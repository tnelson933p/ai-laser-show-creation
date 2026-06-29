use anyhow::{anyhow, Result};
use rustfft::{num_complex::Complex, FftPlanner};
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

// ──────────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct AudioAnalysis {
    pub bpm: f64,
    pub duration_sec: f64,
    pub sample_rate: u32,
    pub beat_times: Vec<f64>, // absolute beat onset timestamps in seconds
    pub total_frames: u64,    // number of 40Hz frames in the track
}

/// Per-40Hz-frame frequency envelopes (all values 0.0 – 1.0).
#[derive(Debug, Clone)]
pub struct FrameEnvelopes {
    pub bass: f32,
    pub mid: f32,
    pub high: f32,
}

/// Holds decoded samples and pre-computed per-frame envelopes.
pub struct AudioData {
    pub analysis: AudioAnalysis,
    /// Mono f32 samples at `analysis.sample_rate`.
    pub samples: Vec<f32>,
    /// Pre-computed 40Hz-frame envelopes across the full track.
    pub envelopes: Vec<FrameEnvelopes>,
}

// ──────────────────────────────────────────────────────────────────────────────
// Decoding
// ──────────────────────────────────────────────────────────────────────────────

pub fn decode_audio(path: &Path) -> Result<(Vec<f32>, u32)> {
    let file = std::fs::File::open(path)?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| anyhow!("Probe failed: {}", e))?;

    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or_else(|| anyhow!("No audio track found"))?
        .clone();

    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or_else(|| anyhow!("Unknown sample rate"))?;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| anyhow!("Decoder error: {}", e))?;

    let track_id = track.id;
    let mut all_samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(e) => return Err(anyhow!("Packet read error: {}", e)),
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let duration = decoded.capacity() as u64;
                let mut sample_buf = SampleBuffer::<f32>::new(duration, spec);
                sample_buf.copy_interleaved_ref(decoded);
                let samples = sample_buf.samples();
                let channels = spec.channels.count();

                // Mix down to mono
                if channels == 1 {
                    all_samples.extend_from_slice(samples);
                } else {
                    for frame in samples.chunks(channels) {
                        let mono: f32 = frame.iter().sum::<f32>() / channels as f32;
                        all_samples.push(mono);
                    }
                }
            }
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(e) => return Err(anyhow!("Decode error: {}", e)),
        }
    }

    Ok((all_samples, sample_rate))
}

// ──────────────────────────────────────────────────────────────────────────────
// BPM detection
// ──────────────────────────────────────────────────────────────────────────────

/// Compute onset strength envelope and estimate BPM from it.
/// Returns (bpm, beat_times_in_seconds).
pub fn detect_bpm(samples: &[f32], sample_rate: u32) -> (f64, Vec<f64>) {
    const HOP_SIZE: usize = 512;
    const FFT_SIZE: usize = 2048;

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);

    let mut onset_strength: Vec<f32> = Vec::new();
    let mut prev_mag: Vec<f32> = vec![0.0; FFT_SIZE / 2 + 1];

    let window: Vec<f32> = (0..FFT_SIZE)
        .map(|i| {
            0.5 * (1.0 - (2.0 * std::f64::consts::PI * i as f64 / (FFT_SIZE - 1) as f64).cos())
                as f32
        })
        .collect();

    for frame_start in (0..samples.len().saturating_sub(FFT_SIZE)).step_by(HOP_SIZE) {
        let mut buffer: Vec<Complex<f32>> = samples[frame_start..frame_start + FFT_SIZE]
            .iter()
            .zip(window.iter())
            .map(|(&s, &w)| Complex::new(s * w, 0.0))
            .collect();

        fft.process(&mut buffer);

        let mag: Vec<f32> = buffer[..FFT_SIZE / 2 + 1]
            .iter()
            .map(|c| (c.re * c.re + c.im * c.im).sqrt())
            .collect();

        // Spectral flux: sum of positive magnitude differences
        let flux: f32 = mag
            .iter()
            .zip(prev_mag.iter())
            .map(|(&m, &p)| (m - p).max(0.0))
            .sum();

        onset_strength.push(flux);
        prev_mag = mag;
    }

    // Normalize onset strength
    let max_onset = onset_strength.iter().cloned().fold(0.0f32, f32::max);
    if max_onset > 0.0 {
        for v in onset_strength.iter_mut() {
            *v /= max_onset;
        }
    }

    let hop_dur = HOP_SIZE as f64 / sample_rate as f64;

    // Pick peaks with a minimum distance of ~0.3 s
    let min_dist = (0.3 / hop_dur).round() as usize;
    let threshold = 0.3f32;
    let mut beat_frames: Vec<usize> = Vec::new();

    let mut i = 1;
    while i + 1 < onset_strength.len() {
        let v = onset_strength[i];
        if v > threshold && v >= onset_strength[i - 1] && v >= onset_strength[i + 1] {
            if beat_frames.last().map(|&last| i - last >= min_dist).unwrap_or(true) {
                beat_frames.push(i);
            }
        }
        i += 1;
    }

    let beat_times: Vec<f64> = beat_frames.iter().map(|&f| f as f64 * hop_dur).collect();

    // Estimate BPM from median inter-beat interval
    let bpm = if beat_times.len() >= 2 {
        let intervals: Vec<f64> = beat_times.windows(2).map(|w| w[1] - w[0]).collect();
        let mut sorted = intervals.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let median_interval = sorted[sorted.len() / 2];
        if median_interval > 0.0 {
            60.0 / median_interval
        } else {
            120.0
        }
    } else {
        120.0
    };

    (bpm.clamp(60.0, 200.0), beat_times)
}

// ──────────────────────────────────────────────────────────────────────────────
// Frequency envelope extraction
// ──────────────────────────────────────────────────────────────────────────────

const FRAME_HZ: f64 = 40.0; // 40 frames per second = 25 ms
const FRAME_DURATION: f64 = 1.0 / FRAME_HZ;

/// Pre-compute per-40Hz-frame RMS envelopes for bass, mid, and high bands.
pub fn compute_envelopes(samples: &[f32], sample_rate: u32) -> Vec<FrameEnvelopes> {
    let samples_per_frame = (sample_rate as f64 * FRAME_DURATION).round() as usize;
    let total_frames = samples.len() / samples_per_frame;

    // FFT plan for one frame
    let fft_size = samples_per_frame.next_power_of_two();
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(fft_size);

    let window: Vec<f32> = (0..fft_size)
        .map(|i| {
            0.5 * (1.0
                - (2.0 * std::f64::consts::PI * i as f64 / (fft_size - 1) as f64).cos())
                as f32
        })
        .collect();

    // Frequency bin boundaries
    let bin_hz = sample_rate as f64 / fft_size as f64;
    let bass_hi = (150.0 / bin_hz).round() as usize;
    let mid_lo = (150.0 / bin_hz).round() as usize;
    let mid_hi = (4000.0 / bin_hz).round() as usize;
    let high_lo = (4000.0 / bin_hz).round() as usize;
    let nyquist = fft_size / 2;

    let mut envelopes = Vec::with_capacity(total_frames);
    let mut running_max_bass = 0.0f32;
    let mut running_max_mid = 0.0f32;
    let mut running_max_high = 0.0f32;

    // First pass: collect raw values
    let mut raw: Vec<(f32, f32, f32)> = Vec::with_capacity(total_frames);

    for frame_idx in 0..total_frames {
        let start = frame_idx * samples_per_frame;
        let end = (start + samples_per_frame).min(samples.len());
        let slice = &samples[start..end];

        let mut buffer: Vec<Complex<f32>> = (0..fft_size)
            .map(|i| {
                let s = if i < slice.len() { slice[i] } else { 0.0 };
                Complex::new(s * window[i], 0.0)
            })
            .collect();

        fft.process(&mut buffer);

        let mag: Vec<f32> = buffer[..nyquist]
            .iter()
            .map(|c| (c.re * c.re + c.im * c.im).sqrt())
            .collect();

        let rms_range = |lo: usize, hi: usize| -> f32 {
            let hi = hi.min(nyquist);
            if lo >= hi {
                return 0.0;
            }
            let sum: f32 = mag[lo..hi].iter().map(|v| v * v).sum();
            (sum / (hi - lo) as f32).sqrt()
        };

        let b = rms_range(0, bass_hi);
        let m = rms_range(mid_lo, mid_hi);
        let h = rms_range(high_lo, nyquist);

        running_max_bass = running_max_bass.max(b);
        running_max_mid = running_max_mid.max(m);
        running_max_high = running_max_high.max(h);

        raw.push((b, m, h));
    }

    // Second pass: normalize to 0–1
    for (b, m, h) in raw {
        envelopes.push(FrameEnvelopes {
            bass: if running_max_bass > 0.0 { (b / running_max_bass).clamp(0.0, 1.0) } else { 0.0 },
            mid: if running_max_mid > 0.0 { (m / running_max_mid).clamp(0.0, 1.0) } else { 0.0 },
            high: if running_max_high > 0.0 { (h / running_max_high).clamp(0.0, 1.0) } else { 0.0 },
        });
    }

    envelopes
}

// ──────────────────────────────────────────────────────────────────────────────
// Top-level analysis function
// ──────────────────────────────────────────────────────────────────────────────

pub fn analyze_file(path: &Path) -> Result<AudioData> {
    let (samples, sample_rate) = decode_audio(path)?;
    let (bpm, beat_times) = detect_bpm(&samples, sample_rate);
    let envelopes = compute_envelopes(&samples, sample_rate);

    let duration_sec = samples.len() as f64 / sample_rate as f64;
    let total_frames = envelopes.len() as u64;

    Ok(AudioData {
        analysis: AudioAnalysis {
            bpm,
            duration_sec,
            sample_rate,
            beat_times,
            total_frames,
        },
        samples,
        envelopes,
    })
}

/// Compute the BPM phase (0.0–1.0) at a given position in seconds.
pub fn bpm_phase_at(time_sec: f64, bpm: f64) -> f32 {
    let beat_dur = 60.0 / bpm;
    ((time_sec % beat_dur) / beat_dur) as f32
}

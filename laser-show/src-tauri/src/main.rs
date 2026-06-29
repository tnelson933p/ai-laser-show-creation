#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod dmx;

use audio::{analyze_file, bpm_phase_at, AudioData};
use dmx::{
    build_eytse_packet, build_generic7_packet, CableType, DmxController, FrequencyEnvelopes,
    LaserProfile,
};

use parking_lot::Mutex;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::State;

// ──────────────────────────────────────────────────────────────────────────────
// Shared application state
// ──────────────────────────────────────────────────────────────────────────────

struct AppState {
    dmx: DmxController,
    audio: Mutex<Option<Arc<AudioData>>>,
    playback_running: AtomicBool,
    current_frame: AtomicU64,
    profile: Mutex<LaserProfile>,
}

impl AppState {
    fn new() -> Self {
        AppState {
            dmx: DmxController::new(),
            audio: Mutex::new(None),
            playback_running: AtomicBool::new(false),
            current_frame: AtomicU64::new(0),
            profile: Mutex::new(LaserProfile::EytseEY003L),
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Tauri commands
// ──────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn list_serial_ports() -> Vec<String> {
    DmxController::list_ports()
}

/// `cable_type` must be either `"enttec-pro"` or `"raw"`.
/// ENTTEC Pro / SoundSwitch adapters: 57600 baud, 1 stop bit, ENTTEC envelope.
/// Generic Open DMX / raw adapters:   250000 baud, 2 stop bits, BREAK + data.
#[tauri::command]
fn connect_dmx(port: String, cable_type: String, state: State<AppState>) -> Result<(), String> {
    let ct = match cable_type.as_str() {
        "raw" => CableType::Raw,
        _ => CableType::EnttecPro,
    };
    state.dmx.connect(&port, ct).map_err(|e| e.to_string())
}

#[tauri::command]
fn disconnect_dmx(state: State<AppState>) {
    state.dmx.disconnect();
}

#[tauri::command]
fn dmx_status(state: State<AppState>) -> bool {
    state.dmx.is_connected()
}

#[tauri::command]
fn set_laser_profile(profile: String, state: State<AppState>) {
    let p = match profile.as_str() {
        "EytseEY003L" => LaserProfile::EytseEY003L,
        "Generic7Channel" => LaserProfile::Generic7Channel,
        _ => LaserProfile::Custom,
    };
    *state.profile.lock() = p;
}

#[tauri::command]
async fn load_audio(
    path: String,
    state: State<'_, AppState>,
) -> Result<audio::AudioAnalysis, String> {
    let p = PathBuf::from(&path);
    let data = analyze_file(&p).map_err(|e| e.to_string())?;
    let analysis = data.analysis.clone();
    *state.audio.lock() = Some(Arc::new(data));
    state.current_frame.store(0, Ordering::Relaxed);
    Ok(analysis)
}

#[tauri::command]
fn get_current_envelopes(state: State<AppState>) -> Option<serde_json::Value> {
    let guard = state.audio.lock();
    let audio = guard.as_ref()?;
    let frame = state.current_frame.load(Ordering::Relaxed) as usize;
    let frame = frame.min(audio.envelopes.len().saturating_sub(1));
    let env = &audio.envelopes[frame];
    Some(serde_json::json!({
        "bass":  env.bass,
        "mid":   env.mid,
        "high":  env.high,
        "frame": frame,
        "total": audio.analysis.total_frames,
        "bpm":   audio.analysis.bpm,
    }))
}

#[tauri::command]
fn start_playback(
    _app_handle: tauri::AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    if state.playback_running.load(Ordering::Relaxed) {
        return Ok(());
    }

    let audio = {
        let guard = state.audio.lock();
        match guard.as_ref() {
            Some(a) => Arc::clone(a),
            None => return Err("No audio loaded".into()),
        }
    };

    let running = Arc::new(AtomicBool::new(true));
    let frame_counter = Arc::new(AtomicU64::new(0));

    // Clone the full DmxController so the DMX thread owns it and can call
    // send_packet() — which handles BREAK generation and ENTTEC framing.
    let dmx = state.dmx.clone();
    let profile = state.profile.lock().clone();
    let running_clone = Arc::clone(&running);
    let frame_clone = Arc::clone(&frame_counter);
    let audio_clone = Arc::clone(&audio);

    state.playback_running.store(true, Ordering::Relaxed);

    // ── Audio playback thread (rodio) ──────────────────────────────────────
    let samples = audio.samples.clone();
    let sample_rate = audio.analysis.sample_rate;
    let _audio_thread = std::thread::spawn(move || {
        use rodio::{buffer::SamplesBuffer, OutputStream, Sink};
        let (_stream, stream_handle) = match OutputStream::try_default() {
            Ok(v) => v,
            Err(e) => { eprintln!("Audio output error: {}", e); return; }
        };
        let sink = match Sink::try_new(&stream_handle) {
            Ok(s) => s,
            Err(e) => { eprintln!("Sink error: {}", e); return; }
        };
        let source = SamplesBuffer::new(1, sample_rate, samples);
        sink.append(source);
        sink.sleep_until_end();
    });

    // ── 40 Hz DMX loop thread ──────────────────────────────────────────────
    std::thread::spawn(move || {
        let start = Instant::now();

        loop {
            if !running_clone.load(Ordering::Relaxed) {
                break;
            }

            let elapsed = start.elapsed().as_secs_f64();
            let frame_idx = (elapsed * 40.0) as usize;

            if frame_idx >= audio_clone.envelopes.len() {
                break;
            }

            frame_clone.store(frame_idx as u64, Ordering::Relaxed);

            let env = &audio_clone.envelopes[frame_idx];
            let bpm_phase = bpm_phase_at(elapsed, audio_clone.analysis.bpm);

            let freq_env = FrequencyEnvelopes {
                bass: env.bass,
                mid: env.mid,
                high: env.high,
                bpm_phase,
            };

            let packet = match profile {
                LaserProfile::EytseEY003L => build_eytse_packet(&freq_env, elapsed),
                LaserProfile::Generic7Channel => build_generic7_packet(&freq_env, elapsed),
                LaserProfile::Custom => [0u8; 16],
            };

            // Use send_packet() so BREAK generation and ENTTEC framing are
            // handled correctly — raw port writes were previously missing the
            // DMX BREAK condition entirely.
            let _ = dmx.send_packet(&packet);

            // Busy-wait to hit the next 25ms boundary exactly
            let next = start + Duration::from_millis(((frame_idx + 1) * 25) as u64);
            let now = Instant::now();
            if next > now {
                std::thread::sleep(next - now);
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn stop_playback(state: State<AppState>) {
    state.playback_running.store(false, Ordering::Relaxed);
    state.current_frame.store(0, Ordering::Relaxed);
}

// ──────────────────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            connect_dmx,
            disconnect_dmx,
            dmx_status,
            set_laser_profile,
            load_audio,
            get_current_envelopes,
            start_playback,
            stop_playback,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

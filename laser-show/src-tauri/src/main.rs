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
//
// playback_running and current_frame are Arc-wrapped so the DMX/audio threads
// can hold their own clone and read/write the same underlying atomic.
// Previously these were plain AtomicBool/AtomicU64 on AppState; the thread
// clones were local Arcs the stop command could never reach, so stop() had no
// effect and get_current_envelopes always returned frame 0.
// ──────────────────────────────────────────────────────────────────────────────

struct AppState {
    dmx: DmxController,
    audio: Mutex<Option<Arc<AudioData>>>,
    playback_running: Arc<AtomicBool>,
    current_frame: Arc<AtomicU64>,
    profile: Mutex<LaserProfile>,
}

impl AppState {
    fn new() -> Self {
        AppState {
            dmx: DmxController::new(),
            audio: Mutex::new(None),
            playback_running: Arc::new(AtomicBool::new(false)),
            current_frame: Arc::new(AtomicU64::new(0)),
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

/// `cable_type` — `"enttec-pro"` (default) or `"raw"`.
///
/// ENTTEC Pro / SoundSwitch: 57 600 baud, 1 stop bit, ENTTEC USB Pro envelope.
/// Generic Open DMX / raw:   250 000 baud, 2 stop bits, hardware BREAK + data.
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
    // current_frame is written by the DMX thread via Arc::clone — reads here
    // always see the real playback position.
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

    // Clone the Arc handles so the background threads share the exact same
    // atomic values that stop_playback() and get_current_envelopes() read.
    let running = Arc::clone(&state.playback_running);
    let frame_arc = Arc::clone(&state.current_frame);

    // Clone the full DmxController (Arc-backed, cheap) so the DMX thread
    // calls send_packet() which handles BREAK generation / ENTTEC framing.
    let dmx = state.dmx.clone();
    let profile = state.profile.lock().clone();
    let audio_clone = Arc::clone(&audio);

    state.playback_running.store(true, Ordering::Relaxed);
    state.current_frame.store(0, Ordering::Relaxed);

    // ── Audio playback thread (rodio) ──────────────────────────────────────
    let samples = audio.samples.clone();
    let sample_rate = audio.analysis.sample_rate;
    let running_audio = Arc::clone(&running);
    std::thread::spawn(move || {
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
        // Poll so we can respond to stop() promptly rather than blocking forever
        while !sink.empty() {
            if !running_audio.load(Ordering::Relaxed) {
                sink.stop();
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    });

    // ── 40 Hz DMX loop thread ──────────────────────────────────────────────
    std::thread::spawn(move || {
        let start = Instant::now();

        loop {
            // Check the shared flag — stop_playback() sets this to false.
            if !running.load(Ordering::Relaxed) {
                break;
            }

            let elapsed = start.elapsed().as_secs_f64();
            let frame_idx = (elapsed * 40.0) as usize;

            if frame_idx >= audio_clone.envelopes.len() {
                // Track finished naturally — clear the running flag so the UI
                // knows playback ended without an explicit stop() call.
                running.store(false, Ordering::Relaxed);
                break;
            }

            // Write to the shared Arc so get_current_envelopes() sees live data.
            frame_arc.store(frame_idx as u64, Ordering::Relaxed);

            let env = &audio_clone.envelopes[frame_idx];
            let bpm_phase = bpm_phase_at(elapsed, audio_clone.analysis.bpm);

            let freq_env = FrequencyEnvelopes {
                bass: env.bass,
                mid: env.mid,
                high: env.high,
                bpm_phase,
            };

            let packet = match profile {
                LaserProfile::EytseEY003L    => build_eytse_packet(&freq_env, elapsed),
                LaserProfile::Generic7Channel => build_generic7_packet(&freq_env, elapsed),
                LaserProfile::Custom          => [0u8; 16],
            };

            // send_packet() handles BREAK generation (raw) or ENTTEC envelope.
            let _ = dmx.send_packet(&packet);

            // Busy-wait to the next 25 ms boundary for a steady 40 Hz cadence.
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
    // Writing false to the shared Arc is seen immediately by both background
    // threads, which exit their loops on the next iteration.
    state.playback_running.store(false, Ordering::Relaxed);
    state.current_frame.store(0, Ordering::Relaxed);
}

/// Send 120 frames (3 seconds at 40 Hz) of a static test pattern so the user
/// can verify the cable and laser respond without needing a music file loaded.
/// The command returns immediately; the burst runs on a background thread.
#[tauri::command]
fn test_dmx_burst(state: State<AppState>) -> Result<(), String> {
    if !state.dmx.is_connected() {
        return Err("Not connected — connect the DMX adapter first".into());
    }
    if state.playback_running.load(Ordering::Relaxed) {
        return Err("Playback is running — stop it before testing".into());
    }

    let dmx     = state.dmx.clone();
    let profile = state.profile.lock().clone();

    std::thread::spawn(move || {
        let start = Instant::now();
        for i in 0..120u64 {
            // Build a static show-like test packet for each profile
            let pkt: [u8; 16] = match profile {
                LaserProfile::EytseEY003L => {
                    let mut ch = [0u8; 16];
                    ch[0]  = 120; // CH1: Mode — DMX control
                    ch[1]  = 0;   // CH2: Pattern group 0
                    ch[2]  = 100; // CH3: Pattern choice mid-range
                    ch[3]  = 0;   // CH4: No strobe
                    ch[4]  = 128; // CH5: X center
                    ch[5]  = 128; // CH6: Y center
                    ch[6]  = 200; // CH7: X zoom
                    ch[7]  = 190; // CH8: Y zoom
                    ch[8]  = 220; // CH9: Multi-color
                    ch[9]  = ((i * 2) % 255) as u8; // CH10: Rotating
                    ch[10] = 0;   // CH11: No X roll
                    ch[11] = 0;   // CH12: No Y roll
                    ch[12] = 150; // CH13: Draw speed
                    ch[13] = 200; // CH14: Pattern size
                    ch[14] = 0;   // CH15: No segments
                    ch[15] = 0;
                    ch
                }
                LaserProfile::Generic7Channel | LaserProfile::Custom => {
                    let mut ch = [0u8; 16];
                    ch[0] = 100; // Mode
                    ch[1] = 80;  // Pattern
                    ch[2] = 0;   // No strobe
                    ch[3] = 200; // Zoom
                    ch[4] = 128; // X center
                    ch[5] = 128; // Y center
                    ch[6] = ((i * 2) % 255) as u8; // Color cycling
                    ch
                }
            };

            let _ = dmx.send_packet(&pkt);

            // Pace to 40 Hz
            let next_ms = (i + 1) * 25;
            let elapsed_ms = start.elapsed().as_millis() as u64;
            if elapsed_ms < next_ms {
                std::thread::sleep(Duration::from_millis(next_ms - elapsed_ms));
            }
        }
        // All-zeros to park the laser after the test
        let _ = dmx.send_packet(&[0u8; 16]);
    });

    Ok(())
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
            test_dmx_burst,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

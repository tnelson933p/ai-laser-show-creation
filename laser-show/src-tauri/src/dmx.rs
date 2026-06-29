use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use serialport::{DataBits, FlowControl, Parity, SerialPort, StopBits};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq)]
pub enum CableType {
    EnttecPro,
    Raw,
}

#[derive(Clone)]
pub struct DmxController {
    port: Arc<Mutex<Option<Box<dyn SerialPort>>>>,
    cable_type: Arc<Mutex<CableType>>,
}

impl DmxController {
    pub fn new() -> Self {
        DmxController {
            port: Arc::new(Mutex::new(None)),
            cable_type: Arc::new(Mutex::new(CableType::EnttecPro)),
        }
    }

    pub fn list_ports() -> Vec<String> {
        serialport::available_ports()
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.port_name)
            .collect()
    }

    pub fn connect(&self, port_name: &str, cable_type: CableType) -> Result<()> {
        let (baud, stop_bits) = match cable_type {
            // ENTTEC Pro / SoundSwitch: CDC serial, device handles DMX framing
            CableType::EnttecPro => (57_600, StopBits::One),
            // Generic Open DMX / raw adapter: full 250kbps 8N2 DMX512
            CableType::Raw => (250_000, StopBits::Two),
        };

        let port = serialport::new(port_name, baud)
            .data_bits(DataBits::Eight)
            .stop_bits(stop_bits)
            .parity(Parity::None)
            .flow_control(FlowControl::None)
            .timeout(Duration::from_millis(10))
            .open()
            .map_err(|e| anyhow!("Failed to open '{}': {}", port_name, e))?;

        *self.cable_type.lock() = cable_type;
        *self.port.lock() = Some(port);
        Ok(())
    }

    pub fn disconnect(&self) {
        *self.port.lock() = None;
    }

    pub fn is_connected(&self) -> bool {
        self.port.lock().is_some()
    }

    /// Send a full DMX512 packet using the correct framing for the connected
    /// cable type.
    ///
    /// **ENTTEC Pro / SoundSwitch** — wraps data in the ENTTEC USB Pro protocol
    /// envelope (0x7E … 0xE7).  The device firmware generates the DMX BREAK
    /// and MAB internally; no baud-rate tricks required.
    ///
    /// **Raw / Generic Open DMX** — generates the BREAK by dropping to ~90kbaud
    /// and sending a null byte (holds the line low for ≈111 µs), then reopens
    /// at 250kbaud for the start code + channel data.  This works reliably on
    /// FTDI and CH340 adapters that don't expose set_break() on all platforms.
    pub fn send_packet(&self, channels: &[u8]) -> Result<()> {
        let cable_type = self.cable_type.lock().clone();
        let mut guard = self.port.lock();
        let port = match guard.as_mut() {
            Some(p) => p,
            None => return Ok(()),
        };

        match cable_type {
            CableType::EnttecPro => {
                // ENTTEC DMX USB Pro message format:
                //   0x7E  — start of message
                //   0x06  — label: "Send DMX Packet Request"
                //   LSB   — data length low byte  (channels + 1 for start code)
                //   MSB   — data length high byte
                //   0x00  — DMX start code
                //   [ch…] — channel values
                //   0xE7  — end of message
                let data_len = channels.len() + 1;
                let mut pkt = Vec::with_capacity(5 + channels.len() + 1);
                pkt.push(0x7E);
                pkt.push(0x06);
                pkt.push((data_len & 0xFF) as u8);
                pkt.push(((data_len >> 8) & 0xFF) as u8);
                pkt.push(0x00); // DMX start code
                pkt.extend_from_slice(channels);
                pkt.push(0xE7);
                port.write_all(&pkt)
                    .map_err(|e| anyhow!("ENTTEC write: {}", e))?;
                port.flush().ok();
            }
            CableType::Raw => {
                // BREAK: slow baud → null byte holds line low ≈ 111 µs
                port.set_baud_rate(90_000)
                    .map_err(|e| anyhow!("set_baud_rate (break): {}", e))?;
                port.write_all(&[0x00])
                    .map_err(|e| anyhow!("BREAK write: {}", e))?;
                port.flush().ok();

                // MAB + data at 250kbaud
                port.set_baud_rate(250_000)
                    .map_err(|e| anyhow!("set_baud_rate (data): {}", e))?;
                let mut pkt = Vec::with_capacity(1 + channels.len());
                pkt.push(0x00); // DMX start code
                pkt.extend_from_slice(channels);
                port.write_all(&pkt)
                    .map_err(|e| anyhow!("DMX data write: {}", e))?;
                port.flush().ok();
            }
        }

        Ok(())
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Channel mapping helpers
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct FrequencyEnvelopes {
    pub bass: f32,
    pub mid: f32,
    pub high: f32,
    pub bpm_phase: f32,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq)]
pub enum LaserProfile {
    EytseEY003L,
    Generic7Channel,
    Custom,
}

/// Build a DMX channel array for the Eytse EY003-L — 15-channel protocol.
///
/// Confirmed channel map (per Eytse EY003-L manual / Gemini verification):
///   CH1  Mode Selection        — 101-150 = DMX Control mode (lock to 120)
///   CH2  Pattern Group         — selects animation category (4 groups × 64)
///   CH3  Pattern Choice        — specific animation within the group
///   CH4  Strobe Speed          — 0 = off, higher = faster flash
///   CH5  X-Axis Move           — horizontal position (128 = center)
///   CH6  Y-Axis Move           — vertical position (128 = center)
///   CH7  X-Axis Zoom           — horizontal width of pattern
///   CH8  Y-Axis Zoom           — vertical height of pattern
///   CH9  Color Selection       — indexed color zones (NOT raw RGB)
///   CH10 Rotation              — 2D rotation of pattern
///   CH11 X-Axis Rolling        — 3D barrel-roll effect
///   CH12 Y-Axis Rolling        — 3D vertical-flip effect
///   CH13 Drawing Speed         — vector rendering / scan speed
///   CH14 Pattern Size          — master scale
///   CH15 Segment Count         — multiply / mirror the pattern
pub fn build_eytse_packet(env: &FrequencyEnvelopes, time_sec: f64) -> [u8; 16] {
    let mut ch = [0u8; 16];

    // CH1: Mode — 101-150 = DMX Control; lock at 120
    ch[0] = 120;

    // CH2: Pattern Group — slow bank cycling (~20 s per bank)
    let bank_idx = ((time_sec * 0.05) as u32 % 4) as u8;
    ch[1] = bank_idx * 64;

    // CH3: Pattern Choice — mid+high energy selects specific animation
    ch[2] = ((env.mid + env.high) * 0.5 * 200.0) as u8;

    // CH4: Strobe Speed — 0 = off; only on peak hi-hat + bass energy
    ch[3] = if env.high > 0.75 && env.bass > 0.5 {
        ((env.high * 150.0) as u8).saturating_add(50).min(200)
    } else {
        0
    };

    // CH5: X-Axis Move — BPM-locked horizontal sweep (0–255, 128 = center)
    let speed = env.bpm_phase * std::f32::consts::TAU;
    ch[4] = ((speed.sin() * 0.5 + 0.5) * 255.0) as u8;

    // CH6: Y-Axis Move — BPM-locked vertical sweep
    ch[5] = ((speed.cos() * 0.5 + 0.5) * 255.0) as u8;

    // CH7: X-Axis Zoom — bass-reactive width snap
    let zoom = if env.bass > 0.80 {
        255
    } else {
        100u8.saturating_add((env.bass * 155.0) as u8)
    };
    ch[6] = zoom;

    // CH8: Y-Axis Zoom — slightly tighter than X for depth perspective
    ch[7] = zoom.saturating_sub(10);

    // CH9: Color Selection — indexed zones (NOT raw RGB):
    //   ~51-100  = Red    (bass/kick dominant)
    //   ~101-150 = Green  (melody/chord dominant)
    //   ~151-200 = Blue   (hi-hat/snare dominant)
    //   ~201-255 = Multi-color cycle (ambient / low energy)
    ch[8] = if env.bass > 0.65 {
        70
    } else if env.mid > 0.60 {
        120
    } else if env.high > 0.60 {
        170
    } else {
        220
    };

    // CH10: Rotation — continuous 2D rotation at ~1/2 BPM
    let rot = time_sec as f32 * 0.4;
    ch[9] = (((rot.sin() * 0.5 + 0.5) * 220.0) as u8).saturating_add(18);

    // CH11: X-Axis Rolling (3D barrel roll) — activate on strong bass drops
    ch[10] = if env.bass > 0.80 {
        ((env.bass * 180.0) as u8).min(200)
    } else {
        0
    };

    // CH12: Y-Axis Rolling (3D vertical flip) — activate on strong mid peaks
    ch[11] = if env.mid > 0.75 {
        ((env.mid * 150.0) as u8).min(180)
    } else {
        0
    };

    // CH13: Drawing Speed — faster on high energy for tighter vector paths
    let energy = env.bass * 0.5 + env.mid * 0.3 + env.high * 0.2;
    ch[12] = (100.0 + energy * 155.0) as u8;

    // CH14: Pattern Size — master scale, bass-driven
    ch[13] = zoom;

    // CH15: Segment Count — multiply/mirror on energy peaks (fan-out effect)
    let density = (env.bass + env.mid + env.high) / 3.0;
    ch[14] = if density > 0.65 { 180 } else { 0 };

    // CH16 unused — 15-ch fixture
    ch[15] = 0;

    ch
}

/// Build a 7-element DMX array for the Generic 7-channel profile.
pub fn build_generic7_packet(env: &FrequencyEnvelopes, time_sec: f64) -> [u8; 16] {
    let mut ch = [0u8; 16];

    ch[0] = 100;
    ch[1] = ((env.mid + env.high) * 0.5 * 200.0) as u8;
    ch[2] = if env.high > 0.65 {
        ((env.high * 255.0) as u8).min(200)
    } else {
        0
    };
    ch[3] = if env.bass > 0.75 {
        255
    } else {
        100u8.saturating_add((env.bass * 100.0) as u8)
    };

    let speed = env.bpm_phase * std::f32::consts::TAU;
    ch[4] = ((speed.sin() * 0.5 + 0.5) * 255.0) as u8;
    ch[5] = ((speed.cos() * 0.5 + 0.5) * 255.0) as u8;
    ch[6] = ((time_sec * 0.2) as u8).wrapping_mul(16);

    ch
}

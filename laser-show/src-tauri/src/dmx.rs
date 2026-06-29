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

/// Build a 16-element DMX channel array for the Eytse EY003-L (16-ch mode).
pub fn build_eytse_packet(env: &FrequencyEnvelopes, time_sec: f64) -> [u8; 16] {
    let mut ch = [0u8; 16];

    ch[0] = 120;

    let bank = if env.mid > 0.75 {
        ((env.mid * 255.0) as u8).saturating_add(64)
    } else {
        80
    };
    ch[1] = bank;

    let pattern_base: u8 = if env.mid > 0.6 || env.high > 0.65 {
        ((env.mid + env.high) * 0.5 * 180.0) as u8
    } else {
        40
    };
    ch[2] = pattern_base;
    ch[3] = pattern_base.saturating_add(20);

    let speed = env.bpm_phase * std::f32::consts::TAU;
    let x = ((speed.sin() * 0.5 + 0.5) * 255.0) as u8;
    let y = ((speed.cos() * 0.5 + 0.5) * 255.0) as u8;
    ch[4] = x;
    ch[5] = y;

    let rot_speed = time_sec as f32 * 0.4;
    ch[6] = (((rot_speed.sin() * 0.5 + 0.5) * 200.0) as u8).saturating_add(28);
    ch[7] = (((rot_speed.cos() * 0.5 + 0.5) * 200.0) as u8).saturating_add(28);

    let zoom = if env.bass > 0.80 {
        255
    } else {
        let decay = (env.bass * 155.0) as u8;
        100u8.saturating_add(decay)
    };
    ch[8] = zoom;
    ch[9] = zoom.saturating_sub(20);

    ch[10] = if env.high > 0.70 {
        ((env.high * 255.0) as u8).min(220)
    } else {
        0
    };

    ch[11] = (env.bass * 255.0) as u8;
    ch[12] = (env.mid * 255.0) as u8;
    ch[13] = (env.high * 255.0) as u8;

    let density = (env.bass + env.mid + env.high) / 3.0;
    ch[14] = if density > 0.65 { 180 } else { 0 };
    ch[15] = if density > 0.75 { 200 } else { 0 };

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

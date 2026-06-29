use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use serialport::{DataBits, FlowControl, Parity, SerialPort, StopBits};
use std::sync::Arc;
use std::time::Duration;

pub struct DmxController {
    port: Arc<Mutex<Option<Box<dyn SerialPort>>>>,
}

impl DmxController {
    pub fn new() -> Self {
        DmxController {
            port: Arc::new(Mutex::new(None)),
        }
    }

    pub fn list_ports() -> Vec<String> {
        serialport::available_ports()
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.port_name)
            .collect()
    }

    pub fn connect(&self, port_name: &str) -> Result<()> {
        let port = serialport::new(port_name, 250_000)
            .data_bits(DataBits::Eight)
            .stop_bits(StopBits::Two)
            .parity(Parity::None)
            .flow_control(FlowControl::None)
            .timeout(Duration::from_millis(10))
            .open()
            .map_err(|e| anyhow!("Failed to open port '{}': {}", port_name, e))?;

        *self.port.lock() = Some(port);
        Ok(())
    }

    pub fn disconnect(&self) {
        *self.port.lock() = None;
    }

    pub fn is_connected(&self) -> bool {
        self.port.lock().is_some()
    }

    /// Send a full DMX512 packet.
    ///
    /// Protocol framing:
    ///   1. Assert BREAK (serial line held low > 88 µs)
    ///   2. Assert MAB   (mark-after-break, line high ≥ 8 µs)
    ///   3. Send start code 0x00 at 250 kbaud (8N2)
    ///   4. Send up to 512 channel bytes at 250 kbaud
    ///
    /// With standard serialport drivers the cleanest way to generate a
    /// BREAK is to drop to ~90 kbaud (≈ one slot-time ≈ 111 µs) and
    /// send a null byte, which holds the line low long enough, then
    /// reopen at 250 kbaud for the data burst.  Most FTDI / CH340
    /// adapters do not expose `set_break()` reliably on all platforms,
    /// so the baud-rate trick is the most portable approach.
    pub fn send_packet(&self, channels: &[u8; 16]) -> Result<()> {
        let mut guard = self.port.lock();
        let port = match guard.as_mut() {
            Some(p) => p,
            None => return Ok(()),
        };

        // --- 1. BREAK: set to slow baud, send 0x00 → line low ≈ 111 µs ---
        port.set_baud_rate(90_000)
            .map_err(|e| anyhow!("set_baud_rate (break): {}", e))?;
        port.write_all(&[0x00])
            .map_err(|e| anyhow!("BREAK write: {}", e))?;
        port.flush().ok();

        // --- 2. MAB: back to 250k; the line rises naturally ---
        port.set_baud_rate(250_000)
            .map_err(|e| anyhow!("set_baud_rate (data): {}", e))?;

        // --- 3 + 4. Start code (0x00) followed by channel data ---
        // Build a single write so the OS doesn't insert idle gaps.
        let mut packet = Vec::with_capacity(1 + channels.len());
        packet.push(0x00); // DMX start code
        packet.extend_from_slice(channels);

        port.write_all(&packet)
            .map_err(|e| anyhow!("DMX data write: {}", e))?;
        port.flush().ok();

        Ok(())
    }

    /// Convenience clone for sharing across threads.
    pub fn port_handle(&self) -> Arc<Mutex<Option<Box<dyn SerialPort>>>> {
        Arc::clone(&self.port)
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Channel mapping helpers
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct FrequencyEnvelopes {
    pub bass: f32,    // 0.0 – 1.0
    pub mid: f32,
    pub high: f32,
    pub bpm_phase: f32, // 0.0 – 1.0 within the current beat
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

    // Ch 1 – Control Mode: lock at 120 (DMX remote-manual override)
    ch[0] = 120;

    // Ch 2 – Animation Bank: step on high mid-range spikes
    let bank = if env.mid > 0.75 {
        ((env.mid * 255.0) as u8).saturating_add(64)
    } else {
        80
    };
    ch[1] = bank;

    // Ch 3-4 – Pattern selection: shift when mid/high envelopes jump
    let pattern_base: u8 = if env.mid > 0.6 || env.high > 0.65 {
        ((env.mid + env.high) * 0.5 * 180.0) as u8
    } else {
        40
    };
    ch[2] = pattern_base;
    ch[3] = pattern_base.saturating_add(20);

    // Ch 5-6 – X/Y Position: sine/cosine at BPM-scaled rate
    let speed = env.bpm_phase * std::f32::consts::TAU;
    let x = ((speed.sin() * 0.5 + 0.5) * 255.0) as u8;
    let y = ((speed.cos() * 0.5 + 0.5) * 255.0) as u8;
    ch[4] = x;
    ch[5] = y;

    // Ch 7-8 – Rotation: slower complementary oscillation
    let rot_speed = time_sec as f32 * 0.4;
    ch[6] = (((rot_speed.sin() * 0.5 + 0.5) * 200.0) as u8).saturating_add(28);
    ch[7] = (((rot_speed.cos() * 0.5 + 0.5) * 200.0) as u8).saturating_add(28);

    // Ch 9-10 – Zoom/Size: baseline 100, snap to 255 on bass spike, decay
    let zoom = if env.bass > 0.80 {
        255
    } else {
        let decay = (env.bass * 155.0) as u8;
        100u8.saturating_add(decay)
    };
    ch[8] = zoom;
    ch[9] = zoom.saturating_sub(20);

    // Ch 11 – Strobe: tied to high-end transient peaks
    ch[10] = if env.high > 0.70 {
        ((env.high * 255.0) as u8).min(220)
    } else {
        0
    };

    // Ch 12-14 – RGB: bass→Red, mid→Green, high→Blue
    ch[11] = (env.bass * 255.0) as u8;
    ch[12] = (env.mid * 255.0) as u8;
    ch[13] = (env.high * 255.0) as u8;

    // Ch 15-16 – Grating effects: activate on dense, loud passages
    let density = (env.bass + env.mid + env.high) / 3.0;
    ch[14] = if density > 0.65 { 180 } else { 0 };
    ch[15] = if density > 0.75 { 200 } else { 0 };

    ch
}

/// Build a 7-element DMX array for the Generic 7-channel profile.
pub fn build_generic7_packet(env: &FrequencyEnvelopes, time_sec: f64) -> [u8; 16] {
    let mut ch = [0u8; 16];

    // Ch 1 – Mode: hold at 100 (auto/DMX mode)
    ch[0] = 100;

    // Ch 2 – Pattern: mid + high drive pattern index
    ch[1] = ((env.mid + env.high) * 0.5 * 200.0) as u8;

    // Ch 3 – Strobe: high-end transients
    ch[2] = if env.high > 0.65 {
        ((env.high * 255.0) as u8).min(200)
    } else {
        0
    };

    // Ch 4 – Zoom: bass-driven
    ch[3] = if env.bass > 0.75 {
        255
    } else {
        100u8.saturating_add((env.bass * 100.0) as u8)
    };

    // Ch 5-6 – X/Y: BPM-phase sine/cosine
    let speed = env.bpm_phase * std::f32::consts::TAU;
    ch[4] = ((speed.sin() * 0.5 + 0.5) * 255.0) as u8;
    ch[5] = ((speed.cos() * 0.5 + 0.5) * 255.0) as u8;

    // Ch 7 – Color palette index: rotates with time
    ch[6] = ((time_sec * 0.2) as u8).wrapping_mul(16);

    ch
}

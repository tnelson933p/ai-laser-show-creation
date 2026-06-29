# AI LaserShow Client

A compiled desktop application that translates music into real-time DMX512 light shows for animation lasers — no Python, no runtime dependencies, just a native binary.

---

## Supported Hardware

| Profile | Channels | Notes |
|---------|----------|-------|
| Eytse EY003-L | 16 | Full RGB + geometry + grating effects |
| Generic DJ Animation Laser | 7 | Mode, Pattern, Strobe, Zoom, X/Y, Color |
| Custom | 1–16 | User-mapped matrix |

USB-to-DMX adapters: **FTDI** or **CH340** chipset required.  
DMX parameters: 250,000 baud · 8 data bits · 2 stop bits · No parity.

---

## Download Pre-Built Binaries (Recommended)

Go to the **[Releases](../../releases)** page and download:

| Platform | File |
|----------|------|
| Windows (x64) | `AI.LaserShow.Client_x.x.x_x64-setup.exe` or `.msi` |
| macOS Apple Silicon | `AI.LaserShow.Client_x.x.x_aarch64.dmg` |
| macOS Intel | `AI.LaserShow.Client_x.x.x_x86_64.dmg` |

---

## Build From Source

### Requirements

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) ≥ 18
- [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites/) for your OS:
  - **Windows**: Microsoft C++ Build Tools, WebView2
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf libudev-dev`

### Steps

```bash
cd laser-show
npm install
npm run dev        # development (hot-reload UI, live Rust recompile)
npm run build      # production binary → src-tauri/target/release/bundle/
```

---

## GitHub Actions — Automated Release Pipeline

Pushing a version tag triggers the CI to compile Windows + macOS binaries automatically and attach them to a GitHub Release.

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow matrix:
- `windows-latest` → `.exe` setup + `.msi` installer  
- `macos-latest` (aarch64) → Apple Silicon `.dmg`  
- `macos-latest` (x86_64) → Intel `.dmg`

Secrets needed in your GitHub repo settings (optional, for update signing):

| Secret | Purpose |
|--------|---------|
| `TAURI_PRIVATE_KEY` | Signing key for auto-updates |
| `TAURI_KEY_PASSWORD` | Password for the signing key |

---

## Project Structure

```
laser-show/
├── src/                        # Frontend (HTML + CSS + JS)
│   ├── index.html              # App shell, setup modal, main UI
│   ├── styles.css              # Dark theme styling
│   └── main.js                 # UI logic, Tauri command calls, 40Hz visualiser
│
├── src-tauri/                  # Rust backend
│   ├── Cargo.toml              # Crate dependencies
│   ├── tauri.conf.json         # Window config, bundle settings, allowlist
│   ├── build.rs                # Tauri build script
│   └── src/
│       ├── main.rs             # Tauri commands, 40Hz DMX loop, audio playback thread
│       ├── audio.rs            # Symphonia decode + FFT envelope extraction + BPM detection
│       └── dmx.rs              # Serial DMX512 framing, channel mapping, profile builders
│
├── .github/workflows/
│   └── release.yml             # Matrix build → GitHub Release on tag push
│
└── package.json                # Tauri CLI dev/build scripts
```

---

## How It Works

1. **Hardware setup** — Select laser brand and COM port on first launch. The Rust backend calls `serialport::available_ports()` to enumerate live USB nodes.

2. **Audio analysis** — When you drop in an `.mp3` or `.wav`, `symphonia` decodes the file to raw PCM samples. A sliding-window FFT (via `rustfft`) splits the spectrum into three envelopes:
   - **Bass** (0 – 150 Hz): kick drums, sub-bass
   - **Mid** (150 Hz – 4 kHz): vocals, melody, synths
   - **High** (4 kHz – 20 kHz): cymbals, hi-hats, snares

3. **BPM detection** — Spectral flux onset strength is computed, peaks are picked with a minimum inter-onset distance, and the median inter-beat interval gives the BPM.

4. **40 Hz DMX loop** — A dedicated Rust thread fires every 25 ms. For each frame it reads the pre-computed envelope values, builds a 16-byte (or 7-byte) channel array using the active profile's math, and writes a correctly framed DMX512 packet:
   ```
   BREAK (serial 0x00 at 90 kbaud ≈ 111 µs)
   MAB   (line rises, baud resets to 250 kbaud)
   Start code 0x00
   Channel bytes (up to 512)
   ```

5. **Frontend polling** — The JS UI polls `get_current_envelopes` at 40 Hz via the Tauri bridge to drive the spectrum visualiser, envelope bars, and live DMX channel readout.

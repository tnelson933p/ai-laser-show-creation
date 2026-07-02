const { invoke } = window.__TAURI__.tauri;
const { open }   = window.__TAURI__.dialog;

// ── Laser Database (mirrors web laser-database.ts) ───────────────────────────
const LASER_DB = {
  "Kvant": [
    { id: "kvant-atom10",      model: "Atom 10 FB4",       channels: 16, scanTier: "pro",    colorMode: "rgb-full", mW: 10000, notes: "Premium 10W RGB with 30K pro scanners. Use complex Lissajous patterns at full pattern library. Bass drives red; pattern banks shift on 4-bar phrases." },
    { id: "kvant-atom20",      model: "Atom 20 FB4",       channels: 16, scanTier: "pro",    colorMode: "rgb-full", mW: 20000, notes: "20W RGBA powerhouse. The yellow diode shines in melodic mid sections. 30K scanner handles 5:4 and 7:6 Lissajous ratios cleanly." },
    { id: "kvant-clubmax3000", model: "Clubmax 3000 FB4",  channels: 16, scanTier: "pro",    colorMode: "rgb-full", mW: 3000,  notes: "Club 3W at 20K. Wide 70° scan covers the room. Shift patterns on 2-bar cycles. Grating from 65% average energy upward." },
    { id: "kvant-clubmax6000", model: "Clubmax 6000 FB4",  channels: 16, scanTier: "pro",    colorMode: "rgb-full", mW: 6000,  notes: "6W festival RGB. Lower bass threshold to 45%. Dual output enables split-beam grating patterns. Limit continuous strobe to 4 bars." },
    { id: "kvant-burstberry",  model: "Burstberry 400 FB4",channels: 16, scanTier: "fast",   colorMode: "rgb-full", mW: 400,   notes: "Compact 400mW. Stick to 1:1 and 2:1 Lissajous for maximum brightness. Pattern shifts every 8 beats." },
  ],
  "Laserworld": [
    { id: "laserworld-pl2000",  model: "PL-2000RGB",  channels: 16, scanTier: "fast",   colorMode: "rgb-full", mW: 2000, notes: "2W pro RGB at 20K. Full pattern library. Shift banks on 2-bar phrases. Grating on dense energy sections." },
    { id: "laserworld-cs500",   model: "CS-500RGB",   channels: 16, scanTier: "mid",    colorMode: "rgb-full", mW: 500,  notes: "Entry pro at 15K. Prefer simple circles and figure-8s. Reserve complex Lissajous for slower passages." },
    { id: "laserworld-ds2000",  model: "DS-2000RGB",  channels: 16, scanTier: "fast",   colorMode: "rgb-full", mW: 2000, notes: "Mid-range pro at 18K. Handles 4:3 Lissajous well. Bass drives zoom and red. Save grating for climactic sections." },
    { id: "laserworld-el900",   model: "EL-900RGB",   channels: 16, scanTier: "mid",    colorMode: "rgb-full", mW: 900,  notes: "Compact 1W class. Simple patterns with generous zoom. Snap zoom on bass drops, decay over 2 beats." },
    { id: "laserworld-tdl500",  model: "TDL-500 RGB", channels: 7,  scanTier: "budget", colorMode: "rgb-full", mW: 500,  notes: "Entry 7ch. Sweep movements. Step patterns every beat. Color index cycles over 4 bars." },
  ],
  "Chauvet DJ": [
    { id: "chauvet-scorpion-fx-rgb", model: "Scorpion Storm FX RGB", channels: 16, scanTier: "mid", colorMode: "rgb-full", mW: 520,  notes: "Built-in grating produces 5-point beam fans — use grating as primary driver from beat 1. Strobe is especially impactful through multi-beam output." },
    { id: "chauvet-scorpion-rgy",    model: "Scorpion Storm RGY",    channels: 16, scanTier: "mid", colorMode: "rgy",      mW: 260,  notes: "RGY only. Yellow is the star — use it on melodic mid sections. Red on bass. Sweep X/Y for depth." },
    { id: "chauvet-scorpion-dual",   model: "Scorpion Dual RGB",     channels: 16, scanTier: "mid", colorMode: "rgb-full", mW: 200,  notes: "Dual output. Program X as pendulum sweep so both beams fan the room. Keep patterns simple (circle, figure-8) for max brightness." },
  ],
  "American DJ": [
    { id: "adj-galaxian-3d", model: "Galaxian 3D MKII",   channels: 7,  scanTier: "budget", colorMode: "rgy",     mW: 100,  notes: "360° motorized scatter head. Program slow circular sweeps at 1/4 BPM. Step patterns every 4 beats. Color cycling is the main variation." },
    { id: "adj-vizi-beam",   model: "Vizi Beam RXONE",    channels: 16, scanTier: "budget", colorMode: "indexed", mW: 150,  notes: "Moving head — slower than galvo. Use conservative movement speeds. Step gobo/prism on 4-bar phrases. Color every 2 bars. Minimal strobe." },
  ],
  "Showtec": [
    { id: "showtec-galactic-b140",   model: "Galactic B140 MKII",  channels: 7,  scanTier: "mid",  colorMode: "rg",      mW: 140,  notes: "RG only classic. Red+green = yellow via additive mixing. Alternate on 2-beat intervals for rhythmic flicker. Figure-8 Lissajous at 2x BPM." },
    { id: "showtec-galactic-rgb300", model: "Galactic RGB 300",    channels: 16, scanTier: "mid",  colorMode: "rgb-full", mW: 300,  notes: "300mW RGB club laser. Full RGB matrix: bass→red, mid→green, high→blue. White flash on simultaneous peaks for maximum impact." },
    { id: "showtec-solaris5",        model: "Solaris 5",           channels: 16, scanTier: "fast", colorMode: "rgb-full", mW: 5000, notes: "5W RGBA festival. Lower bass threshold to 45%. Yellow diode on mid-energy plateaus. Full 4-bank library on 16-beat cycles." },
  ],
  "Eliminator Lighting": [
    { id: "eliminator-stealth",    model: "Stealth Laser",   channels: 7,  scanTier: "budget", colorMode: "rg",       mW: 100, notes: "Budget RG. 4 core patterns cycled every 4 beats. Circle at 1x BPM. Zoom always 80-100% for visibility." },
    { id: "eliminator-avalanche",  model: "Avalanche Laser", channels: 16, scanTier: "mid",    colorMode: "rgb-full", mW: 300, notes: "Mid-range 300mW RGB. Shift banks every 8 beats. Grating at 180 for mid-density, 255 for peaks. Rotation at 1/2 BPM." },
  ],
  "Beamz": [
    { id: "beamz-polaris3000",   model: "Polaris 3000 RGB",  channels: 16, scanTier: "mid",    colorMode: "rgb-full", mW: 300, notes: "Solid mid-range. Prefer 2:1 and 3:2 Lissajous. Step every 8 beats. Zoom snaps on bass very impactful with 50° scan." },
    { id: "beamz-scorpion-rgy",  model: "Scorpion MKII RGY", channels: 7,  scanTier: "budget", colorMode: "rgy",      mW: 80,  notes: "Budget RGY. Cycle: red→yellow→green→off. Step every 4 beats. Zoom stays 85%+ always." },
  ],
  "Eytse": [
    { id: "eytse-ey003l", model: "EY003-L (15-ch)", channels: 15, scanTier: "mid",  colorMode: "indexed", mW: 2000, notes: "15-ch indexed-color DMX. CH1=120 for DMX mode. CH9 color: 51-100=Red, 101-150=Green, 151-200=Blue, 201-255=Multi. CH7/8 X/Y Zoom snap on bass. CH15 segment count fans out on peaks." },
    { id: "eytse-ey006l", model: "EY006-L (16-ch)", channels: 16, scanTier: "fast", colorMode: "rgb-full", mW: 600, notes: "600mW with faster scanner. Complex 3:2 and 4:3 Lissajous cleanly. Lower bass threshold to 50%. 16-beat pattern cycles." },
  ],
  "Generic / Budget": [
    { id: "generic-7ch",  model: "7-Channel Animation Laser",  channels: 7,  scanTier: "budget", colorMode: "indexed",   mW: 200, notes: "Universal 7ch. Patterns every 4 beats. Color 0→255 over 2 bars. Circle sweep. Zoom above 85%." },
    { id: "generic-16ch", model: "16-Channel Animation Laser", channels: 16, scanTier: "budget", colorMode: "rgb-full", mW: 200, notes: "Generic 16ch. Raise bass threshold — budget scanners need strong signal for clean zoom snaps. 1:1 and 2:1 Lissajous only." },
  ],
};

// Correct 15-channel map per EY003-L manual
const EYTSE_CHANNEL_NAMES = [
  'Mode','Pattern Group','Pattern Choice','Strobe Speed',
  'X-Axis Move','Y-Axis Move','X-Axis Zoom','Y-Axis Zoom',
  'Color Select','Rotation','X Roll (3D)','Y Roll (3D)',
  'Draw Speed','Pattern Size','Segment Count',
];
const GENERIC7_CHANNEL_NAMES = [
  'Mode','Pattern','Strobe','Zoom','X Position','Y Position','Color Index',
];

// ── Zone Map constants ─────────────────────────────────────────────────────────
const ZONE_COLS = 12;
const ZONE_ROWS = 8;
const ZONE_STORAGE_KEY = 'lasershow_zone_presets';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  connected: false,
  brand: 'Eytse',
  model: 'EY003-L (16-ch)',
  laserProfile: null,  // the DB entry for current laser
  port: '',
  playing: false,
  duration: 0,
  bpm: 120,
  totalFrames: 0,
  startTime: null,
  pollId: null,
  rafId: null,
  envelopes: { bass: 0, mid: 0, high: 0 },
  phase: 0,
  patternIdx: 0,
  lastPatternBeat: -1,
  energyHistory: [],
  zoomDecay: 0,
  pendingSeek: null,
  zoneMask: Array.from({ length: ZONE_ROWS }, () => new Array(ZONE_COLS).fill(true)),
  zoneEnabled: false,
  zonePreview: false,
  zonePreviewTimer: null,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const setupOverlay    = $('setup-overlay');
const app             = $('app');
const brandSelect     = $('laser-brand-select');
const modelSelect     = $('laser-model-select');
const capBox          = $('laser-capability-box');
const capNotes        = $('cap-notes');
const capBadges       = $('cap-badges');
const comPort         = $('com-port');
const refreshPorts    = $('refresh-ports');
const connectError    = $('connect-error');
const btnConnect      = $('btn-connect');

const dropZone        = $('drop-zone');
const btnBrowse       = $('btn-browse');
const trackInfo       = $('track-info');
const trackName       = $('track-name');
const trackBpm        = $('track-bpm');
const trackDuration   = $('track-duration');
const btnPlay         = $('btn-play');
const iconPlay        = $('icon-play');
const iconStop        = $('icon-stop');
const progressFill    = $('progress-fill');
const timeCurrent     = $('time-current');
const timeTotal       = $('time-total');
const barBass         = $('bar-bass');
const barMid          = $('bar-mid');
const barHigh         = $('bar-high');
const specCanvas      = $('spectrum-canvas');
const channelGrid     = $('channel-grid');
const hwDot           = $('hw-dot');
const hwLabel         = $('hw-label');
const hwBrand         = $('hw-brand-label');
const hwModelEl       = $('hw-model-label');
const hwPort          = $('hw-port-label');
const stripBrand      = $('strip-brand');
const stripModel      = $('strip-model');
const stripBadges     = $('strip-badges');
const strategyStrip   = $('strategy-strip');
const strategyText    = $('strategy-text');
const settingsBrand   = $('settings-brand');
const settingsModel   = $('settings-model');
const settingsPort    = $('settings-port');

// ── Laser brand → model population ───────────────────────────────────────────
function populateModels(brandSel, modelSel, brand) {
  const models = LASER_DB[brand] || [];
  modelSel.innerHTML = models.map(l =>
    `<option value="${l.model}">${l.model}</option>`
  ).join('');
}

function getLaser(brand, model) {
  return (LASER_DB[brand] || []).find(l => l.model === model) || null;
}

function showCapability(laser) {
  if (!laser) { capBox.classList.add('hidden'); return; }
  capNotes.textContent = laser.notes;
  capBadges.innerHTML = [
    `<span class="cap-badge">${laser.channels}ch</span>`,
    `<span class="cap-badge">${laser.mW >= 1000 ? laser.mW/1000 + 'W' : laser.mW + 'mW'}</span>`,
    `<span class="cap-badge">${laser.colorMode.toUpperCase()}</span>`,
    `<span class="cap-badge scan-${laser.scanTier}">${laser.scanTier.toUpperCase()} SCAN</span>`,
  ].join('');
  capBox.classList.remove('hidden');
}

// Init brand/model selects
populateModels(brandSelect, modelSelect, state.brand);
showCapability(getLaser(state.brand, modelSelect.value));

brandSelect.addEventListener('change', () => {
  state.brand = brandSelect.value;
  populateModels(brandSelect, modelSelect, state.brand);
  state.model = modelSelect.value;
  showCapability(getLaser(state.brand, state.model));
});
modelSelect.addEventListener('change', () => {
  state.model = modelSelect.value;
  showCapability(getLaser(state.brand, state.model));
});

// Settings panel mirrors
populateModels(settingsBrand, settingsModel, state.brand);
settingsBrand.addEventListener('change', () => {
  populateModels(settingsBrand, settingsModel, settingsBrand.value);
});

// ── Spectrum canvas ───────────────────────────────────────────────────────────
const specCtx = specCanvas.getContext('2d');

function resizeCanvas() {
  specCanvas.width  = specCanvas.offsetWidth;
  specCanvas.height = specCanvas.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function drawSpectrum() {
  const W = specCanvas.width;
  const H = specCanvas.height;
  specCtx.clearRect(0, 0, W, H);
  const numBars = 32;
  const barW = W / numBars - 2;
  const { bass, mid, high } = state.envelopes;

  for (let i = 0; i < numBars; i++) {
    const t = i / numBars;
    let env = t < 0.3 ? bass * (1 + 0.3 * Math.random())
            : t < 0.65 ? mid * (1 + 0.25 * Math.random())
            : high * (1 + 0.2 * Math.random());
    env = Math.min(1, env);
    const bh = env * H * 0.88;
    let r, g, b;
    if (t < 0.3) {
      r = 255; g = Math.round(101 + t / 0.3 * 60); b = 100;
    } else if (t < 0.65) {
      r = Math.round(100 - (t - 0.3) / 0.35 * 50); g = 217;
      b = Math.round(100 + (t - 0.3) / 0.35 * 60);
    } else {
      r = Math.round(100 + (t - 0.65) / 0.35 * 108);
      g = Math.round(145 - (t - 0.65) / 0.35 * 80); b = 255;
    }
    const x = i * (barW + 2);
    const grad = specCtx.createLinearGradient(0, H, 0, H - bh);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0.2)`);
    specCtx.fillStyle = grad;
    specCtx.beginPath();
    specCtx.roundRect(x, H - bh, barW, bh, 2);
    specCtx.fill();
  }
}

// ── Preview canvas (Lissajous laser preview) ──────────────────────────────────
const previewCanvas = $('preview-canvas');
let previewCtx = null;
if (previewCanvas) previewCtx = previewCanvas.getContext('2d');

const LISSAJOUS = [
  [1,1,Math.PI/2],[2,1,Math.PI/2],[1,2,Math.PI/2],
  [3,2,Math.PI/4],[2,3,Math.PI/4],[3,1,Math.PI/2],
  [4,3,Math.PI/4],[1,1,0],[2,2,Math.PI/4],[3,3,Math.PI/6],
];

function drawPreview() {
  if (!previewCtx || !previewCanvas) return;
  const W = previewCanvas.width  = previewCanvas.offsetWidth;
  const H = previewCanvas.height = previewCanvas.offsetHeight;

  previewCtx.globalAlpha = 0.15;
  previewCtx.fillStyle = '#000008';
  previewCtx.fillRect(0, 0, W, H);
  previewCtx.globalAlpha = 1;

  const { bass, mid, high } = state.envelopes;
  const energy = bass * 0.5 + mid * 0.3 + high * 0.2;
  const laser  = getLaser(state.brand, state.model);

  const r = Math.round(bass * 255);
  const g = Math.round(mid  * 255);
  const bl= Math.round(high * 255);
  const color = `rgb(${r},${g},${bl})`;

  const cx = W / 2;
  const cy = H / 2;
  const radius = Math.min(W, H) * 0.35 * (0.4 + energy * 0.6);
  const t = performance.now() / 1000;

  const pidx = state.patternIdx % LISSAJOUS.length;
  const [a, b, delta] = LISSAJOUS[pidx];

  previewCtx.save();

  // Zone clip — constrain Lissajous to active zone cells
  if (state.zoneEnabled || state.zonePreview) {
    const cw2 = W / ZONE_COLS, rh2 = H / ZONE_ROWS;
    previewCtx.beginPath();
    for (let r = 0; r < ZONE_ROWS; r++) {
      for (let c = 0; c < ZONE_COLS; c++) {
        if (state.zoneMask[r][c]) {
          previewCtx.rect(c * cw2, r * rh2, cw2, rh2);
        }
      }
    }
    previewCtx.clip();
  }

  previewCtx.shadowBlur = 12 + energy * 24;
  previewCtx.shadowColor = color;
  previewCtx.strokeStyle = color;
  previewCtx.lineWidth = 1.5 + energy * 1.5;
  previewCtx.globalAlpha = 0.6 + energy * 0.35;
  previewCtx.lineCap = 'round';
  previewCtx.beginPath();
  const steps = 500;
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * Math.PI * 2 + t * 0.1;
    const x = cx + radius * Math.sin(a * s + delta);
    const y = cy + radius * Math.sin(b * s);
    i === 0 ? previewCtx.moveTo(x, y) : previewCtx.lineTo(x, y);
  }
  previewCtx.stroke();
  previewCtx.restore();

  // Zone overlay — draw grid + blocked cells on top
  drawZoneOverlay(previewCtx, W, H);
}

// ── Serial port helpers ───────────────────────────────────────────────────────
const noPortsHelp  = $('no-ports-help');
const manualPort   = $('manual-port');
const ftdiLink     = $('ftdi-link');

if (ftdiLink) {
  ftdiLink.addEventListener('click', e => {
    e.preventDefault();
    window.__TAURI__.shell.open('https://ftdichip.com/drivers/vcp-drivers/');
  });
}

if (manualPort) {
  manualPort.addEventListener('input', () => {
    btnConnect.disabled = !manualPort.value.trim() && !comPort.value;
  });
}

async function loadPorts(selectEl) {
  try {
    const ports = await invoke('list_serial_ports');
    if (ports.length > 0) {
      selectEl.innerHTML = ports.map(p => `<option value="${p}">${p}</option>`).join('');
      if (noPortsHelp) noPortsHelp.classList.add('hidden');
      btnConnect.disabled = false;
    } else {
      selectEl.innerHTML = '<option value="">No ports detected — see below</option>';
      if (noPortsHelp) noPortsHelp.classList.remove('hidden');
      // Keep connect enabled if user already typed a manual port
      btnConnect.disabled = !manualPort?.value.trim();
    }
  } catch {
    selectEl.innerHTML = '<option value="">Error scanning ports</option>';
    if (noPortsHelp) noPortsHelp.classList.remove('hidden');
    btnConnect.disabled = !manualPort?.value.trim();
  }
}

function resolvePort() {
  return manualPort?.value.trim() || comPort.value;
}

// ── Channel display ───────────────────────────────────────────────────────────
function buildChannelGrid() {
  const laser = getLaser(state.brand, state.model);
  const ch = laser?.channels ?? 16;
  const names = ch === 7 ? GENERIC7_CHANNEL_NAMES : EYTSE_CHANNEL_NAMES;
  channelGrid.innerHTML = names.slice(0, ch).map((name, i) => `
    <div class="ch-card" id="ch-card-${i}">
      <div class="ch-card-label">${name}</div>
      <div class="ch-card-number">CH ${i + 1}</div>
      <div class="ch-card-value" id="ch-val-${i}">0</div>
      <div class="ch-card-bar"><div class="ch-card-bar-fill" id="ch-bar-${i}"></div></div>
    </div>
  `).join('');
}

// ── Expert DMX engine (mirrors show-engine.ts logic) ─────────────────────────
function computeDmx(bass, mid, high, bpm, elapsed) {
  const laser = getLaser(state.brand, state.model);
  if (!laser) return new Array(16).fill(0);

  const beatDur = 60 / bpm;
  const beatsPerTick = (1/40) / beatDur;
  const movSpeed = typeof aiShowOverrides.movementSpeed === 'number' ? aiShowOverrides.movementSpeed : 1.0;
  state.phase += beatsPerTick * Math.PI * 2 * movSpeed;

  const energy = bass * 0.5 + mid * 0.3 + high * 0.2;
  state.energyHistory.push(energy);
  if (state.energyHistory.length > 160) state.energyHistory.shift();
  const avgE = state.energyHistory.reduce((a,b)=>a+b,0) / state.energyHistory.length;

  const absB = Math.floor(elapsed / beatDur);
  const shiftBeats = aiShowOverrides.patternShiftBeats ?? (laser.scanTier === 'pro' ? 32 : laser.scanTier === 'fast' ? 16 : 8);
  if (absB > 0 && absB % shiftBeats === 0 && absB !== state.lastPatternBeat) {
    state.lastPatternBeat = absB;
    state.patternIdx = (state.patternIdx + 1) % LISSAJOUS.length;
  }

  const pidx = state.patternIdx % LISSAJOUS.length;
  const [a, b, delta] = LISSAJOUS[pidx];
  const t = state.phase;
  const xNorm = Math.sin(a * t + delta) * 0.5 + 0.5;
  const yNorm = Math.sin(b * t) * 0.5 + 0.5;

  const bassThresh = aiShowOverrides.bassThreshold ?? (laser.scanTier === 'pro' ? 0.45 : laser.scanTier === 'fast' ? 0.5 : 0.6);
  if (bass > bassThresh) state.zoomDecay = 1.0;
  state.zoomDecay *= 0.94;
  const zoom = Math.round((0.39 + state.zoomDecay * 0.61) * 255);

  const rotation = ((state.phase * 0.5) % (Math.PI * 2)) / (Math.PI * 2) * 255;

  let red = 0, green = 0, blue = 0;
  if (laser.colorMode === 'rgb-full') {
    red   = Math.pow(bass, 0.6) * 255;
    green = Math.pow(mid,  0.7) * 255;
    blue  = Math.pow(high, 0.65) * 255;
  } else if (laser.colorMode === 'rgy' || laser.colorMode === 'rg') {
    red   = Math.pow(bass, 0.7) * 255;
    green = Math.pow(mid,  0.8) * (1 - bass * 0.5) * 255;
    if (mid > 0.65) { red = Math.min(255, red + mid * 100); green = Math.min(255, green + mid * 80); }
  }

  const strobeOk = aiShowOverrides.strobeEnabled !== false;
  const strobe = strobeOk && (high > 0.75 && energy > 0.65) ? Math.round(50 + high * 170) : 0;
  const gratingOk = aiShowOverrides.gratingEnabled !== false;
  const gratingOn = gratingOk && energy > 0.65 && energy > avgE * 1.1;
  const grating = gratingOn ? Math.round(120 + energy * 135) : 0;
  const gratingRot = gratingOn ? Math.round(rotation * 0.5) : 0;

  const ch = new Array(Math.max(laser.channels, 16)).fill(0);
  if (laser.channels === 7) {
    ch[0] = 100;
    ch[1] = Math.round((pidx / LISSAJOUS.length) * 200 + 20);
    ch[2] = strobe;
    ch[3] = zoom;
    ch[4] = Math.round(xNorm * 255);
    ch[5] = Math.round(yNorm * 255);
    ch[6] = Math.round((elapsed * 0.1 * 255) % 255);
  } else {
    // ── EY003-L correct 15-channel mapping ──────────────────────────────────
    // CH1  Mode Selection  — 120 locks DMX Control mode
    ch[0]  = 120;
    // CH2  Pattern Group   — slow bank cycling (~20 s per group, 4 groups)
    const bankIdx = Math.floor(elapsed / (beatDur * Math.max(shiftBeats, 8))) % 4;
    ch[1]  = bankIdx * 64;
    // CH3  Pattern Choice  — specific animation driven by mid+high
    ch[2]  = Math.round((pidx / LISSAJOUS.length) * 200 + 20);
    // CH4  Strobe Speed    — 0 = off; only on peak hi-hat + energy
    ch[3]  = (high > 0.75 && energy > 0.65) ? Math.round(50 + high * 150) : 0;
    // CH5  X-Axis Move     — BPM-locked horizontal sweep
    ch[4]  = Math.round(xNorm * 255);
    // CH6  Y-Axis Move     — BPM-locked vertical sweep
    ch[5]  = Math.round(yNorm * 255);
    // CH7  X-Axis Zoom     — bass-reactive width snap
    ch[6]  = zoom;
    // CH8  Y-Axis Zoom     — slightly tighter for depth feel
    ch[7]  = Math.round(zoom * 0.92);
    // CH9  Color Selection — indexed zones (NOT raw RGB):
    //   ~51-100=Red  ~101-150=Green  ~151-200=Blue  ~201-255=Multi-color
    if      (bass > 0.65)  ch[8] = 70;   // Red — kick/sub
    else if (mid  > 0.60)  ch[8] = 120;  // Green — melody
    else if (high > 0.60)  ch[8] = 170;  // Blue — hi-hat/snare
    else                   ch[8] = 220;  // Multi-color — ambient
    // CH10 Rotation       — continuous 2D rotation
    ch[9]  = Math.round(rotation);
    // CH11 X Roll (3D)    — barrel roll on strong bass drops
    ch[10] = bass > 0.80 ? Math.round(bass * 180) : 0;
    // CH12 Y Roll (3D)    — vertical flip on strong mid peaks
    ch[11] = mid  > 0.75 ? Math.round(mid  * 150) : 0;
    // CH13 Drawing Speed  — faster on high energy
    ch[12] = Math.round(100 + energy * 155);
    // CH14 Pattern Size   — master scale, bass-driven
    ch[13] = zoom;
    // CH15 Segment Count  — fan-out / mirror on peaks
    ch[14] = (energy > 0.65 && energy > avgE * 1.1) ? Math.round(100 + energy * 155) : 0;
    // CH16 unused (15-ch fixture)
    ch[15] = 0;
  }
  // ── Zone masking: remap X/Y position + scale zoom to active zone bounds ───────
  if (state.zoneEnabled) {
    const bounds = getZoneBounds();
    if (bounds) {
      const { minX, maxX, minY, maxY } = bounds;
      const zw = maxX - minX;
      const zh = maxY - minY;
      if (laser.channels === 7) {
        // 7-ch: CH5=X, CH6=Y, CH4=Zoom
        const ox = ch[4] / 255, oy = ch[5] / 255;
        ch[4] = Math.round((minX + ox * zw) * 255);
        ch[5] = Math.round((minY + oy * zh) * 255);
        ch[3] = Math.round(ch[3] * Math.min(zw, zh));
      } else {
        // 15-ch Eytse: CH5=X(idx4), CH6=Y(idx5), CH7=Xzoom(idx6), CH8=Yzoom(idx7), CH14=Size(idx13)
        const ox = ch[4] / 255, oy = ch[5] / 255;
        ch[4]  = Math.round((minX + ox * zw) * 255);
        ch[5]  = Math.round((minY + oy * zh) * 255);
        ch[6]  = Math.round(ch[6]  * zw);
        ch[7]  = Math.round(ch[7]  * zh);
        ch[13] = Math.round(ch[13] * Math.min(zw, zh));
      }
    }
  }

  return ch.slice(0, laser.channels);
}

function updateChannelDisplay(values) {
  values.forEach((v, i) => {
    const val = $(`ch-val-${i}`);
    const bar = $(`ch-bar-${i}`);
    if (val) val.textContent = Math.round(v);
    if (bar) bar.style.width = `${(v / 255) * 100}%`;
  });
}

// ── Envelope bars ─────────────────────────────────────────────────────────────
function updateEnvelopeBars(bass, mid, high) {
  barBass.style.setProperty('--level', `${bass * 100}%`);
  barMid.style.setProperty('--level',  `${mid  * 100}%`);
  barHigh.style.setProperty('--level', `${high * 100}%`);
}

// ── Progress / time ───────────────────────────────────────────────────────────
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateProgress(framePct) {
  progressFill.style.width = `${framePct * 100}%`;
  const elapsed = framePct * state.duration;
  timeCurrent.textContent = formatTime(elapsed);
}

// ── 40 Hz polling loop ────────────────────────────────────────────────────────
async function pollEnvelopes() {
  if (!state.playing) return;
  try {
    const env = await invoke('get_current_envelopes');
    if (env) {
      state.envelopes = { bass: env.bass, mid: env.mid, high: env.high };
      state.bpm = env.bpm || state.bpm;
      updateEnvelopeBars(env.bass, env.mid, env.high);
      const elapsed = state.startTime ? (Date.now() - state.startTime) / 1000 : 0;
      const dmxVals = computeDmx(env.bass, env.mid, env.high, env.bpm || state.bpm, elapsed);
      updateChannelDisplay(dmxVals);
      if (state.totalFrames > 0) updateProgress(env.frame / state.totalFrames);
      if (env.frame >= state.totalFrames - 2 && state.totalFrames > 0) stopPlayback();
    }
  } catch { /* ignore */ }
}

function startPoll() {
  if (state.pollId) return;
  state.pollId = setInterval(pollEnvelopes, 25);
}
function stopPoll() { clearInterval(state.pollId); state.pollId = null; }

// ── Animation frame ────────────────────────────────────────────────────────────
function animFrame() {
  drawSpectrum();
  drawPreview();
  tickSceneEngine();
  state.rafId = requestAnimationFrame(animFrame);
}
requestAnimationFrame(animFrame);

// ── Playback control ──────────────────────────────────────────────────────────
async function startPlayback() {
  try {
    if (state.pendingSeek != null) {
      await invoke('seek_and_play', { offsetSecs: state.pendingSeek });
      state.startTime  = Date.now() - state.pendingSeek * 1000;
      state.pendingSeek = null;
    } else {
      await invoke('start_playback');
      state.startTime = Date.now();
    }
    state.playing   = true;
    state.phase     = 0;
    state.patternIdx = 0;
    state.lastPatternBeat = -1;
    state.energyHistory = [];
    state.zoomDecay = 0;
    btnPlay.classList.add('playing');
    iconPlay.classList.add('hidden');
    iconStop.classList.remove('hidden');
    const liveBanner = $('laser-live-banner');
    if (liveBanner) liveBanner.classList.remove('hidden');
    startPoll();
  } catch (e) { alert('Playback failed: ' + e); }
}

async function stopPlayback() {
  state.playing   = false;
  state.startTime = null;
  await invoke('stop_playback');
  stopPoll();
  state.envelopes = { bass: 0, mid: 0, high: 0 };
  updateEnvelopeBars(0, 0, 0);
  progressFill.style.width = '0%';
  timeCurrent.textContent  = '0:00';
  btnPlay.classList.remove('playing');
  iconPlay.classList.remove('hidden');
  iconStop.classList.add('hidden');
  const liveBanner = $('laser-live-banner');
  if (liveBanner) liveBanner.classList.add('hidden');
}

// ── Cable type toggle ─────────────────────────────────────────────────────────
let selectedCableType = 'enttec-pro';
const cableHints = {
  'enttec-pro': '57 600 baud · ENTTEC USB Pro protocol',
  'raw':        '250 000 baud · raw DMX512 (8N2) with BREAK',
};
document.querySelectorAll('.cable-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cable-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedCableType = btn.dataset.value;
    const hint = document.getElementById('cable-hint');
    if (hint) hint.textContent = cableHints[selectedCableType] || '';
  });
});

// ── Port loading ──────────────────────────────────────────────────────────────
loadPorts(comPort);
refreshPorts.addEventListener('click', () => loadPorts(comPort));

// ── Connect ───────────────────────────────────────────────────────────────────
btnConnect.addEventListener('click', async () => {
  const port  = resolvePort();
  const brand = brandSelect.value;
  const model = modelSelect.value;
  if (!port) return;

  // Map to Rust profile key
  const laser = getLaser(brand, model);
  const profileKey = laser?.channels === 7 ? 'Generic7Channel' : 'EytseEY003L';

  connectError.classList.add('hidden');
  btnConnect.disabled = true;
  btnConnect.textContent = 'Connecting…';

  try {
    await invoke('connect_dmx', { port, cableType: selectedCableType });
    await invoke('set_laser_profile', { profile: profileKey });

    state.connected = true;
    state.brand = brand;
    state.model = model;
    state.port  = port;

    // Update sidebar
    hwDot.className     = 'dot connected';
    hwLabel.textContent = 'DMX Connected';
    hwBrand.textContent = brand;
    if (hwModelEl) hwModelEl.textContent = model;
    hwPort.textContent  = port;

    // Update strip
    if (stripBrand) stripBrand.textContent = brand;
    if (stripModel) stripModel.textContent = model;
    if (stripBadges && laser) {
      stripBadges.innerHTML = [
        `<span class="strip-badge">${laser.channels}ch</span>`,
        `<span class="strip-badge">${laser.mW >= 1000 ? laser.mW/1000+'W' : laser.mW+'mW'}</span>`,
        `<span class="strip-badge">${laser.colorMode.toUpperCase()}</span>`,
      ].join('');
    }

    // Strategy strip
    if (strategyStrip && laser) {
      strategyText.textContent = laser.notes;
      strategyStrip.classList.remove('hidden');
    }

    buildChannelGrid();
    setupOverlay.classList.add('hidden');
    app.classList.remove('hidden');

    await loadPorts(settingsPort);
    settingsBrand.value = brand;
    populateModels(settingsBrand, settingsModel, brand);
    settingsModel.value = model;
  } catch (e) {
    connectError.textContent = String(e);
    connectError.classList.remove('hidden');
  } finally {
    btnConnect.disabled  = false;
    btnConnect.textContent = 'Connect & Launch Show';
  }
});

// ── Nav panel switching ────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`panel-${btn.dataset.panel}`).classList.add('active');
  });
});

// ── File loading ───────────────────────────────────────────────────────────────
async function loadFile(path) {
  if (state.playing) await stopPlayback();
  dropZone.style.opacity = '.5';
  try {
    const analysis = await invoke('load_audio', { path });
    state.duration    = analysis.duration_sec;
    state.bpm         = analysis.bpm;
    state.totalFrames = analysis.total_frames;

    const name = path.split(/[\\/]/).pop();
    trackName.textContent     = name;
    trackBpm.textContent      = `${Math.round(analysis.bpm)} BPM`;
    trackDuration.textContent = formatTime(analysis.duration_sec);
    timeTotal.textContent     = formatTime(analysis.duration_sec);
    timeCurrent.textContent   = '0:00';
    progressFill.style.width  = '0%';
    dropZone.classList.add('hidden');
    trackInfo.classList.remove('hidden');
  } catch (e) {
    alert('Failed to load audio: ' + e);
  } finally {
    dropZone.style.opacity = '1';
  }
}

btnBrowse.addEventListener('click', async () => {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac'] }],
  });
  if (selected) loadFile(selected);
});

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file.path);
});

btnPlay.addEventListener('click', () => {
  if (state.playing) stopPlayback(); else startPlayback();
});

// ── Settings panel ─────────────────────────────────────────────────────────────
$('settings-refresh-ports').addEventListener('click', () => loadPorts(settingsPort));

$('btn-reconnect').addEventListener('click', async () => {
  const port  = settingsPort.value;
  const brand = settingsBrand.value;
  const model = settingsModel.value;
  if (!port) return;
  const laser = getLaser(brand, model);
  const profileKey = laser?.channels === 7 ? 'Generic7Channel' : 'EytseEY003L';
  try {
    await invoke('connect_dmx', { port, cableType: selectedCableType });
    await invoke('set_laser_profile', { profile: profileKey });
    state.port  = port;
    state.brand = brand;
    state.model = model;
    hwDot.className     = 'dot connected';
    hwLabel.textContent = 'DMX Connected';
    hwPort.textContent  = port;
    buildChannelGrid();
  } catch (e) { alert('Reconnect failed: ' + e); }
});

$('btn-disconnect').addEventListener('click', async () => {
  if (state.playing) await stopPlayback();
  await invoke('disconnect_dmx');
  state.connected     = false;
  hwDot.className     = 'dot disconnected';
  hwLabel.textContent = 'Not connected';
});

// ── Test burst ────────────────────────────────────────────────────────────────
const btnTestBurst    = $('btn-test-burst');
const testBurstStatus = $('test-burst-status');

if (btnTestBurst) {
  btnTestBurst.addEventListener('click', async () => {
    btnTestBurst.disabled = true;
    testBurstStatus.textContent = 'Sending…';
    testBurstStatus.style.color = '#ffcd56';
    try {
      await invoke('test_dmx_burst');
      testBurstStatus.textContent = '✓ 120 frames sent — watch the laser';
      testBurstStatus.style.color = '#43d9a3';
      setTimeout(() => {
        testBurstStatus.textContent = '';
        btnTestBurst.disabled = false;
      }, 4000);
    } catch (e) {
      testBurstStatus.textContent = '✗ ' + e;
      testBurstStatus.style.color = '#ff6584';
      btnTestBurst.disabled = false;
    }
  });
}

// ── AI Show Director ──────────────────────────────────────────────────────────
const aiMessages   = $('ai-messages');
const aiEmptyState = $('ai-empty-state');
const aiInput      = $('ai-input');
const aiSend       = $('ai-send');
const aiApiStatus  = $('ai-api-status');
const aiActiveBadge= $('ai-active-badge');

let aiChatHistory  = [];
let aiStreaming     = false;
let aiApiUrl        = localStorage.getItem('ai-lasershow-api-url') || '';
let aiShowOverrides = {};

// Restore API URL setting
const settingsAiUrl = $('settings-ai-url');
const btnSaveAiUrl  = $('btn-save-ai-url');
const aiUrlSaved    = $('ai-url-saved');

if (settingsAiUrl) settingsAiUrl.value = aiApiUrl;

if (btnSaveAiUrl) {
  btnSaveAiUrl.addEventListener('click', () => {
    aiApiUrl = (settingsAiUrl?.value || '').trim().replace(/\/$/, '');
    localStorage.setItem('ai-lasershow-api-url', aiApiUrl);
    if (aiUrlSaved) {
      aiUrlSaved.style.display = 'inline';
      setTimeout(() => { aiUrlSaved.style.display = 'none'; }, 2000);
    }
  });
}

// Quick prompts — set input AND immediately send
document.querySelectorAll('.ai-quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (aiInput) {
      aiInput.value = btn.dataset.prompt;
      sendAiMessage();
    }
  });
});

function aiShowStatus(msg, isError = false) {
  if (!aiApiStatus) return;
  if (!msg) { aiApiStatus.classList.add('hidden'); return; }
  aiApiStatus.textContent = msg;
  aiApiStatus.style.color = isError ? '#ff6584' : '#43d9a3';
  aiApiStatus.classList.remove('hidden');
}

function appendAiMessage(role, content, settingsApplied) {
  if (aiEmptyState) aiEmptyState.style.display = 'none';
  const el = document.createElement('div');
  el.className = role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant';
  el.textContent = content || '';
  if (settingsApplied && Object.keys(settingsApplied).length > 0) {
    const badge = document.createElement('div');
    badge.className = 'ai-msg-applied';
    badge.textContent = '✓ Updated: ' + Object.keys(settingsApplied).join(', ');
    el.appendChild(badge);
  }
  aiMessages.appendChild(el);
  aiMessages.scrollTop = aiMessages.scrollHeight;
  return el;
}

async function sendAiMessage() {
  if (!aiInput || !aiInput.value.trim() || aiStreaming) return;
  const text = aiInput.value.trim();
  aiInput.value = '';

  if (!aiApiUrl) {
    aiShowStatus('⚠ Set your AI API URL in Settings → AI Director to enable chat.', true);
    return;
  }

  aiStreaming = true;
  if (aiSend) aiSend.disabled = true;
  aiShowStatus('');

  appendAiMessage('user', text);
  aiChatHistory.push({ role: 'user', content: text });

  const placeholderEl = appendAiMessage('assistant', '');
  placeholderEl.innerHTML = '<span class="ai-thinking">thinking…</span>';

  const laser = getLaser(state.brand, state.model);

  try {
    const resp = await fetch(`${aiApiUrl}/api/laser/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        laser: laser ? {
          brand: state.brand,
          model: state.model,
          channelCount: laser.channels,
          colorMode: laser.colorMode,
          scanTier: laser.scanTier,
          availableColors: [],
          specialFeatures: [],
          maxPowerMw: laser.mW,
          notes: laser.notes,
        } : null,
        messages: aiChatHistory,
        currentSettings: aiShowOverrides,
        musicContext: state.bpm ? {
          bpm: state.bpm,
          duration: state.duration,
          isPlaying: state.playing,
        } : undefined,
        zoneInfo: (() => {
          const total = ZONE_COLS * ZONE_ROWS;
          const activeCells = state.zoneMask.flat().filter(Boolean).length;
          if (!state.zoneEnabled || activeCells === total) return null;
          const bounds = getZoneBounds();
          // Human-readable description of the active zone
          const leftPct  = Math.round(bounds.minX * 100);
          const rightPct = Math.round(bounds.maxX * 100);
          const topPct   = Math.round(bounds.minY * 100);
          const botPct   = Math.round(bounds.maxY * 100);
          const cx = Math.round((bounds.minX + bounds.maxX) / 2 * 100);
          const cy = Math.round((bounds.minY + bounds.maxY) / 2 * 100);
          const hPos = cx < 35 ? 'left third' : cx > 65 ? 'right third' : 'center';
          const vPos = cy < 35 ? 'top third'  : cy > 65 ? 'bottom third' : 'middle';
          return {
            enabled: true,
            activeCells,
            totalCells: total,
            activePercent: Math.round(activeCells / total * 100),
            bounds: { minX: bounds.minX, maxX: bounds.maxX, minY: bounds.minY, maxY: bounds.maxY },
            description: `${hPos}, ${vPos} — horizontal ${leftPct}%–${rightPct}%, vertical ${topPct}%–${botPct}% of output field`,
          };
        })(),
      }),
    });

    if (!resp.ok || !resp.body) throw new Error(`API error ${resp.status}`);

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let accumulated = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.error) throw new Error(data.error);
          if (data.content) {
            accumulated += data.content;
            // Strip <settings> blocks for display
            const display = accumulated
              .replace(/<settings>[\s\S]*?<\/settings>/g, '')
              .trim();
            placeholderEl.textContent = display || accumulated;
          }
          if (data.done) {
            // Parse <settings>{...}</settings> block from the API response
            const match = accumulated.match(/<settings>([\s\S]*?)<\/settings>/);
            let settings = null;
            if (match) {
              try { settings = JSON.parse(match[1]); } catch { /* ignore */ }
            }
            const displayText = accumulated
              .replace(/<settings>[\s\S]*?<\/settings>/g, '')
              .trim();

            placeholderEl.textContent = displayText || accumulated;

            if (settings && Object.keys(settings).length > 0) {
              aiShowOverrides = { ...aiShowOverrides, ...settings };
              buildSceneTimes();
              renderSceneList();
              renderSceneTimeline();
              if (aiActiveBadge) aiActiveBadge.classList.remove('hidden');
              const badge = document.createElement('div');
              badge.className = 'ai-msg-applied';
              const sceneNote = sceneTimes.length ? ` · ${sceneTimes.length} scenes` : '';
              badge.textContent = '✓ Updated: ' + Object.keys(settings).join(', ') + sceneNote;
              placeholderEl.appendChild(badge);
            }

            aiChatHistory.push({ role: 'assistant', content: accumulated });
          }
        } catch (parseErr) { /* skip malformed SSE lines */ }
      }
    }
  } catch (e) {
    placeholderEl.textContent = 'Error: ' + e.message;
    placeholderEl.style.color = '#ff6584';
    aiShowStatus('Connection failed — check the AI API URL in Settings.', true);
  } finally {
    aiStreaming = false;
    if (aiSend) aiSend.disabled = false;
    aiMessages.scrollTop = aiMessages.scrollHeight;
  }
}

if (aiSend)  aiSend.addEventListener('click', sendAiMessage);
if (aiInput) aiInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENE ENGINE
// ══════════════════════════════════════════════════════════════════════════════

let sceneTimes = [];
let currentSceneIdx = -1;

function buildSceneTimes() {
  const seq = aiShowOverrides.sequence;
  if (!Array.isArray(seq) || !seq.length) { sceneTimes = []; return; }
  const bpm = state.bpm || 120;
  const beatDur = 60 / bpm;
  const barDur = beatDur * 4;
  let offset = 0;
  sceneTimes = seq.map((scene, i) => {
    const bars = scene.durationBars ?? 8;
    const dur = bars * barDur;
    const entry = { ...scene, startTime: offset, endTime: offset + dur, idx: i };
    offset += dur;
    return entry;
  });
}

function getSceneIdxAtTime(elapsed) {
  if (!sceneTimes.length) return -1;
  for (let i = sceneTimes.length - 1; i >= 0; i--) {
    if (elapsed >= sceneTimes[i].startTime) return i;
  }
  return 0;
}

async function seekToScene(idx) {
  const scene = sceneTimes[idx];
  if (!scene) return;
  const offsetSecs = scene.startTime;
  if (state.playing) {
    state.startTime = Date.now() - offsetSecs * 1000;
    try { await invoke('seek_and_play', { offsetSecs }); }
    catch (e) { console.warn('seek_and_play failed:', e); }
  } else {
    state.pendingSeek = offsetSecs;
  }
  currentSceneIdx = idx;
  updateSceneHighlights(idx);
  scrollTimelineToScene(idx);
  updatePreviewSceneLabel(idx);
}

function updateSceneHighlights(idx) {
  document.querySelectorAll('.scene-card').forEach((card, i) => {
    card.classList.toggle('active', i === idx);
  });
  document.querySelectorAll('.scene-chip').forEach((chip, i) => {
    chip.classList.toggle('active', i === idx);
  });
}

function scrollTimelineToScene(idx) {
  const timeline = document.getElementById('scene-timeline');
  if (!timeline) return;
  const chip = timeline.querySelectorAll('.scene-chip')[idx];
  if (chip) chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function updatePreviewSceneLabel(idx) {
  const label = document.getElementById('preview-scene-label');
  if (!label) return;
  const scene = sceneTimes[idx];
  if (!scene) { label.classList.add('hidden'); return; }
  label.classList.remove('hidden');
  const bars = scene.durationBars ?? 8;
  label.textContent = `SCENE ${idx + 1} — ${scene.label ?? 'Untitled'} · ${bars} bars`;
}

function renderSceneList() {
  const el = document.getElementById('scene-list');
  if (!el) return;
  if (!sceneTimes.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');

  el.innerHTML = `
    <div class="scene-list-header">
      <span class="scene-list-title">SHOW SCENES</span>
      <span class="scene-list-count">${sceneTimes.length} scenes</span>
    </div>
    <div class="scene-cards">
      ${sceneTimes.map((scene, i) => {
        const bars = scene.durationBars ?? 8;
        const style = scene.movementStyle ?? '';
        const speed = scene.movementSpeed != null ? `×${scene.movementSpeed}` : '';
        const strobeB = scene.strobeEnabled === true ? '⚡strobe' : '';
        const gratingB = scene.gratingEnabled === true ? '✦grating' : '';
        const badges = [style, speed, strobeB, gratingB].filter(Boolean)
          .map(b => `<span class="scene-badge">${b}</span>`).join('');
        return `
          <div class="scene-card" data-idx="${i}">
            <div class="scene-card-top">
              <span class="scene-num">${i + 1}</span>
              <span class="scene-name">${scene.label ?? 'Scene ' + (i + 1)}</span>
              <span class="scene-bars">${bars} bars</span>
            </div>
            ${badges ? `<div class="scene-card-badges">${badges}</div>` : ''}
            <div class="scene-card-actions">
              <button class="scene-seek-btn" data-idx="${i}">▶ Preview</button>
              <button class="scene-edit-btn" data-idx="${i}">✏ Edit scene</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  el.querySelectorAll('.scene-seek-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); seekToScene(parseInt(btn.dataset.idx)); });
  });
  el.querySelectorAll('.scene-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const scene = sceneTimes[idx];
      if (!scene || !aiInput) return;
      const name = scene.label ?? `Scene ${idx + 1}`;
      aiInput.value = `For scene ${idx + 1} ("${name}"): `;
      aiInput.focus();
      document.querySelector('[data-panel="show"]')?.click();
    });
  });
  el.querySelectorAll('.scene-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('scene-seek-btn') || e.target.classList.contains('scene-edit-btn')) return;
      seekToScene(parseInt(card.dataset.idx));
    });
  });
}

function renderSceneTimeline() {
  const el = document.getElementById('scene-timeline');
  if (!el) return;
  if (!sceneTimes.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');

  el.innerHTML = sceneTimes.map((scene, i) => {
    const bars = scene.durationBars ?? 8;
    const flex = Math.max(4, Math.min(18, bars * 1.2));
    return `
      <div class="scene-chip" data-idx="${i}" style="flex:${flex}">
        <span class="scene-chip-num">${i + 1}</span>
        <span class="scene-chip-label">${scene.label ?? 'Scene ' + (i + 1)}</span>
        <span class="scene-chip-bars">${bars}b</span>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.scene-chip').forEach(chip => {
    chip.addEventListener('click', () => seekToScene(parseInt(chip.dataset.idx)));
  });
}

function tickSceneEngine() {
  if (!sceneTimes.length) return;
  if (!state.playing || state.startTime === null) return;
  const elapsed = (Date.now() - state.startTime) / 1000;
  const newIdx = getSceneIdxAtTime(elapsed);
  if (newIdx !== currentSceneIdx && newIdx >= 0) {
    currentSceneIdx = newIdx;
    updateSceneHighlights(newIdx);
    updatePreviewSceneLabel(newIdx);
    const scene = sceneTimes[newIdx];
    if (scene) {
      const sceneKeys = ['movementStyle', 'movementSpeed', 'strobeEnabled',
                         'gratingEnabled', 'bassThreshold', 'patternShiftBeats', 'colorIntensity'];
      sceneKeys.forEach(k => { if (scene[k] !== undefined) aiShowOverrides[k] = scene[k]; });
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SHOW LIBRARY
// ══════════════════════════════════════════════════════════════════════════════

const LIBRARY_KEY = 'ai-lasershow-library';

function getLibrary() {
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]'); }
  catch { return []; }
}

function saveCurrentShow(name) {
  if (!Object.keys(aiShowOverrides).length) {
    alert('Nothing to save — ask the AI Director to create a show first.');
    return null;
  }
  const library = getLibrary();
  const show = {
    id: Date.now().toString(),
    name: name || 'Untitled Show',
    createdAt: new Date().toISOString(),
    overrides: JSON.parse(JSON.stringify(aiShowOverrides)),
    chatHistory: aiChatHistory.slice(-20),
    sceneCount: sceneTimes.length,
  };
  library.unshift(show);
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library.slice(0, 50)));
  renderLibrary();
  return show;
}

function loadShow(id) {
  const library = getLibrary();
  const show = library.find(s => s.id === id);
  if (!show) return;
  aiShowOverrides = JSON.parse(JSON.stringify(show.overrides));
  if (show.chatHistory?.length) aiChatHistory = [...show.chatHistory];
  buildSceneTimes();
  renderSceneList();
  renderSceneTimeline();
  if (aiActiveBadge) aiActiveBadge.classList.remove('hidden');
  if (aiMessages && aiEmptyState) {
    aiEmptyState.classList.add('hidden');
    const notice = document.createElement('div');
    notice.className = 'ai-msg-assistant';
    notice.textContent = `✓ Loaded: "${show.name}" · ${show.sceneCount || 0} scenes`;
    aiMessages.appendChild(notice);
    aiMessages.scrollTop = aiMessages.scrollHeight;
  }
  document.querySelector('[data-panel="show"]')?.click();
}

function deleteShow(id) {
  if (!confirm('Delete this show from the library?')) return;
  const library = getLibrary().filter(s => s.id !== id);
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  renderLibrary();
}

function renderLibrary() {
  const list = document.getElementById('library-list');
  const empty = document.getElementById('library-empty');
  if (!list || !empty) return;
  const library = getLibrary();
  if (!library.length) {
    empty.classList.remove('hidden');
    list.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = library.map(show => {
    const date = new Date(show.createdAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const scenes = show.sceneCount ? `· ${show.sceneCount} scenes` : '';
    return `
      <div class="library-entry">
        <div class="library-entry-info">
          <span class="library-entry-name">${show.name}</span>
          <span class="library-entry-meta">${date} ${scenes}</span>
        </div>
        <div class="library-entry-actions">
          <button class="library-load-btn" data-id="${show.id}">Load</button>
          <button class="library-delete-btn" data-id="${show.id}">✕</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.library-load-btn').forEach(btn => {
    btn.addEventListener('click', () => loadShow(btn.dataset.id));
  });
  list.querySelectorAll('.library-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteShow(btn.dataset.id));
  });
}

const aiSaveBtn = document.getElementById('ai-save-show');
if (aiSaveBtn) {
  aiSaveBtn.addEventListener('click', () => {
    const name = prompt('Name this show:', 'My Show ' + new Date().toLocaleDateString());
    if (name !== null) {
      const saved = saveCurrentShow(name || 'Untitled Show');
      if (saved) {
        const orig = aiSaveBtn.textContent;
        aiSaveBtn.textContent = '✓ Saved!';
        setTimeout(() => { aiSaveBtn.textContent = orig; }, 1600);
      }
    }
  });
}

renderLibrary();

// ══════════════════════════════════════════════════════════════════════════════
// SAFETY ZONE MAPPER
// ══════════════════════════════════════════════════════════════════════════════

function getZoneBounds() {
  let minR = ZONE_ROWS, maxR = -1, minC = ZONE_COLS, maxC = -1;
  for (let r = 0; r < ZONE_ROWS; r++) {
    for (let c = 0; c < ZONE_COLS; c++) {
      if (state.zoneMask[r][c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < 0) return { minX: 0.45, maxX: 0.55, minY: 0.45, maxY: 0.55 };
  return {
    minX: minC / ZONE_COLS,
    maxX: (maxC + 1) / ZONE_COLS,
    minY: minR / ZONE_ROWS,
    maxY: (maxR + 1) / ZONE_ROWS,
  };
}

function drawZoneOverlay(ctx, W, H) {
  if (!state.zoneEnabled && !state.zonePreview) return;
  const cw = W / ZONE_COLS;
  const rh = H / ZONE_ROWS;

  // Blocked cells — red tint + X mark
  for (let r = 0; r < ZONE_ROWS; r++) {
    for (let c = 0; c < ZONE_COLS; c++) {
      if (!state.zoneMask[r][c]) {
        ctx.save();
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = '#ff2828';
        ctx.fillRect(c * cw, r * rh, cw, rh);
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = 'rgba(255,80,80,0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(c * cw + 4, r * rh + 4);
        ctx.lineTo((c + 1) * cw - 4, (r + 1) * rh - 4);
        ctx.moveTo((c + 1) * cw - 4, r * rh + 4);
        ctx.lineTo(c * cw + 4, (r + 1) * rh - 4);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Grid lines
  ctx.save();
  ctx.strokeStyle = 'rgba(90,90,140,0.35)';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < ZONE_COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, H); ctx.stroke();
  }
  for (let r = 1; r < ZONE_ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * rh); ctx.lineTo(W, r * rh); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(108,99,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.restore();
}

function buildZoneGrid() {
  const grid = $('zone-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let r = 0; r < ZONE_ROWS; r++) {
    for (let c = 0; c < ZONE_COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'zone-cell' + (state.zoneMask[r][c] ? '' : ' blocked');
      cell.title = `Row ${r + 1}, Col ${c + 1}`;
      cell.addEventListener('click', () => toggleZoneCell(r, c));
      grid.appendChild(cell);
    }
  }
  updateZoneStats();
}

function toggleZoneCell(r, c) {
  state.zoneMask[r][c] = !state.zoneMask[r][c];
  const cells = document.querySelectorAll('.zone-cell');
  const idx = r * ZONE_COLS + c;
  if (cells[idx]) cells[idx].classList.toggle('blocked');
  updateZoneStats();
}

function updateZoneStats() {
  const total = ZONE_COLS * ZONE_ROWS;
  const active = state.zoneMask.flat().filter(Boolean).length;
  const el = $('zone-stats');
  const pctEl = $('zone-pct');
  if (el) el.textContent = `${active} / ${total} active`;
  if (pctEl) pctEl.textContent = `${Math.round((active / total) * 100)}% of output field active`;
}

function saveZonePreset(name) {
  const presets = JSON.parse(localStorage.getItem(ZONE_STORAGE_KEY) || '[]');
  presets.push({ name, mask: state.zoneMask.map(r => [...r]), saved: Date.now() });
  if (presets.length > 8) presets.shift();
  localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(presets));
  renderZonePresets();
}

function loadZonePreset(idx) {
  const presets = JSON.parse(localStorage.getItem(ZONE_STORAGE_KEY) || '[]');
  if (presets[idx]) {
    state.zoneMask = presets[idx].mask.map(r => [...r]);
    buildZoneGrid();
  }
}

function deleteZonePreset(idx) {
  const presets = JSON.parse(localStorage.getItem(ZONE_STORAGE_KEY) || '[]');
  presets.splice(idx, 1);
  localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(presets));
  renderZonePresets();
}

function renderZonePresets() {
  const presets = JSON.parse(localStorage.getItem(ZONE_STORAGE_KEY) || '[]');
  const list = $('zone-presets-list');
  if (!list) return;
  if (presets.length === 0) {
    list.innerHTML = '<p class="muted-hint">No saved zones yet.</p>';
    return;
  }
  list.innerHTML = presets.map((p, i) => `
    <div class="zone-preset-row">
      <span class="zone-preset-name">${p.name}</span>
      <div class="zone-preset-actions">
        <button class="btn-ghost btn-xs zone-preset-load" data-idx="${i}">Load</button>
        <button class="btn-ghost btn-xs zone-preset-del" data-idx="${i}">✕</button>
      </div>
    </div>
  `).join('');
  list.querySelectorAll('.zone-preset-load').forEach(btn =>
    btn.addEventListener('click', () => loadZonePreset(+btn.dataset.idx)));
  list.querySelectorAll('.zone-preset-del').forEach(btn =>
    btn.addEventListener('click', () => deleteZonePreset(+btn.dataset.idx)));
}

// ── Zone event listeners ───────────────────────────────────────────────────────
const zoneToggle = $('zone-enabled-toggle');
if (zoneToggle) {
  zoneToggle.addEventListener('change', () => {
    state.zoneEnabled = zoneToggle.checked;
    const label = $('zone-enabled-label');
    if (label) {
      label.textContent = state.zoneEnabled ? 'ON' : 'OFF';
      label.style.color  = state.zoneEnabled ? 'var(--green)' : 'var(--muted)';
    }
  });
}

const zoneBtnSelectAll = $('zone-select-all');
if (zoneBtnSelectAll) {
  zoneBtnSelectAll.addEventListener('click', () => {
    for (let r = 0; r < ZONE_ROWS; r++)
      for (let c = 0; c < ZONE_COLS; c++)
        state.zoneMask[r][c] = true;
    buildZoneGrid();
  });
}

const zoneBtnClearAll = $('zone-clear-all');
if (zoneBtnClearAll) {
  zoneBtnClearAll.addEventListener('click', () => {
    for (let r = 0; r < ZONE_ROWS; r++)
      for (let c = 0; c < ZONE_COLS; c++)
        state.zoneMask[r][c] = false;
    buildZoneGrid();
  });
}

const zoneBtnInvert = $('zone-invert');
if (zoneBtnInvert) {
  zoneBtnInvert.addEventListener('click', () => {
    for (let r = 0; r < ZONE_ROWS; r++)
      for (let c = 0; c < ZONE_COLS; c++)
        state.zoneMask[r][c] = !state.zoneMask[r][c];
    buildZoneGrid();
  });
}

const zoneBtnProject = $('zone-project');
if (zoneBtnProject) {
  zoneBtnProject.addEventListener('click', () => {
    if (state.zonePreview) {
      state.zonePreview = false;
      clearTimeout(state.zonePreviewTimer);
      zoneBtnProject.textContent = '⚡ Preview Field';
      zoneBtnProject.classList.remove('active');
      return;
    }
    state.zonePreview = true;
    zoneBtnProject.textContent = '⏹ Stop Preview';
    zoneBtnProject.classList.add('active');
    state.zonePreviewTimer = setTimeout(() => {
      state.zonePreview = false;
      if (zoneBtnProject) {
        zoneBtnProject.textContent = '⚡ Preview Field';
        zoneBtnProject.classList.remove('active');
      }
    }, 8000);
  });
}

const zoneBtnSavePreset = $('zone-save-preset');
if (zoneBtnSavePreset) {
  zoneBtnSavePreset.addEventListener('click', () => {
    const name = prompt('Name this zone:', 'Zone ' + new Date().toLocaleDateString());
    if (name !== null) saveZonePreset(name || 'Untitled Zone');
  });
}

buildZoneGrid();
renderZonePresets();

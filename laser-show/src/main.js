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
    { id: "eytse-ey003l", model: "EY003-L (16-ch)", channels: 16, scanTier: "mid",  colorMode: "rgb-full", mW: 300, notes: "Reference laser for this system. CH1 locked to 120. Grating from 65% energy. Lissajous X/Y with rotation at 1/2 BPM." },
    { id: "eytse-ey006l", model: "EY006-L (16-ch)", channels: 16, scanTier: "fast", colorMode: "rgb-full", mW: 600, notes: "600mW with faster scanner. Complex 3:2 and 4:3 Lissajous cleanly. Lower bass threshold to 50%. 16-beat pattern cycles." },
  ],
  "Generic / Budget": [
    { id: "generic-7ch",  model: "7-Channel Animation Laser",  channels: 7,  scanTier: "budget", colorMode: "indexed",   mW: 200, notes: "Universal 7ch. Patterns every 4 beats. Color 0→255 over 2 bars. Circle sweep. Zoom above 85%." },
    { id: "generic-16ch", model: "16-Channel Animation Laser", channels: 16, scanTier: "budget", colorMode: "rgb-full", mW: 200, notes: "Generic 16ch. Raise bass threshold — budget scanners need strong signal for clean zoom snaps. 1:1 and 2:1 Lissajous only." },
  ],
};

const EYTSE_CHANNEL_NAMES = [
  'Mode','Anim Bank','Pattern Lo','Pattern Hi',
  'X Position','Y Position','Rotation','Rot Speed',
  'Zoom','Size Scale','Strobe','Red','Green','Blue','Grating','Grating Rot',
];
const GENERIC7_CHANNEL_NAMES = [
  'Mode','Pattern','Strobe','Zoom','X Position','Y Position','Color Index',
];

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
}

// ── Serial port helpers ───────────────────────────────────────────────────────
async function loadPorts(selectEl) {
  try {
    const ports = await invoke('list_serial_ports');
    selectEl.innerHTML = ports.length
      ? ports.map(p => `<option value="${p}">${p}</option>`).join('')
      : '<option value="">No ports found</option>';
    btnConnect.disabled = ports.length === 0;
  } catch {
    selectEl.innerHTML = '<option value="">Error scanning ports</option>';
    btnConnect.disabled = false;
  }
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
  state.phase += beatsPerTick * Math.PI * 2;

  const energy = bass * 0.5 + mid * 0.3 + high * 0.2;
  state.energyHistory.push(energy);
  if (state.energyHistory.length > 160) state.energyHistory.shift();
  const avgE = state.energyHistory.reduce((a,b)=>a+b,0) / state.energyHistory.length;

  const absB = Math.floor(elapsed / beatDur);
  const shiftBeats = laser.scanTier === 'pro' ? 32 : laser.scanTier === 'fast' ? 16 : 8;
  if (absB > 0 && absB % shiftBeats === 0 && absB !== state.lastPatternBeat) {
    state.lastPatternBeat = absB;
    state.patternIdx = (state.patternIdx + 1) % LISSAJOUS.length;
  }

  const pidx = state.patternIdx % LISSAJOUS.length;
  const [a, b, delta] = LISSAJOUS[pidx];
  const t = state.phase;
  const xNorm = Math.sin(a * t + delta) * 0.5 + 0.5;
  const yNorm = Math.sin(b * t) * 0.5 + 0.5;

  const bassThresh = laser.scanTier === 'pro' ? 0.45 : laser.scanTier === 'fast' ? 0.5 : 0.6;
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

  const strobe = (high > 0.75 && energy > 0.65) ? Math.round(50 + high * 170) : 0;
  const gratingOn = energy > 0.65 && energy > avgE * 1.1;
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
    ch[0]  = 120;
    ch[1]  = 0;
    ch[2]  = Math.round((pidx / LISSAJOUS.length) * 200 + 20);
    ch[3]  = 0;
    ch[4]  = Math.round(xNorm * 255);
    ch[5]  = Math.round(yNorm * 255);
    ch[6]  = Math.round(rotation);
    ch[7]  = 0;
    ch[8]  = zoom;
    ch[9]  = Math.round(zoom * 0.85);
    ch[10] = strobe;
    ch[11] = Math.round(Math.min(255, red));
    ch[12] = Math.round(Math.min(255, green));
    ch[13] = Math.round(Math.min(255, blue));
    ch[14] = grating;
    ch[15] = gratingRot;
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
  barBass.style.width = `${bass * 100}%`;
  barMid.style.width  = `${mid  * 100}%`;
  barHigh.style.width = `${high * 100}%`;
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
  state.rafId = requestAnimationFrame(animFrame);
}
requestAnimationFrame(animFrame);

// ── Playback control ──────────────────────────────────────────────────────────
async function startPlayback() {
  try {
    await invoke('start_playback');
    state.playing   = true;
    state.startTime = Date.now();
    state.phase     = 0;
    state.patternIdx = 0;
    state.lastPatternBeat = -1;
    state.energyHistory = [];
    state.zoomDecay = 0;
    btnPlay.classList.add('playing');
    iconPlay.classList.add('hidden');
    iconStop.classList.remove('hidden');
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
  const port  = comPort.value;
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

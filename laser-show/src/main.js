const { invoke } = window.__TAURI__.tauri;
const { open } = window.__TAURI__.dialog;

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  connected: false,
  profile: 'EytseEY003L',
  port: '',
  playing: false,
  duration: 0,
  bpm: 0,
  totalFrames: 0,
  startTime: null,
  rafId: null,
  pollId: null,
  envelopes: { bass: 0, mid: 0, high: 0 },
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const setupOverlay   = $('setup-overlay');
const app            = $('app');
const laserBrand     = $('laser-brand');
const comPort        = $('com-port');
const refreshPorts   = $('refresh-ports');
const customGrid     = $('custom-grid');
const channelMapGrid = $('channel-map-grid');
const connectError   = $('connect-error');
const btnConnect     = $('btn-connect');

const dropZone      = $('drop-zone');
const btnBrowse     = $('btn-browse');
const trackInfo     = $('track-info');
const trackName     = $('track-name');
const trackBpm      = $('track-bpm');
const trackDuration = $('track-duration');
const btnPlay       = $('btn-play');
const iconPlay      = $('icon-play');
const iconStop      = $('icon-stop');
const progressFill  = $('progress-fill');
const timeCurrent   = $('time-current');
const timeTotal     = $('time-total');
const barBass       = $('bar-bass').querySelector('.env-fill');
const barMid        = $('bar-mid').querySelector('.env-fill');
const barHigh       = $('bar-high').querySelector('.env-fill');
const specCanvas    = $('spectrum-canvas');
const channelGrid   = $('channel-grid');
const hwDot         = $('hw-dot');
const hwLabel       = $('hw-label');
const hwBrand       = $('hw-brand-label');
const hwPort        = $('hw-port-label');
const settingsPort  = $('settings-port');

// ── Channel name maps ────────────────────────────────────────────────────────
const EYTSE_CHANNEL_NAMES = [
  'Mode', 'Animation Bank', 'Pattern Lo', 'Pattern Hi',
  'X Position', 'Y Position', 'Rotation A', 'Rotation B',
  'Zoom', 'Size Scale', 'Strobe', 'Red', 'Green', 'Blue',
  'Grating 1', 'Grating 2',
];
const GENERIC_CHANNEL_NAMES = [
  'Mode', 'Pattern', 'Strobe', 'Zoom', 'X Position', 'Y Position', 'Color Index',
];

// ── Spectrum canvas setup ────────────────────────────────────────────────────
const ctx = specCanvas.getContext('2d');
let bars = [];

function resizeCanvas() {
  specCanvas.width  = specCanvas.offsetWidth;
  specCanvas.height = specCanvas.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function drawSpectrum() {
  const W = specCanvas.width;
  const H = specCanvas.height;
  ctx.clearRect(0, 0, W, H);

  // Animate 32 bars from the three envelope values
  const numBars = 32;
  const barW = W / numBars - 2;
  const { bass, mid, high } = state.envelopes;

  for (let i = 0; i < numBars; i++) {
    const t = i / numBars;
    // Blend envelope values across frequency range
    let env;
    if (t < 0.3)       env = bass  * (1 + 0.3 * Math.random());
    else if (t < 0.65) env = mid   * (1 + 0.25 * Math.random());
    else               env = high  * (1 + 0.2 * Math.random());
    env = Math.min(1, env);

    const bh = env * H * 0.88;

    // Colour gradient: bass=red, mid=green, high=purple
    let r, g, b;
    if (t < 0.3) {
      r = 255; g = Math.round(101 + t / 0.3 * 60); b = 100;
    } else if (t < 0.65) {
      r = Math.round(100 - (t - 0.3) / 0.35 * 50);
      g = 217; b = Math.round(100 + (t - 0.3) / 0.35 * 60);
    } else {
      r = Math.round(100 + (t - 0.65) / 0.35 * 108);
      g = Math.round(145 - (t - 0.65) / 0.35 * 80);
      b = 255;
    }

    const x = i * (barW + 2);
    const grad = ctx.createLinearGradient(0, H, 0, H - bh);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0.2)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, H - bh, barW, bh, 2);
    ctx.fill();
  }
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
  }
}

// ── Channel display ───────────────────────────────────────────────────────────
function buildChannelGrid() {
  const names = state.profile === 'Generic7Channel'
    ? GENERIC_CHANNEL_NAMES
    : EYTSE_CHANNEL_NAMES;
  channelGrid.innerHTML = names.map((name, i) => `
    <div class="ch-card" id="ch-card-${i}">
      <div class="ch-card-label">${name}</div>
      <div class="ch-card-number">CH ${i + 1}</div>
      <div class="ch-card-value" id="ch-val-${i}">0</div>
      <div class="ch-card-bar"><div class="ch-card-bar-fill" id="ch-bar-${i}"></div></div>
    </div>
  `).join('');
}

function updateChannelGrid(envelopes) {
  if (!envelopes) return;
  const { bass, mid, high, bpm } = envelopes;
  const t = state.startTime ? (Date.now() - state.startTime) / 1000 : 0;
  const phase = (bpm > 0) ? ((t % (60 / bpm)) / (60 / bpm)) : 0;
  const tau = Math.PI * 2;

  let values;
  if (state.profile === 'EytseEY003L') {
    const speed = phase * tau;
    const zoom = bass > 0.8 ? 255 : Math.round(100 + bass * 155);
    values = [
      120,
      Math.min(255, Math.round(mid > 0.75 ? mid * 255 + 64 : 80)),
      Math.min(255, Math.round((mid > 0.6 || high > 0.65) ? (mid + high) * 0.5 * 180 : 40)),
      Math.min(255, Math.round((mid > 0.6 || high > 0.65) ? (mid + high) * 0.5 * 180 + 20 : 60)),
      Math.round((Math.sin(speed) * 0.5 + 0.5) * 255),
      Math.round((Math.cos(speed) * 0.5 + 0.5) * 255),
      Math.round((Math.sin(t * 0.4) * 0.5 + 0.5) * 200 + 28),
      Math.round((Math.cos(t * 0.4) * 0.5 + 0.5) * 200 + 28),
      zoom,
      Math.max(0, zoom - 20),
      high > 0.7 ? Math.min(220, Math.round(high * 255)) : 0,
      Math.round(bass * 255),
      Math.round(mid * 255),
      Math.round(high * 255),
      (bass + mid + high) / 3 > 0.65 ? 180 : 0,
      (bass + mid + high) / 3 > 0.75 ? 200 : 0,
    ];
  } else {
    const speed = phase * Math.PI * 2;
    values = [
      100,
      Math.min(255, Math.round((mid + high) * 0.5 * 200)),
      high > 0.65 ? Math.min(200, Math.round(high * 255)) : 0,
      bass > 0.75 ? 255 : Math.round(100 + bass * 100),
      Math.round((Math.sin(speed) * 0.5 + 0.5) * 255),
      Math.round((Math.cos(speed) * 0.5 + 0.5) * 255),
      (Math.round(t * 0.2) & 0xff) * 16 & 0xff,
    ];
  }

  values.forEach((v, i) => {
    const val = $(`ch-val-${i}`);
    const bar = $(`ch-bar-${i}`);
    if (val) val.textContent = v;
    if (bar) bar.style.width = `${(v / 255) * 100}%`;
  });
}

// ── Envelope bars ─────────────────────────────────────────────────────────────
function updateEnvelopeBars(bass, mid, high) {
  barBass.style.setProperty('--w', `${bass * 100}%`);
  barMid.style.setProperty('--w',  `${mid  * 100}%`);
  barHigh.style.setProperty('--w', `${high * 100}%`);
  // Drive via ::after width using CSS custom properties
  barBass.style.cssText = `width: ${bass * 100}%`;
  barMid.style.cssText  = `width: ${mid  * 100}%`;
  barHigh.style.cssText = `width: ${high * 100}%`;
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
      updateEnvelopeBars(env.bass, env.mid, env.high);
      updateChannelGrid(env);
      if (state.totalFrames > 0) {
        updateProgress(env.frame / state.totalFrames);
      }
      // Auto-stop when track ends
      if (env.frame >= state.totalFrames - 2 && state.totalFrames > 0) {
        stopPlayback();
      }
    }
  } catch { /* ignore */ }
}

function startPoll() {
  if (state.pollId) return;
  state.pollId = setInterval(pollEnvelopes, 25); // 40 Hz
}
function stopPoll() {
  clearInterval(state.pollId);
  state.pollId = null;
}

// ── Animation frame (spectrum) ────────────────────────────────────────────────
function animFrame() {
  drawSpectrum();
  state.rafId = requestAnimationFrame(animFrame);
}
requestAnimationFrame(animFrame);

// ── Playback control ─────────────────────────────────────────────────────────
async function startPlayback() {
  try {
    await invoke('start_playback');
    state.playing   = true;
    state.startTime = Date.now();
    btnPlay.classList.add('playing');
    iconPlay.classList.add('hidden');
    iconStop.classList.remove('hidden');
    startPoll();
  } catch (e) {
    alert('Playback failed: ' + e);
  }
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

// ── Custom channel mapping grid ───────────────────────────────────────────────
const CHANNEL_FUNCTIONS = [
  'Mode', 'Pattern', 'X-Position', 'Y-Position', 'Zoom',
  'Strobe', 'Red', 'Green', 'Blue', 'Effects', '(unused)',
];

function buildCustomGrid() {
  channelMapGrid.innerHTML = Array.from({ length: 16 }, (_, i) => `
    <div class="channel-row">
      <span>CH ${i + 1}</span>
      <select id="cmap-${i}">
        ${CHANNEL_FUNCTIONS.map(f => `<option>${f}</option>`).join('')}
      </select>
    </div>
  `).join('');
}
buildCustomGrid();

// ── Setup panel interactions ──────────────────────────────────────────────────
loadPorts(comPort);

refreshPorts.addEventListener('click', () => loadPorts(comPort));

laserBrand.addEventListener('change', () => {
  customGrid.classList.toggle('hidden', laserBrand.value !== 'Custom');
});

btnConnect.addEventListener('click', async () => {
  const port    = comPort.value;
  const profile = laserBrand.value;
  if (!port) return;

  connectError.classList.add('hidden');
  btnConnect.disabled = true;
  btnConnect.textContent = 'Connecting…';

  try {
    await invoke('connect_dmx', { port });
    await invoke('set_laser_profile', { profile });

    state.connected = true;
    state.profile   = profile;
    state.port      = port;

    // Update sidebar info
    hwDot.className   = 'dot connected';
    hwLabel.textContent = 'DMX Connected';
    hwBrand.textContent = laserBrand.options[laserBrand.selectedIndex].text;
    hwPort.textContent  = port;

    buildChannelGrid();

    // Hide setup, show app
    setupOverlay.classList.add('hidden');
    app.classList.remove('hidden');

    // Mirror port list to settings panel
    await loadPorts(settingsPort);
    Array.from(settingsPort.options).forEach(o => {
      if (o.value === port) o.selected = true;
    });
    $('settings-profile').value = profile;

  } catch (e) {
    connectError.textContent = e;
    connectError.classList.remove('hidden');
  } finally {
    btnConnect.disabled  = false;
    btnConnect.textContent = 'Connect & Launch';
  }
});

// ── Nav panel switching ───────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`panel-${btn.dataset.panel}`).classList.add('active');
  });
});

// ── File loading ──────────────────────────────────────────────────────────────
async function loadFile(path) {
  if (state.playing) await stopPlayback();

  dropZone.style.opacity = '.5';
  try {
    const analysis = await invoke('load_audio', { path });

    state.duration    = analysis.duration_sec;
    state.bpm         = analysis.bpm;
    state.totalFrames = analysis.total_frames;

    const name = path.split(/[\\/]/).pop();
    trackName.textContent    = name;
    trackBpm.textContent     = `${Math.round(analysis.bpm)} BPM`;
    trackDuration.textContent = formatTime(analysis.duration_sec);
    timeTotal.textContent    = formatTime(analysis.duration_sec);
    timeCurrent.textContent  = '0:00';
    progressFill.style.width = '0%';

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
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }],
  });
  if (selected) loadFile(selected);
});

// Drag-and-drop
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file.path);
});

// ── Play/Stop button ─────────────────────────────────────────────────────────
btnPlay.addEventListener('click', () => {
  if (state.playing) stopPlayback();
  else startPlayback();
});

// ── Settings panel ────────────────────────────────────────────────────────────
$('settings-refresh-ports').addEventListener('click', () => loadPorts(settingsPort));

$('btn-reconnect').addEventListener('click', async () => {
  const port    = settingsPort.value;
  const profile = $('settings-profile').value;
  if (!port) return;
  try {
    await invoke('connect_dmx', { port });
    await invoke('set_laser_profile', { profile });
    state.port    = port;
    state.profile = profile;
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

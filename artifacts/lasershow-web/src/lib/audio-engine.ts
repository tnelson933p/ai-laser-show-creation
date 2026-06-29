export async function analyzeTrack(buffer: AudioBuffer) {
  // Pre-analyze track to get per-frame (40Hz / 25ms) envelopes for Bass, Mid, High
  const frameSize = Math.floor(buffer.sampleRate / 40);
  const duration = buffer.duration;
  
  // Extract envelopes via OfflineAudioContext
  const bassEnv = await getFilteredEnvelope(buffer, 'lowpass', 150);
  const midEnv = await getFilteredEnvelope(buffer, 'bandpass', 1000); // 150-4000 approx
  const highEnv = await getFilteredEnvelope(buffer, 'highpass', 4000);
  
  // Estimate BPM from Bass Envelope
  const bpm = estimateBPM(bassEnv, 40);
  
  return {
    bass: bassEnv,
    mid: midEnv,
    high: highEnv,
    bpm,
    duration
  };
}

async function getFilteredEnvelope(buffer: AudioBuffer, type: BiquadFilterType, freq: number): Promise<Float32Array> {
  const offlineCtx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  
  const filter = offlineCtx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  if (type === 'bandpass') {
    filter.Q.value = 1;
  }
  
  source.connect(filter);
  filter.connect(offlineCtx.destination);
  source.start(0);
  
  const rendered = await offlineCtx.startRendering();
  const data = rendered.getChannelData(0);
  
  const frameSize = Math.floor(buffer.sampleRate / 40);
  const frames = Math.floor(data.length / frameSize);
  const env = new Float32Array(frames);
  
  let max = 0;
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    const offset = i * frameSize;
    for (let j = 0; j < frameSize; j++) {
      sum += Math.abs(data[offset + j]);
    }
    env[i] = sum / frameSize;
    if (env[i] > max) max = env[i];
  }
  
  // Normalize 0.0 - 1.0
  if (max > 0) {
    for (let i = 0; i < frames; i++) {
      env[i] /= max;
    }
  }
  
  return env;
}

function estimateBPM(envelope: Float32Array, fps: number): number {
  const peaks: number[] = [];
  const minSpacing = Math.floor(fps * 0.3); // ~0.3s minimum spacing
  let lastPeak = -minSpacing;
  
  // Simple onset detection
  for (let i = 1; i < envelope.length - 1; i++) {
    if (envelope[i] > envelope[i-1] && envelope[i] > envelope[i+1] && envelope[i] > 0.4) {
      if (i - lastPeak >= minSpacing) {
        peaks.push(i);
        lastPeak = i;
      }
    }
  }
  
  if (peaks.length < 2) return 120; // fallback
  
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i-1]);
  }
  
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];
  
  // interval is in frames. 1 frame = 1/fps seconds.
  const intervalSeconds = medianInterval / fps;
  let bpm = Math.round(60 / intervalSeconds);
  
  // Keep in reasonable range
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  
  return Math.round(bpm);
}

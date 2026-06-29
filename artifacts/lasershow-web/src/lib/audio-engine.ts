export interface EnergySegment {
  bar: number;       // starting bar number (0-indexed)
  bass: number;      // 0-1 average bass energy in this segment
  mid: number;       // 0-1 average mid energy
  high: number;      // 0-1 average high energy
  energy: number;    // 0-1 combined energy (bass*0.5 + mid*0.3 + high*0.2)
  level: "quiet" | "low" | "med" | "high" | "peak";
}

export async function analyzeTrack(buffer: AudioBuffer) {
  const duration = buffer.duration;

  const bassEnv = await getFilteredEnvelope(buffer, "lowpass", 150);
  const midEnv  = await getFilteredEnvelope(buffer, "bandpass", 1000);
  const highEnv = await getFilteredEnvelope(buffer, "highpass", 4000);

  const bpm = estimateBPM(bassEnv, 40);
  const segments = computeEnergyTimeline(bassEnv, midEnv, highEnv, bpm, 40);

  return { bass: bassEnv, mid: midEnv, high: highEnv, bpm, duration, segments };
}

async function getFilteredEnvelope(
  buffer: AudioBuffer,
  type: BiquadFilterType,
  freq: number,
): Promise<Float32Array> {
  const offlineCtx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;

  const filter = offlineCtx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  if (type === "bandpass") filter.Q.value = 1;

  source.connect(filter);
  filter.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  const data = rendered.getChannelData(0);

  const fps = 40;
  const frameSize = Math.floor(buffer.sampleRate / fps);
  const frames = Math.floor(data.length / frameSize);
  const env = new Float32Array(frames);

  let max = 0;
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    const offset = i * frameSize;
    for (let j = 0; j < frameSize; j++) sum += Math.abs(data[offset + j]);
    env[i] = sum / frameSize;
    if (env[i] > max) max = env[i];
  }
  if (max > 0) for (let i = 0; i < frames; i++) env[i] /= max;

  return env;
}

function estimateBPM(envelope: Float32Array, fps: number): number {
  const peaks: number[] = [];
  const minSpacing = Math.floor(fps * 0.3);
  let lastPeak = -minSpacing;

  for (let i = 1; i < envelope.length - 1; i++) {
    if (
      envelope[i] > envelope[i - 1] &&
      envelope[i] > envelope[i + 1] &&
      envelope[i] > 0.4
    ) {
      if (i - lastPeak >= minSpacing) {
        peaks.push(i);
        lastPeak = i;
      }
    }
  }

  if (peaks.length < 2) return 120;

  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) intervals.push(peaks[i] - peaks[i - 1]);
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];
  const intervalSeconds = medianInterval / fps;
  let bpm = Math.round(60 / intervalSeconds);
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm);
}

function computeEnergyTimeline(
  bass: Float32Array,
  mid: Float32Array,
  high: Float32Array,
  bpm: number,
  fps: number,
): EnergySegment[] {
  const framesPerBeat = (fps * 60) / bpm;
  const framesPerBar = framesPerBeat * 4;       // 4/4 time
  const framesPerSegment = framesPerBar * 4;     // 4 bars per segment

  const totalSegments = Math.ceil(bass.length / framesPerSegment);
  const segments: EnergySegment[] = [];

  for (let seg = 0; seg < totalSegments; seg++) {
    const start = Math.floor(seg * framesPerSegment);
    const end = Math.min(Math.floor((seg + 1) * framesPerSegment), bass.length);
    const count = end - start;
    if (count === 0) break;

    let avgBass = 0, avgMid = 0, avgHigh = 0;
    for (let i = start; i < end; i++) {
      avgBass += bass[i];
      avgMid  += mid[i];
      avgHigh += high[i];
    }
    avgBass /= count;
    avgMid  /= count;
    avgHigh /= count;

    const energy = avgBass * 0.5 + avgMid * 0.3 + avgHigh * 0.2;
    let level: EnergySegment["level"];
    if (energy < 0.15)      level = "quiet";
    else if (energy < 0.30) level = "low";
    else if (energy < 0.50) level = "med";
    else if (energy < 0.68) level = "high";
    else                    level = "peak";

    segments.push({
      bar:    seg * 4,
      bass:   Math.round(avgBass  * 100) / 100,
      mid:    Math.round(avgMid   * 100) / 100,
      high:   Math.round(avgHigh  * 100) / 100,
      energy: Math.round(energy   * 100) / 100,
      level,
    });
  }

  return segments;
}

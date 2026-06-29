// ─────────────────────────────────────────────────────────────────────────────
// AI LaserShow — Expert Show Generation Engine
//
// Generates 40Hz DMX channel arrays from audio envelopes using laser-specific
// strategies. Each laser profile carries its own automation rules; this engine
// interprets them with deep knowledge of laser physics and show design.
// ─────────────────────────────────────────────────────────────────────────────

import type { LaserModel } from "./laser-database";

export interface AudioFrame {
  bass: number;   // 0–1
  mid: number;    // 0–1
  high: number;   // 0–1
  bpm: number;
  timeS: number;  // absolute playback position in seconds
}

export interface ShowFrame {
  channels: number[];   // DMX values, 0–255, length = laser.channelCount
  visualState: VisualState;
}

export interface VisualState {
  // Derived visual parameters for the canvas renderer
  xNorm: number;       // 0–1 normalized X position
  yNorm: number;       // 0–1 normalized Y position
  rotation: number;    // radians
  zoom: number;        // 0–1
  red: number;         // 0–1
  green: number;       // 0–1
  blue: number;        // 0–1
  strobe: boolean;
  patternIndex: number; // which Lissajous ratio preset
  gratingActive: boolean;
  energy: number;      // 0–1 overall energy
  // Per-frame audio reactivity — passed directly into animationCode
  bass: number;        // 0–1 live bass energy (kick/sub — reactive to low-end hits)
  mid: number;         // 0–1 live mid energy (melody, chords, vocals)
  high: number;        // 0–1 live high energy (hi-hats, snare, cymbals)
  beat: number;        // 0–1 position within current BPM beat (resets to 0 on each beat)
  bar: number;         // current bar number (integer, 0-indexed)
  // Text & animation overlays
  textEnabled: boolean;
  textContent: string;
  animationStyle: "none" | "stars" | "fireworks" | "wave" | "spiral" | "butterfly" | "hands" | "birds" | "rain" | "lightning" | "heart" | "galaxy";
  animationCode?: string;  // AI-generated canvas drawing code (overrides animationStyle)
}

// ─────────────────────────────────────────────────────────────────────────────
// Lissajous pattern presets
// Each entry: [a, b, delta] for x=sin(a*t+d), y=sin(b*t)
// ─────────────────────────────────────────────────────────────────────────────
export const LISSAJOUS_PRESETS = [
  [1, 1, Math.PI / 2],   // 0: Circle
  [2, 1, Math.PI / 2],   // 1: Figure-8 vertical
  [1, 2, Math.PI / 2],   // 2: Figure-8 horizontal
  [3, 2, Math.PI / 4],   // 3: Three-leaf
  [2, 3, Math.PI / 4],   // 4: Complex 2:3
  [3, 1, Math.PI / 2],   // 5: Pretzel
  [4, 3, Math.PI / 4],   // 6: Dense 4:3
  [5, 4, Math.PI / 6],   // 7: Ultra dense
  [1, 1, 0],             // 8: Diagonal line
  [2, 2, Math.PI / 4],   // 9: Square spiral
  [3, 3, Math.PI / 6],   // 10: Star burst
  [4, 1, Math.PI / 2],   // 11: Complex horizontal
];

// Map of pattern step beats → number of presets to use (simpler on budget gear)
const BUDGET_PATTERN_POOL = [0, 1, 2, 8, 9];
const MID_PATTERN_POOL    = [0, 1, 2, 3, 4, 5, 8, 9, 10];
const PRO_PATTERN_POOL    = LISSAJOUS_PRESETS.map((_, i) => i);

// ─────────────────────────────────────────────────────────────────────────────
// Runtime overrides — set by the AI chat to modify show behaviour live
// ─────────────────────────────────────────────────────────────────────────────

// A single scene in a sequenced show — all override fields + timing metadata
export interface SceneSettings {
  label?: string;            // display name, e.g. "INTRO", "DROP", "FINALE"
  durationBars: number;      // how many 4/4 bars this scene lasts
  patternShiftBeats?: number;
  bassThreshold?: number;
  strobeEnabled?: boolean;
  zoomEnabled?: boolean;
  movementStyle?: "lissajous" | "sweep" | "bounce" | "step";
  colorIntensity?: number;
  movementSpeed?: number;
  gratingEnabled?: boolean;
  patternComplexity?: "simple" | "medium" | "complex";
  textEnabled?: boolean;
  textContent?: string;
  animationStyle?: "none" | "stars" | "fireworks" | "wave" | "spiral" | "butterfly" | "hands" | "birds" | "rain" | "lightning" | "heart" | "galaxy";
  animationCode?: string;  // AI-written canvas code — takes precedence over animationStyle
}

export interface ShowOverrides {
  patternShiftBeats?: number;
  bassThreshold?: number;
  strobeEnabled?: boolean;
  zoomEnabled?: boolean;
  movementStyle?: "lissajous" | "sweep" | "bounce" | "step";
  colorIntensity?: number;   // 0.5–2.0 multiplier on RGB
  movementSpeed?: number;    // 0.5–3.0 phase multiplier
  gratingEnabled?: boolean;
  patternComplexity?: "simple" | "medium" | "complex";
  // Text overlay — beam traces the text in the laser's active color
  textEnabled?: boolean;
  textContent?: string;
  // 2D animation overlay drawn on top of Lissajous patterns
  animationStyle?: "none" | "stars" | "fireworks" | "wave" | "spiral" | "butterfly" | "hands" | "birds" | "rain" | "lightning" | "heart" | "galaxy";
  animationCode?: string;  // AI-written canvas code — takes precedence over animationStyle
  // Sequenced show — array of scenes that auto-advance during playback
  sequence?: SceneSettings[];
  // Music transition commands (consumed and cleared by Dashboard)
  audioAction?: "fadeOut" | "fadeIn" | "cut";
  fadeSeconds?: number;      // duration for fade in/out (default 3)
}

const SIMPLE_PATTERN_POOL  = [0, 1, 2, 8];
const MEDIUM_PATTERN_POOL  = [0, 1, 2, 3, 4, 5, 8, 9, 10];
const COMPLEX_PATTERN_POOL = LISSAJOUS_PRESETS.map((_, i) => i);

// ─────────────────────────────────────────────────────────────────────────────
// Stateful show engine
// ─────────────────────────────────────────────────────────────────────────────

export class ShowEngine {
  private laser: LaserModel;
  private patternPool: number[];
  private currentPatternIdx = 0;
  private lastPatternShiftBeat = -1;
  private currentBeat = 0;
  private phaseAccumulator = 0;      // BPM-locked phase in radians
  private zoomDecay = 0;             // for smooth zoom decay after bass snap
  private bankIndex = 0;             // current animation bank (0–3)
  private lastBankShiftPhrase = -1;
  private energyHistory: number[] = [];
  private phraseCount = 0;

  constructor(laser: LaserModel) {
    this.laser = laser;
    this.patternPool =
      laser.scanTier === "pro" ? PRO_PATTERN_POOL :
      laser.scanTier === "fast" ? MID_PATTERN_POOL :
      laser.scanTier === "mid" ? MID_PATTERN_POOL :
      BUDGET_PATTERN_POOL;
  }

  /**
   * Compute one DMX frame from the current audio state.
   * Called every 25ms (40Hz). Overrides from the AI chat director take priority
   * over the laser's built-in strategy where they overlap.
   */
  compute(frame: AudioFrame, overrides: ShowOverrides = {}): ShowFrame {
    const { bass, mid, high, bpm, timeS } = frame;
    const strategy = this.laser.strategy;

    // Resolve effective settings (AI overrides win over strategy defaults)
    const shiftBeats        = overrides.patternShiftBeats ?? strategy.patternShiftBeats;
    const bassThreshold     = overrides.bassThreshold     ?? strategy.bassThreshold;
    const zoomOnBass        = overrides.zoomEnabled       ?? strategy.zoomOnBass;
    const strobeOnHigh      = overrides.strobeEnabled     ?? strategy.strobeOnHigh;
    const movementStyle     = overrides.movementStyle     ?? strategy.movementStyle;
    const colorIntensity    = overrides.colorIntensity    ?? 1.0;
    const speedMul          = overrides.movementSpeed     ?? 1.0;
    const gratingAllowed    = overrides.gratingEnabled    ?? true;

    // Effective pattern pool (complexity override or laser-native)
    let pool = this.patternPool;
    if (overrides.patternComplexity === "simple")  pool = SIMPLE_PATTERN_POOL;
    if (overrides.patternComplexity === "medium")  pool = MEDIUM_PATTERN_POOL;
    if (overrides.patternComplexity === "complex") pool = COMPLEX_PATTERN_POOL;

    // ── Phase / beat tracking ─────────────────────────────────────────────
    const beatDuration = 60 / bpm;
    const beatsPerTick = (1 / 40) / beatDuration;
    this.phaseAccumulator += beatsPerTick * Math.PI * 2 * speedMul;
    const absoluteBeat = Math.floor(timeS / beatDuration);
    const beatPhase = (timeS % beatDuration) / beatDuration; // 0–1 within beat
    const beat = beatPhase; // alias for clarity — passed to animationCode
    const currentBar = Math.floor(timeS / (beatDuration * 4)); // current 4/4 bar
    const phraseLength = 8;
    const phraseIndex = Math.floor(absoluteBeat / phraseLength);

    // ── Energy tracking ───────────────────────────────────────────────────
    const energy = (bass * 0.5 + mid * 0.3 + high * 0.2);
    this.energyHistory.push(energy);
    if (this.energyHistory.length > 160) this.energyHistory.shift();
    const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;

    // ── Pattern stepping ──────────────────────────────────────────────────
    if (absoluteBeat > 0 && absoluteBeat % shiftBeats === 0 && absoluteBeat !== this.lastPatternShiftBeat) {
      this.lastPatternShiftBeat = absoluteBeat;
      this.currentPatternIdx = (this.currentPatternIdx + 1) % pool.length;
      if (energy > 0.8 && Math.random() > 0.5) {
        this.currentPatternIdx = (this.currentPatternIdx + 1) % pool.length;
      }
    }
    const patternIndex = pool[this.currentPatternIdx % pool.length];

    // ── Animation bank shift (every 4 phrases) ────────────────────────────
    if (phraseIndex > 0 && phraseIndex % 4 === 0 && phraseIndex !== this.lastBankShiftPhrase) {
      this.lastBankShiftPhrase = phraseIndex;
      this.bankIndex = (this.bankIndex + 1) % 4;
    }

    // ── Movement (X/Y) ───────────────────────────────────────────────────
    let xNorm: number;
    let yNorm: number;

    if (movementStyle === "lissajous") {
      const [a, b, delta] = LISSAJOUS_PRESETS[patternIndex % LISSAJOUS_PRESETS.length];
      const t = this.phaseAccumulator;
      xNorm = (Math.sin(a * t + delta) * 0.5 + 0.5);
      yNorm = (Math.sin(b * t) * 0.5 + 0.5);
    } else if (movementStyle === "sweep") {
      xNorm = (Math.sin(this.phaseAccumulator) * 0.5 + 0.5);
      yNorm = (Math.sin(this.phaseAccumulator * 0.7 + Math.PI / 4) * 0.5 + 0.5);
    } else if (movementStyle === "bounce") {
      xNorm = Math.abs(Math.sin(this.phaseAccumulator * 1.3));
      yNorm = Math.abs(Math.sin(this.phaseAccumulator * 0.9 + 1));
    } else {
      xNorm = beatPhase < 0.5 ? 0.3 : 0.7;
      yNorm = (absoluteBeat % 4) / 3;
    }

    this.currentBeat = absoluteBeat;

    // ── Rotation ──────────────────────────────────────────────────────────
    const rotation = this.phaseAccumulator * 0.5 + mid * Math.PI;

    // ── Zoom with bass snap + exponential decay ───────────────────────────
    let zoomNorm: number;
    if (zoomOnBass && bass > bassThreshold) {
      this.zoomDecay = 1.0;
    }
    this.zoomDecay *= 0.94;
    zoomNorm = 0.39 + this.zoomDecay * 0.61;

    // ── Color ─────────────────────────────────────────────────────────────
    let red = 0, green = 0, blue = 0;

    if (strategy.colorMode === "rgb-full") {
      red   = Math.pow(bass, 0.6);
      green = Math.pow(mid, 0.7);
      blue  = Math.pow(high, 0.65);

      if (bass > 0.75 && mid > 0.6 && high > 0.5) {
        const whiteBoost = Math.min(1, (bass + mid + high - 1.85) * 2);
        red   = Math.min(1, red   + whiteBoost * 0.4);
        green = Math.min(1, green + whiteBoost * 0.4);
        blue  = Math.min(1, blue  + whiteBoost * 0.4);
      }

      if (avgEnergy > 0.55) {
        red   = Math.min(1, red   * 1.15);
        green = Math.min(1, green * 1.05);
      }

    } else if (strategy.colorMode === "rgy") {
      red   = Math.pow(bass, 0.7);
      green = Math.pow(mid, 0.8) * (1 - bass * 0.5);
      blue  = 0;
      if (mid > 0.65) {
        red   = Math.min(1, red   + mid * 0.4);
        green = Math.min(1, green + mid * 0.3);
      }

    } else if (strategy.colorMode === "rg") {
      if (bass > mid) {
        red = Math.pow(bass, 0.6);
        green = Math.pow(mid, 0.9) * 0.4;
      } else {
        green = Math.pow(mid, 0.6);
        red = Math.pow(bass, 0.9) * 0.4;
      }
      blue = 0;

    } else {
      red = energy; green = energy * 0.5; blue = energy * 0.8;
    }

    red   = Math.min(1, red   * colorIntensity);
    green = Math.min(1, green * colorIntensity);
    blue  = Math.min(1, blue  * colorIntensity);

    // ── Strobe ────────────────────────────────────────────────────────────
    const strobe = strobeOnHigh && high > 0.75 && energy > 0.65;

    // ── Grating ───────────────────────────────────────────────────────────
    const gratingActive = gratingAllowed && energy > 0.65 && energy > avgEnergy * 1.1;

    // ── Build DMX channels ────────────────────────────────────────────────
    const channels = new Array(this.laser.channelCount).fill(0);
    const map = this.laser.channelMap;

    const fn = (fnKey: string): number => {
      const def = map.find(c => c.fn === fnKey);
      return def ? def.ch - 1 : -1;
    };

    const set = (fnKey: string, value: number) => {
      const idx = fn(fnKey);
      if (idx >= 0) channels[idx] = Math.round(Math.min(255, Math.max(0, value)));
    };

    set("mode", 120);
    set("animBank", this.bankIndex * 63);

    const patternVal = (patternIndex / (LISSAJOUS_PRESETS.length - 1)) * 200 + 20;
    set("patternLo", patternVal);
    set("pattern",  patternVal);
    set("patternHi", 0);

    set("xPos", xNorm * 255);
    set("yPos", yNorm * 255);

    const rotVal = ((rotation % (Math.PI * 2)) / (Math.PI * 2)) * 255;
    set("rotation",  rotVal);
    set("rotSpeed",  0);

    set("zoom", zoomNorm * 255);
    set("size", zoomNorm * 220);

    set("strobe", strobe ? Math.round(50 + high * 170) : 0);

    set("red",   red   * 255);
    set("green", green * 255);
    set("blue",  blue  * 255);

    set("grating",    gratingActive ? Math.round(120 + energy * 135) : 0);
    set("gratingRot", gratingActive ? Math.round(rotVal * 0.5) : 0);

    if (strategy.colorMode === "indexed") {
      const colorIdx = Math.round((timeS * 0.1 * 255) % 255);
      set("color", colorIdx);
    }

    // ── Visual state for canvas renderer ─────────────────────────────────
    const visualState: VisualState = {
      xNorm, yNorm, rotation, zoom: zoomNorm,
      red, green, blue, strobe, patternIndex, gratingActive, energy,
      // Per-frame audio values passed through to animationCode
      bass, mid, high, beat, bar: currentBar,
      textEnabled:    overrides.textEnabled    ?? false,
      textContent:    overrides.textContent    ?? "",
      animationStyle: overrides.animationStyle ?? "none",
      animationCode:  overrides.animationCode,
    };

    return { channels, visualState };
  }

  reset() {
    this.currentPatternIdx = 0;
    this.lastPatternShiftBeat = -1;
    this.phaseAccumulator = Math.random() * Math.PI * 2;
    this.zoomDecay = 0;
    this.bankIndex = Math.floor(Math.random() * 4);
    this.lastBankShiftPhrase = -1;
    this.energyHistory = [];
    this.currentBeat = 0;
    this.phraseCount = 0;
  }
}

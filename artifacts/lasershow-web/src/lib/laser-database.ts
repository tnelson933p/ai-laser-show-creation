// ─────────────────────────────────────────────────────────────────────────────
// AI LaserShow — Expert Laser Database
//
// Each profile contains:
//   • Full DMX channel map with value ranges
//   • Physical capabilities (scan speed, colors, power)
//   • Expert automation strategy tuned to this specific laser's strengths
// ─────────────────────────────────────────────────────────────────────────────

export type ColorMode = "rgb-full" | "rgy" | "rg" | "indexed" | "white-only";
export type ScanTier = "budget" | "mid" | "fast" | "pro";
export type MovementStyle = "lissajous" | "sweep" | "bounce" | "step";
export type PatternStrategy = "step-on-beat" | "step-on-phrase" | "hold-energy" | "music-reactive";

export interface ChannelRange {
  lo: number;
  hi: number;
  label: string;
}

export interface ChannelDef {
  ch: number;          // 1-indexed DMX channel
  name: string;
  fn: string;          // logical function key
  defaultVal: number;
  ranges?: ChannelRange[];
}

export interface AutomationStrategy {
  // Which channel functions respond to which audio band
  bassChannels: string[];   // fn keys driven by bass
  midChannels: string[];
  highChannels: string[];
  // BPM-phase channels (oscillate at BPM)
  bpmSyncFns: string[];
  colorMode: ColorMode;
  movementStyle: MovementStyle;
  patternStrategy: PatternStrategy;
  // Sensitivity tweaks (0–1)
  bassThreshold: number;    // min bass level to trigger bass effects
  strobeOnHigh: boolean;
  zoomOnBass: boolean;
  // Structural: how many beats before shifting to next pattern bank
  patternShiftBeats: number;
  // Expert notes for UI display
  notes: string;
}

export interface LaserModel {
  id: string;
  brand: string;
  model: string;
  channelCount: number;
  channelMap: ChannelDef[];
  scanTier: ScanTier;       // scanner speed quality
  colorMode: ColorMode;
  availableColors: string[];// human-readable colors (e.g. "660nm Red")
  maxPowerMw: number;
  builtInPatterns: number;  // number of built-in animation patterns
  scanAngleDeg: number;     // optical scan angle in degrees
  specialFeatures: string[];
  strategy: AutomationStrategy;
}

// ─────────────────────────────────────────────────────────────────────────────
// BRAND → MODEL catalog
// ─────────────────────────────────────────────────────────────────────────────

export const LASER_BRANDS: Record<string, string[]> = {
  "Kvant":           ["Atom 10 FB4", "Atom 20 FB4", "Clubmax 3000 FB4", "Clubmax 6000 FB4", "Burstberry 400 FB4"],
  "Laserworld":      ["PL-2000RGB", "CS-500RGB", "DS-2000RGB", "EL-900RGB", "TDL-500 RGB"],
  "Chauvet DJ":      ["Scorpion Storm FX RGB", "Scorpion Storm RGY", "Scorpion Dual RGB"],
  "American DJ":     ["Galaxian 3D MKII", "Vizi Beam RXONE"],
  "Showtec":         ["Galactic B140 MKII", "Galactic RGB 300", "Solaris 5"],
  "Eliminator Lighting": ["Stealth Laser", "Avalanche Laser"],
  "Beamz":           ["Polaris 3000 RGB", "Scorpion MKII RGY"],
  "Eytse":           ["EY003-L (16-ch)", "EY006-L (16-ch)"],
  "Generic / Budget":["7-Channel Animation Laser", "16-Channel Animation Laser"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build standard 16-ch Eytse-style map
// ─────────────────────────────────────────────────────────────────────────────
function eytseChannelMap(): ChannelDef[] {
  return [
    { ch: 1,  name: "Mode",            fn: "mode",        defaultVal: 120,
      ranges: [{ lo:0, hi:50, label:"Blackout"}, {lo:51, hi:100, label:"Auto"}, {lo:101, hi:150, label:"DMX Control"}, {lo:151, hi:200, label:"Sound Active"}, {lo:201, hi:255, label:"Master"}] },
    { ch: 2,  name: "Animation Bank",  fn: "animBank",    defaultVal: 0,
      ranges: [{lo:0,hi:63,label:"Bank 1"},{lo:64,hi:127,label:"Bank 2"},{lo:128,hi:191,label:"Bank 3"},{lo:192,hi:255,label:"Bank 4"}] },
    { ch: 3,  name: "Pattern Select",  fn: "patternLo",   defaultVal: 40 },
    { ch: 4,  name: "Pattern Sub",     fn: "patternHi",   defaultVal: 0 },
    { ch: 5,  name: "X Position",      fn: "xPos",        defaultVal: 127 },
    { ch: 6,  name: "Y Position",      fn: "yPos",        defaultVal: 127 },
    { ch: 7,  name: "Rotation",        fn: "rotation",    defaultVal: 127 },
    { ch: 8,  name: "Rotation Speed",  fn: "rotSpeed",    defaultVal: 0 },
    { ch: 9,  name: "Zoom",            fn: "zoom",        defaultVal: 100 },
    { ch: 10, name: "Size Scale",      fn: "size",        defaultVal: 100 },
    { ch: 11, name: "Strobe Rate",     fn: "strobe",      defaultVal: 0,
      ranges: [{lo:0,hi:0,label:"Off"},{lo:1,hi:50,label:"Slow"},{lo:51,hi:200,label:"Fast"},{lo:201,hi:255,label:"Ultra"}] },
    { ch: 12, name: "Red",             fn: "red",         defaultVal: 0 },
    { ch: 13, name: "Green",           fn: "green",       defaultVal: 0 },
    { ch: 14, name: "Blue",            fn: "blue",        defaultVal: 0 },
    { ch: 15, name: "Grating Effect",  fn: "grating",     defaultVal: 0 },
    { ch: 16, name: "Grating Rotation",fn: "gratingRot",  defaultVal: 0 },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard 7-channel generic map
// ─────────────────────────────────────────────────────────────────────────────
function generic7Map(): ChannelDef[] {
  return [
    { ch: 1, name: "Mode",        fn: "mode",    defaultVal: 100,
      ranges: [{lo:0,hi:50,label:"Blackout"},{lo:51,hi:150,label:"DMX"},{lo:151,hi:255,label:"Auto"}] },
    { ch: 2, name: "Pattern",     fn: "pattern", defaultVal: 50 },
    { ch: 3, name: "Strobe",      fn: "strobe",  defaultVal: 0 },
    { ch: 4, name: "Zoom",        fn: "zoom",    defaultVal: 100 },
    { ch: 5, name: "X Position",  fn: "xPos",    defaultVal: 127 },
    { ch: 6, name: "Y Position",  fn: "yPos",    defaultVal: 127 },
    { ch: 7, name: "Color Index", fn: "color",   defaultVal: 0,
      ranges: [{lo:0,hi:36,label:"Red"},{lo:37,hi:73,label:"Green"},{lo:74,hi:109,label:"Blue"},{lo:110,hi:145,label:"Yellow"},{lo:146,hi:182,label:"Cyan"},{lo:183,hi:218,label:"Magenta"},{lo:219,hi:255,label:"White"}] },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy templates
// ─────────────────────────────────────────────────────────────────────────────
const RGB_STRATEGY: AutomationStrategy = {
  bassChannels: ["red", "zoom", "grating"],
  midChannels: ["green", "pattern", "animBank"],
  highChannels: ["blue", "strobe"],
  bpmSyncFns: ["xPos", "yPos", "rotation"],
  colorMode: "rgb-full",
  movementStyle: "lissajous",
  patternStrategy: "step-on-phrase",
  bassThreshold: 0.55,
  strobeOnHigh: true,
  zoomOnBass: true,
  patternShiftBeats: 16,
  notes: "Full RGB — bass drives red saturation and zoom; mid drives green tonal melody; high triggers blue shimmer and strobe flashes. BPM-locked X/Y Lissajous movement."
};

const RGY_STRATEGY: AutomationStrategy = {
  bassChannels: ["zoom", "grating"],
  midChannels: ["pattern", "animBank"],
  highChannels: ["strobe"],
  bpmSyncFns: ["xPos", "yPos", "rotation"],
  colorMode: "rgy",
  movementStyle: "sweep",
  patternStrategy: "step-on-beat",
  bassThreshold: 0.60,
  strobeOnHigh: true,
  zoomOnBass: true,
  patternShiftBeats: 8,
  notes: "Red/Green/Yellow — color rotates through the palette with energy: yellow on bass peaks, green on melody presence, red as rhythmic foundation. Beat-locked pattern steps."
};

const INDEXED_STRATEGY: AutomationStrategy = {
  bassChannels: ["zoom"],
  midChannels: ["pattern"],
  highChannels: ["strobe"],
  bpmSyncFns: ["xPos", "yPos"],
  colorMode: "indexed",
  movementStyle: "sweep",
  patternStrategy: "step-on-beat",
  bassThreshold: 0.65,
  strobeOnHigh: false,
  zoomOnBass: true,
  patternShiftBeats: 8,
  notes: "Indexed color palette — color index steps through the spectrum in sync with track energy. Conservative strobe use for maximum visual impact on each hit."
};

// ─────────────────────────────────────────────────────────────────────────────
// The full model database
// ─────────────────────────────────────────────────────────────────────────────
export const LASER_DATABASE: LaserModel[] = [

  // ── KVANT ────────────────────────────────────────────────────────────────
  {
    id: "kvant-atom10",
    brand: "Kvant", model: "Atom 10 FB4",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "pro",
    colorMode: "rgb-full",
    availableColors: ["638nm Red", "520nm Green", "450nm Blue"],
    maxPowerMw: 10000,
    builtInPatterns: 64,
    scanAngleDeg: 60,
    specialFeatures: ["FB4 Pangolin BEYOND compatible", "30K ILDA scanner", "Full ILDA input"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 32,
      notes: "Premium 10W RGB with 30K pro scanners. Capable of the fastest, sharpest Lissajous curves. Use the full pattern library — pattern bank shifts work best on 4-bar (32-beat) phrases. Zoom can be modulated aggressively because the high KPPS rate prevents flicker even at extreme zoom. Bass-driven red saturation pairs perfectly with the 638nm deep red diode."
    }
  },
  {
    id: "kvant-atom20",
    brand: "Kvant", model: "Atom 20 FB4",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "pro",
    colorMode: "rgb-full",
    availableColors: ["638nm Red", "520nm Green", "450nm Blue", "588nm Yellow"],
    maxPowerMw: 20000,
    builtInPatterns: 64,
    scanAngleDeg: 60,
    specialFeatures: ["FB4 Pangolin", "30K scanner", "RGBA diodes", "Quad beam splitter ready"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 32,
      bassThreshold: 0.50,
      notes: "20W powerhouse with RGBA diodes. The yellow diode adds a warm mid-energy color unavailable in 3-diode lasers — use it during melodic mid sections. At 30K scanner speed, complex 5:4 and 7:6 Lissajous ratios are achievable. Drive pattern banks on 8-bar cycles for maximum structural variation across a long set."
    }
  },
  {
    id: "kvant-clubmax3000",
    brand: "Kvant", model: "Clubmax 3000 FB4",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "pro",
    colorMode: "rgb-full",
    availableColors: ["638nm Red", "520nm Green", "450nm Blue"],
    maxPowerMw: 3000,
    builtInPatterns: 64,
    scanAngleDeg: 70,
    specialFeatures: ["FB4 ready", "20K scanner", "40° horizontal, 30° vertical spread", "Ultra compact"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 16,
      notes: "Club-optimized 3W RGB at 20K scan. Wider 70° scan angle means more immersive room coverage. Prioritize sweeping X/Y movement at 1x and 2x BPM phase. At club scale, grating effects are highly visible — activate them on dense energy bars above 65% average. Pattern banks at 2-bar (16 beat) cycles keep the show dynamic."
    }
  },
  {
    id: "kvant-clubmax6000",
    brand: "Kvant", model: "Clubmax 6000 FB4",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "pro",
    colorMode: "rgb-full",
    availableColors: ["638nm Red", "520nm Green", "450nm Blue"],
    maxPowerMw: 6000,
    builtInPatterns: 64,
    scanAngleDeg: 70,
    specialFeatures: ["FB4 ready", "25K scanner", "Dual output option", "Festival grade"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 16,
      bassThreshold: 0.45,
      notes: "6W festival-grade RGB. At this power level, every effect is visible even under ambient stage lighting. Lower the bass threshold — even moderate bass hits justify full zoom snaps. The dual output option enables split-beam patterns using both grating channels. Strobe on high-energy bars is extremely impactful — but limit to max 4 bars continuous."
    }
  },
  {
    id: "kvant-burstberry",
    brand: "Kvant", model: "Burstberry 400 FB4",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "fast",
    colorMode: "rgb-full",
    availableColors: ["638nm Red", "520nm Green", "450nm Blue"],
    maxPowerMw: 400,
    builtInPatterns: 32,
    scanAngleDeg: 50,
    specialFeatures: ["FB4 ready", "Compact performance laser", "15K scanner"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 8,
      bassThreshold: 0.60,
      notes: "400mW compact — ideal for smaller venues and DJ booths. Use simpler 1:1 and 2:1 Lissajous patterns at this power level; they scan faster and appear brighter than complex high-ratio patterns. Shift patterns every 8 beats to maintain energy without overwhelming the small venue footprint."
    }
  },

  // ── LASERWORLD ────────────────────────────────────────────────────────────
  {
    id: "laserworld-pl2000",
    brand: "Laserworld", model: "PL-2000RGB",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "fast",
    colorMode: "rgb-full",
    availableColors: ["Red 638nm", "Green 520nm", "Blue 450nm"],
    maxPowerMw: 2000,
    builtInPatterns: 64,
    scanAngleDeg: 60,
    specialFeatures: ["ILDA input", "20K scanner", "Stand-alone auto mode"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 16,
      notes: "2W RGB professional with ILDA. At 20K scan the PL-2000RGB handles complex patterns cleanly. The built-in pattern library is comprehensive — shift banks on 2-bar phrases for variety. Good candidate for using grating effects on the dense energy sections of progressive electronic music."
    }
  },
  {
    id: "laserworld-cs500",
    brand: "Laserworld", model: "CS-500RGB",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "mid",
    colorMode: "rgb-full",
    availableColors: ["Red", "Green", "Blue"],
    maxPowerMw: 500,
    builtInPatterns: 32,
    scanAngleDeg: 50,
    specialFeatures: ["Entry-level professional", "15K scanner"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "sweep",
      patternShiftBeats: 8,
      bassThreshold: 0.60,
      notes: "Entry pro RGB. At 15K scanner speed, prefer simple patterns — circles, figure-8s, single lines — which appear sharper at this scan rate. Step patterns every 8 beats. Reserve complex Lissajous (3:2, 4:3) for slower passages where the scanner can render them without visible flicker."
    }
  },
  {
    id: "laserworld-ds2000",
    brand: "Laserworld", model: "DS-2000RGB",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "fast",
    colorMode: "rgb-full",
    availableColors: ["Red 638nm", "Green 520nm", "Blue 450nm"],
    maxPowerMw: 2000,
    builtInPatterns: 48,
    scanAngleDeg: 55,
    specialFeatures: ["ILDA input", "ShowNET ready", "18K scanner"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 16,
      notes: "DS-2000RGB mid-range professional. ShowNET networking capability makes it ideal for synchronized multi-unit setups. In standalone DMX mode, the 18K scanner handles up to 4:3 Lissajous well. Bass response should drive zoom and red; save the grating effects for the climactic sections of the track."
    }
  },
  {
    id: "laserworld-el900",
    brand: "Laserworld", model: "EL-900RGB",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "mid",
    colorMode: "rgb-full",
    availableColors: ["Red", "Green", "Blue"],
    maxPowerMw: 900,
    builtInPatterns: 32,
    scanAngleDeg: 50,
    specialFeatures: ["ILDA input", "Compact form factor", "15K scanner"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "sweep",
      patternShiftBeats: 8,
      notes: "EL-900RGB compact 1W-class RGB. Best used with simple patterns and generous zoom to maximize visible impact. The 15K scanner is adequate for basic Lissajous at moderate zoom. Step patterns every 8 beats. On bass drops, snap zoom to max then decay over 2 beats for a punchy hit effect."
    }
  },
  {
    id: "laserworld-tdl500",
    brand: "Laserworld", model: "TDL-500 RGB",
    channelCount: 7,
    channelMap: generic7Map(),
    scanTier: "budget",
    colorMode: "rgb-full",
    availableColors: ["Red", "Green", "Blue"],
    maxPowerMw: 500,
    builtInPatterns: 20,
    scanAngleDeg: 40,
    specialFeatures: ["7-channel DMX", "Entry level"],
    strategy: {
      ...INDEXED_STRATEGY,
      movementStyle: "sweep",
      patternStrategy: "step-on-beat",
      notes: "Entry-level 7ch RGB. Simple sweep movements look best at this power level. Step patterns every beat on the downbeat. Color index should cycle through the full 0–255 range over 4 bars so the show stays colorful without feeling chaotic."
    }
  },

  // ── CHAUVET DJ ───────────────────────────────────────────────────────────
  {
    id: "chauvet-scorpion-fx-rgb",
    brand: "Chauvet DJ", model: "Scorpion Storm FX RGB",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "mid",
    colorMode: "rgb-full",
    availableColors: ["Red 650nm", "Green 532nm", "Blue 450nm"],
    maxPowerMw: 520,
    builtInPatterns: 24,
    scanAngleDeg: 45,
    specialFeatures: ["FX beam-splitting diffraction grating built in", "Multiple output apertures", "12 built-in FX patterns"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "bounce",
      patternShiftBeats: 8,
      notes: "Scorpion FX RGB is unique for its built-in diffraction grating producing 5-point beam fans. The grating channels should be the primary visual driver — activate grating effects (CH15) from the first beat. The 5-fan spread means X/Y movement sweeps an entire wall. Pattern steps every 8 beats keep the show fresh. Strobe is especially impactful through the multi-beam grating output."
    }
  },
  {
    id: "chauvet-scorpion-rgy",
    brand: "Chauvet DJ", model: "Scorpion Storm RGY",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "mid",
    colorMode: "rgy",
    availableColors: ["Red 650nm", "Green 532nm", "Yellow 589nm"],
    maxPowerMw: 260,
    builtInPatterns: 24,
    scanAngleDeg: 40,
    specialFeatures: ["FX grating", "No blue diode", "Warm color palette"],
    strategy: {
      ...RGY_STRATEGY,
      movementStyle: "sweep",
      notes: "RGY color palette (no blue). Yellow is this laser's unique strength — use it on the melodic mid sections for a warm, energetic feel. Red on the bass foundation, green for rhythm elements. At 40° scan, sweeping X/Y movements create a sense of depth. Grating effects multiply the output visually — rely on them heavily."
    }
  },
  {
    id: "chauvet-scorpion-dual",
    brand: "Chauvet DJ", model: "Scorpion Dual RGB",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "mid",
    colorMode: "rgb-full",
    availableColors: ["Red 650nm", "Green 532nm", "Blue 450nm"],
    maxPowerMw: 200,
    builtInPatterns: 16,
    scanAngleDeg: 40,
    specialFeatures: ["Dual beam output", "Compact DMX club fixture"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "sweep",
      patternShiftBeats: 8,
      bassThreshold: 0.60,
      notes: "Dual-beam RGB. The two outputs are fixed at a divergent angle — program X movement as a pendulum sweep so both beams fan across the room. Bass drives zoom (both beams widen/narrow together). Keep patterns simple (circle, figure-8) for maximum brightness per beam at this power level."
    }
  },

  // ── AMERICAN DJ ──────────────────────────────────────────────────────────
  {
    id: "adj-galaxian-3d",
    brand: "American DJ", model: "Galaxian 3D MKII",
    channelCount: 7,
    channelMap: generic7Map(),
    scanTier: "budget",
    colorMode: "rgy",
    availableColors: ["Red 650nm", "Green 532nm", "Yellow"],
    maxPowerMw: 100,
    builtInPatterns: 12,
    scanAngleDeg: 360,
    specialFeatures: ["360° motorized head", "Star-field scatter projection", "Sound active"],
    strategy: {
      ...RGY_STRATEGY,
      movementStyle: "bounce",
      patternStrategy: "step-on-beat",
      patternShiftBeats: 4,
      notes: "Galaxian 3D MKII uses a scatter-type projection (dot/starfield, not line-based). The 360° motorized head projects upward and bounces off the ceiling. Program X/Y as slow circular sweeps at 1/4 BPM for immersive atmosphere. Fast pattern steps (every 4 beats) work well because the scatter patterns are all visually similar and transitions are subtle. Color cycling through the 7-color palette adds the main show variation."
    }
  },
  {
    id: "adj-vizi-beam",
    brand: "American DJ", model: "Vizi Beam RXONE",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "budget",
    colorMode: "indexed",
    availableColors: ["White (LED base)", "Red", "Green", "Blue", "Yellow", "Cyan", "Magenta"],
    maxPowerMw: 150,
    builtInPatterns: 8,
    scanAngleDeg: 35,
    specialFeatures: ["Moving head (not scanner)", "Gobos", "Prism"],
    strategy: {
      ...INDEXED_STRATEGY,
      movementStyle: "step",
      patternStrategy: "step-on-phrase",
      patternShiftBeats: 16,
      notes: "Vizi Beam RXONE is a moving head — mechanics are slower than a galvo scanner. Program movement speeds conservatively (60–90% of max) to avoid motor overshooting on fast BPM tracks. Gobo/prism effects are the main visual draw — step them on 4-bar phrases. Color index should change every 2 bars. Strobe use should be minimal to avoid mechanical stress."
    }
  },

  // ── SHOWTEC ──────────────────────────────────────────────────────────────
  {
    id: "showtec-galactic-b140",
    brand: "Showtec", model: "Galactic B140 MKII",
    channelCount: 7,
    channelMap: generic7Map(),
    scanTier: "mid",
    colorMode: "rg",
    availableColors: ["Red 650nm", "Green 532nm"],
    maxPowerMw: 140,
    builtInPatterns: 20,
    scanAngleDeg: 45,
    specialFeatures: ["RG only — no blue", "Stand-alone & DMX", "Compact DJ laser"],
    strategy: {
      ...INDEXED_STRATEGY,
      colorMode: "rg",
      movementStyle: "sweep",
      patternShiftBeats: 4,
      notes: "Red/Green only laser — a classic club staple. The limited palette is the aesthetic: red and green together create yellow via additive mixing at the screen. Strategy: red on the bass downbeats, green rises with the melodic mid layer. Alternate them on 2-beat intervals for a rhythmic flickering effect. Sweep X/Y in a figure-8 Lissajous at 2x BPM for classic laser sweep feel."
    }
  },
  {
    id: "showtec-galactic-rgb300",
    brand: "Showtec", model: "Galactic RGB 300",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "mid",
    colorMode: "rgb-full",
    availableColors: ["Red 650nm", "Green 532nm", "Blue 450nm"],
    maxPowerMw: 300,
    builtInPatterns: 32,
    scanAngleDeg: 48,
    specialFeatures: ["Compact RGB", "ILDA input", "15K scanner"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 8,
      bassThreshold: 0.60,
      notes: "300mW RGB at 15K — a well-rounded club laser. Use simple 1:1 and 2:1 Lissajous at full zoom for maximum brightness. Drive color with the full RGB matrix: bass→red, mid→green, high→blue. The additive color mixing produces white on simultaneous peaks — use this white flash on major builds for impact."
    }
  },
  {
    id: "showtec-solaris5",
    brand: "Showtec", model: "Solaris 5",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "fast",
    colorMode: "rgb-full",
    availableColors: ["Red", "Green", "Blue", "Yellow"],
    maxPowerMw: 5000,
    builtInPatterns: 64,
    scanAngleDeg: 65,
    specialFeatures: ["5W RGBA", "20K scanner", "Festival class", "Multiple zones"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 16,
      bassThreshold: 0.45,
      notes: "5W festival-class RGBA Showtec. With a 65° scan angle this floods large stages. Lower the bass threshold significantly — at this power level moderate hits still need to trigger zoom snaps. The yellow diode should appear on mid-energy plateaus between drops. Use the full 4-bank animation library with 16-beat shift cycles for maximum set-length variety."
    }
  },

  // ── ELIMINATOR ───────────────────────────────────────────────────────────
  {
    id: "eliminator-stealth",
    brand: "Eliminator Lighting", model: "Stealth Laser",
    channelCount: 7,
    channelMap: generic7Map(),
    scanTier: "budget",
    colorMode: "rg",
    availableColors: ["Red 650nm", "Green 532nm"],
    maxPowerMw: 100,
    builtInPatterns: 10,
    scanAngleDeg: 35,
    specialFeatures: ["Budget DJ laser", "Stand-alone & DMX"],
    strategy: {
      ...INDEXED_STRATEGY,
      colorMode: "rg",
      movementStyle: "sweep",
      patternShiftBeats: 4,
      notes: "Budget RG laser — keep it simple. Stick to 4 core patterns and cycle them every 4 beats. X/Y sweep in a circle at 1x BPM. The limited power means zoom should always stay at 80–100% for maximum visibility. Color channel alternates between red (0) and green (85) with yellow blend (42) on the BPM downbeat."
    }
  },
  {
    id: "eliminator-avalanche",
    brand: "Eliminator Lighting", model: "Avalanche Laser",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "mid",
    colorMode: "rgb-full",
    availableColors: ["Red", "Green", "Blue"],
    maxPowerMw: 300,
    builtInPatterns: 24,
    scanAngleDeg: 45,
    specialFeatures: ["16-ch DMX", "Mid-range club laser"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 8,
      notes: "Mid-range 300mW RGB. Good all-around club laser — the RGB automation matrix applies cleanly. Shift animation banks every 8 beats. Use grating at 180 (half power) for mid-density sections and 255 for peaks. Rotation channel should sweep at 1/2 BPM for a slow hypnotic rotation between patterns."
    }
  },

  // ── BEAMZ ────────────────────────────────────────────────────────────────
  {
    id: "beamz-polaris3000",
    brand: "Beamz", model: "Polaris 3000 RGB",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "mid",
    colorMode: "rgb-full",
    availableColors: ["Red", "Green", "Blue"],
    maxPowerMw: 300,
    builtInPatterns: 32,
    scanAngleDeg: 50,
    specialFeatures: ["16-ch DMX", "ILDA compatible", "Built-in SD card"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 8,
      notes: "Polaris 3000 RGB — solid mid-range performance. The SD card standalone mode means this laser performs well at any event. In DMX mode, the standard RGB matrix strategy applies. Prefer 2:1 and 3:2 Lissajous ratios. Pattern step every 8 beats. Zoom snaps on bass are very impactful with the 50° scan angle."
    }
  },
  {
    id: "beamz-scorpion-rgy",
    brand: "Beamz", model: "Scorpion MKII RGY",
    channelCount: 7,
    channelMap: generic7Map(),
    scanTier: "budget",
    colorMode: "rgy",
    availableColors: ["Red 650nm", "Green 532nm", "Yellow"],
    maxPowerMw: 80,
    builtInPatterns: 12,
    scanAngleDeg: 40,
    specialFeatures: ["Budget event laser", "RGY palette"],
    strategy: {
      ...RGY_STRATEGY,
      movementStyle: "sweep",
      patternShiftBeats: 4,
      notes: "Budget RGY — color is the main tool. Cycle: red (bass) → yellow (mid peak) → green (sustained energy) → all-off (silence/break). Step patterns every 4 beats to keep visual interest. Zoom should stay at 85%+ to ensure visibility in any ambient light condition."
    }
  },

  // ── EYTSE ────────────────────────────────────────────────────────────────
  {
    id: "eytse-ey003l",
    brand: "Eytse", model: "EY003-L (16-ch)",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "mid",
    colorMode: "rgb-full",
    availableColors: ["Red", "Green", "Blue"],
    maxPowerMw: 2000,
    builtInPatterns: 200,
    scanAngleDeg: 45,
    specialFeatures: [
      "2W total RGB (Red 450mW · Green 350mW · Blue 1200mW)",
      "Blue-dominant output — cyan/blue/violet appear brightest",
      "200+ built-in 3D animations & aerial geometry patterns",
      "50 holiday/Christmas themed patterns",
      "16-ch full DMX512 In/Out",
      "Bluetooth Light Elf app — custom text, freehand drawing, 20-scene show builder",
      "Sound-active / mic mode",
      "Master/Slave daisy-chain via DMX",
      "Auto mode (standalone loop)",
    ],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 8,
      notes: "EY003-L — 2W total RGB (R 450mW / G 350mW / B 1200mW). Blue diode is 60% of total power, so pure blue beams are strikingly bright while red is the weakest color — push red intensity higher to compensate. Lock CH1 to 120 (DMX remote control mode) at all times. Grating effects (CH15-16) are highly visible — engage from 65% average energy upward. Standard BPM-locked Lissajous on X/Y with rotation at 1/2 BPM. Scanner is mid-tier (~15 KPPS): keep Lissajous ratios at 1:1, 2:1, 3:2 for clean shapes — avoid 5:4 or higher which may flicker at this scanner speed. At 2W the beams are visible overhead without haze but benefit significantly from light fog/haze. High energy sections fully support grating fan-out across the room."
    }
  },
  {
    id: "eytse-ey006l",
    brand: "Eytse", model: "EY006-L (16-ch)",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "fast",
    colorMode: "rgb-full",
    availableColors: ["Red", "Green", "Blue"],
    maxPowerMw: 600,
    builtInPatterns: 48,
    scanAngleDeg: 50,
    specialFeatures: ["16-ch full DMX", "600mW RGB", "Fast scanner"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "lissajous",
      patternShiftBeats: 16,
      bassThreshold: 0.50,
      notes: "EY006-L at 600mW — twice the power of the 003-L with a faster scanner. Can drive more complex Lissajous patterns (3:2, 4:3) cleanly. Lower bass threshold to 50% since the extra power means moderate hits deserve full response. Pattern bank cycle every 16 beats for more structural variety in the show."
    }
  },

  // ── GENERIC / BUDGET ─────────────────────────────────────────────────────
  {
    id: "generic-7ch",
    brand: "Generic / Budget", model: "7-Channel Animation Laser",
    channelCount: 7,
    channelMap: generic7Map(),
    scanTier: "budget",
    colorMode: "indexed",
    availableColors: ["Red", "Green", "Blue", "Yellow", "Cyan", "Magenta", "White"],
    maxPowerMw: 200,
    builtInPatterns: 16,
    scanAngleDeg: 40,
    specialFeatures: ["Universal budget fixture", "7-ch DMX"],
    strategy: {
      ...INDEXED_STRATEGY,
      movementStyle: "sweep",
      patternShiftBeats: 4,
      notes: "Generic 7-ch budget laser. Keep the automation simple and reliable: step patterns every 4 beats, color index cycles through 0→255 over 2 bars. X/Y sweep in a circle. Zoom stays above 85% for visibility. Strobe only on the very highest high-end peaks to reserve it for special moments."
    }
  },
  {
    id: "generic-16ch",
    brand: "Generic / Budget", model: "16-Channel Animation Laser",
    channelCount: 16,
    channelMap: eytseChannelMap(),
    scanTier: "budget",
    colorMode: "rgb-full",
    availableColors: ["Red", "Green", "Blue"],
    maxPowerMw: 200,
    builtInPatterns: 24,
    scanAngleDeg: 40,
    specialFeatures: ["16-ch DMX", "Standard animation fixture"],
    strategy: {
      ...RGB_STRATEGY,
      movementStyle: "sweep",
      patternShiftBeats: 8,
      bassThreshold: 0.65,
      notes: "Generic 16-ch budget RGB. Apply the standard RGB matrix but raise the bass threshold — budget scanners need a strong signal to make zoom snaps look intentional rather than jittery. Keep Lissajous at 1:1 and 2:1 ratios. Pattern step every 8 beats. Grating effects work even on budget scanners and add significant visual complexity."
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getLaserById(id: string): LaserModel | undefined {
  return LASER_DATABASE.find(l => l.id === id);
}

export function getLaserByBrandModel(brand: string, model: string): LaserModel | undefined {
  return LASER_DATABASE.find(l => l.brand === brand && l.model === model);
}

export function getModelsForBrand(brand: string): LaserModel[] {
  return LASER_DATABASE.filter(l => l.brand === brand);
}

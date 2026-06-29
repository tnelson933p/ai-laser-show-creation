---
name: AI show director animation variables
description: What variables are available in animationCode, and what each one does
---

The `runCustomAnimation` sandbox passes these variables via `new Function(...)`:

| Variable | Type | Description |
|---|---|---|
| `ctx` | CanvasRenderingContext2D | Pre-configured with laser glow, color, lineWidth |
| `t` | number | Time in seconds (always increasing) |
| `energy` | number 0-1 | Combined energy: bass×0.5 + mid×0.3 + high×0.2 |
| `bass` | number 0-1 | Live kick/sub energy — drives beat-drop reactions |
| `mid` | number 0-1 | Live melody/chord energy — drives secondary motion |
| `high` | number 0-1 | Live hi-hat/snare energy — drives sparkle, shimmer |
| `beat` | number 0-1 | Position within current BPM beat — RESETS each beat |
| `bar` | number | Current bar number (integer, 0-indexed) |
| `cx, cy` | number | Canvas center in pixels |
| `W, H` | number | Canvas width/height |
| `R` | number | Reference radius = 0.38 × min(W,H) |
| `color` | string | Current laser color hex |
| `dpr` | number | Device pixel ratio |
| `Math, performance` | globals | Standard JS globals |

**Key beat-locked pattern:**
```js
const kick = Math.max(0, 1 - beat * 6) * bass;
// Sharp attack at beat start, instant decay. Multiplied by bass so it only fires on loud kicks.
```

**Why:** beat was missing before this audit. Without it, all animations were time-based (Math.sin(t*speed)) and drifted relative to the music. With beat, effects can fire exactly on every BPM pulse.

**How to apply:** Any time animationCode is being written or debugged, verify these 5 audio-reactive variables are being used (not just t and energy).

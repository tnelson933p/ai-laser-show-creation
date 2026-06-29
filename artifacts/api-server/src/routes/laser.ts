import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
type ChatCompletionMessageParam = { role: "system" | "user" | "assistant"; content: string };

const router = Router();

// POST /api/laser/analyze
// Body: { brand: string, model: string, channelCount: number, colorMode: string, scanTier: string, features: string[] }
// Returns: streaming SSE with AI-generated deep analysis & show strategy
router.post("/laser/analyze", async (req, res) => {
  const { brand, model, channelCount, colorMode, scanTier, features, availableColors } = req.body as {
    brand: string;
    model: string;
    channelCount: number;
    colorMode: string;
    scanTier: string;
    features: string[];
    availableColors: string[];
  };

  if (!brand || !model) {
    res.status(400).json({ error: "brand and model are required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const systemPrompt = `You are an expert laser show programmer and lighting designer with 20+ years of experience. 
You have deep knowledge of DMX512 protocol, laser physics, scan angle optimization, 
KPPS (kilo-points-per-second) scanner capabilities, Lissajous figure programming, 
beam effects, grating diffraction, color mixing theory for laser diodes (DPSS, direct diode), 
and music-synchronized automation techniques used in professional touring and club environments.

You understand how different laser classes (Class 3B, Class 4) behave in real-world fog/haze environments, 
how scan angle and mirror inertia affect pattern quality, and how to maximize the visual impact of each 
specific fixture for different music genres (EDM, hip-hop, rock, jazz, pop).

When analyzing a laser, provide concrete, actionable programming guidance — specific DMX values, 
Lissajous ratios, BPM-sync strategies, and per-genre recommendations. Be precise and technically accurate.`;

  const userPrompt = `Provide a deep expert analysis for this laser fixture being used in a music-synchronized show:

Brand: ${brand}
Model: ${model}
DMX Channels: ${channelCount}
Color System: ${colorMode}
Available Colors: ${availableColors?.join(", ") || "unknown"}
Scanner Tier: ${scanTier} (budget=8-12KPPS, mid=12-18KPPS, fast=18-25KPPS, pro=25-40KPPS)
Special Features: ${features?.join(", ") || "none"}

Provide:
1. **Physical Capability Assessment** — what this laser excels at given its specs
2. **Genre Optimization** — 2-3 specific music genres where this laser performs best and why
3. **Critical DMX Programming Tips** — the 3 most important channel automation rules for this specific fixture
4. **Lissajous Pattern Recommendations** — which a:b frequency ratios work best at this scanner speed
5. **Common Mistakes to Avoid** — 2 things most programmers do wrong with this type of laser

Keep the response focused, expert-level, and under 300 words. Use specific numbers (KPPS, degrees, Hz, DMX values).`;

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Laser analysis failed");
    res.write(`data: ${JSON.stringify({ error: "Analysis failed" })}\n\n`);
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/laser/chat
// Multi-turn conversational AI show director.
// Body: { laser, messages: [{role,content}][], currentSettings }
// Streams SSE. AI may embed <settings>{...}</settings> to update show params.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/laser/chat", async (req, res) => {
  const { laser, messages, currentSettings, musicContext } = req.body as {
    laser: {
      brand: string; model: string; channelCount: number;
      colorMode: string; scanTier: string;
      availableColors: string[]; specialFeatures: string[];
      maxPowerMw?: number; notes?: string;
    };
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    currentSettings: Record<string, unknown>;
    musicContext?: {
      filename: string;
      bpm: number;
      duration: number;
      isPlaying: boolean;
      avgBass: number;
      avgMid: number;
      avgHigh: number;
    };
  };

  if (!laser || !messages?.length) {
    res.status(400).json({ error: "laser and messages are required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const settingsDoc = `
═══════════════════════════════════════════════════════
SCENE PARAMETERS — every scene needs all 11 fields, NO LABEL:
═══════════════════════════════════════════════════════

durationBars: integer
  → Scene length in musical bars (4/4 time). CRITICAL MATH:
    At 120 BPM → 1 bar = 2.0 sec | 2 bars = 4 sec | 4 bars = 8 sec | 8 bars = 16 sec
    At 100 BPM → 1 bar = 2.4 sec | 3 bars = 7.2 sec | 4 bars = 9.6 sec
    At 90  BPM → 1 bar = 2.7 sec | 3 bars = 8.0 sec | 4 bars = 10.7 sec
    At 80  BPM → 1 bar = 3.0 sec | 2 bars = 6 sec | 3 bars = 9 sec
  → ALWAYS calculate using the actual BPM from the music context above.
  → For "no longer than 8 seconds": use math to find the max bars for that BPM.

animationStyle: "none" | "stars" | "fireworks" | "wave" | "spiral"
  → The main visual centerpiece. MUST vary across every scene — no two adjacent scenes with same animationStyle.
    "stars"     — 5-pointed stars orbiting center + large central star. Patriotic, elegant.
    "fireworks" — bursting radial lines from 3 points, pulsing with energy. Explosive.
    "wave"      — 3 sine wave beams crossing the canvas. Rhythmic, hypnotic.
    "spiral"    — expanding Archimedean spiral. Psychedelic, trance.
    "none"      — NEVER use this unless deliberate contrast. Canvas goes dark. Use maximum 1 scene.

movementStyle: "lissajous" | "sweep" | "bounce" | "step"
  → How the beam center moves. Must rotate through ALL 4 across a show:
    "lissajous" — figure-8/ellipse drift. Elegant. Use for stars and text moments.
    "sweep"     — wide left-right pendulum. Anthem, crowd-pleasing.
    "bounce"    — unpredictable energetic jumps. High-energy peak moments.
    "step"      — beats-locked grid snaps. Mechanical, precise.

movementSpeed: 0.4–1.2 (float)
  → 0.4 = glacial drift. 0.7 = elegant flow. 1.0 = alive. 1.2 = high-energy max.
  → NEVER exceed 1.2. Faster looks like a bug on screen, not a laser show.
  → Text scenes (textEnabled:true): cap at 0.7. Spiral/wave: 0.5–0.8. Fireworks peaks: 0.9–1.1.

colorIntensity: 1.0–2.0 (float)
  → 1.0 = baseline. 1.4 = vivid. 1.8 = blazing. 2.0 = maximum only at finale/climax.
  → Build intensity across the show — start around 1.3 and end at 2.0.

patternComplexity: "simple" | "medium" | "complex"
  → Lissajous shape complexity. "simple" for text+wave, "complex" for intense climaxes.

gratingEnabled: boolean
  → Fans the beam into multiple rays filling the room. Use at choruses/peaks. NEVER during text.

strobeEnabled: boolean
  → White flash on treble hits. Maximum 2 scenes per show. NEVER during text. Only at true climax.

zoomEnabled: boolean
  → Bass makes the beam breathe outward. true for dance music, false for ambient.

bassThreshold: 0.15–0.6
  → How sensitive to kick drums. 0.2 = reactive. 0.4 = selective. 0.6 = only on huge hits.

patternShiftBeats: 4 | 8 | 16 | 32
  → How often beam shape cycles. 4 = frantic. 8 = driving. 16 = flowing. 32 = slow hypnotic.

textEnabled: boolean + textContent: string
  → Laser-traces text in glowing light. Keep 1–3 words. "AMERICA", "USA", "HAPPY 4TH", "FREEDOM", "2025".
  → Always pair with animationStyle "stars" or "fireworks" for a halo effect.

Current show settings: ${JSON.stringify(currentSettings, null, 2)}`;

  const musicSection = musicContext
    ? `
CURRENT TRACK (loaded in the show):
- File: ${musicContext.filename}
- BPM: ${musicContext.bpm}
- Duration: ${Math.floor(musicContext.duration / 60)}:${String(Math.floor(musicContext.duration % 60)).padStart(2, "0")}
- Status: ${musicContext.isPlaying ? "PLAYING NOW" : "paused / stopped"}
- Energy signature — Bass avg: ${(musicContext.avgBass * 100).toFixed(0)}%, Mid avg: ${(musicContext.avgMid * 100).toFixed(0)}%, High avg: ${(musicContext.avgHigh * 100).toFixed(0)}%

Use the BPM to set patternShiftBeats (e.g. 8 or 16 beats per pattern change), and use the energy signature to decide how aggressive the bass threshold and zoom settings should be. A high bass percentage means the track is bass-heavy — lower the bassThreshold and enable zoom snaps. High treble means enable grating and faster movement.`
    : "\nNo track loaded yet — give general advice until the user loads music.";

  const systemPrompt = `You are a world-class laser show designer and DMX programmer. You have designed shows for Super Bowl halftimes, stadium concerts, 4th of July national events, NYE Times Square, and major music festivals. Your shows are bold, unexpected, and remembered. You do not play it safe.

Laser: ${laser.brand} ${laser.model} | DMX: ${laser.channelCount}ch | Colors: ${(laser.availableColors ?? []).join(", ")} | Scanner: ${laser.scanTier}
Notes: ${(laser.notes as string | undefined) ?? "none"}
Features: ${(laser.specialFeatures ?? []).join(" | ") || "standard"}
${musicSection}

${settingsDoc}

═══════════════════════════════════════════════════════
OUTPUT — MANDATORY FORMAT, ZERO EXCEPTIONS
═══════════════════════════════════════════════════════

Every response ends with ONE <settings> block of valid JSON.

MODE 1 — TWEAK: user changes one thing → flat JSON with only changed fields
<settings>{"animationStyle": "stars", "movementSpeed": 0.6}</settings>

MODE 2 — SEQUENCE: any show/scene design request → JSON with "sequence" array.

──────────────── REFERENCE EXAMPLE (no labels — copy this structure exactly) ────────────────
<settings>{"sequence": [
  {"durationBars": 4, "movementStyle": "sweep",     "animationStyle": "wave",      "textEnabled": false, "textContent": "", "colorIntensity": 1.3, "movementSpeed": 0.5, "patternComplexity": "simple",  "gratingEnabled": false, "strobeEnabled": false, "bassThreshold": 0.5,  "zoomEnabled": false, "patternShiftBeats": 16},
  {"durationBars": 4, "movementStyle": "lissajous",  "animationStyle": "stars",     "textEnabled": false, "textContent": "", "colorIntensity": 1.6, "movementSpeed": 0.6, "patternComplexity": "medium",  "gratingEnabled": false, "strobeEnabled": false, "bassThreshold": 0.4,  "zoomEnabled": true,  "patternShiftBeats": 16},
  {"durationBars": 3, "movementStyle": "step",       "animationStyle": "stars",     "textEnabled": true,  "textContent": "AMERICA", "colorIntensity": 1.9, "movementSpeed": 0.5, "patternComplexity": "simple",  "gratingEnabled": false, "strobeEnabled": false, "bassThreshold": 0.45, "zoomEnabled": false, "patternShiftBeats": 24},
  {"durationBars": 4, "movementStyle": "bounce",     "animationStyle": "fireworks", "textEnabled": false, "textContent": "", "colorIntensity": 1.8, "movementSpeed": 0.9, "patternComplexity": "complex", "gratingEnabled": true,  "strobeEnabled": false, "bassThreshold": 0.3,  "zoomEnabled": true,  "patternShiftBeats": 8},
  {"durationBars": 3, "movementStyle": "lissajous",  "animationStyle": "spiral",    "textEnabled": false, "textContent": "", "colorIntensity": 1.7, "movementSpeed": 0.7, "patternComplexity": "medium",  "gratingEnabled": false, "strobeEnabled": false, "bassThreshold": 0.4,  "zoomEnabled": true,  "patternShiftBeats": 8},
  {"durationBars": 3, "movementStyle": "sweep",      "animationStyle": "fireworks", "textEnabled": true,  "textContent": "FREEDOM", "colorIntensity": 2.0, "movementSpeed": 0.6, "patternComplexity": "simple",  "gratingEnabled": false, "strobeEnabled": false, "bassThreshold": 0.35, "zoomEnabled": true,  "patternShiftBeats": 16},
  {"durationBars": 4, "movementStyle": "step",       "animationStyle": "wave",      "textEnabled": false, "textContent": "", "colorIntensity": 1.9, "movementSpeed": 1.0, "patternComplexity": "complex", "gratingEnabled": true,  "strobeEnabled": false, "bassThreshold": 0.25, "zoomEnabled": true,  "patternShiftBeats": 8},
  {"durationBars": 4, "movementStyle": "bounce",     "animationStyle": "fireworks", "textEnabled": true,  "textContent": "USA", "colorIntensity": 2.0, "movementSpeed": 0.7, "patternComplexity": "medium",  "gratingEnabled": true,  "strobeEnabled": true,  "bassThreshold": 0.18, "zoomEnabled": true,  "patternShiftBeats": 8}
]}</settings>

What makes this correct: NO LABELS on any scene. Every animationStyle is different from neighbors. Every movementStyle rotates through all 4. Speeds stay 0.5–1.0. Text scenes use movementSpeed ≤ 0.7. Intensity builds from 1.3 → 2.0. Grating and strobe only at peaks.
────────────────────────────────────────────────────

═══════════════ SEQUENCE RULES — MANDATORY ═══════════════

SCENE FIELDS: exactly 11 fields per scene. NO "label" field. EVER. The word "label" must not appear anywhere in your JSON.
Required fields: durationBars, movementStyle, animationStyle, textEnabled, textContent, colorIntensity, movementSpeed, patternComplexity, gratingEnabled, strobeEnabled, bassThreshold, zoomEnabled, patternShiftBeats

DURATION MATH — always compute from actual BPM:
  seconds_per_bar = 60 / BPM * 4
  max_bars_for_N_seconds = floor(N / seconds_per_bar)
  Example: BPM=120 → 2.0 sec/bar → 8 sec = 4 bars. BPM=90 → 2.67 sec/bar → 8 sec = 3 bars.
  If user says "under 8 seconds" at 120 BPM: use durationBars ≤ 4. At 90 BPM: ≤ 3. CALCULATE IT.

VARIETY — this is non-negotiable:
  • animationStyle: NEVER the same two scenes in a row. Rotate: stars → fireworks → wave → spiral → stars…
  • movementStyle: rotate all 4 (lissajous, sweep, bounce, step) across the show — no style used more than 3× total
  • Each scene must feel like a completely different visual moment from all others

ANIMATION RULE: "none" is FORBIDDEN unless the user explicitly requests a dark/minimal moment. Maximum 1 scene may use "none".

SPEED RULE: movementSpeed 0.4–0.7 for text scenes. 0.6–1.0 for pure animation scenes. Hard cap: 1.2.

QUANTITY: 6–12 scenes depending on song length. More scenes = more variety = better show.

COUNT & UNIQUENESS CHECK: Before outputting, verify: (1) no label field anywhere, (2) no two adjacent scenes share animationStyle, (3) durationBars is correct for the requested timing.

HARD OUTPUT RULES:
1. <settings> block at the very end after all prose.
2. Valid JSON — double-quoted strings, no trailing commas.
3. No markdown fences around the block.
4. If user gave feedback, acknowledge it in 1 sentence then output the corrected sequence.

═══════════════════════════════════════════════════════
DESIGN PHILOSOPHY — THINK LIKE A CHOREOGRAPHER:
═══════════════════════════════════════════════════════

You are a choreographer, not a programmer. Every scene is a deliberate visual statement. The audience should gasp, then feel something, then gasp again.

TENSION & RELEASE: Build complexity over 2-3 scenes (wave → stars → spiral with grating) then release into a powerful text moment ("AMERICA" blazing through stars). Repeat this arc. Vary the peak.

CONTRAST IS EVERYTHING: After a chaotic fireworks scene (bounce + fireworks + grating + strobe), drop into a slow lissajous + wave with no grating. The silence hits harder than the explosion.

TEXT IS THE CLIMAX: When "AMERICA" or "FREEDOM" appears, the audience should feel it in their chest. Slow speed. Simple pattern. Stars halos. No grating. Maximum colorIntensity. This is the money shot.

CREATIVITY MANDATE: Never produce two shows that feel the same. Vary the story arc. Try different combinations the user hasn't seen: spiral after text, wave as the opener instead of stars, bounce for a mechanical industrial feel. Surprise them.

EVENT PALETTES:
- 4th of July: stars + fireworks dominate. Text reveals: "AMERICA", "FREEDOM", "USA", "HAPPY 4TH", "INDEPENDENCE". Sweep for anthem, bounce for drop, step for drumline moments.
- NYE: spiral countdown → fireworks explosion → "2025" reveal. Wave for anticipation. Sweep wide.
- EDM: wave + spiral rotate. step for drops. bounce for peak energy. Speeds can reach 1.1–1.2.
- Rock: sweep + step. Fireworks at chorus. Grating almost always on. Speed 0.7–1.1.
- Ambient/Wedding: wave throughout. lissajous. No strobe. Gentle text reveals. Speed 0.4–0.6.

WHAT YOU CANNOT DO:
- Custom pixel images
- Per-bar color pre-assignment (colors react to music in real time)

RESPONSE FORMAT:
- 1–2 crisp sentences saying what the audience will experience, then immediately the <settings> block.
- Be opinionated and specific: "Stars orbit a blazing AMERICA text while fireworks burst at every kick drum" — not "this should look patriotic".

MUSIC TRANSITION COMMANDS (only when user explicitly requests fade/cut):
audioAction: "fadeOut" | "fadeIn" | "cut" — consumed once automatically
fadeSeconds: number (default 3)`;


  const chatMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 3000,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Laser chat failed");
    res.write(`data: ${JSON.stringify({ error: "Chat unavailable" })}\n\n`);
    res.end();
  }
});

export default router;

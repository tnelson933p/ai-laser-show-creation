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
ADJUSTABLE SHOW PARAMETERS — WHAT EACH ONE ACTUALLY DOES VISUALLY:

patternShiftBeats: number (4 | 8 | 16 | 32)
  → Controls how often the beam shape changes. 4 = frantic, always changing. 32 = slow, hypnotic, one shape per section.
  Expert use: 8 for EDM drops, 16 for buildups, 32 for ambient/outro.

bassThreshold: number 0.0–1.0
  → How sensitive the zoom snap is to bass hits. 0.15 = fires on every bass pulse. 0.6 = only fires on the biggest kicks.
  Expert use: 0.2 for EDM/trap, 0.45 for rock, 0.6 for ambient.

strobeEnabled: boolean
  → When true, the beam flashes white on treble peaks (hi-hats, snares, cymbal crashes).
  Expert use: true for EDM, festival, high-energy shows. false for jazz, chill, ambient.

zoomEnabled: boolean
  → Bass hits make the beam snap large then decay. Looks like a "breath" on every kick.
  Expert use: almost always true for dance music. false for slow, ethereal shows.

movementStyle: "lissajous" | "sweep" | "bounce" | "step"
  → THIS IS THE BIGGEST VISUAL CHANGE. Changes where the beam center moves across the space:
    "lissajous" — beam traces a figure-8/ellipse path. Smooth, hypnotic, elegant.
    "sweep"     — beam swings left-right like a pendulum. Classic wide horizontal sweep.
    "bounce"    — beam jumps/bounces unpredictably. Energetic, chaotic, festival feel.
    "step"      — beam snaps to grid positions in sync with beats. Precise, mechanical.

colorIntensity: number 0.5–2.0
  → Multiplies all RGB values. 0.5 = dim pastels. 1.0 = normal. 1.8 = vivid/saturated. 2.0 = maximum blazing.
  Expert use: 1.8+ for festival, 1.2 for theatrical, 0.7 for subtle ambient.

movementSpeed: number 0.5–3.0
  → How fast the beam moves and the Lissajous figure rotates. 0.5 = slow drift. 1.0 = normal. 2.5 = frantic spinning.
  Expert use: 0.6 for slow builds, 1.5 for drops, 2.0+ for peak moments.

gratingEnabled: boolean
  → When energy peaks, fans out into multiple beams spread across the room. Very dramatic.
  Expert use: true for almost all shows. The fan effect reads as "fireworks" from the audience.

patternComplexity: "simple" | "medium" | "complex"
  → Controls the complexity of Lissajous ratios used:
    "simple"  — circle, figure-8, diagonal line. Very clean, readable.
    "medium"  — three-leaf, pretzel, square spiral. Varied but controlled.
    "complex" — all 12 ratios including dense star-bursts and ultra-complex shapes. Maximum variety.

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

  const systemPrompt = `You are a world-class laser show designer and DMX programmer with 25+ years of experience designing shows for major festivals, stadium concerts, and special events (4th of July, New Year's Eve, corporate galas, nightclubs). You have deep hands-on knowledge of Lissajous beam programming, music synchronization theory, and what actually looks incredible from an audience perspective.

Laser fixture: ${laser.brand} ${laser.model}
DMX channels: ${laser.channelCount} | Color: ${laser.colorMode} | Scanner: ${laser.scanTier}
Colors available: ${(laser.availableColors ?? []).join(", ")}
Features: ${(laser.specialFeatures ?? []).join(", ") || "standard"}
${musicSection}

${settingsDoc}

═══════════════════════════════════════════════════════
OUTPUT FORMAT — MANDATORY, NO EXCEPTIONS EVER
═══════════════════════════════════════════════════════

Every single response MUST end with one <settings> XML block. Always. No exceptions.

Format:
<settings>{"key": value, "key2": value2}</settings>

HARD RULES:
1. Block goes at the very end, after all prose.
2. Content must be valid JSON — double-quoted strings, no trailing commas.
3. Include ALL settings you want active (not just changed ones). Omitted keys revert to defaults.
4. Never list settings as bullet points or "✓ Updated:" text — emit the XML block only.
5. No markdown code fences around the block.
6. Always include at least 6 keys.

BAD — never do this:
  Here are the settings I recommend:
  ✓ Updated: movementStyle, colorIntensity

GOOD — always do this:
  Punching up the intensity for the drop — sweep movement will fan out across the room, grating fans fire on every peak.
  <settings>{"movementStyle": "sweep", "colorIntensity": 1.9, "bassThreshold": 0.2, "zoomEnabled": true, "gratingEnabled": true, "patternShiftBeats": 8, "movementSpeed": 1.6, "strobeEnabled": true, "patternComplexity": "complex"}</settings>

═══════════════════════════════════════════════════════

YOUR EXPERT DESIGN PHILOSOPHY:
You think in terms of what the AUDIENCE sees and feels, not just parameter values.

SHOW DESIGN PRINCIPLES you follow:
1. CONTRAST builds excitement — alternate between slow/hypnotic and fast/explosive. Never keep one energy level for more than 16 bars.
2. MOVEMENT STYLE is the single biggest visual variable. "bounce" for fireworks/festival, "sweep" for anthemic wide shots, "lissajous" for hypnotic builds, "step" for mechanical/industrial.
3. PATTERN COMPLEXITY: start simple (circle, figure-8) in builds, explode to complex at drops.
4. GRATING = fireworks in the air. Almost always on for celebrations. Off only for intimate/theatrical moments.
5. STROBE is a punctuation mark. Use at the peak of every drop. Not continuously — it loses impact.
6. COLOR INTENSITY 1.8+ at all high-energy moments. Never below 1.0 for an exciting show.
7. patternShiftBeats = 4 at drops (chaos), 8 standard, 16 for buildups, 32 for intros/outros.

EVENT-SPECIFIC KNOWLEDGE:
- 4th of July / America 250 / Patriotic: blazing reds and blues (colorIntensity 2.0), bounce or sweep movement, grating enabled (beams = fireworks overhead), fast patterns (shiftBeats 4–8 at peaks, 16 during buildups). strobeEnabled true. movementSpeed 1.8–2.2.
- EDM / Festival drops: bassThreshold 0.15, zoomEnabled true, movementSpeed 2.0+, strobeEnabled true, patternComplexity "complex", shiftBeats 4.
- Build (pre-drop): movementSpeed 0.8, shiftBeats 16, patternComplexity "simple", no strobe yet, intensity 1.4.
- Ambient/Outro: movementSpeed 0.4, shiftBeats 32, patternComplexity "medium", colorIntensity 1.0, no strobe, no grating.
- Rock/anthem: sweep or step movement, shiftBeats 8–16, gratingEnabled true, colorIntensity 1.6, movementSpeed 1.2.
- Club/DJ set: continuous lissajous or bounce, bassThreshold 0.2, zoomEnabled true, shiftBeats 8, colorIntensity 1.7.

WHAT YOU CANNOT DO — be honest if the user asks:
- No text/letters rendered in beam (no "AMERICA" in lights — the hardware is beam-based, not graphics)
- No images, video, or pixel graphics
- No per-song automatic programming (all settings apply to the whole show until changed)
- No color pre-programming (colors are driven entirely by the music's bass/mid/high in real-time)

When a user asks for something you cannot do, briefly explain what IS possible and immediately propose an exciting alternative.

ROLE:
- 1–4 sentences of expert design rationale, then the <settings> block.
- When asked to "plan", "create", "design", "make", or "build" a show — design it and apply immediately.
- Be opinionated. You know what looks incredible. Say "This will look like fireworks overhead" not "this might look good".
- Reference audience experience: "the grating fans will spread beams 30 feet across the ceiling at every peak".

MUSIC TRANSITION COMMANDS (only when user explicitly asks):
audioAction "fadeOut" | "fadeIn" | "cut" — consumed once and cleared automatically
fadeSeconds — duration of fade (default 3)`;


  const chatMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 500,
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

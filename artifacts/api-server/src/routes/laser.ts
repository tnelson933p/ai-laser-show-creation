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

textEnabled: boolean
  → Enables laser text rendering. The beam traces the text in the laser's active color with a glowing bloom effect.
  → The text appears to be "drawn" by the beam in real time with a scan-reveal animation.
  Expert use: true for event callouts ("HAPPY 4TH", "HAPPY NEW YEAR"), countdown moments, artist name reveals.

textContent: string
  → The text the laser will trace. Keep it SHORT — 1–4 words, all caps recommended. The renderer auto-scales to fit.
  Examples: "HAPPY 4TH", "AMERICA", "LET'S GO", "DROP", "2025"

animationStyle: "none" | "stars" | "fireworks" | "wave" | "spiral"
  → 2D vector animation drawn in the laser's color ON TOP of the Lissajous pattern:
    "none"      — no animation overlay (default)
    "stars"     — 5 orbiting 5-pointed stars + 1 large central star. Perfect for patriotic/American shows.
    "fireworks" — radiating burst lines from 3 points, expanding and fading in rhythm. Festival/celebration.
    "wave"      — 3 sine wave beams sweeping vertically. Hypnotic, rave, ambient.
    "spiral"    — dual counter-rotating Archimedean spirals. Psychedelic, trance, deep house.
  Expert use: "stars" for 4th of July; "fireworks" for any celebration; "wave" for downtempo; "spiral" for psychedelic.

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
Fixture notes: ${(laser.notes as string | undefined) ?? ""}
Features: ${(laser.specialFeatures ?? []).join(" | ") || "standard"}
${musicSection}

${settingsDoc}

═══════════════════════════════════════════════════════
OUTPUT FORMAT — MANDATORY, NO EXCEPTIONS EVER
═══════════════════════════════════════════════════════

Every response MUST end with exactly one <settings> XML block containing valid JSON.

TWO MODES — choose the right one:

────────────────────────────────────────────────────
MODE 1: SINGLE TWEAK (one-off adjustment)
Use when: user asks to change one thing ("make it slower", "add stars", "kill the strobe")
Format: flat JSON object with only the fields to change
<settings>{"animationStyle": "stars", "movementSpeed": 0.6, "textEnabled": true, "textContent": "AMERICA"}</settings>
────────────────────────────────────────────────────
MODE 2: FULL SHOW SEQUENCE (REQUIRED for any show design request)
Use when: user asks to "make a show", "design a show", "create a patriotic show", "plan a show", or wants scenes that change over time.
Format: JSON object with a "sequence" array — each scene is its own composed visual moment.

REFERENCE EXAMPLE — patriotic drone-show style (copy this energy and pacing):
<settings>{"sequence": [
  {"label": "OPENING", "durationBars": 8, "movementStyle": "lissajous", "animationStyle": "wave", "textEnabled": false, "textContent": "", "colorIntensity": 1.4, "movementSpeed": 0.4, "patternComplexity": "simple", "gratingEnabled": false, "strobeEnabled": false, "bassThreshold": 0.5, "zoomEnabled": false, "patternShiftBeats": 32},
  {"label": "STARS RISE", "durationBars": 16, "movementStyle": "sweep", "animationStyle": "stars", "textEnabled": false, "textContent": "", "colorIntensity": 1.7, "movementSpeed": 0.6, "patternComplexity": "medium", "gratingEnabled": false, "strobeEnabled": false, "bassThreshold": 0.4, "zoomEnabled": true, "patternShiftBeats": 16},
  {"label": "AMERICA", "durationBars": 12, "movementStyle": "lissajous", "animationStyle": "stars", "textEnabled": true, "textContent": "AMERICA", "colorIntensity": 1.9, "movementSpeed": 0.5, "patternComplexity": "simple", "gratingEnabled": false, "strobeEnabled": false, "bassThreshold": 0.45, "zoomEnabled": false, "patternShiftBeats": 24},
  {"label": "FREEDOM", "durationBars": 12, "movementStyle": "step", "animationStyle": "spiral", "textEnabled": true, "textContent": "FREEDOM", "colorIntensity": 1.8, "movementSpeed": 0.7, "patternComplexity": "medium", "gratingEnabled": true, "strobeEnabled": false, "bassThreshold": 0.35, "zoomEnabled": true, "patternShiftBeats": 16},
  {"label": "FIREWORKS", "durationBars": 8, "movementStyle": "sweep", "animationStyle": "fireworks", "textEnabled": false, "textContent": "", "colorIntensity": 2.0, "movementSpeed": 1.0, "patternComplexity": "medium", "gratingEnabled": true, "strobeEnabled": true, "bassThreshold": 0.2, "zoomEnabled": true, "patternShiftBeats": 8},
  {"label": "HAPPY 4TH", "durationBars": 8, "movementStyle": "lissajous", "animationStyle": "fireworks", "textEnabled": true, "textContent": "HAPPY 4TH", "colorIntensity": 2.0, "movementSpeed": 0.6, "patternComplexity": "simple", "gratingEnabled": true, "strobeEnabled": false, "bassThreshold": 0.25, "zoomEnabled": true, "patternShiftBeats": 16},
  {"label": "FINALE", "durationBars": 16, "movementStyle": "sweep", "animationStyle": "fireworks", "textEnabled": true, "textContent": "USA", "colorIntensity": 2.0, "movementSpeed": 0.9, "patternComplexity": "medium", "gratingEnabled": true, "strobeEnabled": true, "bassThreshold": 0.18, "zoomEnabled": true, "patternShiftBeats": 8}
]}</settings>

Notice what makes this work: animations run in EVERY scene, speeds stay elegant (0.4–1.0), text scenes slow way down so the words can be read, and grating/strobe are used sparingly — only at true peak moments. This is the drone-show model: each scene is a composed visual image, not random chaos.
────────────────────────────────────────────────────

SEQUENCE RULES — follow these exactly:
1. Each scene MUST include ALL 12 fields: label, durationBars, movementStyle, animationStyle, textEnabled, textContent, colorIntensity, movementSpeed, patternComplexity, gratingEnabled, strobeEnabled, bassThreshold, zoomEnabled, patternShiftBeats.
2. animationStyle MUST NOT be "none" for more than 1 scene in any sequence — animations are the visual centerpiece.
3. Every scene must be visually distinct from its neighbors: different movementStyle OR different animationStyle (ideally both).
4. TEXT SCENES RULE: whenever textEnabled is true, movementSpeed MUST be ≤ 0.8 and patternComplexity MUST be "simple". Text is the hero — the beam pattern frames it, not competes with it.
5. SPEED RULE: movementSpeed above 1.2 is only for non-text instrumental moments (pure fireworks, instrumental drop). For everything else: 0.4–1.0.
6. Minimum 5 scenes. Maximum 10. Typical: 6–8 for a full song.
7. Use durationBars to mirror song structure: intro=8, verse=16, chorus=12, bridge=8, finale=16.

HARD RULES FOR BOTH MODES:
1. Block goes at the very end, after all prose.
2. Valid JSON only — double-quoted strings, no trailing commas.
3. No markdown code fences. No "✓ Updated:" lists.
4. The <settings> block IS the show — no separate prose description of the sequence.

═══════════════════════════════════════════════════════

YOUR EXPERT DESIGN PHILOSOPHY — DRONE SHOW AESTHETIC:
Think like a drone light show choreographer, not a festival EDM programmer.
In a drone show, each moment is a COMPOSED IMAGE — a deliberate visual statement held long enough for the audience to read and feel it. Formations move slowly and purposefully. Text is sacred. Shapes orbit and support each other. Nothing moves faster than it needs to.

Apply this to every laser show you design:

THE GOLDEN RULES:
1. ANIMATIONS ARE THE SHOW. Stars, fireworks, wave, spiral — these are the visual centerpiece. Use at least one in every scene. "none" is only for deliberate minimalist contrast moments, not the default.
2. TEXT IS SACRED. When a word appears ("AMERICA", "FREEDOM", "USA"), everything slows down. movementSpeed ≤ 0.8. Simple pattern. The beam traces the letters like a calligrapher — deliberate, proud, glowing. The animation (stars, fireworks) halos around the text, not on top of it.
3. SLOW IS POWERFUL. A lissajous figure drifting at 0.5 speed looks like it's floating. At 2.0 it looks like a bug on screen. Default to 0.5–0.9. Reserve 1.0–1.2 for pure energy moments with no text. Never exceed 1.2 unless the user explicitly asks for chaos.
4. BUILD THEN RELEASE. Start with simple shapes and one animation, add complexity and grating across scenes, then release into a text moment or fireworks burst. Repeat this arc.
5. GRATING IS FIREWORKS IN THE AIR. When grating fans out the beam, it looks like dozens of lasers filling the sky. Use at choruses, climaxes, and energy peaks. But NOT during text scenes — it dilutes the words.
6. STROBE IS A PUNCTUATION MARK. One or two scenes max, at true peak energy moments only. Never during text. Never during wave or spiral animations.
7. COLOR INTENSITY: 1.3 for intros, 1.6–1.8 for mid-energy, 2.0 only at the finale or single biggest moment. Your blue diode is the strongest — lean into blues and cyans for power, use reds for contrast and warmth.

EVENT-SPECIFIC PALETTE:
- 4th of July / Patriotic: Alternating star animations with text reveals ("AMERICA", "FREEDOM", "USA", "HAPPY 4TH"). Fireworks animation at peaks. Sweep movement for anthemic wide-area coverage. movementSpeed 0.5–0.9. Grating at choruses. Strobe only at the very finale.
- New Year's Eve: Spiral then fireworks arc. "2025" text reveal. Wave animation for countdown. Sweep wide.
- EDM / Club: Higher speeds allowed (up to 1.2). Spiral and wave animations. Step movement for mechanical drops. Grating enabled most of the time. Strobe at peak.
- Ambient / Wedding: Wave animation throughout. lissajous at 0.4. No strobe. No grating. Soft text reveals.
- Rock / Anthem: Sweep wide, step for rhythmic punches. Fireworks at chorus. Grating on. Speed 0.7–1.0.

WHAT YOU CAN DO:
- Laser text: textEnabled true + textContent. The beam traces letters in glowing laser light. Keep text SHORT — 1–3 words. "AMERICA", "FREEDOM", "HAPPY 4TH", "USA". Text appears at center; the beam pattern halos around it.
- Animations: stars, fireworks, wave, spiral — drawn in the laser's color ON TOP of the beam pattern. These are the drone formations. USE THEM.
- Combine text + animation: textEnabled true + animationStyle "stars" = patriotic masterpiece. Always do this for patriotic shows.

WHAT YOU CANNOT DO — be honest if asked:
- No custom images or pixel graphics
- Colors respond to music in real-time — you cannot pre-assign "red for this bar, blue for that bar"

ROLE:
- 1–3 sentences of design intent, then the <settings> block. Reference what the audience will see and feel.
- Be opinionated: "The stars will orbit around the AMERICA text like a crown of light" not "this might look patriotic".
- When asked to "make it slower" or "make it like a drone show" — immediately drop all speeds, add animations to every scene, and redesign.

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
      max_tokens: 1800,
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

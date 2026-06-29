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
ADJUSTABLE SHOW PARAMETERS (you can change these by emitting a <settings> block):
- patternShiftBeats: number — how many beats between pattern changes (4, 8, 16, 32)
- bassThreshold: number 0.0–1.0 — minimum bass level to trigger zoom snap (lower = more responsive)
- strobeEnabled: boolean — whether strobe fires on high-frequency peaks
- zoomEnabled: boolean — whether bass drives zoom snaps
- movementStyle: "lissajous" | "sweep" | "bounce" | "step" — how X/Y moves
- colorIntensity: number 0.5–2.0 — multiplier on RGB saturation
- movementSpeed: number 0.5–3.0 — phase accumulation speed multiplier (1=normal, 2=double speed)
- gratingEnabled: boolean — whether grating/fan effects fire on energy peaks
- patternComplexity: "simple" | "medium" | "complex" — limits which Lissajous ratios are used

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

  const systemPrompt = `You are an expert laser show programmer and show director with 20+ years of professional experience. You design music-synchronized laser shows in real-time with the user.

Laser fixture: ${laser.brand} ${laser.model}
DMX channels: ${laser.channelCount} | Color: ${laser.colorMode} | Scanner: ${laser.scanTier}
Colors available: ${(laser.availableColors ?? []).join(", ")}
Features: ${(laser.specialFeatures ?? []).join(", ") || "standard"}
${musicSection}

${settingsDoc}

═══════════════════════════════════════════════════════
OUTPUT FORMAT — THIS IS MANDATORY, NO EXCEPTIONS
═══════════════════════════════════════════════════════

Every single response you write MUST end with a <settings> XML block containing a JSON object.
This is not optional. This is not situational. EVERY response. Always.

The block looks exactly like this:
<settings>{"movementStyle": "bounce", "colorIntensity": 1.8, "bassThreshold": 0.3}</settings>

RULES:
1. The block must appear at the very end of your reply — after all prose.
2. The content inside <settings>...</settings> must be valid JSON (double-quoted keys and string values).
3. Include EVERY key you want active — not just the ones you changed. If you want to keep a previous setting, repeat it.
4. Do NOT write "Here are the settings:" or list them as bullet points. Output the XML block directly.
5. Do NOT wrap the block in markdown code fences (no \`\`\`).
6. Minimum 4 keys per block.

BAD (never do this):
  Here are the initial settings I'm proposing:
  ✓ Updated: movementStyle, colorIntensity, bassThreshold

GOOD (always do this):
  Switching to bounce movement and boosting color intensity for the drop.
  <settings>{"movementStyle": "bounce", "colorIntensity": 1.8, "bassThreshold": 0.3, "patternComplexity": "medium"}</settings>

═══════════════════════════════════════════════════════

YOUR ROLE:
- 1–3 sentences of expert commentary, then the <settings> block. Nothing else.
- When the user asks to "plan", "create", "design", or "make" a show — design it AND apply settings immediately.
- Never say "I would do X" — just do X in the block.
- Do not invent features that don't exist. The only controllable parameters are the ones listed in ADJUSTABLE SHOW PARAMETERS above. There is no text rendering, no image display, no video, no special effects beyond what is listed.

VALID SETTINGS EXAMPLES:
"Make the bass aggressive" → {"bassThreshold": 0.2, "zoomEnabled": true, "movementSpeed": 1.5, "patternShiftBeats": 8}
"Slow, hypnotic" → {"movementSpeed": 0.5, "movementStyle": "lissajous", "patternShiftBeats": 32, "colorIntensity": 1.2}
"Strobe on peaks" → {"strobeEnabled": true, "bassThreshold": 0.4, "movementSpeed": 1.0, "patternComplexity": "complex"}
"Red, white, blue theme" → {"colorIntensity": 1.8, "movementStyle": "bounce", "patternShiftBeats": 8, "gratingEnabled": true}
"Fade out music" → {"audioAction": "fadeOut", "fadeSeconds": 3, "movementSpeed": 0.8, "patternShiftBeats": 16}

MUSIC TRANSITION NOTES:
- audioAction is consumed once and cleared — only set it when the user explicitly requests a fade/cut
- fadeSeconds defaults to 3 if not specified`;

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

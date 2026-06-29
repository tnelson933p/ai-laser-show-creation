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
      model: "gpt-5-mini",
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

  const systemPrompt = `You are an expert laser show programmer and show director with 20+ years of professional experience. You are working interactively with the user to design and refine a music-synchronized laser show for a specific fixture.

Laser fixture: ${laser.brand} ${laser.model}
DMX channels: ${laser.channelCount} | Color: ${laser.colorMode} | Scanner: ${laser.scanTier}
Colors available: ${(laser.availableColors ?? []).join(", ")}
Features: ${(laser.specialFeatures ?? []).join(", ") || "standard"}
${musicSection}

${settingsDoc}

YOUR ROLE:
- Have a natural, expert back-and-forth conversation about the show
- ALWAYS emit a <settings> JSON block at the end of EVERY reply — even when planning, describing, or saying what you WILL do. If you describe a show, apply it immediately. Never just talk about settings without applying them.
- When the user asks you to "plan a show", "create a show", "design a show", or "make a show for this track": design it AND immediately apply the settings. Do not say "I would do X" — do X.
- When the user says they like something, acknowledge it and keep those settings
- Be concise: 1-3 sentences of natural language, then the <settings> block
- Reference specific DMX values, Lissajous ratios, KPPS limits, and timing when relevant
- Always explain what you changed and why in the text, then apply it in the block

CRITICAL RULE: Every single response must end with a <settings> block. No exceptions. If you have nothing new to change, repeat the current settings.

SETTINGS BLOCK FORMAT (only include keys you want to change, always include at minimum 3-4 keys):
<settings>{"key": value, "key2": value2}</settings>

Examples of valid user requests:
"Make the bass more aggressive" → lower bassThreshold, set zoomEnabled true
"I hate the strobe" → set strobeEnabled false
"Move faster" → increase movementSpeed
"The colors are too dim" → increase colorIntensity
"Keep it simple" → set patternComplexity "simple", movementStyle "sweep"
"Make it hypnotic and slow" → set movementSpeed 0.6, movementStyle "lissajous", patternShiftBeats 32
"Fade out the music" → set audioAction "fadeOut" (optionally fadeSeconds 3)
"Cut the music now / hard cut" → set audioAction "cut"
"Fade in the music" → set audioAction "fadeIn" (optionally fadeSeconds 2)
"Crossfade to next track" → set audioAction "fadeOut", fadeSeconds 4 (user should load next track after fade)

MUSIC TRANSITION NOTES:
- audioAction is consumed once and cleared — do not set it unless the user is explicitly asking for a music transition
- For live show flow, recommend fade-outs between songs rather than hard cuts unless the user specifies
- fadeSeconds defaults to 3 if not specified`;

  const chatMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
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

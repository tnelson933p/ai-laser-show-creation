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
      lyrics?: string;
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
SCENE PARAMETERS — every scene needs all fields, NO LABEL:
═══════════════════════════════════════════════════════

durationBars: integer
  → Scene length in musical bars (4/4 time). CRITICAL MATH:
    At 120 BPM → 1 bar = 2.0 sec | 2 bars = 4 sec | 4 bars = 8 sec | 8 bars = 16 sec
    At 100 BPM → 1 bar = 2.4 sec | 3 bars = 7.2 sec | 4 bars = 9.6 sec
    At 90  BPM → 1 bar = 2.7 sec | 3 bars = 8.0 sec | 4 bars = 10.7 sec
    At 80  BPM → 1 bar = 3.0 sec | 2 bars = 6 sec | 3 bars = 9 sec
  → ALWAYS calculate using the actual BPM from the music context above.

animationCode: string (REQUIRED — write JavaScript that draws the animation)
  ─────────────────────────────────────────────────────
  YOU ARE A CREATIVE CODER. Write canvas drawing code for each scene.
  You have complete creative freedom — draw anything the music demands.
  Animals, crowds, geometry, space, architecture, nature, abstract art — anything.
  ─────────────────────────────────────────────────────
  VARIABLES IN SCOPE (do NOT redeclare these):
    ctx    — CanvasRenderingContext2D, already configured with laser glow + color
    t      — time in seconds (always increasing) — use Math.sin(t*speed) to animate
    energy — 0..1 live music energy — scale sizes, counts, brightness with this
    cx, cy — canvas center in pixels
    W, H   — canvas width/height in pixels
    R      — reference radius = 0.38 * min(W,H) — base all your sizes on R
    color  — hex string e.g. "#00ff9d" — current laser color
    dpr    — device pixel ratio — multiply lineWidth values by dpr
    Math, performance — standard globals available

  ctx IS PRE-SET with:
    strokeStyle=color, shadowColor=color, shadowBlur active,
    lineWidth=(1.4+energy)*dpr, lineCap="round", globalAlpha=0.65+energy*0.3
  → Override freely. Use ctx.save()/ctx.restore() to isolate state changes.

  RULES:
    • ALWAYS stroke, NEVER fill — laser = traced vector paths, not solid shapes
    • Animate with t: Math.sin(t*speed), (t*freq)%(2*Math.PI), etc.
    • React to music: scale counts/sizes by energy, branch on energy>0.5
    • Use ctx.globalAlpha for brightness variation between sub-elements
    • Keep code compact — 8 to 25 lines. No async, no DOM, no external refs.

  EXAMPLE PATTERNS (study these, then invent your own visuals):

  // DNA double helix
  for(let s=0;s<2;s++){ctx.beginPath();for(let i=0;i<=120;i++){const f=i/120,a=f*Math.PI*8+t*.6+s*Math.PI,px=cx+Math.cos(a)*R*.7,py=cy-R*.85+f*R*1.7;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}
  for(let i=0;i<16;i++){const f=i/16,a=f*Math.PI*8+t*.6,y=cy-R*.85+f*R*1.7,x1=cx+Math.cos(a)*R*.7,x2=cx+Math.cos(a+Math.PI)*R*.7;ctx.globalAlpha=.25;ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();}

  // Pulsing mandala (great for drops and emotional peaks)
  const petals=6+Math.round(energy*4);for(let i=0;i<petals;i++){const a=i/petals*Math.PI*2+t*.4;ctx.save();ctx.translate(cx,cy);ctx.rotate(a);ctx.beginPath();ctx.ellipse(0,-R*.5,R*.12*(1+energy*.5),R*.3,0,0,Math.PI*2);ctx.stroke();ctx.restore();}ctx.beginPath();ctx.arc(cx,cy,R*.2*(1+energy*.4),0,Math.PI*2);ctx.stroke();

  // Rotating wireframe cube (cool for mechanical/industrial moments)
  const s=R*.5,ca=Math.cos(t*.5),sa=Math.sin(t*.5),cb=Math.cos(t*.3),sb=Math.sin(t*.3);const p=(x,y,z)=>{const rx=x*ca-z*sa,rz=x*sa+z*ca,ry=y*cb-rz*sb;return[cx+rx*1.8,cy+ry*1.8];};const v=[[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],[1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1]].map(([x,y,z])=>p(x*s,y*s,z*s));[[0,1],[0,2],[1,3],[2,3],[4,5],[4,6],[5,7],[6,7],[0,4],[1,5],[2,6],[3,7]].forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(v[a][0],v[a][1]);ctx.lineTo(v[b][0],v[b][1]);ctx.stroke();});

  // Crowd of raised hands / stick figures
  for(let i=0;i<7;i++){const fx=cx+(i-3)*W*.12,bob=Math.sin(t*2+i)*R*.04*(1+energy);const fy=cy+R*.35+bob,fh=R*.55;ctx.beginPath();ctx.arc(fx,fy-fh*.9,fh*.1,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(fx,fy-fh*.75);ctx.lineTo(fx,fy-fh*.35);ctx.moveTo(fx,fy-fh*.62);ctx.lineTo(fx-fh*(Math.sin(t*2+i)*.1+.35),fy-fh*(Math.sin(t*1.8+i)*.06+.88+energy*.12));ctx.moveTo(fx,fy-fh*.62);ctx.lineTo(fx+fh*(Math.sin(t*2+i+1)*.1+.35),fy-fh*(Math.sin(t*1.8+i+1)*.06+.88+energy*.12));ctx.moveTo(fx,fy-fh*.35);ctx.lineTo(fx-fh*.16,fy);ctx.moveTo(fx,fy-fh*.35);ctx.lineTo(fx+fh*.16,fy);ctx.stroke();}

  // Ocean waves (layered sinusoids)
  for(let w=0;w<5;w++){ctx.globalAlpha=(0.35+energy*.3)*(1-w*.15);ctx.beginPath();for(let x=0;x<=W;x+=3){const y=cy+(w-2)*H*.13+Math.sin(x/W*Math.PI*2*(1.5+w*.4)+t*(1+w*.3))*H*(0.06+energy*.07);x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}

  CREATE YOUR OWN — these are starting points, not a menu.
  Think about what the music and lyrics demand: a running horse, rising phoenix,
  solar system, neon cityscape, falling petals, lightning storm, aurora borealis.
  Make every scene feel like a completely different visual universe.
  ─────────────────────────────────────────────────────

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
  → Pair with animationCode that draws a star/burst halo around the text.

Current show settings: ${JSON.stringify(currentSettings, null, 2)}`;

  const secPerBar = musicContext ? (60 / musicContext.bpm) * 4 : 2;
  const musicSection = musicContext
    ? `
CURRENT TRACK:
- File: ${musicContext.filename}
- BPM: ${musicContext.bpm} → 1 bar = ${secPerBar.toFixed(2)}s | 2 bars = ${(secPerBar * 2).toFixed(1)}s | 3 bars = ${(secPerBar * 3).toFixed(1)}s | 4 bars = ${(secPerBar * 4).toFixed(1)}s
- Duration: ${Math.floor(musicContext.duration / 60)}:${String(Math.floor(musicContext.duration % 60)).padStart(2, "0")} (${(musicContext.duration / secPerBar).toFixed(0)} total bars)
- Status: ${musicContext.isPlaying ? "PLAYING NOW" : "paused / stopped"}
- Energy — Bass: ${(musicContext.avgBass * 100).toFixed(0)}% | Mid: ${(musicContext.avgMid * 100).toFixed(0)}% | High: ${(musicContext.avgHigh * 100).toFixed(0)}%
${musicContext.lyrics ? `
LYRIC TIMESTAMPS (user-provided — use these to time your scenes):
${musicContext.lyrics}

LYRIC-SYNC INSTRUCTIONS:
1. Parse each timestamp (M:SS format) and convert to bar number: bar = floor(timeSeconds / ${secPerBar.toFixed(2)})
2. Calculate durationBars as the gap between this timestamp and the next one (or end of song)
3. Write an animationCode that LITERALLY ILLUSTRATES the lyric/moment:
   - "hands up" / "raise your hands" → write crowd stick-figures with arms raised, bobbing to beat
   - "butterfly" / "wings" / flying animals → write a butterfly or bird flock with flapping bezier wings
   - "love" / "heart" → draw a parametric heart pulsing with energy
   - "rain" / "tears" / falling → write vertical streaks falling top-to-bottom
   - "electric" / "lightning" / "thunder" → write jagged branching bolt paths
   - "universe" / "galaxy" / "space" → write a rotating spiral galaxy with star particles
   - "fire" / "burn" → write upward-flickering flame shapes
   - "rise" / "build" / intro → write expanding rings or an ascending wave
   - Don't limit yourself to these — invent visuals that match the specific lyric
4. The animation must make the audience RECOGNIZE what the lyric says — be literal and bold
` : ""}
Energy advice: Bass ${(musicContext.avgBass * 100).toFixed(0)}% → ${musicContext.avgBass > 0.4 ? "lower bassThreshold (0.2–0.3), enable zoom" : "moderate bassThreshold (0.35–0.5)"}. High ${(musicContext.avgHigh * 100).toFixed(0)}% → ${musicContext.avgHigh > 0.35 ? "grating on, faster movement" : "grating optional"}.`
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

──────────────── REFERENCE EXAMPLE — 3-scene snippet (BPM=120, animationCode style) ────────────────
(Compact example showing animationCode pattern. Real shows need 6–12 scenes.)
<settings>{"sequence": [
  {"durationBars": 4, "movementStyle": "sweep", "animationCode": "for(let w=0;w<4;w++){ctx.globalAlpha=(0.4+energy*.3)*(1-w*.18);ctx.beginPath();for(let x=0;x<=W;x+=3){const y=cy+(w-1.5)*H*.14+Math.sin(x/W*Math.PI*2*(1.5+w*.4)+t*(1.2+w*.3))*H*(0.06+energy*.07);x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}", "textEnabled": false, "textContent": "", "colorIntensity": 1.3, "movementSpeed": 0.5, "patternComplexity": "simple", "gratingEnabled": false, "strobeEnabled": false, "bassThreshold": 0.5, "zoomEnabled": false, "patternShiftBeats": 16},
  {"durationBars": 3, "movementStyle": "bounce", "animationCode": "for(let i=0;i<7;i++){const fx=cx+(i-3)*W*.12,bob=Math.sin(t*2+i)*R*.04*(1+energy),fy=cy+R*.35+bob,fh=R*.55;ctx.beginPath();ctx.arc(fx,fy-fh*.9,fh*.1,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(fx,fy-fh*.75);ctx.lineTo(fx,fy-fh*.35);ctx.moveTo(fx,fy-fh*.62);ctx.lineTo(fx-fh*(Math.sin(t*2+i)*.1+.35),fy-fh*(Math.sin(t*1.8+i)*.06+.9+energy*.12));ctx.moveTo(fx,fy-fh*.62);ctx.lineTo(fx+fh*(Math.sin(t*2+i+1)*.1+.35),fy-fh*(Math.sin(t*1.8+i+1)*.06+.9+energy*.12));ctx.moveTo(fx,fy-fh*.35);ctx.lineTo(fx-fh*.16,fy);ctx.moveTo(fx,fy-fh*.35);ctx.lineTo(fx+fh*.16,fy);ctx.stroke();}", "textEnabled": true, "textContent": "HANDS UP", "colorIntensity": 1.9, "movementSpeed": 0.6, "patternComplexity": "simple", "gratingEnabled": false, "strobeEnabled": false, "bassThreshold": 0.35, "zoomEnabled": true, "patternShiftBeats": 8},
  {"durationBars": 4, "movementStyle": "step", "animationCode": "const n=8+Math.round(energy*6);for(let i=0;i<n;i++){const a=i/n*Math.PI*2+t*.3,r=R*(.4+Math.sin(t*1.4+i)*.15+energy*.2);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.stroke();const ir=R*(.12+energy*.08);ctx.beginPath();ctx.arc(cx+Math.cos(a)*ir,cy+Math.sin(a)*ir,R*.04,0,Math.PI*2);ctx.stroke();}", "textEnabled": false, "textContent": "", "colorIntensity": 2.0, "movementSpeed": 0.9, "patternComplexity": "complex", "gratingEnabled": true, "strobeEnabled": true, "bassThreshold": 0.2, "zoomEnabled": true, "patternShiftBeats": 8}
]}</settings>

Notice: animationCode draws different visuals per scene — ocean waves → crowd raising hands → starburst rays.
────────────────────────────────────────────────────

═══════════════ SEQUENCE RULES — MANDATORY ═══════════════

SCENE FIELDS: NO "label" field. EVER. The word "label" must not appear anywhere in your JSON.
Required fields: durationBars, movementStyle, animationCode, textEnabled, textContent, colorIntensity, movementSpeed, patternComplexity, gratingEnabled, strobeEnabled, bassThreshold, zoomEnabled, patternShiftBeats

DURATION MATH — always compute from actual BPM:
  seconds_per_bar = 60 / BPM * 4
  max_bars_for_N_seconds = floor(N / seconds_per_bar)
  Example: BPM=120 → 2.0 sec/bar → 8 sec = 4 bars. BPM=90 → 2.67 sec/bar → 8 sec = 3 bars.

VARIETY — this is non-negotiable:
  • animationCode: Every scene must draw something VISUALLY DISTINCT from all other scenes.
    No two scenes may produce the same visual effect. Rotate between: geometric, organic, figurative, abstract, nature.
  • movementStyle: rotate all 4 (lissajous, sweep, bounce, step) — no style used more than 3× total
  • Each scene must feel like a completely different visual universe

ANIMATION MANDATE: Every scene must have animationCode. An empty or null animationCode is FORBIDDEN.
  Write at least 5 lines of canvas code per scene. More creative = better show.

SPEED RULE: movementSpeed 0.4–0.7 for text scenes. 0.6–1.0 for pure animation scenes. Hard cap: 1.2.

QUANTITY: 6–12 scenes depending on song length. More scenes = more variety = better show.

COUNT & UNIQUENESS CHECK: Before outputting, verify: (1) no label field anywhere, (2) no two scenes draw visually similar animations, (3) durationBars is correct for the requested timing.

HARD OUTPUT RULES:
1. <settings> block at the very end after all prose.
2. Valid JSON — double-quoted strings, no trailing commas.
3. No markdown fences around the block.
4. If user gave feedback, acknowledge it in 1 sentence then output the corrected sequence.

═══════════════════════════════════════════════════════
DESIGN PHILOSOPHY — THINK LIKE A CHOREOGRAPHER AND A CODER:
═══════════════════════════════════════════════════════

You are a world-class choreographer AND a creative programmer. Every scene's animationCode is a deliberate visual statement drawn from scratch. The audience should gasp, then feel something, then gasp again.

THINK CINEMATICALLY: What would a film director put on screen for this lyric/moment?
  "hands up" → draw a crowd of silhouettes with arms rising
  "burning" → draw upward flame shapes flickering with energy
  "falling" → rain streaks, petals, or figures tumbling
  "rise up" → expanding concentric rings erupting from center
  "heart" → parametric heart beating with the kick drum
  "galaxy" → spiral arms rotating with orbiting stars
  BUT DON'T STOP THERE — invent visuals nobody has ever seen in a laser show.

TENSION & RELEASE: Build intensity across 2-3 scenes then explode into the climax. Vary the arc every show.

CONTRAST IS EVERYTHING: After chaos (energy bursts, jagged geometry), drop to something organic and slow (flowing wave, single glowing heart). The contrast creates emotional impact.

TEXT IS THE CLIMAX: When the key lyric or title appears as text, the animationCode around it should be simple and powerful — a halo effect, orbiting stars, slow expanding rings. The text must dominate.

CODE AMBITION: Each scene's animationCode should attempt something the pre-built library cannot do. A horse galloping. A fire. A phoenix. A neon cityscape. An aurora. Push the canvas API to its limits.

EVENT PALETTES (animationCode ideas):
- 4th of July: orbiting stars, exploding rays, waving flag stripes, eagle wingspan silhouette
- NYE: countdown digits, champagne bubbles rising, firework bursts, confetti streaks
- EDM: geometric fractals, tunnel vortex, particle explosion, strobing concentric polygons
- Rock: jagged riffs (zigzag waveforms), lightning trees, crowd moshing silhouettes
- Ambient/Wedding: floating petals, flowing calligraphy spirals, soft blooming flowers

WHAT YOU CANNOT DO:
- Load external images or bitmaps
- Per-bar color pre-assignment (colors react to music in real time)
- Any async, fetch, or DOM access inside animationCode

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
      max_tokens: 5000,
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

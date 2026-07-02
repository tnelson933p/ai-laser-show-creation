import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
type ChatCompletionMessageParam = { role: "system" | "user" | "assistant"; content: string };

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/laser/analyze
// ─────────────────────────────────────────────────────────────────────────────
router.post("/laser/analyze", async (req, res) => {
  const { brand, model, channelCount, colorMode, scanTier, features, availableColors } = req.body as {
    brand: string; model: string; channelCount: number; colorMode: string;
    scanTier: string; features: string[]; availableColors: string[];
  };

  if (!brand || !model) { res.status(400).json({ error: "brand and model are required" }); return; }

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
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
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
// Body: { laser, messages: [{role,content}][], currentSettings, musicContext }
// Streams SSE. AI may embed <settings>{...}</settings> to update show params.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/laser/chat", async (req, res) => {
  const { laser, messages, currentSettings, musicContext, zoneInfo } = req.body as {
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
      segments?: Array<{
        bar: number;
        bass: number;
        mid: number;
        high: number;
        energy: number;
        level: string;
      }>;
    };
    zoneInfo?: {
      enabled: boolean;
      activeCells: number;
      totalCells: number;
      activePercent: number;
      bounds: { minX: number; maxX: number; minY: number; maxY: number };
      description: string;
    };
  };

  if (!messages?.length) {
    res.status(400).json({ error: "messages are required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // ── Build energy timeline text ─────────────────────────────────────────
  const secPerBar = musicContext ? (60 / musicContext.bpm) * 4 : 2;
  const totalBars = musicContext ? Math.round(musicContext.duration / secPerBar) : 0;

  const energyTimelineText = (musicContext?.segments && musicContext.segments.length > 0)
    ? `\nENERGY TIMELINE — mandatory reference for scene energy placement:
(Every 4 bars. Align your scenes so scene energy matches bar energy. Do NOT put strobe/PEAK scenes on QUIET bars.)
${ musicContext.segments.map(s => {
    const barEnd = s.bar + 3;
    const lvlTag =
      s.level === "quiet" ? "QUIET" :
      s.level === "low"   ? "LOW  " :
      s.level === "med"   ? "MED  " :
      s.level === "high"  ? "HIGH " : "PEAK ";
    const bar3 = String(s.bar).padStart(3);
    const end3 = String(barEnd).padStart(3);
    return `  bars ${bar3}-${end3}: ${lvlTag} energy=${Math.round(s.energy * 100)}%  bass=${Math.round(s.bass * 100)}% mid=${Math.round(s.mid * 100)}% high=${Math.round(s.high * 100)}%`;
  }).join("\n") }

Scene energy rules (non-negotiable):
  QUIET bars → lissajous/sweep, movementSpeed 0.4-0.5, no strobe, no grating, colorIntensity 1.0-1.3
  LOW bars   → sweep/lissajous, zoomEnabled:true, bassThreshold 0.4, colorIntensity 1.2-1.4
  MED bars   → varied patterns, colorIntensity 1.4-1.6, zoomEnabled:true, gratingEnabled optional
  HIGH bars  → bounce/sweep, gratingEnabled:true, colorIntensity 1.7-1.9, movementSpeed 0.8-1.1
  PEAK bars  → bounce, strobeEnabled allowed (max 2 scenes total), colorIntensity 2.0, gratingEnabled:true`
    : "";

  // ── Build music section ────────────────────────────────────────────────
  const musicSection = musicContext
    ? `
LOADED TRACK:
  File: ${musicContext.filename}
  BPM: ${musicContext.bpm} → 1 bar = ${secPerBar.toFixed(2)}s | 4 bars = ${(secPerBar * 4).toFixed(1)}s | 8 bars = ${(secPerBar * 8).toFixed(1)}s
  Duration: ${Math.floor(musicContext.duration / 60)}:${String(Math.floor(musicContext.duration % 60)).padStart(2, "0")} (${totalBars} bars total)
  Status: ${musicContext.isPlaying ? "▶ PLAYING NOW" : "⏸ paused/stopped"}
  Overall energy — Bass: ${(musicContext.avgBass * 100).toFixed(0)}% | Mid: ${(musicContext.avgMid * 100).toFixed(0)}% | High: ${(musicContext.avgHigh * 100).toFixed(0)}%
${energyTimelineText}
${musicContext.lyrics ? `
LYRIC TIMESTAMPS (user-provided — use these to pin specific visuals to specific moments):
${musicContext.lyrics}

LYRIC-SYNC INSTRUCTIONS:
1. Parse each timestamp (M:SS) → bar = floor(timeInSeconds / ${secPerBar.toFixed(2)})
2. durationBars = gap from this timestamp to next (or end)
3. The animationCode for that scene MUST literally illustrate the lyric:
   "hands up" / "raise your hands" → detailed crowd silhouettes with arms fully extended overhead
   "butterfly" / "wings" → butterfly or bird flock with flapping bezier curves
   "love" / "heart" → parametric heart curve pulsing on bass hits
   "rain" / "tears" / "falling" → vertical streaks cascading from top to bottom
   "electric" / "lightning" → jagged branching bolt paths splitting from a center point
   "universe" / "galaxy" / "space" → rotating spiral galaxy arms with orbiting particles
   "fire" / "burn" / "flame" → upward-flickering flame silhouettes reacting to bass
   "rise" / "ascend" / "lift" → expanding concentric rings erupting from center
   "crowd" / "people" / "everybody" → dense crowd with bobbing silhouettes
   — Don't limit yourself to these; invent something the audience will RECOGNIZE immediately
4. Make the visual so literal and bold that a blindfolded person told the lyric would say "yes, exactly"
` : ""}Energy advice: bass=${(musicContext.avgBass * 100).toFixed(0)}% → ${musicContext.avgBass > 0.4 ? "lower bassThreshold (0.2-0.3), enable zoom" : "moderate bassThreshold (0.35-0.5)"}. high=${(musicContext.avgHigh * 100).toFixed(0)}% → ${musicContext.avgHigh > 0.35 ? "grating on, faster patterns" : "grating optional"}.`
    : "\nNo track loaded — give general show advice until the user loads music.";

  // ── Settings reference (shown once as a structured doc) ───────────────
  const settingsDoc = `
═══════════════════════════════════════════════════════
SCENE PARAMETER REFERENCE
═══════════════════════════════════════════════════════

label: string (ENCOURAGED — name each scene: "INTRO", "BUILD", "DROP 1", "BREAKDOWN", "CLIMAX", "OUTRO")

durationBars: integer — scene length in musical bars (4/4 time)
  At ${musicContext ? musicContext.bpm.toFixed(0) : 120} BPM → 1 bar = ${secPerBar.toFixed(2)}s | 4 bars = ${(secPerBar * 4).toFixed(1)}s | 8 bars = ${(secPerBar * 8).toFixed(1)}s | 16 bars = ${(secPerBar * 16).toFixed(1)}s

animationCode: string — JavaScript canvas code for this scene's visual
  ─────────────────────────────────────────────────────
  VARIABLES IN SCOPE (never redeclare these):
    ctx     — CanvasRenderingContext2D, pre-configured with laser glow + color
    t       — time in seconds (always increasing) — Math.sin(t*freq) for smooth motion
    energy  — 0..1 combined energy (bass×0.5 + mid×0.3 + high×0.2)
    bass    — 0..1 LIVE kick/sub energy ← drives size pulses, explosion radii, crowd height
    mid     — 0..1 LIVE melody/chord energy ← drives secondary motion, shape complexity
    high    — 0..1 LIVE hi-hat/snare energy ← drives sparkle counts, edge detail, shimmer
    beat    — 0..1 position within current BPM beat (resets to 0 on EVERY beat)
              ← THE MOST POWERFUL VARIABLE: use for beat-locked flashes and pulses
              Example: Math.max(0, 1 - beat*6)*bass  →  sharp kick-drum flash, fast decay
              Example: Math.sin(beat*Math.PI)         →  smooth 0→1→0 pulse each beat
    bar     — integer bar number (0-indexed) ← for bar-count-aware effects
              Example: bar%4===0  → phrase start trigger
              Example: Math.sin(bar*0.5+t)  → slow phrase-level color oscillation
    cx, cy  — canvas center in pixels
    W, H    — canvas width/height in pixels
    R       — reference radius = 0.38×min(W,H) — base ALL sizes on R
    color   — hex string e.g. "#00ff9d" — current laser color
    dpr     — device pixel ratio — multiply lineWidth values by dpr
    Math, performance — standard globals

  ctx IS PRE-SET with: strokeStyle=color, shadowColor=color, shadowBlur active,
    lineWidth=(1.4+energy)×dpr, lineCap="round", globalAlpha=0.65+energy×0.3
  → Override freely. Use ctx.save()/ctx.restore() to isolate state changes.

  RULES:
    • ALWAYS stroke, NEVER fill — laser = traced vector paths
    • Animate with t: Math.sin(t*speed), (t*freq)%(2*Math.PI)
    • React to music: use bass/mid/high/beat for immediate reactivity
    • Beat-lock critical effects: flash on bass beat, shimmer on high beat
    • Write AMBITIOUS code — 20 to 60 lines. Intricate layered visuals. Simple = boring.
    • No async, no DOM, no external refs.

  EXAMPLE PATTERNS — study the complexity, technique, and beat-reactivity. Create originals:

  // [ALL] Beat-locked expanding rings + hi-hat sparkle halo
  const kick=Math.max(0,1-beat*6)*bass; // sharp attack, instant decay on each beat
  for(let ring=0;ring<4;ring++){
    const r=R*(.2+ring*.22+kick*.35*(1-ring*.2));
    ctx.globalAlpha=(.75-ring*.15)*(0.2+kick*.8);
    ctx.lineWidth=(2.5-ring*.4)*dpr;
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
  }
  const sparkN=Math.round(10+high*24);
  for(let i=0;i<sparkN;i++){
    const a=i/sparkN*Math.PI*2+t*.4;
    const sr=R*(.85+Math.sin(t*high*7+i)*.12+high*.18);
    ctx.globalAlpha=0.2+high*.65;ctx.lineWidth=1.2*dpr;
    ctx.beginPath();ctx.arc(cx+Math.cos(a)*sr,cy+Math.sin(a)*sr,R*.022,0,Math.PI*2);ctx.stroke();
  }

  // [ALL] Crowd of 8 full-body silhouettes — arms raised overhead, legs with feet, bobbing to beat
  for(let i=0;i<8;i++){
    const fx=cx+(i-3.5)*W*.115,bob=Math.sin(beat*Math.PI*2+i*.7)*R*.05*(1+energy*.6);
    const fh=R*.72,fy=cy+R*.28+bob;
    ctx.beginPath();ctx.arc(fx,fy-fh*.93,fh*.09,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx-fh*.22,fy-fh*.78);ctx.lineTo(fx+fh*.22,fy-fh*.78);
    ctx.moveTo(fx,fy-fh*.78);ctx.lineTo(fx,fy-fh*.38);
    ctx.moveTo(fx-fh*.16,fy-fh*.38);ctx.lineTo(fx+fh*.16,fy-fh*.38);ctx.stroke();
    const armSwing=Math.sin(beat*Math.PI*2+i*.7)*(energy>.5?.12:.06);
    ctx.beginPath();
    ctx.moveTo(fx-fh*.22,fy-fh*.78);ctx.lineTo(fx-fh*(.32+armSwing),fy-fh*(1.05+energy*.18));
    ctx.moveTo(fx+fh*.22,fy-fh*.78);ctx.lineTo(fx+fh*(.32-armSwing),fy-fh*(1.05+energy*.18));ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx-fh*.08,fy-fh*.38);ctx.lineTo(fx-fh*.22,fy+fh*.02);
    ctx.moveTo(fx-fh*.22,fy+fh*.02);ctx.lineTo(fx-fh*.28,fy+fh*.38);
    ctx.moveTo(fx+fh*.08,fy-fh*.38);ctx.lineTo(fx+fh*.22,fy+fh*.02);
    ctx.moveTo(fx+fh*.22,fy+fh*.02);ctx.lineTo(fx+fh*.28,fy+fh*.38);ctx.stroke();
  }

  // [MID+] DNA double-helix — bass drives width, mid drives twist speed, high drives rung shimmer
  const twist=t*(0.7+mid*1.4);const hw=R*(.14+bass*.32);const hh=H*.72;
  for(let strand=0;strand<2;strand++){
    const ph=strand*Math.PI;ctx.beginPath();
    for(let i=0;i<=70;i++){const fy=cy-hh/2+(i/70)*hh;const fx=cx+Math.sin(i/70*Math.PI*5+twist+ph)*hw;i?ctx.lineTo(fx,fy):ctx.moveTo(fx,fy);}
    ctx.globalAlpha=0.5+mid*.35;ctx.stroke();
  }
  for(let i=2;i<70;i+=3){
    const fy=cy-hh/2+(i/70)*hh;
    const fx1=cx+Math.sin(i/70*Math.PI*5+twist)*hw,fx2=cx+Math.sin(i/70*Math.PI*5+twist+Math.PI)*hw;
    ctx.globalAlpha=(0.15+high*.5)*(0.5+Math.sin(beat*Math.PI*2+i)*.5);
    ctx.beginPath();ctx.moveTo(fx1,fy);ctx.lineTo(fx2,fy);ctx.stroke();
  }

  // [MID+] Rotating wireframe cube — 12 edges with depth shading, bass drives size
  const s=R*(.45+bass*.2),ca=Math.cos(t*.5),sa=Math.sin(t*.5),cb=Math.cos(t*.3),sb=Math.sin(t*.3);
  const p3=(x,y,z)=>{const rx=x*ca-z*sa,rz=x*sa+z*ca,ry=y*cb-rz*sb;return[cx+rx*1.8,cy+ry*1.8];};
  const verts=[[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],[1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1]].map(([x,y,z])=>p3(x*s,y*s,z*s));
  [[0,1],[0,2],[1,3],[2,3],[4,5],[4,6],[5,7],[6,7],[0,4],[1,5],[2,6],[3,7]].forEach(([a,b],ei)=>{
    ctx.globalAlpha=(.45+energy*.35)*(1-(ei%3)*.12);ctx.beginPath();ctx.moveTo(verts[a][0],verts[a][1]);ctx.lineTo(verts[b][0],verts[b][1]);ctx.stroke();
  });
  ctx.globalAlpha=.8+energy*.2;ctx.beginPath();ctx.arc(cx,cy,R*(.08+energy*.06),0,Math.PI*2);ctx.stroke();

  // [FAST+] Aurora borealis — layered sine curtains with vertical shafts, high drives shimmer
  for(let layer=0;layer<5;layer++){
    const yBase=cy-R*.1+layer*H*.1-energy*H*.08;
    const freq=1.2+layer*.3,amp=H*(.06+energy*.05+layer*.015),spd=.5+layer*.2;
    ctx.globalAlpha=(0.25+energy*.2)*(1-layer*.15);ctx.beginPath();
    for(let x=0;x<=W;x+=5){const y=yBase+Math.sin(x/W*Math.PI*2*freq+t*spd)*amp+Math.sin(x/W*Math.PI*3.7+t*(spd*.7))*amp*.4;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
  }
  for(let sh=0;sh<6;sh++){
    const sx=cx+(sh-2.5)*W*.15+Math.sin(t*.3+sh)*W*.04;
    ctx.globalAlpha=(.12+high*.25)*(.6+Math.sin(beat*Math.PI*2+sh)*.4);
    ctx.beginPath();ctx.moveTo(sx,cy-R*(1.2+energy*.3));ctx.lineTo(sx+R*.06,cy+R*.5);ctx.stroke();
  }

  // [FAST+] Phoenix — bezier wings, tail plumes, energy-driven ascent, beat-locked wing flap
  const flap=Math.sin(beat*Math.PI*2)*0.3+Math.sin(t*3.5)*0.1;
  const bx=cx+Math.sin(t*.4)*R*.5,by=cy-energy*R*.32+Math.cos(t*.55)*R*.2;
  const ws=R*(1.1+energy*.35);
  ctx.beginPath();ctx.moveTo(bx-R*.08,by);ctx.bezierCurveTo(bx,by-R*.22,bx,by-R*.22,bx+R*.22,by+R*.05);ctx.stroke();
  ctx.beginPath();ctx.arc(bx+R*.2,by+R*.04,R*.05,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(bx+R*.25,by+R*.04);ctx.lineTo(bx+R*.34,by+R*.04);ctx.stroke();
  for(let f=0;f<3;f++){ctx.beginPath();ctx.moveTo(bx,by);ctx.bezierCurveTo(bx-ws*.3-f*R*.1,by-R*(.35+flap+f*.08),bx-ws*.55-f*R*.05,by-R*(.1+flap*.5+f*.04),bx-ws*(0.7+f*.12),by+R*(flap*.4+f*.06));ctx.stroke();}
  for(let f=0;f<3;f++){ctx.beginPath();ctx.moveTo(bx,by);ctx.bezierCurveTo(bx+ws*.1+f*R*.05,by-R*(.25+flap+f*.06),bx+ws*.25+f*R*.05,by-R*(.08+flap*.4+f*.03),bx+ws*(0.35+f*.08),by+R*(flap*.3+f*.04));ctx.stroke();}
  for(let p=0;p<4;p++){ctx.beginPath();ctx.moveTo(bx-R*.06,by+R*.04);ctx.quadraticCurveTo(bx-R*(.2+p*.08),by+R*(.22+p*.1)+Math.sin(t*2.5+p)*.12*R,bx-R*(.32+p*.1),by+R*(.42+p*.14));ctx.stroke();}

  // [ALL] Parametric heart — beats with kick drum every beat
  const heartPulse=1+Math.max(0,1-beat*5)*bass*.4;
  ctx.beginPath();
  for(let i=0;i<=80;i++){const a=i/80*Math.PI*2;const r=R*(.55+energy*.2)*heartPulse;const hx=cx+r*(Math.sin(a)**3)*1.2;const hy=cy-r*(.85*Math.cos(a)-.35*Math.cos(2*a)-.12*Math.cos(3*a)-.07*Math.cos(4*a));i?ctx.lineTo(hx,hy):ctx.moveTo(hx,hy);}
  ctx.closePath();ctx.globalAlpha=0.6+energy*.35;ctx.stroke();
  for(let ring=1;ring<4;ring++){ctx.globalAlpha=(0.4-ring*.08)*(0.3+bass*.5);ctx.beginPath();for(let i=0;i<=80;i++){const a=i/80*Math.PI*2;const r=R*(.55+energy*.2)*heartPulse*(1+ring*.18);const hx=cx+r*(Math.sin(a)**3)*1.2;const hy=cy-r*(.85*Math.cos(a)-.35*Math.cos(2*a)-.12*Math.cos(3*a)-.07*Math.cos(4*a));i?ctx.lineTo(hx,hy):ctx.moveTo(hx,hy);}ctx.closePath();ctx.stroke();}

  // [ALL] Galloping horse — built from parts: head, neck, body, four legs with knee joints
  const gx=cx+Math.sin(t*.9)*R*.45, gy=cy+Math.cos(t*1.1)*R*.12;
  const stride=Math.sin(t*5.8+beat*Math.PI*2), bounce=Math.abs(Math.sin(t*5.8))*R*.06;
  // Head + neck
  ctx.beginPath();ctx.arc(gx+R*.52,gy-R*.46-bounce,R*.1,0,Math.PI*2);ctx.stroke(); // head
  ctx.beginPath();ctx.moveTo(gx+R*.48,gy-R*.36-bounce);ctx.lineTo(gx+R*.34,gy-R*.18-bounce);ctx.stroke(); // neck
  ctx.beginPath();ctx.moveTo(gx+R*.56,gy-R*.52-bounce);ctx.lineTo(gx+R*.7,gy-R*.5-bounce);ctx.stroke(); // ear
  // Body
  ctx.beginPath();ctx.moveTo(gx-R*.38,gy);ctx.bezierCurveTo(gx-R*.2,gy-R*.3-bounce,gx+R*.18,gy-R*.3-bounce,gx+R*.38,gy-R*.04);ctx.stroke();
  ctx.beginPath();ctx.moveTo(gx-R*.38,gy);ctx.bezierCurveTo(gx-R*.2,gy+R*.15,gx+R*.18,gy+R*.15,gx+R*.38,gy-R*.04);ctx.stroke();
  // Tail
  ctx.beginPath();ctx.moveTo(gx-R*.38,gy+R*.04);ctx.quadraticCurveTo(gx-R*.58+stride*R*.12,gy-R*.12,gx-R*.68+stride*R*.18,gy+R*.22);ctx.stroke();
  // Four legs — alternating stride pairs
  const legs=[[-R*.22,1],[-R*.08,-1],[R*.14,1],[R*.28,-1]];
  legs.forEach(([lx,ph])=>{
    const s=Math.sin(t*5.8+ph*Math.PI*.5)*R*.28, ky=gy+R*.22, fy=gy+R*.52;
    ctx.beginPath();ctx.moveTo(gx+lx,gy+R*.12);ctx.lineTo(gx+lx+s*.3,ky);ctx.lineTo(gx+lx+s*.5,fy);ctx.stroke(); // leg+knee
    ctx.beginPath();ctx.moveTo(gx+lx+s*.5,fy);ctx.lineTo(gx+lx+s*.5+R*.04,fy+R*.04);ctx.stroke(); // hoof
  });
  ctx.globalAlpha=0.4+energy*.4;

  // [ALL] Blooming flower — petals grow on bass, spin on beat, each petal is a bezier lobe
  const petals=7, bloom=0.4+energy*.6+Math.max(0,1-beat*5)*bass*.35;
  for(let p=0;p<petals;p++){
    const pa=p/petals*Math.PI*2+t*.25, pr=R*(.5*bloom);
    const px=cx+Math.cos(pa)*pr*.55, py=cy+Math.sin(pa)*pr*.55;
    ctx.globalAlpha=(0.5+energy*.35)*(0.7+Math.sin(t*2+p)*.3);
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.bezierCurveTo(
      cx+Math.cos(pa-0.5)*pr,cy+Math.sin(pa-0.5)*pr,
      cx+Math.cos(pa+0.5)*pr,cy+Math.sin(pa+0.5)*pr,
      px*2-cx,py*2-cy
    );
    ctx.stroke();
  }
  // Stamen — rings at center
  for(let r=1;r<4;r++){
    ctx.globalAlpha=0.3+bass*.5;
    ctx.beginPath();ctx.arc(cx,cy,R*(.07*r+bass*.05),0,Math.PI*2);ctx.stroke();
  }

  // [ALL] Fire column — stacked flickering flame lobes, bass drives height, high drives flicker
  const flames=5, fbase=cy+R*.55;
  for(let f=0;f<flames;f++){
    const ft=t*2.8+f*.6, fh=R*(.32+energy*.38-f*.06)*(1-f*.14);
    const fw=R*(.22-f*.03)*(0.7+bass*.5);
    const fx=cx+Math.sin(ft*.7+f)*R*.04*(f+1);
    const flicker=Math.sin(ft*3.2+f*2.1)*fw*.3;
    ctx.globalAlpha=(0.7-f*.1)*(0.4+bass*.5+Math.sin(ft*high*4)*.15);
    ctx.beginPath();
    ctx.moveTo(fx-fw,fbase-f*fh*.5);
    ctx.bezierCurveTo(fx-fw*.6+flicker,fbase-f*fh*.5-fh*.5,fx+flicker,fbase-f*fh*.5-fh,fx,fbase-f*fh*.5-fh*(1.2+high*.3));
    ctx.bezierCurveTo(fx+flicker,fbase-f*fh*.5-fh,fx+fw*.6+flicker,fbase-f*fh*.5-fh*.5,fx+fw,fbase-f*fh*.5);
    ctx.stroke();
  }
  // Ember sparks — fly upward on beat
  const eSpark=Math.max(0,1-beat*4)*bass;
  for(let e=0;e<8;e++){
    const ea=(e/8)*Math.PI*2+t, er=R*(.08+Math.sin(t*3+e)*.06)*eSpark;
    ctx.globalAlpha=eSpark*(0.4+Math.random()*.4);
    ctx.beginPath();ctx.arc(cx+Math.cos(ea)*er,fbase-R*(.25+e*.06+eSpark*.35),R*.012,0,Math.PI*2);ctx.stroke();
  }

  THESE ARE STARTING POINTS ONLY. Every scene must invent something the existing library cannot do.
  Approach every object like a character: give it a body, joints, secondary motion, breath.
  A horse has four jointed legs with hooves. A fire has lobes with flicker and rising embers.
  A flower has petals that unfurl one by one and a stamen that pulses.
  Think about WHAT THE OBJECT DOES, not just what it looks like.
  ─────────────────────────────────────────────────────

  ★ HARDWARE CONSTRAINTS — YOUR CODE MUST RESPECT THESE OR THE SHOW BREAKS ★
  ─────────────────────────────────────────────────────
  Laser: ${laser ? `${laser.brand} ${laser.model} | Scanner: ${laser.scanTier} | Colors: ${(laser.availableColors ?? []).join(", ")} | Mode: ${laser.colorMode}${laser.maxPowerMw ? ` | ${laser.maxPowerMw}mW` : ""}` : "Unknown — design for a mid-tier scanner, moderate path counts"}

${!laser || laser.scanTier === "budget" ? `  BUDGET SCANNER (8–12 KPPS) — STRICT PATH LIMITS
  • Max ~60 points per stroke call (each loop iteration = 1 point)
  • Max 3 separate stroke calls per scene total
  • Forbidden: dense spirals, fine particles, high-res beziers, large loop counts
  • GOOD: simple geometry (triangles, stars 5-7 pts), straight lines, wide arcs, 3-5 figures, 1 bold wave (max 40 x-steps)` : laser.scanTier === "mid" ? `  MID-TIER SCANNER (12–18 KPPS) — MODERATE PATH LIMITS
  • Max ~120 points per stroke call
  • Max 6 separate stroke calls per scene total
  • OK: moderate spirals (max 3 turns, 80 steps), 6-8 crowd figures, 3 wave layers (40 x-steps each)
  • Avoid: 50+ particle dots, ultra-dense Lissajous` : laser.scanTier === "fast" ? `  FAST SCANNER (18–25 KPPS) — MODERATE-HIGH PATH LIMITS
  • Max ~200 points per stroke call
  • Max 10 separate stroke calls per scene total
  • OK: complex spirals (5 turns, 150 steps), 3D wireframes, 10-figure crowds, 5-layer waves, 20-30 particles` : `  PRO SCANNER (25–40 KPPS) — FULL CREATIVE FREEDOM
  • Max ~400 points per stroke call, up to 15+ separate stroke calls
  • Complex spirals, dense particles, fine 3D geometry — all safe
  • This scanner renders anything you can imagine at full frame rate`}

${!laser || laser.colorMode === "rgb" || laser.colorMode === "rgb-full" ? `  COLOR: RGB FULL — 'color' carries the active laser color (engine picks it, you pick shapes)
  • Design for one vivid color at a time — high contrast shapes read best
  • At choruses/peaks: pair with gratingEnabled:true to fan the colored beam across the room` : laser.colorMode === "indexed" ? `  COLOR: INDEXED PALETTE (${(laser.availableColors ?? []).join(", ")})
  • 'color' reflects the active indexed slot — design for any single color
  • Bold simple outlines over fine detail` : `  COLOR: SINGLE (${(laser.availableColors ?? []).join(", ")}) — Monochrome
  • Use ctx.globalAlpha (0.2–1.0) for depth. Bold strokes for foreground, thin for secondary.`}
  ─────────────────────────────────────────────────────

movementStyle: "lissajous" | "sweep" | "bounce" | "step"
  lissajous — figure-8/ellipse drift. Elegant. Best for stars, text, ambient.
  sweep     — wide left-right pendulum. Anthem feel, crowd-pleasing.
  bounce    — unpredictable energetic jumps. High-energy peaks and drops.
  step      — beats-locked grid snaps. Mechanical, industrial, precise.
  → Rotate through all 4 across a show. No style used more than 3× total.

movementSpeed: 0.4–1.2 (float)
  0.4=glacial drift, 0.7=elegant, 1.0=alive, 1.2=maximum (HARD CAP — faster looks buggy)
  Text scenes: cap at 0.7. Intro/ambient: 0.4-0.6. Peak drops: 0.9-1.2.

colorIntensity: 1.0–2.0
  1.0=baseline, 1.4=vivid, 1.8=blazing, 2.0=only at climax/finale
  Build intensity across the show — start 1.2 and end 2.0.

patternComplexity: "simple" | "medium" | "complex"
  Lissajous shape complexity. Use "simple" for text+intros, "complex" for peak moments.

gratingEnabled: boolean — fans beam into multiple rays. Use at choruses/peaks. NEVER during text.
strobeEnabled: boolean — white flash on treble. MAXIMUM 2 scenes total. NEVER during text.
zoomEnabled: boolean — bass makes beam breathe outward. true for dance music, false for ambient.
bassThreshold: 0.15–0.6 — kick sensitivity. 0.2=reactive, 0.4=selective, 0.6=only huge hits.
patternShiftBeats: 4|8|16|32 — beam shape cycle speed. 4=frantic, 32=slow hypnotic.

textEnabled: boolean + textContent: string
  Laser-traces text in glowing light. 1-3 words max. "DROP", "AMERICA", "TONIGHT", "LOVE".
  Keep animationCode simple when textEnabled — a halo or slow ring. TEXT must dominate.

Current show settings: ${JSON.stringify(currentSettings, null, 2)}`;

  const systemPrompt = `You are a world-class laser show director. You have designed shows for EDC, Coachella, Super Bowl halftimes, stadium tours, NYE Times Square, and Burning Man. Your shows make audiences gasp. You do not play it safe — you are bold, unexpected, and cinematic.

Laser: ${laser ? `${laser.brand} ${laser.model} | ${laser.channelCount}ch DMX | Colors: ${(laser.availableColors ?? []).join(", ")} | Scanner: ${laser.scanTier}` : "Unknown hardware — design for mid-tier scanner"}
Notes: ${laser ? ((laser.notes as string | undefined) ?? "none") : "none"}
Features: ${laser ? ((laser.specialFeatures ?? []).join(" | ") || "standard") : "standard"}
${musicSection}
${zoneInfo ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAFETY ZONE ACTIVE — ${zoneInfo.activePercent}% of output field
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The user has set a safety zone mask. The DMX mapper will automatically constrain beam position channels.
Zone location: ${zoneInfo.description}
Active cells: ${zoneInfo.activeCells} of ${zoneInfo.totalCells}
Design all scenes AS IF this zone IS the full canvas — the hardware will clip to it.
For sweeps and animations: prefer movements that stay within the active region.
If the zone is small (<40%), keep patterns tighter (lower panRange/tiltRange).
` : ""}

${settingsDoc}

═══════════════════════════════════════════════════════
OUTPUT — MANDATORY FORMAT, ZERO EXCEPTIONS
═══════════════════════════════════════════════════════

Every response ends with ONE <settings> block of valid JSON. Pick exactly one mode.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODE 1 — TWEAK  (no sequence exists yet, or user tweaks a single global param)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Triggers: "turn off strobe", "slow it down", "more bass" — a single setting, no full sequence context.
Output: flat JSON with ONLY the changed fields.
<settings>{"movementSpeed": 0.6, "strobeEnabled": false}</settings>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODE 2 — BUILD NEW SHOW  (explicit request to create a complete show from scratch)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Triggers ONLY when the user says "build me a show", "create a show", "generate a show",
  "make a show for [song/event]", "start fresh", or there is NO existing sequence at all.
DO NOT trigger MODE 2 just because the user mentions a change or improvement.
Output: full "sequence" array covering the entire song.

──────────────── EXAMPLE — 3-scene snippet (real shows need 16-30 scenes) ────────────────
<settings>{"sequence": [
  {"label": "INTRO", "durationBars": 8, "movementStyle": "sweep", "animationCode": "const kick=Math.max(0,1-beat*6)*bass;for(let ring=0;ring<4;ring++){const r=R*(.18+ring*.21+kick*.32*(1-ring*.18));ctx.globalAlpha=(.7-ring*.14)*(0.15+kick*.85);ctx.lineWidth=(2.4-ring*.38)*dpr;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();}const sn=Math.round(8+high*18);for(let i=0;i<sn;i++){const a=i/sn*Math.PI*2+t*.35;const sr=R*(.82+Math.sin(t*high*6+i)*.1+high*.15);ctx.globalAlpha=0.18+high*.6;ctx.lineWidth=1.1*dpr;ctx.beginPath();ctx.arc(cx+Math.cos(a)*sr,cy+Math.sin(a)*sr,R*.02,0,Math.PI*2);ctx.stroke();}", "textEnabled": false, "textContent": "", "colorIntensity": 1.2, "movementSpeed": 0.5, "patternComplexity": "simple", "gratingEnabled": false, "strobeEnabled": false, "bassThreshold": 0.45, "zoomEnabled": true, "patternShiftBeats": 16},
  {"label": "DROP 1", "durationBars": 16, "movementStyle": "bounce", "animationCode": "for(let i=0;i<8;i++){const fx=cx+(i-3.5)*W*.115,bob=Math.sin(beat*Math.PI*2+i*.7)*R*.06*(1+energy*.6);const fh=R*.72,fy=cy+R*.28+bob;ctx.beginPath();ctx.arc(fx,fy-fh*.93,fh*.09,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(fx-fh*.22,fy-fh*.78);ctx.lineTo(fx+fh*.22,fy-fh*.78);ctx.moveTo(fx,fy-fh*.78);ctx.lineTo(fx,fy-fh*.38);ctx.moveTo(fx-fh*.16,fy-fh*.38);ctx.lineTo(fx+fh*.16,fy-fh*.38);ctx.stroke();const aw=Math.sin(beat*Math.PI*2+i*.7)*(energy>.5?.12:.06);ctx.beginPath();ctx.moveTo(fx-fh*.22,fy-fh*.78);ctx.lineTo(fx-fh*(.32+aw),fy-fh*(1.05+energy*.18));ctx.moveTo(fx+fh*.22,fy-fh*.78);ctx.lineTo(fx+fh*(.32-aw),fy-fh*(1.05+energy*.18));ctx.stroke();ctx.beginPath();ctx.moveTo(fx-fh*.08,fy-fh*.38);ctx.lineTo(fx-fh*.22,fy+fh*.02);ctx.moveTo(fx-fh*.22,fy+fh*.02);ctx.lineTo(fx-fh*.28,fy+fh*.38);ctx.moveTo(fx+fh*.08,fy-fh*.38);ctx.lineTo(fx+fh*.22,fy+fh*.02);ctx.moveTo(fx+fh*.22,fy+fh*.02);ctx.lineTo(fx+fh*.28,fy+fh*.38);ctx.stroke();}", "textEnabled": false, "textContent": "", "colorIntensity": 1.9, "movementSpeed": 1.0, "patternComplexity": "complex", "gratingEnabled": true, "strobeEnabled": false, "bassThreshold": 0.25, "zoomEnabled": true, "patternShiftBeats": 8},
  {"label": "CLIMAX", "durationBars": 8, "movementStyle": "step", "animationCode": "const n=8+Math.round(energy*7);const kick=Math.max(0,1-beat*5)*bass;for(let i=0;i<n;i++){const a=i/n*Math.PI*2+t*.25;const r=R*(.38+Math.sin(t*1.3+i)*.14+kick*.35);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.globalAlpha=0.5+kick*.5;ctx.stroke();const ir=R*(.1+kick*.1);ctx.beginPath();ctx.arc(cx+Math.cos(a)*ir,cy+Math.sin(a)*ir,R*.04+kick*R*.03,0,Math.PI*2);ctx.globalAlpha=0.6+kick*.4;ctx.stroke();}", "textEnabled": false, "textContent": "", "colorIntensity": 2.0, "movementSpeed": 1.1, "patternComplexity": "complex", "gratingEnabled": true, "strobeEnabled": true, "bassThreshold": 0.2, "zoomEnabled": true, "patternShiftBeats": 4}
]}</settings>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODE 3 — PATCH EXISTING SHOW  ← USE THIS for any fix/change/improve request on an existing show
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Triggers when: a sequence already exists in currentSettings AND the user wants to change
  specific parts — e.g. "fix the drop", "the strobe is too aggressive", "make scene 3 better",
  "change the chorus animation", "the intro is too slow", "update DROP 2 to be more intense".

CRITICAL RULE — THE SHOW IS ALREADY BUILT. DO NOT REBUILD IT.
  You have the full existing show in "Current show settings" above (currentSettings.sequence).
  Your job is SURGICAL: copy every scene exactly, only modify the specific scenes the user asked about.
  Scenes the user did NOT mention = COPY THEM CHARACTER FOR CHARACTER. Do not touch them.
  Output the full modified sequence (all scenes, unchanged + changed).

HOW TO PATCH:
  1. Identify WHICH scenes need changing (by label or position — "DROP 1", "scene 3", "the chorus", etc.)
  2. For ONLY those scenes: write new/corrected fields (animationCode, colorIntensity, etc.)
  3. For ALL OTHER scenes: copy them EXACTLY from currentSettings.sequence, field for field
  4. Output the entire sequence as a "sequence" array — patched scenes changed, rest identical

SCENE IDENTIFICATION RULES:
  • "the drop" / "DROP 1" → find the scene labeled "DROP 1" or the first high-energy scene
  • "scene 3" / "third scene" → 0-indexed: scene at index 2
  • "the chorus" → find scenes labeled CHORUS or positioned where energy is HIGH/PEAK
  • "the intro" → scene labeled INTRO or index 0
  • "the outro" → last scene
  • "the breakdown" → scene labeled BREAKDOWN or the LOW-energy scene after a peak
  • "all the drops" → every scene labeled DROP or with strobeEnabled/high colorIntensity

PATCH EXAMPLE (user says "fix the intro to use a DNA helix instead"):
  → Copy all scenes from currentSettings.sequence
  → Only replace the animationCode (and any related fields) in the INTRO scene
  → Output the full sequence with all other scenes unchanged
<settings>{"sequence": [
  {"label": "INTRO", "durationBars": 8, "animationCode": "...NEW DNA CODE...", "movementStyle": "sweep", "textEnabled": false, "textContent": "", "colorIntensity": 1.2, "movementSpeed": 0.5, "patternComplexity": "simple", "gratingEnabled": false, "strobeEnabled": false, "bassThreshold": 0.45, "zoomEnabled": true, "patternShiftBeats": 16},
  ...ALL OTHER SCENES COPIED EXACTLY FROM currentSettings.sequence...
]}</settings>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEQUENCE RULES (apply to MODE 2 and MODE 3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REQUIRED FIELDS per scene: label, durationBars, movementStyle, animationCode, textEnabled, textContent,
  colorIntensity, movementSpeed, patternComplexity, gratingEnabled, strobeEnabled, bassThreshold, zoomEnabled, patternShiftBeats

ENERGY ALIGNMENT (MODE 2 only — MODE 3 preserves existing alignment unless user asks to change it):
  Read the ENERGY TIMELINE above. Scene energies MUST match the timeline.
  Strobe on a QUIET bar = amateur mistake. Gentle intro on a PEAK bar = wasted drop.

DURATION MATH:
  seconds_per_bar = (60 / BPM) × 4
  Total durationBars MUST sum to exactly ${totalBars > 0 ? totalBars : "total song bars"} (±2 bars).
  NEVER let scenes run out before the song ends — show dies at the last scene.

SCENE COUNT BY SONG LENGTH (MODE 2 builds only):
  Under 2 min  → 8–12 scenes
  2–3 min     → 14–18 scenes
  3–4 min     → 18–24 scenes
  4–6 min     → 24–32 scenes
  6–10 min    → 32–45 scenes
  10+ min set → build per-song (ask user which song to build for)

VARIETY (MODE 2 builds):
  • animationCode: every scene draws something VISUALLY DISTINCT — no two share a subject
  • movementStyle: rotate all 4 — no style used more than 3× total
  • colorIntensity: arc from ~1.2 at intro to 2.0 at climax

BEAT-REACTIVITY — MANDATORY in every animationCode:
  Use bass, high, or beat for immediate musical reactivity. Not just t and energy.
  At minimum: one beat-locked effect per scene using beat + bass.

ANIMATION MANDATE: Every scene must have animationCode. Null or empty = FORBIDDEN.
  Write 20–60 lines per scene.

SPEED RULE: movementSpeed 0.4–0.7 for text/ambient. 0.7–1.2 for energy scenes. Hard cap: 1.2.

PRE-OUTPUT CHECKLIST:
  ✓ MODE 3? → every unmodified scene copied character-for-character from currentSettings.sequence
  ✓ label on every scene
  ✓ durationBars sum = total song bars ±2
  ✓ MODE 2: every scene energy matches ENERGY TIMELINE
  ✓ No two scenes draw the same visual subject (MODE 2) or the patched scene doesn't duplicate an adjacent one (MODE 3)
  ✓ Every animationCode uses beat/bass/high
  ✓ strobeEnabled:true scenes ≤ 2 total and only on PEAK bars
  ✓ No null/empty animationCode

HARD OUTPUT RULES:
  1. <settings> block at the very end, after all prose
  2. Valid JSON — double-quoted strings, no trailing commas
  3. No markdown code fences
  4. 1–2 crisp sentences before the block (for MODE 3: say which scenes you changed and why)

═══════════════════════════════════════════════════════
DESIGN PHILOSOPHY — THINK LIKE A CHOREOGRAPHER AND A CODER
═══════════════════════════════════════════════════════

You are designing for a real live audience at a major event. Every scene is a deliberate visual statement.
The goal: the audience should gasp, then feel something, then gasp again.

THINK CINEMATICALLY: What would a film director put on screen for this moment?
  A kick drum → the room flashes white for 40ms
  A vocal swell → crowd silhouettes rise, arms reaching for the sky
  A breakdown → everything goes dark except one slow-spinning shape
  The climax → the entire sky explodes in synchronized geometry
  A key lyric → that image becomes the visual, unmistakably

TENSION & RELEASE: Build 2-3 scenes of rising intensity, then explode into the climax.
  After chaos, drop to something organic and slow. The contrast is the emotion.

CONTRAST IS EVERYTHING: After jagged geometry (high energy), give them one flowing wave (low energy).
  After a crowd scene, give them something cosmic and solitary. The contrast creates impact.

TEXT IS THE CLIMAX MOMENT: When the key lyric or title appears as text, the animation around
  it should be simple and powerful — a halo, orbiting stars, slow expanding rings. TEXT dominates.

PUSH THE MEDIUM: Each scene should attempt something the pre-built library cannot do.
  A horse galloping. Fire rising. A city at night. An aurora. A beating heart. A solar system.
  Code it from scratch. Push the canvas API to its limit.

OBJECT ANIMATION PRINCIPLES — how to make things feel alive:
  ANATOMY FIRST: Break every object into its physical parts and draw each separately.
    Horse = head (arc) + neck (line) + body (two beziers) + 4 jointed legs + tail (quadratic)
    Fire = 5 overlapping lobe beziers stacked vertically, each flickering at different speeds
    Flower = 7 petal beziers from center + stamen rings + stem line
    Bird = body ellipse + two bezier wings that flap + tail fork + beak line
    Person = head arc + spine + shoulder bar + hip bar + upper+lower arm+leg segments each
  SECONDARY MOTION: Nothing moves in isolation. Add subtle secondary movements.
    Horse body bounces slightly as legs stride. Tail swings opposite to gait.
    Fire lobes wobble left/right at different frequencies. Embers drift upward on beat.
    Flower petals breathe in/out independently. Stem sways slightly.
  WEIGHT & PHYSICS: Animate as if gravity and inertia exist.
    Heavy things: settle on bass hit, lag behind, overshoot and spring back.
    Light things: flutter, drift, react instantly to high frequencies.
    Use Math.sin(t*freq+phase) with different frequencies per part for organic motion.
  BEAT-LOCKING: One element must react sharply on EVERY beat.
    Use Math.max(0, 1 - beat*5) for sharp attack → instant decay.
    Crowd arms snap up on beat. Fire surges. Horse hooves hit ground. Petals flash open.
  ALWAYS STROKE, NEVER FILL — laser only traces paths. Plan shapes as outlines.

EVENT PALETTES — specific animationCode ideas by genre/event:
  EDC / Festival EDM: tunnel vortex, geometric fractals, particle explosions, morphing polygons
  Hip-Hop show: crowd moshing silhouettes, city skyline, graffiti-style bold geometry
  Pop concert: blooming flowers, butterflies, flowing ribbons, sparkle constellations
  Rock: jagged waveforms, lightning trees, moshing crowd, industrial angular geometry
  4th of July: star bursts, eagle wingspan, waving stripes, orbiting stars + text "FREEDOM"
  NYE: countdown numbers, champagne bubbles rising, firework explosions, confetti streaks
  Wedding: flowing petals, soft spirals, two interlocking rings, a gentle dove in flight

WHAT YOU CANNOT DO (technical limits):
  • Load external images, fonts, or bitmaps in animationCode
  • Use fetch(), DOM, or async inside animationCode
  • Per-bar color pre-assignment (colors react to music in real time automatically)

MUSIC TRANSITION COMMANDS (only when user explicitly requests fade/cut):
  audioAction: "fadeOut" | "fadeIn" | "cut"
  fadeSeconds: number (default 3)`;

  const chatMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5",
      max_completion_tokens: 32000,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
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

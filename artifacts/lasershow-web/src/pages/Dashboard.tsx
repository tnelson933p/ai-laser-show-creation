import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { analyzeTrack } from "@/lib/audio-engine";
import {
  LASER_BRANDS, LASER_DATABASE, getLaserByBrandModel,
  type LaserModel,
} from "@/lib/laser-database";
import { ShowEngine, LISSAJOUS_PRESETS, type VisualState, type ShowOverrides, type SceneSettings } from "@/lib/show-engine";
import {
  type ChatMessage, type ShowSave, loadLibrary, saveLibrary,
} from "@/lib/show-library";
import {
  Play, Square, Upload, Usb, Activity, Zap, Music, ChevronDown, ChevronUp, Cpu,
  TrendingDown, Scissors, TrendingUp, Pause, Copy, Clock, Library, Save, Plus, X as XIcon, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TrackData {
  filename: string;
  buffer: AudioBuffer;
  analysis: {
    bass: Float32Array;
    mid: Float32Array;
    high: Float32Array;
    bpm: number;
    duration: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  // Laser selection
  const [selectedBrand, setSelectedBrand] = useState<string>("Eytse");
  const [selectedModel, setSelectedModel] = useState<string>("EY003-L (16-ch)");
  const [laser, setLaser] = useState<LaserModel | null>(null);

  // Audio — setlist replaces single track
  const [setlist, setSetlist] = useState<TrackData[]>([]);
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0);
  const track = setlist[currentTrackIdx] ?? null;
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentEnvelopes, setCurrentEnvelopes] = useState({ bass: 0, mid: 0, high: 0 });

  // AI Show Director — lifted here so state survives play/stop cycles
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Auto-advance state: when onended fires it sets this; a useEffect then starts the new track
  const [autoAdvancing, setAutoAdvancing] = useState(false);

  // Show library
  const [savedShows, setSavedShows] = useState<ShowSave[]>(() => loadLibrary());
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState("");

  // DMX
  const [dmxOutput, setDmxOutput] = useState<number[]>(new Array(16).fill(0));
  const [port, setPort] = useState<SerialPort | null>(null);
  const [webSerialSupported, setWebSerialSupported] = useState(true);
  const [dmxExpanded, setDmxExpanded] = useState(false);
  const [dmxCableType, setDmxCableType] = useState<"enttec-pro" | "raw">("enttec-pro");
  const dmxCableTypeRef = useRef<"enttec-pro" | "raw">("enttec-pro");

  // Show engine
  const engineRef = useRef<ShowEngine | null>(null);
  const visualStateRef = useRef<VisualState | null>(null);
  const [showOverrides, setShowOverrides] = useState<ShowOverrides>({});
  const showOverridesRef = useRef<ShowOverrides>({});

  // Show sequencer — AI-defined scenes that auto-advance during playback
  const sequenceRef = useRef<SceneSettings[]>([]);
  const [showSequence, setShowSequence] = useState<SceneSettings[]>([]);
  const [activeSceneIdx, setActiveSceneIdx] = useState<number>(-1);
  const lastActiveSceneRef = useRef<SceneSettings | null>(null);
  // Shared with LaserCanvas (ref so canvas reads it without re-renders)
  const activeSceneDisplayRef = useRef<{ label: string; changedAt: number } | null>(null);
  // Transition: set when scene changes, read by dmxLoop (blending) + canvas (visuals)
  const sceneTransitionRef = useRef<{
    fromScene: SceneSettings;
    startedAt: number;
    durationMs: number;
  } | null>(null);

  // Synchronous updater — updates the ref immediately so the 40Hz loops never
  // read a stale override (don't rely on React's async render cycle for this).
  const applyOverrides = (next: ShowOverrides) => {
    const { sequence, ...rest } = next;
    if (sequence !== undefined) {
      sequenceRef.current = sequence;
      setShowSequence(sequence);
      lastActiveSceneRef.current = null; // force scene re-detection on next loop
    } else if (Object.keys(next).length === 0) {
      // Full reset — clear sequence too
      sequenceRef.current = [];
      setShowSequence([]);
      setActiveSceneIdx(-1);
      activeSceneDisplayRef.current = null;
      lastActiveSceneRef.current = null;
      sceneTransitionRef.current = null;
    }
    showOverridesRef.current = rest;
    setShowOverrides(rest);
  };

  // Music transitions
  const [isFadingOut, setIsFadingOut] = useState(false);
  const fadeTimerRef = useRef<number | null>(null);

  // Pause / seek
  const [isPaused, setIsPaused] = useState(false);
  const pausedAtRef = useRef<number>(0);
  const [copiedTs, setCopiedTs] = useState(false);

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

  // Refs for auto-advance (needed because onended callbacks have stale closures)
  const setlistRef = useRef<TrackData[]>([]);
  const currentTrackIdxRef = useRef(0);
  useEffect(() => { setlistRef.current = setlist; }, [setlist]);
  useEffect(() => { currentTrackIdxRef.current = currentTrackIdx; }, [currentTrackIdx]);


  // Init
  useEffect(() => {
    document.documentElement.classList.add("dark");
    if (!("serial" in navigator)) setWebSerialSupported(false);
  }, []);

  // Resolve laser model
  useEffect(() => {
    const found = getLaserByBrandModel(selectedBrand, selectedModel);
    setLaser(found ?? null);
    if (found) {
      engineRef.current = new ShowEngine(found);
    }
    applyOverrides({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrand, selectedModel]);

  // Brand change → pick first model
  const handleBrandChange = (brand: string) => {
    setSelectedBrand(brand);
    const models = LASER_DATABASE.filter(l => l.brand === brand);
    if (models.length > 0) setSelectedModel(models[0].model);
  };

  // Keep the cable-type ref in sync so the dmxLoop closure reads the latest value
  useEffect(() => { dmxCableTypeRef.current = dmxCableType; }, [dmxCableType]);

  // ── Hardware ────────────────────────────────────────────────────────────
  const connectPort = async () => {
    try {
      const p = await navigator.serial.requestPort();
      // ENTTEC Pro / SoundSwitch: 57600 baud, CDC framing handled by device firmware
      // Generic Open DMX / raw: 250000 baud, 8 data bits, 2 stop bits, no parity
      const baudRate = dmxCableTypeRef.current === "enttec-pro" ? 57600 : 250000;
      await p.open({
        baudRate,
        dataBits: 8,
        stopBits: dmxCableTypeRef.current === "enttec-pro" ? 1 : 2,
        parity: "none",
        flowControl: "none",
      });
      setPort(p);
      writerRef.current = p.writable?.getWriter() ?? null;
    } catch { /* user cancelled or access denied */ }
  };

  // ── Show library save/load ───────────────────────────────────────────────
  const handleSaveShow = () => {
    const name = saveNameInput.trim() || `Show ${new Date().toLocaleDateString()}`;
    if (!laser) return;
    const show: ShowSave = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      laserBrand: laser.brand,
      laserModel: laser.model,
      messages: chatMessages,
      overrides: showOverrides,
      setlistMeta: setlist.map(t => ({ filename: t.filename, bpm: t.analysis.bpm, durationSecs: t.analysis.duration })),
    };
    const updated = [...savedShows, show];
    setSavedShows(updated);
    saveLibrary(updated);
    setSaveNameInput("");
  };

  const handleLoadShow = (show: ShowSave) => {
    setChatMessages(show.messages);
    applyOverrides(show.overrides);
    setLibraryOpen(false);
  };

  const handleDeleteShow = (id: string) => {
    const updated = savedShows.filter(s => s.id !== id);
    setSavedShows(updated);
    saveLibrary(updated);
  };

  // ── Audio ───────────────────────────────────────────────────────────────
  const loadFile = async (file: File) => {
    if (!file.name.match(/\.(mp3|wav|ogg|flac)$/i)) {
      alert("Please select an audio file (.mp3, .wav, .ogg, .flac)");
      return;
    }
    setIsAnalyzing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      const analysis = await analyzeTrack(audioBuffer);
      setSetlist(prev => [...prev, { filename: file.name, buffer: audioBuffer, analysis }]);
    } catch { alert("Audio processing failed. Try another file."); }
    finally { setIsAnalyzing(false); }
  };

  const onFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    // Support dropping multiple files at once
    Array.from(e.dataTransfer.files).forEach(f => loadFile(f));
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach(f => loadFile(f));
    e.target.value = "";
  };

  const removeTrackFromSetlist = useCallback((idx: number) => {
    if (isPlaying && idx === currentTrackIdx) stopPlayback();
    setSetlist(prev => prev.filter((_, i) => i !== idx));
    setCurrentTrackIdx(prev => Math.max(0, idx < prev ? prev - 1 : prev));
    setCurrentFrame(0);
    setDmxOutput(new Array(16).fill(0));
    setCurrentEnvelopes({ bass: 0, mid: 0, high: 0 });
    visualStateRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentTrackIdx]);

  const clearSetlist = useCallback(() => {
    if (isPlaying) stopPlayback();
    setSetlist([]);
    setCurrentTrackIdx(0);
    setCurrentFrame(0);
    setDmxOutput(new Array(16).fill(0));
    setCurrentEnvelopes({ bass: 0, mid: 0, high: 0 });
    visualStateRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // ── Playback ─────────────────────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    sourceNodeRef.current?.stop();
    sourceNodeRef.current?.disconnect();
    if (timerRef.current) clearInterval(timerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    setIsPlaying(false);
    setIsPaused(false);
    setIsFadingOut(false);
    pausedAtRef.current = 0;
    setCurrentFrame(0);
    setCurrentEnvelopes({ bass: 0, mid: 0, high: 0 });
    setDmxOutput(new Array(16).fill(0));
    engineRef.current?.reset();
    visualStateRef.current = null;
  }, []);

  // ── Fade / Cut helpers ────────────────────────────────────────────────────
  const fadeOut = useCallback((seconds = 3) => {
    const ctx = audioCtxRef.current;
    const gain = gainNodeRef.current;
    if (!ctx || !gain || !isPlaying || isFadingOut) return;
    setIsFadingOut(true);
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds);
    fadeTimerRef.current = window.setTimeout(() => {
      stopPlayback();
      setIsFadingOut(false);
    }, seconds * 1000);
  }, [isPlaying, isFadingOut]);

  const fadeIn = useCallback((seconds = 3) => {
    const ctx = audioCtxRef.current;
    const gain = gainNodeRef.current;
    if (!ctx || !gain) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + seconds);
  }, []);

  const cutNow = useCallback(() => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    setIsFadingOut(false);
    stopPlayback();
  }, []);

  // Watch for AI-directed audioAction overrides and execute them once
  useEffect(() => {
    const action = showOverrides.audioAction;
    if (!action) return;
    const secs = showOverrides.fadeSeconds ?? 3;
    // Clear the action immediately so it doesn't fire again
    const { audioAction: _a, fadeSeconds: _f, ...rest } = showOverrides;
    applyOverrides(rest);
    if (action === "fadeOut") fadeOut(secs);
    else if (action === "cut")     cutNow();
    else if (action === "fadeIn")  fadeIn(secs);
  }, [showOverrides.audioAction]);

  const togglePlayback = () => {
    if (!track || !audioCtxRef.current) return;
    if (isPlaying) { stopPlayback(); return; }

    const ctx = audioCtxRef.current;
    const source = ctx.createBufferSource();
    source.buffer = track.buffer;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1, ctx.currentTime);
    gainNodeRef.current = gain;

    // chain: source → analyser → gain → speakers
    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);

    source.start();
    sourceNodeRef.current = source;
    startTimeRef.current = ctx.currentTime;
    setIsPlaying(true);
    setIsFadingOut(false);
    // Do NOT reset the engine here — the preview loop has been running it with
    // the AI's current overrides. Resetting would wipe that state and always
    // start from pattern 0 (circle) regardless of what the AI configured.
    timerRef.current = window.setInterval(dmxLoop, 25);
    source.onended = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      setIsFadingOut(false);
      visualStateRef.current = null;
      setDmxOutput(new Array(16).fill(0));
      const nextIdx = currentTrackIdxRef.current + 1;
      if (nextIdx < setlistRef.current.length) {
        setCurrentTrackIdx(nextIdx);
        setAutoAdvancing(true);
      } else {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentFrame(0);
      }
    };
  };

  // ── 40Hz DMX Loop ─────────────────────────────────────────────────────
  const dmxLoop = useCallback(() => {
    if (!track || !audioCtxRef.current || !engineRef.current) return;
    const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
    const frameIndex = Math.floor(elapsed * 40);
    if (frameIndex >= track.analysis.bass.length) return;
    setCurrentFrame(frameIndex);

    const bass = track.analysis.bass[frameIndex] || 0;
    const mid  = track.analysis.mid[frameIndex]  || 0;
    const high = track.analysis.high[frameIndex] || 0;
    const bpm  = track.analysis.bpm;

    setCurrentEnvelopes({ bass, mid, high });

    // ── Sequencer: find the active scene and merge its overrides ─────────
    let activeOverrides: ShowOverrides = showOverridesRef.current;
    const seq = sequenceRef.current;
    if (seq.length > 0) {
      const barDuration = (60 / bpm) * 4; // 4/4 time
      const currentBar = Math.floor(elapsed / barDuration);
      let cumBars = 0;
      let activeScene: SceneSettings | null = null;
      let sceneIdx = 0;
      for (let i = 0; i < seq.length; i++) {
        cumBars += seq[i].durationBars;
        if (currentBar < cumBars) { activeScene = seq[i]; sceneIdx = i; break; }
      }
      // After all scenes end — hold the last scene
      if (!activeScene) { activeScene = seq[seq.length - 1]; sceneIdx = seq.length - 1; }

      // Detect scene change → start transition + update display ref + timeline
      if (activeScene !== lastActiveSceneRef.current) {
        const prevScene = lastActiveSceneRef.current;
        lastActiveSceneRef.current = activeScene;
        if (prevScene) {
          sceneTransitionRef.current = {
            fromScene: prevScene,
            startedAt: performance.now(),
            durationMs: 2400, // 2.4 s smooth crossfade
          };
        }
        activeSceneDisplayRef.current = {
          label: activeScene.label ?? `SCENE ${sceneIdx + 1}`,
          changedAt: performance.now(),
        };
        setActiveSceneIdx(sceneIdx);
      }

      const { durationBars: _d, label: _l, ...sceneOverrides } = activeScene;
      activeOverrides = { ...showOverridesRef.current, ...sceneOverrides };

      // ── Transition blending: smoothly interpolate numeric + discrete params ──
      const tr = sceneTransitionRef.current;
      if (tr) {
        const rawT = Math.min(1, (performance.now() - tr.startedAt) / tr.durationMs);
        if (rawT >= 1) {
          sceneTransitionRef.current = null;
        } else {
          // Ease in-out cubic
          const t = rawT < 0.5 ? 4 * rawT ** 3 : 1 - (-2 * rawT + 2) ** 3 / 2;
          const { durationBars: _fd, label: _fl, ...from } = tr.fromScene;
          const lp = (a: number, b: number, dflt: number) =>
            (a ?? dflt) + ((b ?? dflt) - (a ?? dflt)) * t;
          // Swap discrete string/bool values at the midpoint
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sw = <T,>(a: T, b: T): T => (t < 0.5 ? a : b);
          activeOverrides = {
            ...activeOverrides,
            // Numeric — continuously lerped
            colorIntensity: lp(from.colorIntensity ?? 1,   activeOverrides.colorIntensity ?? 1,   1),
            movementSpeed:  lp(from.movementSpeed  ?? 1,   activeOverrides.movementSpeed  ?? 1,   1),
            bassThreshold:  lp(from.bassThreshold  ?? 0.4, activeOverrides.bassThreshold  ?? 0.4, 0.4),
            // Discrete — switch at t=0.5 so each half belongs fully to one scene
            movementStyle:   sw(from.movementStyle   ?? "lissajous", activeOverrides.movementStyle   ?? "lissajous"),
            animationStyle:  sw(from.animationStyle  ?? "none",      activeOverrides.animationStyle  ?? "none"),
            patternComplexity: sw(from.patternComplexity ?? "medium",  activeOverrides.patternComplexity ?? "medium"),
            strobeEnabled:   sw(from.strobeEnabled  ?? false, activeOverrides.strobeEnabled  ?? false),
            gratingEnabled:  sw(from.gratingEnabled ?? false, activeOverrides.gratingEnabled ?? false),
            zoomEnabled:     sw(from.zoomEnabled    ?? false, activeOverrides.zoomEnabled    ?? false),
            textEnabled:     sw(from.textEnabled    ?? false, activeOverrides.textEnabled    ?? false),
            textContent:     sw(from.textContent    ?? "",    activeOverrides.textContent    ?? ""),
          };
        }
      }
    }

    const result = engineRef.current.compute({ bass, mid, high, bpm, timeS: elapsed }, activeOverrides);
    setDmxOutput(result.channels);
    visualStateRef.current = result.visualState;

    if (writerRef.current) {
      try {
        const ch = result.channels;
        let packet: Uint8Array;
        if (dmxCableTypeRef.current === "enttec-pro") {
          // ENTTEC DMX USB Pro / SoundSwitch protocol:
          // [0x7E] [label=6] [len_lsb] [len_msb] [0x00=start_code] [ch...] [0xE7]
          const dataLen = ch.length + 1; // +1 for the DMX start code byte
          packet = new Uint8Array(5 + ch.length + 1);
          packet[0] = 0x7E;                   // SOM
          packet[1] = 0x06;                   // Label: Send DMX Packet Request
          packet[2] = dataLen & 0xFF;         // Length LSB
          packet[3] = (dataLen >> 8) & 0xFF;  // Length MSB
          packet[4] = 0x00;                   // DMX start code
          for (let i = 0; i < ch.length; i++) packet[5 + i] = ch[i];
          packet[5 + ch.length] = 0xE7;       // EOM
        } else {
          // Generic Open DMX: raw 250kbps — start code + channel data
          packet = new Uint8Array(ch.length + 1);
          packet[0] = 0x00;
          for (let i = 0; i < ch.length; i++) packet[i + 1] = ch[i];
        }
        writerRef.current.write(packet);
      } catch { /* port error, ignore */ }
    }
  }, [track]);

  // ── Pause / Resume / Seek (must be after dmxLoop) ──────────────────────────
  const pausePlayback = useCallback(() => {
    if (!isPlaying || !audioCtxRef.current) return;
    const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
    pausedAtRef.current = elapsed;
    sourceNodeRef.current?.stop();
    sourceNodeRef.current?.disconnect();
    if (timerRef.current) clearInterval(timerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    setIsPlaying(false);
    setIsPaused(true);
    setIsFadingOut(false);
  }, [isPlaying]);

  const _startSourceAt = useCallback((offset: number) => {
    if (!track || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1, ctx.currentTime);
    gainNodeRef.current = gain;
    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    const safeOffset = Math.max(0, Math.min(offset, track.analysis.duration - 0.05));
    source.start(0, safeOffset);
    sourceNodeRef.current = source;
    startTimeRef.current = ctx.currentTime - safeOffset;
    setIsPlaying(true);
    setIsPaused(false);
    timerRef.current = window.setInterval(dmxLoop, 25);
    source.onended = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      setIsFadingOut(false);
      visualStateRef.current = null;
      setDmxOutput(new Array(16).fill(0));
      const nextIdx = currentTrackIdxRef.current + 1;
      if (nextIdx < setlistRef.current.length) {
        setCurrentTrackIdx(nextIdx);
        setAutoAdvancing(true);
      } else {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentFrame(0);
      }
    };
  }, [track, dmxLoop]);

  const resumePlayback = useCallback(() => {
    if (isPlaying || !isPaused) return;
    _startSourceAt(pausedAtRef.current);
  }, [isPlaying, isPaused, _startSourceAt]);

  const seekTo = useCallback((seconds: number) => {
    if (!track) return;
    const clamped = Math.max(0, Math.min(seconds, track.analysis.duration - 0.05));
    pausedAtRef.current = clamped;
    const frameIndex = Math.min(Math.floor(clamped * 40), track.analysis.bass.length - 1);
    setCurrentFrame(frameIndex);

    // Compute the show engine output at this exact frame so the preview updates immediately
    if (engineRef.current) {
      const bass = track.analysis.bass[frameIndex] || 0;
      const mid  = track.analysis.mid[frameIndex]  || 0;
      const high = track.analysis.high[frameIndex] || 0;
      const bpm  = track.analysis.bpm;
      const result = engineRef.current.compute(
        { bass, mid, high, bpm, timeS: clamped },
        showOverridesRef.current,
      );
      visualStateRef.current = result.visualState;
      setDmxOutput(result.channels);
      setCurrentEnvelopes({ bass, mid, high });
    }

    if (isPlaying) {
      sourceNodeRef.current?.stop();
      sourceNodeRef.current?.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
      _startSourceAt(clamped);
    }
  }, [track, isPlaying, _startSourceAt]);

  // Auto-advance effect: when onended increments track idx, trigger playback of new track
  useEffect(() => {
    if (autoAdvancing && track && audioCtxRef.current) {
      setAutoAdvancing(false);
      engineRef.current?.reset();
      _startSourceAt(0);
    }
  }, [autoAdvancing, track, _startSourceAt]);

  const selectedLaserChannels = laser?.channelCount ?? 16;

  return (
    <div className="min-h-screen bg-[#030305] text-zinc-300 font-mono flex flex-col">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="border-b border-zinc-900 bg-black/60 px-6 py-3 sticky top-0 z-10 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-[#00ff9d] animate-pulse" />
          <span className="text-lg font-bold tracking-widest text-white uppercase">AI LaserShow</span>
        </div>
        <div className="flex items-center gap-3">
          {port && (
            <Badge className="bg-[#00ff9d]/10 text-[#00ff9d] border border-[#00ff9d]/30 rounded-sm font-mono text-xs">
              <Usb className="w-3 h-3 mr-1" /> DMX LIVE
            </Badge>
          )}
          <Badge className={cn(
            "rounded-sm font-mono text-xs border",
            isPlaying
              ? "bg-primary/10 text-primary border-primary/30"
              : "bg-zinc-900 text-zinc-500 border-zinc-800"
          )}>
            {isPlaying ? "● SHOW LIVE" : "○ STANDBY"}
          </Badge>
          {/* Show library + save */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-zinc-500 hover:text-white gap-1.5 text-xs"
            onClick={() => setLibraryOpen(v => !v)}
          >
            <Library className="w-4 h-4" />
            Library
            {savedShows.length > 0 && (
              <span className="ml-0.5 text-[10px] bg-zinc-800 rounded-full px-1.5">{savedShows.length}</span>
            )}
          </Button>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={saveNameInput}
              onChange={e => setSaveNameInput(e.target.value)}
              placeholder="Show name…"
              className="h-8 w-32 bg-black/60 border border-zinc-800 rounded-sm px-2 text-xs text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-zinc-500 hover:text-[#00ff9d] gap-1 text-xs"
              onClick={handleSaveShow}
              disabled={!laser}
              title="Save current show"
            >
              <Save className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Show Library Drawer ────────────────────────────────────────── */}
      {libraryOpen && (
        <div className="border-b border-zinc-800 bg-[#08080f] px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-widest text-zinc-500 font-mono">Saved Shows</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-zinc-600" onClick={() => setLibraryOpen(false)}>
              <XIcon className="w-4 h-4" />
            </Button>
          </div>
          {savedShows.length === 0 ? (
            <p className="text-xs text-zinc-700">No saved shows yet. Type a name above and click save.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {savedShows.map(show => (
                <div key={show.id} className="border border-zinc-800 bg-black rounded-sm p-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-white font-bold truncate">{show.name}</p>
                      <p className="text-[10px] text-zinc-600">{show.laserBrand} {show.laserModel}</p>
                      <p className="text-[10px] text-zinc-700">{new Date(show.createdAt).toLocaleDateString()}</p>
                      {show.setlistMeta.length > 0 && (
                        <p className="text-[10px] text-zinc-600 mt-0.5">{show.setlistMeta.length} track{show.setlistMeta.length > 1 ? "s" : ""}</p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-zinc-700 hover:text-red-500 shrink-0" onClick={() => handleDeleteShow(show.id)}>
                      <XIcon className="w-3 h-3" />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-[10px] font-mono uppercase tracking-wider bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-sm w-full gap-1"
                    onClick={() => handleLoadShow(show)}
                  >
                    <ChevronRight className="w-3 h-3" /> Load
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <main className="flex-1 flex flex-col p-4 gap-4 max-w-[1400px] mx-auto w-full">

        {/* ── Top Row: Laser Config + Music ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Laser Configuration Panel */}
          <Card className="border-zinc-800/60 bg-[#08080f] shadow-xl">
            <CardHeader className="pb-3 pt-4 px-5">
              <CardTitle className="text-sm uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#00ff9d]" /> Laser Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              {/* Brand + Model selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600">Brand</label>
                  <Select value={selectedBrand} onValueChange={handleBrandChange}>
                    <SelectTrigger className="bg-black border-zinc-800 text-white rounded-sm h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d0d0d] border-zinc-800 text-white">
                      {Object.keys(LASER_BRANDS).map(brand => (
                        <SelectItem key={brand} value={brand} className="text-sm">{brand}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600">Model</label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="bg-black border-zinc-800 text-white rounded-sm h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d0d0d] border-zinc-800 text-white">
                      {LASER_DATABASE.filter(l => l.brand === selectedBrand).map(l => (
                        <SelectItem key={l.id} value={l.model} className="text-sm">{l.model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Capability badges */}
              {laser && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge className="bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-sm text-[10px]">
                      {laser.channelCount}ch DMX
                    </Badge>
                    <Badge className="bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-sm text-[10px]">
                      {laser.maxPowerMw >= 1000 ? `${laser.maxPowerMw / 1000}W` : `${laser.maxPowerMw}mW`}
                    </Badge>
                    <Badge className="bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-sm text-[10px]">
                      {laser.scanAngleDeg}° scan
                    </Badge>
                    <Badge className="bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-sm text-[10px]">
                      {laser.builtInPatterns} patterns
                    </Badge>
                    <Badge className={cn("rounded-sm text-[10px] border", {
                      "bg-green-900/30 border-green-700/50 text-green-400": laser.scanTier === "pro",
                      "bg-blue-900/30 border-blue-700/50 text-blue-400":  laser.scanTier === "fast",
                      "bg-yellow-900/30 border-yellow-700/50 text-yellow-400": laser.scanTier === "mid",
                      "bg-zinc-900 border-zinc-700 text-zinc-400": laser.scanTier === "budget",
                    })}>
                      {laser.scanTier.toUpperCase()} SCAN
                    </Badge>
                    <Badge className="bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-sm text-[10px]">
                      {laser.colorMode.toUpperCase()}
                    </Badge>
                  </div>

                  {/* Color swatches */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Colors:</span>
                    <div className="flex gap-1">
                      {laser.availableColors.map((c, i) => (
                        <div
                          key={i}
                          title={c}
                          className="w-4 h-4 rounded-full border border-zinc-800"
                          style={{ backgroundColor: colorNameToHex(c) }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-zinc-600 truncate">
                      {laser.availableColors.join(" · ")}
                    </span>
                  </div>

                  {/* AI Show Director chat */}
                  <ShowChat
                    laser={laser}
                    overrides={showOverrides}
                    onOverridesChange={applyOverrides}
                    track={track}
                    currentEnvelopes={currentEnvelopes}
                    isPlaying={isPlaying}
                    messages={chatMessages}
                    onMessagesChange={setChatMessages}
                  />

                  {/* DMX connect */}
                  {webSerialSupported && (
                    <div className="space-y-2">
                      {/* Cable type selector — only show when not connected */}
                      {!port && (
                        <div className="flex rounded-sm border border-zinc-800 overflow-hidden text-[10px]">
                          <button
                            onClick={() => setDmxCableType("enttec-pro")}
                            className={cn(
                              "flex-1 px-2 py-1.5 transition-colors",
                              dmxCableType === "enttec-pro"
                                ? "bg-[#00ff9d]/10 text-[#00ff9d] border-r border-[#00ff9d]/20"
                                : "text-zinc-600 hover:text-zinc-400 border-r border-zinc-800"
                            )}
                          >
                            ENTTEC Pro / SoundSwitch
                          </button>
                          <button
                            onClick={() => setDmxCableType("raw")}
                            className={cn(
                              "flex-1 px-2 py-1.5 transition-colors",
                              dmxCableType === "raw"
                                ? "bg-[#00ff9d]/10 text-[#00ff9d]"
                                : "text-zinc-600 hover:text-zinc-400"
                            )}
                          >
                            Generic USB-DMX
                          </button>
                        </div>
                      )}
                      <Button
                        onClick={connectPort}
                        variant="outline"
                        size="sm"
                        className={cn(
                          "w-full border-zinc-800 text-zinc-400 hover:text-white rounded-sm text-xs",
                          port && "border-[#00ff9d]/40 text-[#00ff9d]"
                        )}
                      >
                        <Usb className="w-3 h-3 mr-1.5" />
                        {port
                          ? `DMX Connected · ${dmxCableType === "enttec-pro" ? "ENTTEC Pro" : "Raw 250k"}`
                          : "Connect DMX Hardware"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Music Panel */}
          <Card className="border-zinc-800/60 bg-[#08080f] shadow-xl">
            <CardHeader className="pb-3 pt-4 px-5">
              <CardTitle className="text-sm uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Music className="w-4 h-4 text-primary" /> Music
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              {setlist.length === 0 ? (
                <label
                  className={cn(
                    "border-2 border-dashed rounded-sm flex flex-col items-center justify-center gap-3 cursor-pointer transition-all p-10",
                    isDragOver
                      ? "border-primary/70 bg-primary/5"
                      : "border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900/30",
                    isAnalyzing && "opacity-60 pointer-events-none"
                  )}
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={onFileDrop}
                  data-testid="dropzone-audio"
                >
                  <input
                    type="file"
                    className="hidden"
                    accept=".mp3,.wav,.ogg,.flac"
                    multiple
                    onChange={onFileInput}
                  />
                  <Upload className={cn("w-8 h-8", isDragOver ? "text-primary" : "text-zinc-600")} />
                  <div className="text-center">
                    <p className="text-sm font-bold text-zinc-300">
                      {isAnalyzing ? "ANALYZING TRACK…" : "DROP MUSIC HERE"}
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">MP3, WAV, OGG, FLAC — drop multiple for a setlist</p>
                    <p className="text-xs text-zinc-700 mt-0.5">or click to browse</p>
                  </div>
                </label>
              ) : (
                <div className="space-y-4">
                  {/* Setlist */}
                  {setlist.length > 1 && (
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5">Setlist</div>
                      {setlist.map((t, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer transition-colors text-xs",
                            i === currentTrackIdx
                              ? "bg-primary/10 border border-primary/30 text-primary"
                              : "bg-zinc-900/50 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                          )}
                          onClick={() => {
                            if (!isPlaying) setCurrentTrackIdx(i);
                          }}
                        >
                          <span className="w-4 text-center font-mono shrink-0">
                            {i === currentTrackIdx && isPlaying ? "▶" : `${i + 1}`}
                          </span>
                          <span className="truncate flex-1">{t.filename}</span>
                          <span className="text-[10px] text-zinc-600 shrink-0">{formatDuration(t.analysis.duration)}</span>
                          <button
                            onClick={e => { e.stopPropagation(); removeTrackFromSetlist(i); }}
                            className="text-zinc-700 hover:text-red-500 shrink-0 ml-1"
                          >
                            <XIcon className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Current track info */}
                  <div className="bg-black border border-zinc-800 rounded-sm p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white truncate">{track?.filename}</span>
                      <Badge className="bg-primary/20 text-primary border-none rounded-sm text-xs shrink-0">
                        {track?.analysis.bpm} BPM
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="text-zinc-600 uppercase tracking-wider text-[10px]">Duration</div>
                        <div className="text-zinc-300">{track ? formatDuration(track.analysis.duration) : "--"}</div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-zinc-600 uppercase tracking-wider text-[10px]">Progress</div>
                        <div className="text-zinc-300 font-mono">{formatDuration(currentFrame / 40)}</div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-zinc-600 uppercase tracking-wider text-[10px]">Status</div>
                        <div className={isPlaying ? "text-[#00ff9d]" : "text-zinc-500"}>
                          {isPlaying ? "● LIVE" : "○ READY"}
                        </div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-none"
                        style={{ width: track ? `${(currentFrame / 40 / track.analysis.duration) * 100}%` : "0%" }}
                      />
                    </div>
                  </div>

                  {/* Add more tracks */}
                  <label
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 border border-dashed border-zinc-800 rounded-sm cursor-pointer text-xs text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 transition-colors",
                      isAnalyzing && "opacity-60 pointer-events-none"
                    )}
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={onFileDrop}
                  >
                    <input type="file" className="hidden" accept=".mp3,.wav,.ogg,.flac" multiple onChange={onFileInput} />
                    <Plus className="w-3 h-3" />
                    {isAnalyzing ? "Analyzing…" : "Add more tracks to setlist"}
                  </label>

                  {/* Envelope meters */}
                  <div className="grid grid-cols-3 gap-2">
                    <Meter label="BASS" value={currentEnvelopes.bass} color="#ff3300" />
                    <Meter label="MID"  value={currentEnvelopes.mid}  color="#00ff9d" />
                    <Meter label="HIGH" value={currentEnvelopes.high} color="#aa44ff" />
                  </div>

                  {/* Primary play/stop + eject */}
                  <div className="flex gap-2">
                    <Button
                      onClick={togglePlayback}
                      className={cn(
                        "flex-1 h-12 font-bold uppercase tracking-wider rounded-sm transition-all",
                        isPlaying
                          ? "bg-red-600 hover:bg-red-700 text-white"
                          : "bg-primary hover:bg-primary/90 text-black"
                      )}
                      data-testid="button-play-stop"
                    >
                      {isPlaying
                        ? <><Square className="w-4 h-4 mr-2 fill-current" /> Stop</>
                        : <><Play  className="w-4 h-4 mr-2 fill-current" /> Play Show</>
                      }
                    </Button>
                    <Button
                      variant="outline"
                      onClick={clearSetlist}
                      className="h-12 px-4 border-zinc-800 text-zinc-500 hover:text-white rounded-sm"
                      title="Clear setlist"
                    >
                      <XIcon className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Transition controls — visible when a track is loaded */}
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fadeIn(3)}
                      disabled={!isPlaying || isFadingOut}
                      className="h-9 border-zinc-800 text-zinc-400 hover:text-[#00ff9d] hover:border-[#00ff9d]/40 rounded-sm text-[11px] font-mono uppercase tracking-wider"
                      title="Fade volume in over 3 s"
                    >
                      <TrendingUp className="w-3 h-3 mr-1.5" /> Fade In
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fadeOut(3)}
                      disabled={!isPlaying || isFadingOut}
                      className={cn(
                        "h-9 border-zinc-800 rounded-sm text-[11px] font-mono uppercase tracking-wider",
                        isFadingOut
                          ? "text-yellow-400 border-yellow-600/40 animate-pulse"
                          : "text-zinc-400 hover:text-yellow-400 hover:border-yellow-600/40"
                      )}
                      title="Fade volume out over 3 s then stop"
                    >
                      <TrendingDown className="w-3 h-3 mr-1.5" />
                      {isFadingOut ? "Fading…" : "Fade Out"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cutNow}
                      disabled={!isPlaying}
                      className="h-9 border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-600/40 rounded-sm text-[11px] font-mono uppercase tracking-wider"
                      title="Hard cut — stop immediately"
                    >
                      <Scissors className="w-3 h-3 mr-1.5" /> Cut
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Laser Show Preview Canvas ───────────────────────────────── */}
        <Card className="border-zinc-800/60 bg-black shadow-2xl" style={{ minHeight: 340, flex: 1 }}>
          {/* Canvas header — explains the live state machine */}
          <div className="border-b border-zinc-900 px-5 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[#00ff9d]" />
              <span className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold">
                {isPlaying ? "Show Output" : "Show Design Canvas"}
              </span>
            </div>
            <span className="text-[10px] text-zinc-600 font-mono">
              {isPlaying
                ? "● Music-reactive DMX · same output goes to laser hardware"
                : laser
                  ? "Chat with AI Director to design · drop music + Play Show to go live"
                  : "Select a laser to begin designing"}
            </span>
          </div>
          <CardContent className="p-0" style={{ height: "calc(100% - 41px)" }}>
            <LaserCanvas
              visualStateRef={visualStateRef}
              isPlaying={isPlaying}
              laser={laser}
              analyser={analyserRef.current}
              activeSceneDisplayRef={activeSceneDisplayRef}
              sceneTransitionRef={sceneTransitionRef}
            />
          </CardContent>
        </Card>

        {/* ── Scene Sequence Timeline ──────────────────────────────────── */}
        {showSequence.length > 0 && (
          <div className="border border-zinc-800/60 rounded-lg bg-[#08080f] px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3 h-3 text-[#00ff9d]" />
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Show Sequence · {showSequence.length} scenes · auto-advances during playback</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {showSequence.map((scene, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-sm border font-mono text-[10px] uppercase tracking-wider transition-all",
                    i === activeSceneIdx
                      ? "border-[#00ff9d]/60 bg-[#00ff9d]/10 text-[#00ff9d]"
                      : "border-zinc-800 text-zinc-600"
                  )}
                >
                  {i === activeSceneIdx && <span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d] animate-pulse" />}
                  <span>{scene.label ?? `Scene ${i + 1}`}</span>
                  <span className="text-zinc-700">{scene.durationBars}b</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Show Timeline / Scrubber ─────────────────────────────────── */}
        {track && (
          <div className="border border-zinc-800/60 rounded-lg bg-[#08080f] px-5 py-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Show Timeline</span>
              </div>
              <span className="text-[10px] text-zinc-700">Pause &amp; scrub · copy a timestamp · paste it into the AI chat</span>
            </div>

            {/* Scrub bar */}
            <div className="relative">
              <input
                type="range"
                min={0}
                max={track.analysis.duration}
                step={0.05}
                value={currentFrame / 40}
                onChange={e => seekTo(parseFloat(e.target.value))}
                className="w-full h-2 cursor-pointer rounded-full appearance-none bg-zinc-900"
                style={{ accentColor: "#00ff9d" }}
              />
              {/* tick marks every 30 s */}
              <div className="absolute top-4 left-0 right-0 flex justify-between pointer-events-none">
                {Array.from({ length: Math.floor(track.analysis.duration / 30) + 1 }).map((_, i) => {
                  const pct = (i * 30 / track.analysis.duration) * 100;
                  if (pct > 100) return null;
                  return (
                    <div key={i} className="absolute flex flex-col items-center" style={{ left: `${pct}%`, transform: "translateX(-50%)" }}>
                      <div className="w-px h-1.5 bg-zinc-700" />
                      <span className="text-[9px] text-zinc-600 mt-0.5 font-mono">{formatDuration(i * 30)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-3 mt-5">
              {/* Pause / Resume */}
              {isPlaying ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={pausePlayback}
                  className="h-9 px-4 border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 rounded-sm font-mono text-xs uppercase tracking-wider"
                >
                  <Pause className="w-3.5 h-3.5 mr-1.5 fill-current" /> Pause
                </Button>
              ) : isPaused ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resumePlayback}
                  className="h-9 px-4 border-[#00ff9d]/40 text-[#00ff9d] hover:bg-[#00ff9d]/10 rounded-sm font-mono text-xs uppercase tracking-wider"
                >
                  <Play className="w-3.5 h-3.5 mr-1.5 fill-current" /> Resume
                </Button>
              ) : null}

              {/* Big timestamp */}
              <div className="flex items-baseline gap-1.5 flex-1">
                <span className="font-mono text-3xl font-bold text-[#00ff9d] tabular-nums tracking-tight leading-none">
                  {formatTimestamp(currentFrame / 40)}
                </span>
                <span className="font-mono text-sm text-zinc-600 tabular-nums">
                  / {formatTimestamp(track.analysis.duration)}
                </span>
              </div>

              {/* Copy timestamp button */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const ts = formatTimestamp(currentFrame / 40);
                  navigator.clipboard.writeText(`at ${ts}`).catch(() => {});
                  setCopiedTs(true);
                  setTimeout(() => setCopiedTs(false), 1800);
                }}
                className={cn(
                  "h-9 px-3 rounded-sm font-mono text-xs uppercase tracking-wider transition-colors",
                  copiedTs
                    ? "border-[#00ff9d]/50 text-[#00ff9d] bg-[#00ff9d]/10"
                    : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
                )}
                title='Copy "at MM:SS.cc" to clipboard — paste into AI chat'
              >
                <Copy className="w-3 h-3 mr-1.5" />
                {copiedTs ? "Copied!" : "Copy timestamp"}
              </Button>

              {/* BPM badge */}
              <Badge className="bg-zinc-900 border border-zinc-700 text-zinc-400 rounded-sm font-mono text-[10px]">
                {track.analysis.bpm} BPM
              </Badge>
            </div>
          </div>
        )}

        {/* ── DMX Channel Grid (collapsible) ──────────────────────────── */}
        <div className="border border-zinc-800/60 rounded-lg bg-[#08080f] overflow-hidden">
          <button
            onClick={() => setDmxExpanded(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-zinc-900/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-zinc-500 font-bold">DMX Output</span>
              <Badge variant="outline" className="text-zinc-600 border-zinc-800 rounded-sm font-mono text-[10px]">
                {selectedLaserChannels} CH
              </Badge>
            </div>
            {dmxExpanded ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
          </button>
          {dmxExpanded && (
            <div className="px-5 pb-4">
              <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-16 gap-2">
                {dmxOutput.slice(0, selectedLaserChannels).map((val, idx) => {
                  const chDef = laser?.channelMap[idx];
                  return (
                    <div key={idx} className="bg-black border border-zinc-900 rounded-sm p-2 flex flex-col gap-1">
                      <div className="flex justify-between items-center text-[9px] text-zinc-600 font-bold">
                        <span>CH{idx + 1}</span>
                        <span className="text-white">{val}</span>
                      </div>
                      <div className="text-[9px] text-zinc-500 truncate leading-tight" title={chDef?.name}>
                        {chDef?.name ?? "—"}
                      </div>
                      <div className="h-0.5 bg-zinc-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-zinc-400 transition-all duration-75"
                          style={{ width: `${(val / 255) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      {/* ── Download footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-800/40 mt-2 px-6 py-4 flex items-center justify-between">
        <span className="text-[11px] text-zinc-700">AI LaserShow Desktop — real DMX512 output via USB serial</span>
        <a
          href="https://github.com/tnelson933p/ai-laser-show-creation/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-sm text-[12px] text-zinc-300 hover:text-[#00ff9d] hover:border-[#00ff9d]/40 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          Download Desktop App
        </a>
      </footer>

      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Show Director — ShowChat component
// ─────────────────────────────────────────────────────────────────────────────
function parseSettingsBlock(text: string): { display: string; settings: ShowOverrides | null } {
  const match = text.match(/<settings>([\s\S]*?)<\/settings>/);
  if (!match) {
    console.debug("[ShowChat] No <settings> block found in AI response. Raw tail:", text.slice(-200));
    return { display: text, settings: null };
  }
  try {
    const settings = JSON.parse(match[1]) as ShowOverrides;
    console.debug("[ShowChat] Settings parsed OK:", settings);
    return { display: text.replace(/<settings>[\s\S]*?<\/settings>/, "").trim(), settings };
  } catch (e) {
    console.warn("[ShowChat] <settings> block found but JSON is invalid:", match[1], e);
    return { display: text.replace(/<settings>[\s\S]*?<\/settings>/, "").trim(), settings: null };
  }
}

function ShowChat({
  laser,
  overrides,
  onOverridesChange,
  track,
  currentEnvelopes,
  isPlaying,
  messages,
  onMessagesChange,
}: {
  laser: LaserModel;
  overrides: ShowOverrides;
  onOverridesChange: (o: ShowOverrides) => void;
  track: TrackData | null;
  currentEnvelopes: { bass: number; mid: number; high: number };
  isPlaying: boolean;
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
}) {
  const setMessages = onMessagesChange;
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  };

  const send = async () => {
    if (!input.trim() || streaming) return;
    const userText = input.trim();
    setInput("");

    const userMsg: ChatMessage = { role: "user", content: userText, displayContent: userText };
    const updatedMsgs = [...messages, userMsg];
    setMessages(updatedMsgs);
    setStreaming(true);

    const placeholderIdx = updatedMsgs.length;
    setMessages(prev => [...prev, { role: "assistant", content: "", displayContent: "" }]);
    scrollToBottom();

    let accumulated = "";

    try {
      // Build music context from analysis data so AI can make music-aware decisions
      const musicContext = track ? (() => {
        const avg = (a: ArrayLike<number>) => a.length ? Array.from(a).reduce((s, v) => s + v, 0) / a.length : 0;
        return {
          filename: track.filename,
          bpm: track.analysis.bpm,
          duration: track.analysis.duration,
          isPlaying,
          avgBass: avg(track.analysis.bass),
          avgMid:  avg(track.analysis.mid),
          avgHigh: avg(track.analysis.high),
        };
      })() : undefined;

      const resp = await fetch("/api/laser/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          laser: {
            brand: laser.brand,
            model: laser.model,
            channelCount: laser.channelCount,
            colorMode: laser.colorMode,
            scanTier: laser.scanTier,
            availableColors: laser.availableColors,
            specialFeatures: laser.specialFeatures,
          },
          messages: updatedMsgs.map(m => ({ role: m.role, content: m.content })),
          currentSettings: overrides,
          musicContext,
        }),
      });

      if (!resp.ok || !resp.body) throw new Error("no body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6)) as { content?: string; done?: boolean; error?: string };
            if (data.error) {
              accumulated = `[AI unavailable: ${data.error}]`;
              setMessages(prev => {
                const next = [...prev];
                next[placeholderIdx] = { role: "assistant", content: accumulated, displayContent: accumulated };
                return next;
              });
            } else if (data.content) {
              accumulated += data.content;
              const { display } = parseSettingsBlock(accumulated);
              setMessages(prev => {
                const next = [...prev];
                next[placeholderIdx] = { role: "assistant", content: accumulated, displayContent: display || accumulated };
                return next;
              });
              scrollToBottom();
            }
          } catch { /* skip */ }
        }
      }

      // Final pass — parse and apply settings
      console.debug("[ShowChat] Full accumulated response:", accumulated);
      const { display, settings } = parseSettingsBlock(accumulated);
      const finalDisplay = display || accumulated;

      // If stream closed with no content at all, show a fallback so "thinking…" never sticks
      if (!accumulated) {
        setMessages(prev => {
          const next = [...prev];
          next[placeholderIdx] = { role: "assistant", content: "No response.", displayContent: "AI returned no response. Please try again." };
          return next;
        });
      } else if (settings) {
        console.debug("[ShowChat] Applying overrides:", settings);
        const merged = { ...overrides, ...settings };
        onOverridesChange(merged);
        setMessages(prev => {
          const next = [...prev];
          next[placeholderIdx] = { role: "assistant", content: accumulated, displayContent: finalDisplay, settingsApplied: settings };
          return next;
        });
      } else {
        setMessages(prev => {
          const next = [...prev];
          next[placeholderIdx] = { role: "assistant", content: accumulated, displayContent: finalDisplay };
          return next;
        });
      }
    } catch {
      setMessages(prev => {
        const next = [...prev];
        next[placeholderIdx] = { role: "assistant", content: "Connection error.", displayContent: "Connection error — check the API server." };
        return next;
      });
    } finally {
      setStreaming(false);
      scrollToBottom();
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const activeCount = Object.keys(overrides).length;

  return (
    <div className="bg-black/60 border border-zinc-800/60 rounded-sm flex flex-col" style={{ minHeight: 220 }}>
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800/60 flex-shrink-0">
        <Cpu className="w-3 h-3 text-[#00ff9d]" />
        <span className="text-[10px] text-[#00ff9d] uppercase tracking-widest font-bold">AI Show Director</span>
        {activeCount > 0 && (
          <span className="ml-auto text-[9px] text-[#00ff9d]/50 border border-[#00ff9d]/20 rounded px-1.5 py-0.5">
            {activeCount} override{activeCount > 1 ? "s" : ""} active
          </span>
        )}
        {activeCount > 0 && (
          <button
            onClick={() => onOverridesChange({})}
            className="text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors ml-1"
            title="Reset all AI overrides"
          >
            reset
          </button>
        )}
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2" style={{ minHeight: 120, maxHeight: 240 }}>
        {messages.length === 0 && (
          <p className="text-[11px] leading-relaxed text-zinc-600 italic px-1 pt-1">
            {laser.strategy.notes}
            <br /><br />
            <span className="not-italic text-zinc-700">Try: "make the bass more aggressive" · "kill the strobe" · "slow it down and make it hypnotic" · "keep it simple"</span>
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={cn(
              "max-w-[88%] rounded px-2.5 py-1.5 text-[11px] leading-relaxed",
              msg.role === "user"
                ? "bg-zinc-800 text-zinc-200"
                : "bg-zinc-900/80 border border-zinc-800 text-zinc-300"
            )}>
              {msg.displayContent
                ? msg.displayContent
                : <span className="text-zinc-600 animate-pulse">thinking…</span>
              }
              {msg.settingsApplied && Object.keys(msg.settingsApplied).length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-zinc-800 text-[9px] text-[#00ff9d]/60">
                  ✓ Updated: {Object.keys(msg.settingsApplied).join(", ")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input row */}
      <div className="flex gap-1.5 px-2 pb-2 pt-1 flex-shrink-0 border-t border-zinc-900">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={streaming ? "waiting for response…" : "Tell the AI what to change or keep…"}
          disabled={streaming}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-[#00ff9d]/30 disabled:opacity-40 transition-colors"
        />
        <button
          onClick={send}
          disabled={!input.trim() || streaming}
          className="px-2.5 py-1.5 text-[11px] border border-zinc-700 rounded-sm text-zinc-500 hover:text-[#00ff9d] hover:border-[#00ff9d]/40 disabled:opacity-25 transition-colors"
        >
          {streaming ? "…" : "↵"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Laser Show Canvas Renderer
// ─────────────────────────────────────────────────────────────────────────────
interface LaserCanvasProps {
  visualStateRef: React.MutableRefObject<VisualState | null>;
  isPlaying: boolean;
  laser: LaserModel | null;
  analyser: AnalyserNode | null;
  activeSceneDisplayRef: React.MutableRefObject<{ label: string; changedAt: number } | null>;
  sceneTransitionRef: React.MutableRefObject<{ fromScene: SceneSettings; startedAt: number; durationMs: number } | null>;
}

function LaserCanvas({ visualStateRef, isPlaying, laser, analyser, activeSceneDisplayRef, sceneTransitionRef }: LaserCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const trailBufferRef = useRef<ImageData | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width;
      const H = canvas.height;
      const vs = visualStateRef.current;

      // ── Background with motion blur/trail ─────────────────────────
      // During a transition: reduce alpha so old trails "ghost" longer,
      // creating a natural visual crossfade between scenes.
      let trailAlpha = 0.18;
      const trTr = sceneTransitionRef.current;
      if (trTr && isPlaying) {
        const rawTr = Math.min(1, (performance.now() - trTr.startedAt) / trTr.durationMs);
        // Bell-shaped alpha reduction — deepest ghost at midpoint (rawTr=0.5)
        const ghostDepth = Math.sin(rawTr * Math.PI); // 0 → 1 → 0
        trailAlpha = 0.18 - ghostDepth * 0.13; // bottoms out at 0.05
      }
      ctx.globalAlpha = trailAlpha;
      ctx.fillStyle = "#000008";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;

      if (!vs) {
        // No show playing — fully dark canvas, nothing animating
        ctx.fillStyle = "#000008";
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, W, H);
        return;
      }

      // ── Live show rendering ───────────────────────────────────────
      const cx = W / 2;
      const cy = H / 2;
      const animOffset = performance.now() / 1000;

      // Strobe: full white flash on strobe frames — very visible
      if (vs.strobe && Math.random() > 0.35) {
        ctx.globalAlpha = 0.97;
        ctx.fillStyle = `rgb(${Math.round(vs.red * 255)},${Math.round(vs.green * 255)},${Math.round(vs.blue * 255)})`;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        return;
      }

      // Pattern position — large offset so movement style is unmistakably visible
      // xNorm/yNorm range 0–1, centered at 0.5, 35% canvas offset at extremes
      const patternX = cx + (vs.xNorm - 0.5) * W * 0.35;
      const patternY = cy + (vs.yNorm - 0.5) * H * 0.35;

      // Base radius, boosted by zoom
      const baseR = Math.min(W, H) * (0.28 + vs.zoom * 0.16);

      const r255 = Math.round(vs.red   * 255);
      const g255 = Math.round(vs.green * 255);
      const b255 = Math.round(vs.blue  * 255);
      const color = `rgb(${r255},${g255},${b255})`;

      // ── Fog / atmosphere glow ─────────────────────────────────────
      // Scales with energy — dramatic at high energy levels
      const fogGlowR = Math.min(W, H) * (0.3 + vs.energy * 0.5);
      const fogGrad = ctx.createRadialGradient(patternX, patternY, 0, patternX, patternY, fogGlowR);
      fogGrad.addColorStop(0, `rgba(${r255},${g255},${b255},${(0.04 + vs.energy * 0.08).toFixed(3)})`);
      fogGrad.addColorStop(0.5, `rgba(${r255},${g255},${b255},${(0.01 + vs.energy * 0.03).toFixed(3)})`);
      fogGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fogGrad;
      ctx.fillRect(0, 0, W, H);

      // ── Primary Lissajous — rotated by vs.rotation ───────────────
      const [a, b, delta] = LISSAJOUS_PRESETS[vs.patternIndex % LISSAJOUS_PRESETS.length];
      ctx.save();
      ctx.translate(patternX, patternY);
      ctx.rotate(vs.rotation * 0.3); // slow rotation driven by engine
      drawLissajous(ctx, 0, 0, baseR, a, b, delta, animOffset, color, vs.energy, true);

      // Mirror beam (second Lissajous slightly offset in phase) for richness
      if (vs.energy > 0.3) {
        drawLissajous(ctx, 0, 0, baseR * 0.7, a, b, delta + Math.PI * 0.25, animOffset + 0.4, color, vs.energy * 0.5, false);
      }
      ctx.restore();

      // ── Grating: fan beams spread around canvas ───────────────────
      if (vs.gratingActive) {
        const fanCount = laser?.scanTier === "pro" ? 6 : laser?.scanTier === "fast" ? 4 : 3;
        for (let i = 0; i < fanCount; i++) {
          const angle = vs.rotation + (i / fanCount) * Math.PI * 2;
          const spread = Math.min(W, H) * 0.3;
          const fanX = cx + Math.cos(angle) * spread;
          const fanY = cy + Math.sin(angle) * spread;
          const fanR = baseR * 0.45;
          const dim = 0.5 + (i % 2) * 0.25;
          drawLissajous(ctx, fanX, fanY, fanR, a, b, delta + i * 1.1, animOffset, color, vs.energy * dim, false);
        }
      }

      // ── Energy flash: color wash at peaks ────────────────────────
      if (vs.energy > 0.75) {
        const flash = (vs.energy - 0.75) / 0.25;
        ctx.globalAlpha = flash * 0.12;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.8);
        grad.addColorStop(0, color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      // ── 2D animation overlay ──────────────────────────────────────
      if (vs.animationStyle !== "none") {
        drawLaserAnimation(ctx, cx, cy, W, H, vs.animationStyle, animOffset, color, r255, g255, b255, vs.energy);
      }

      // ── Laser text overlay ────────────────────────────────────────
      // Beam traces text in the laser's current color — vector/stroke style
      if (vs.textEnabled && vs.textContent) {
        const dpr = window.devicePixelRatio;
        const text = vs.textContent.toUpperCase();
        // Scale font so text fits within 85% of canvas width
        let fontSize = Math.min(W, H) * 0.14;
        ctx.font = `900 ${fontSize}px "Arial Black", Impact, sans-serif`;
        while (ctx.measureText(text).width > W * 0.85 && fontSize > 18) {
          fontSize -= 2;
          ctx.font = `900 ${fontSize}px "Arial Black", Impact, sans-serif`;
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Scan reveal: text appears to be drawn by the beam, cycling every 2.5s
        const scanT = animOffset % 2.5;
        const revealFrac = Math.min(1, scanT / 1.2);
        const revealChars = Math.max(1, Math.ceil(text.length * revealFrac));
        const partial = text.slice(0, revealChars);

        ctx.save();
        // Outer glow — laser bloom
        ctx.shadowBlur  = 28 * dpr;
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth   = (2.8 + vs.energy * 1.5) * dpr;
        ctx.globalAlpha = 0.7 + vs.energy * 0.25;
        ctx.strokeText(partial, cx, cy);

        // Bright white core — looks like concentrated beam
        ctx.shadowBlur  = 8 * dpr;
        ctx.shadowColor = "#ffffff";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth   = 0.9 * dpr;
        ctx.globalAlpha = 0.6 + vs.energy * 0.35;
        ctx.strokeText(partial, cx, cy);

        // Scan cursor dot — trailing bright point
        if (revealFrac < 1) {
          const metrics = ctx.measureText(partial);
          const cursorX = cx - ctx.measureText(text).width / 2 + metrics.width;
          ctx.beginPath();
          ctx.arc(cursorX, cy, 4 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.shadowBlur = 16 * dpr;
          ctx.shadowColor = color;
          ctx.globalAlpha = 1;
          ctx.fill();
        }
        ctx.restore();
      }

      // ── Scene transition visual effects ──────────────────────────────
      const canvasTr = sceneTransitionRef.current;
      if (canvasTr && isPlaying) {
        const rawTr = Math.min(1, (performance.now() - canvasTr.startedAt) / canvasTr.durationMs);
        // Ease in-out cubic for smooth feel
        const eTr = rawTr < 0.5 ? 4 * rawTr ** 3 : 1 - (-2 * rawTr + 2) ** 3 / 2;

        // ① Expanding shockwave ring from center ─────────────────────
        // Ring grows from r=0 to r=diag over the first 60% of the transition
        const ringProgress = Math.min(1, rawTr / 0.6);
        const diag = Math.hypot(W, H);
        const ringR = ringProgress * diag * 0.55;
        const ringAlpha = (1 - ringProgress) * 0.65; // fades as it expands
        if (ringAlpha > 0.01) {
          const grad = ctx.createRadialGradient(cx, cy, Math.max(0, ringR - 18), cx, cy, ringR + 18);
          grad.addColorStop(0,   `rgba(0,255,157,0)`);
          grad.addColorStop(0.4, `rgba(0,255,157,${ringAlpha.toFixed(3)})`);
          grad.addColorStop(0.6, `rgba(180,255,230,${(ringAlpha * 0.7).toFixed(3)})`);
          grad.addColorStop(1,   `rgba(0,255,157,0)`);
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }

        // ② Secondary inner pulse ring — slightly delayed, tighter ────
        const ring2Progress = Math.min(1, Math.max(0, (rawTr - 0.05) / 0.5));
        const ring2R = ring2Progress * diag * 0.35;
        const ring2Alpha = (1 - ring2Progress) * 0.4;
        if (ring2Progress > 0 && ring2Alpha > 0.01) {
          const g2 = ctx.createRadialGradient(cx, cy, Math.max(0, ring2R - 10), cx, cy, ring2R + 10);
          g2.addColorStop(0,   `rgba(255,120,255,0)`);
          g2.addColorStop(0.5, `rgba(255,120,255,${ring2Alpha.toFixed(3)})`);
          g2.addColorStop(1,   `rgba(255,120,255,0)`);
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          ctx.fillStyle = g2;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }

        // ③ Vignette pulse — edges briefly bloom inward then recede ───
        const vigAlpha = Math.sin(eTr * Math.PI) * 0.35;
        if (vigAlpha > 0.01) {
          const vGrad = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.2, cx, cy, diag * 0.6);
          vGrad.addColorStop(0,   `rgba(0,0,0,0)`);
          vGrad.addColorStop(0.6, `rgba(0,0,0,0)`);
          vGrad.addColorStop(1,   `rgba(0,255,157,${vigAlpha.toFixed(3)})`);
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          ctx.fillStyle = vGrad;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }

        // ④ Brief center flash at the exact moment of switch (rawTr < 0.08) ─
        if (rawTr < 0.08) {
          const flashAlpha = (1 - rawTr / 0.08) * 0.45;
          const fGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.4);
          fGrad.addColorStop(0,   `rgba(255,255,255,${flashAlpha.toFixed(3)})`);
          fGrad.addColorStop(0.5, `rgba(0,255,157,${(flashAlpha * 0.5).toFixed(3)})`);
          fGrad.addColorStop(1,   `rgba(0,0,0,0)`);
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          ctx.fillStyle = fGrad;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      }

      // ── Scene flash: name shown briefly when scene changes ───────────
      const sceneDisplay = activeSceneDisplayRef.current;
      if (sceneDisplay && isPlaying) {
        const age = performance.now() - sceneDisplay.changedAt;
        const SHOW_MS = 2200;
        if (age < SHOW_MS) {
          const dpr = window.devicePixelRatio;
          const fadeIn  = Math.min(1, age / 200);
          const fadeOut = age > SHOW_MS - 400 ? (SHOW_MS - age) / 400 : 1;
          const alpha   = fadeIn * fadeOut * 0.95;
          const fontSize = Math.min(W, H) * 0.10;
          ctx.save();
          ctx.font = `900 ${fontSize}px "Arial Black", Impact, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.shadowBlur = 30 * dpr;
          ctx.shadowColor = "#00ff9d";
          ctx.fillStyle = "#00ff9d";
          ctx.globalAlpha = alpha;
          ctx.fillText(sceneDisplay.label.toUpperCase(), cx, H * 0.12);
          ctx.restore();
        }
      }

      // State label — bottom-right corner
      {
        const fontSize = 10 * window.devicePixelRatio;
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = "right";
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = isPlaying ? "#00ff9d" : "#888888";
        const label = isPlaying ? "● LIVE — music-reactive" : "◌ DESIGN — AI settings applied";
        ctx.fillText(label, W - 12 * window.devicePixelRatio, H - 14 * window.devicePixelRatio);
        ctx.globalAlpha = 1;
      }

      // Spectrum bar at bottom (if analyser available)
      if (analyser) {
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);
        const barW = W / freqData.length;
        ctx.globalAlpha = 0.25;
        for (let i = 0; i < freqData.length; i++) {
          const barH = (freqData[i] / 255) * H * 0.08;
          const hue = (i / freqData.length) * 240;
          ctx.fillStyle = `hsl(${hue},100%,60%)`;
          ctx.fillRect(i * barW, H - barH, barW - 1, barH);
        }
        ctx.globalAlpha = 1;
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [isPlaying, laser, analyser]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="canvas-laser"
      className="w-full"
      style={{ height: "clamp(320px, 45vh, 540px)", display: "block" }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2D animation overlay helper — laser-traced shapes
// ─────────────────────────────────────────────────────────────────────────────
function drawLaserAnimation(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  W: number, H: number,
  style: string,
  t: number,
  color: string,
  r255: number, g255: number, b255: number,
  energy: number,
) {
  const dpr = window.devicePixelRatio;
  const R = Math.min(W, H) * 0.38;

  ctx.save();
  ctx.shadowBlur  = (14 + energy * 18) * dpr;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth   = (1.4 + energy * 1.0) * dpr;
  ctx.globalAlpha = 0.65 + energy * 0.3;
  ctx.lineCap = "round";

  if (style === "stars") {
    // Patriotic 5-pointed stars orbiting the canvas center
    const count = 5;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + t * 0.4;
      const orbitR = R * 0.65;
      const sx = cx + Math.cos(angle) * orbitR;
      const sy = cy + Math.sin(angle) * orbitR;
      const starR = R * (0.10 + energy * 0.06);
      ctx.beginPath();
      for (let p = 0; p < 10; p++) {
        const a = (p / 10) * Math.PI * 2 - Math.PI / 2 + t * 0.5;
        const r = p % 2 === 0 ? starR : starR * 0.42;
        const px = sx + Math.cos(a) * r;
        const py = sy + Math.sin(a) * r;
        if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // Central large star
    const bigR = R * (0.18 + energy * 0.08);
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const a = (p / 10) * Math.PI * 2 - Math.PI / 2 + t * 0.2;
      const r = p % 2 === 0 ? bigR : bigR * 0.42;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

  } else if (style === "fireworks") {
    // Radiating burst lines from multiple points
    const bursts = 3;
    const rayCount = 12;
    for (let b = 0; b < bursts; b++) {
      const bAngle = (b / bursts) * Math.PI * 2 + t * 0.3;
      const bx = cx + Math.cos(bAngle) * R * 0.4;
      const by = cy + Math.sin(bAngle) * R * 0.4;
      const phase = (t * 1.2 + b * 1.1) % 2; // 0→1 expand, 1→2 fade
      const reach = phase < 1 ? R * 0.32 * phase : R * 0.32 * (2 - phase);
      ctx.globalAlpha = phase < 1 ? 0.5 + energy * 0.4 : (2 - phase) * 0.5;
      for (let r = 0; r < rayCount; r++) {
        const a = (r / rayCount) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a) * reach, by + Math.sin(a) * reach);
        ctx.stroke();
      }
    }

  } else if (style === "wave") {
    // Sine wave beams sweeping vertically
    const waves = 3;
    for (let w = 0; w < waves; w++) {
      const yOff = ((w / waves) - 0.5) * H * 0.55;
      const freq = 3 + w;
      const amp  = H * (0.06 + energy * 0.06);
      ctx.globalAlpha = (0.4 + energy * 0.35) * (1 - w * 0.2);
      ctx.beginPath();
      for (let px = 0; px <= W; px += 4) {
        const py = cy + yOff + Math.sin((px / W) * Math.PI * 2 * freq + t * 2 + w) * amp;
        if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

  } else if (style === "spiral") {
    // Archimedean spiral expanding from center
    const turns = 4;
    const maxR  = R * 0.88;
    const phase = (t * 0.5) % 1; // continuous growth
    const steps = 400;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const a = frac * Math.PI * 2 * turns + t * 0.8;
      const r = frac * maxR;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // Second spiral, counter-rotating
    ctx.globalAlpha *= 0.5;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const a = -frac * Math.PI * 2 * turns - t * 0.8;
      const r = frac * maxR * 0.7;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Lissajous beam draw helper
// ─────────────────────────────────────────────────────────────────────────────
function drawLissajous(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number,
  a: number, b: number, delta: number,
  timeOffset: number,
  color: string,
  energy: number,
  glow: boolean
) {
  const steps = 600;
  const dpr = window.devicePixelRatio;
  ctx.save();

  if (glow) {
    ctx.shadowBlur  = (12 + energy * 20) * dpr;
    ctx.shadowColor = color;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth   = (1.2 + energy * 1.2) * dpr;
  ctx.globalAlpha = 0.55 + energy * 0.35;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 + timeOffset * 0.12;
    const x = cx + radius * Math.sin(a * t + delta);
    const y = cy + radius * Math.sin(b * t);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Bright inner core
  if (glow) {
    ctx.shadowBlur  = (4 + energy * 8) * dpr;
    ctx.lineWidth   = (0.4 + energy * 0.5) * dpr;
    ctx.globalAlpha = 0.8 + energy * 0.2;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2 + timeOffset * 0.12;
      const x = cx + radius * Math.sin(a * t + delta);
      const y = cy + radius * Math.sin(b * t);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.min(100, value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold text-zinc-500">
        <span>{label}</span>
        <span className="font-mono text-zinc-400">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-zinc-900 border border-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-75"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** MM:SS.cc — centisecond precision for AI timestamp references */
function formatTimestamp(seconds: number): string {
  const m  = Math.floor(seconds / 60);
  const s  = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

function colorNameToHex(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("red"))     return "#ff2200";
  if (n.includes("green"))   return "#00ff44";
  if (n.includes("blue"))    return "#0044ff";
  if (n.includes("yellow"))  return "#ffee00";
  if (n.includes("cyan"))    return "#00ffee";
  if (n.includes("magenta")) return "#ff00cc";
  if (n.includes("white"))   return "#ffffff";
  if (n.includes("orange"))  return "#ff8800";
  return "#888888";
}

function laserIdleColor(laser: LaserModel): string {
  if (laser.colorMode === "rg")       return "#44ff44";
  if (laser.colorMode === "rgy")      return "#ffee00";
  if (laser.colorMode === "rgb-full") return "#00ff9d";
  return "#00ff9d";
}

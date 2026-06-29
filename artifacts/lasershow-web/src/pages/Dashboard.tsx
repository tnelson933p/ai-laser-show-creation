import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { analyzeTrack } from "@/lib/audio-engine";
import { Play, Square, Upload, Usb, HardDrive, Download, Activity, AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";

// --- Types ---
type LaserProfile = "eytse-16" | "generic-7" | "custom";

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

// --- Main App Component ---
export default function Dashboard() {
  const [laserProfile, setLaserProfile] = useState<LaserProfile>("eytse-16");
  const [port, setPort] = useState<SerialPort | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);
  const [webSerialSupported, setWebSerialSupported] = useState(true);
  
  const [track, setTrack] = useState<TrackData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentEnvelopes, setCurrentEnvelopes] = useState({ bass: 0, mid: 0, high: 0 });
  const [dmxOutput, setDmxOutput] = useState<number[]>(new Array(16).fill(0));
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

  // Initialize checks
  useEffect(() => {
    if (!("serial" in navigator)) {
      setWebSerialSupported(false);
    }
    // Force dark mode
    document.documentElement.classList.add("dark");
  }, []);

  // --- Hardware Setup ---
  const connectPort = async () => {
    try {
      const selectedPort = await navigator.serial.requestPort();
      await selectedPort.open({ baudRate: 250000 });
      setPort(selectedPort);
      writerRef.current = selectedPort.writable?.getWriter() ?? null;
      setSetupComplete(true);
    } catch (err) {
      console.error("Failed to connect to serial port", err);
    }
  };

  const skipSetup = () => {
    setSetupComplete(true);
  };

  // --- Audio Engine ---
  const onFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || (!file.name.endsWith('.mp3') && !file.name.endsWith('.wav'))) {
      alert("Please drop an .mp3 or .wav file");
      return;
    }

    setIsAnalyzing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      const analysis = await analyzeTrack(audioBuffer);
      
      setTrack({
        filename: file.name,
        buffer: audioBuffer,
        analysis
      });
    } catch (err) {
      console.error("Audio processing failed", err);
      alert("Audio processing failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const togglePlayback = () => {
    if (!track || !audioCtxRef.current) return;

    if (isPlaying) {
      // Stop
      sourceNodeRef.current?.stop();
      sourceNodeRef.current?.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
      setIsPlaying(false);
      setCurrentEnvelopes({ bass: 0, mid: 0, high: 0 });
      setDmxOutput(new Array(16).fill(0));
    } else {
      // Play
      const source = audioCtxRef.current.createBufferSource();
      source.buffer = track.buffer;
      
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 128;
      analyserRef.current = analyser;
      
      source.connect(analyser);
      analyser.connect(audioCtxRef.current.destination);
      
      source.start();
      sourceNodeRef.current = source;
      startTimeRef.current = audioCtxRef.current.currentTime;
      setIsPlaying(true);
      
      // Start 40Hz Loop
      timerRef.current = window.setInterval(() => dmxLoop(), 25);
      
      source.onended = () => {
        setIsPlaying(false);
        if (timerRef.current) clearInterval(timerRef.current);
        setDmxOutput(new Array(16).fill(0));
      };
    }
  };

  // --- DMX 40Hz Loop ---
  const phaseRef = useRef(0);
  
  const dmxLoop = useCallback(() => {
    if (!track || !audioCtxRef.current) return;
    
    const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
    const frameIndex = Math.floor(elapsed * 40);
    
    if (frameIndex >= track.analysis.bass.length) {
      return; // End of track
    }

    setCurrentFrame(frameIndex);

    const bass = track.analysis.bass[frameIndex] || 0;
    const mid = track.analysis.mid[frameIndex] || 0;
    const high = track.analysis.high[frameIndex] || 0;
    const bpm = track.analysis.bpm;
    
    setCurrentEnvelopes({ bass, mid, high });

    // DMX Logic
    const channels = new Array(16).fill(0);
    phaseRef.current += (bpm / 60) * (25 / 1000) * Math.PI * 2; // radians per tick
    
    if (laserProfile === "eytse-16") {
      channels[0] = 120; // Mode
      channels[1] = mid > 0.75 ? 255 : 0; // Anim Bank
      channels[2] = (mid + high) > 1.2 ? 150 : 50; // Pattern
      channels[3] = 0;
      channels[4] = Math.floor(127 + Math.sin(phaseRef.current) * 127); // X
      channels[5] = Math.floor(127 + Math.cos(phaseRef.current) * 127); // Y
      channels[6] = Math.floor(127 + Math.sin(phaseRef.current * 0.5) * 127); // Rot
      channels[7] = 0;
      channels[8] = bass > 0.8 ? 255 : 100; // Zoom
      channels[9] = 0;
      channels[10] = high > 0.7 ? Math.floor(high * 255) : 0; // Strobe
      channels[11] = Math.floor(bass * 255); // Red
      channels[12] = Math.floor(mid * 255); // Green
      channels[13] = Math.floor(high * 255); // Blue
      channels[14] = ((bass + mid + high)/3) > 0.65 ? 180 : 0; // Grating
      channels[15] = 0;
    } else if (laserProfile === "generic-7") {
      channels[0] = 100;
      channels[1] = Math.floor((mid + high) * 0.5 * 200);
      channels[2] = high > 0.65 ? Math.floor(high * 255) : 0;
      channels[3] = bass > 0.75 ? 255 : Math.floor(100 + bass * 100);
      channels[4] = Math.floor(127 + Math.sin(phaseRef.current) * 127);
      channels[5] = Math.floor(127 + Math.cos(phaseRef.current) * 127);
      channels[6] = Math.floor(phaseRef.current * 20) % 255;
    }
    
    setDmxOutput(channels);

    // Write to serial port
    if (writerRef.current) {
      try {
        const packet = new Uint8Array(17);
        packet[0] = 0x00; // DMX Start Code
        for (let i = 0; i < 16; i++) {
          packet[i + 1] = channels[i];
        }
        writerRef.current.write(packet);
      } catch (err) {
        console.error("Failed to write to port", err);
      }
    }
  }, [track, laserProfile]);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-mono flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-black/50 p-4 sticky top-0 z-10 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-primary animate-pulse" />
            <h1 className="text-xl font-bold tracking-tight text-white uppercase">AI LaserShow</h1>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className={cn(
              "font-mono rounded-sm border-zinc-800",
              port ? "text-primary border-primary/50" : "text-zinc-500"
            )}>
              {port ? "DMX CONNECTED" : "DMX OFFLINE"}
            </Badge>
            <Badge variant="outline" className={cn(
              "font-mono rounded-sm border-zinc-800",
              isPlaying ? "text-green-400 border-green-400/50" : "text-zinc-500"
            )}>
              {isPlaying ? "ENGINE LIVE" : "ENGINE IDLE"}
            </Badge>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* Step 1: Hardware Setup */}
        {!setupComplete && (
          <Card className="border-zinc-800 bg-[#0a0a0a] shadow-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <HardDrive className="w-5 h-5" />
                Hardware Configuration
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Connect your DMX interface via Web Serial. Requires Chrome or Edge.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!webSerialSupported && (
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded text-destructive text-sm flex flex-col gap-2">
                  <p>Web Serial requires Chrome or Edge. Download the desktop app for full hardware support.</p>
                  <a href="#download" className="underline font-bold">Get Desktop App</a>
                </div>
              )}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Laser Brand</label>
                  <Select value={laserProfile} onValueChange={(v) => setLaserProfile(v as LaserProfile)}>
                    <SelectTrigger className="bg-black border-zinc-800 text-white rounded-sm h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111] border-zinc-800 text-white">
                      <SelectItem value="eytse-16">Eytse EY003-L (16-Channel Mode)</SelectItem>
                      <SelectItem value="generic-7">Generic DJ Animation Laser (7-Channel Mode)</SelectItem>
                      <SelectItem value="custom">Custom Laser Array (User-Mapped Matrix)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-4">
                  <Button 
                    onClick={connectPort} 
                    disabled={!webSerialSupported}
                    className="flex-1 h-12 bg-primary hover:bg-primary/90 text-black font-bold uppercase tracking-wider rounded-sm"
                    data-testid="button-connect-dmx"
                  >
                    <Usb className="w-5 h-5 mr-2" /> Connect DMX Port
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={skipSetup}
                    className="h-12 border-zinc-800 text-zinc-400 hover:text-white rounded-sm"
                    data-testid="button-skip-setup"
                  >
                    Skip (Visualizer Only)
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dashboard Grid */}
        {setupComplete && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Col: Audio Engine & Downloads */}
            <div className="space-y-6">
              <Card className="border-zinc-800 bg-[#0a0a0a]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <AudioLines className="w-5 h-5" />
                    Audio Engine
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!track ? (
                    <div 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={onFileDrop}
                      className={cn(
                        "border-2 border-dashed border-zinc-800 rounded-sm p-10 flex flex-col items-center justify-center gap-4 transition-colors",
                        isAnalyzing ? "opacity-50" : "hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
                      )}
                      data-testid="dropzone-audio"
                    >
                      <Upload className="w-8 h-8 text-zinc-600" />
                      <div className="text-center">
                        <p className="text-sm font-bold text-zinc-300">
                          {isAnalyzing ? "ANALYZING TRACK..." : "DRAG & DROP TRACK"}
                        </p>
                        <p className="text-xs text-zinc-600 mt-1">.mp3 or .wav only</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="p-4 bg-black border border-zinc-800 rounded-sm space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-sm font-bold text-white truncate" title={track.filename}>
                            {track.filename}
                          </p>
                          <Badge className="bg-primary/20 text-primary border-none rounded-sm whitespace-nowrap">
                            {track.analysis.bpm} BPM
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs text-zinc-500">
                          <span>{(track.analysis.duration / 60).toFixed(2)} min</span>
                          <span>40Hz ENVELOPES READY</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          onClick={togglePlayback}
                          className={cn(
                            "flex-1 h-16 text-lg font-bold uppercase rounded-sm transition-all",
                            isPlaying ? "bg-destructive hover:bg-destructive/90 text-white" : "bg-primary hover:bg-primary/90 text-black"
                          )}
                          data-testid="button-play-stop"
                        >
                          {isPlaying ? <><Square className="w-5 h-5 mr-2 fill-current" /> STOP</> : <><Play className="w-5 h-5 mr-2 fill-current" /> PLAY</>}
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => {
                            if(isPlaying) togglePlayback();
                            setTrack(null);
                            setCurrentFrame(0);
                            setDmxOutput(new Array(16).fill(0));
                          }}
                          className="h-16 w-16 border-zinc-800 text-zinc-400 hover:text-white rounded-sm"
                          data-testid="button-eject"
                          title="Eject Track"
                        >
                          <Upload className="w-5 h-5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card className="border-zinc-800 bg-[#0a0a0a]" id="download">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Download className="w-5 h-5" />
                    Desktop App
                  </CardTitle>
                  <CardDescription className="text-zinc-500 text-xs">
                    Zero latency. Native hardware access. Works without Chrome.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <a href="https://github.com/tnelson933P/ai-laser-show-creation/releases" target="_blank" rel="noreferrer" className="block">
                    <Button variant="outline" className="w-full justify-start border-zinc-800 text-zinc-300 hover:bg-zinc-900 rounded-sm">
                      Windows (.msi / .exe)
                    </Button>
                  </a>
                  <a href="https://github.com/tnelson933P/ai-laser-show-creation/releases" target="_blank" rel="noreferrer" className="block">
                    <Button variant="outline" className="w-full justify-start border-zinc-800 text-zinc-300 hover:bg-zinc-900 rounded-sm">
                      macOS Apple Silicon (.dmg)
                    </Button>
                  </a>
                  <a href="https://github.com/tnelson933P/ai-laser-show-creation/releases" target="_blank" rel="noreferrer" className="block">
                    <Button variant="outline" className="w-full justify-start border-zinc-800 text-zinc-300 hover:bg-zinc-900 rounded-sm">
                      macOS Intel (.dmg)
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </div>

            {/* Right Col: Visuals & DMX */}
            <div className="lg:col-span-2 space-y-6">
              
              <Card className="border-zinc-800 bg-[#0a0a0a]">
                <CardContent className="p-6 space-y-6">
                  {/* Spectrum Visualizer */}
                  <div className="h-48 bg-black border border-zinc-800 rounded-sm relative overflow-hidden flex items-end p-2 gap-[2px]">
                    <LiveSpectrum analyser={analyserRef.current} isPlaying={isPlaying} />
                    
                    {/* Time Progress Overlay */}
                    {track && (
                      <div className="absolute top-2 right-3 font-mono text-xs text-zinc-500">
                        {((currentFrame * 0.025) / 60).toFixed(2)} / {(track.analysis.duration / 60).toFixed(2)}
                      </div>
                    )}
                  </div>

                  {/* Envelope Meters */}
                  <div className="grid grid-cols-3 gap-4">
                    <Meter label="BASS" value={currentEnvelopes.bass} color="bg-[#ff4400]" glow="laser-glow-bass" />
                    <Meter label="MID" value={currentEnvelopes.mid} color="bg-[#00ff9d]" glow="laser-glow-mid" />
                    <Meter label="HIGH" value={currentEnvelopes.high} color="bg-[#bb00ff]" glow="laser-glow-high" />
                  </div>
                </CardContent>
              </Card>

              {/* DMX Output Grid */}
              <Card className="border-zinc-800 bg-[#0a0a0a]">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-white">DMX Output</CardTitle>
                  <Badge variant="outline" className="text-zinc-500 border-zinc-800 rounded-sm font-mono">
                    CH: {laserProfile === "generic-7" ? 7 : 16}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
                    {dmxOutput.slice(0, laserProfile === "generic-7" ? 7 : 16).map((val, idx) => (
                      <div key={idx} className="bg-black border border-zinc-800 rounded-sm p-3 flex flex-col gap-2 relative overflow-hidden group">
                        <div className="flex justify-between items-center text-[10px] text-zinc-500 font-bold">
                          <span>CH{idx + 1}</span>
                          <span className="text-white">{val}</span>
                        </div>
                        <div className="text-[10px] leading-tight text-zinc-400 truncate" title={getChannelName(laserProfile, idx)}>
                          {getChannelName(laserProfile, idx)}
                        </div>
                        {/* Tiny progress bar */}
                        <div className="h-1 bg-zinc-900 rounded-full mt-1 overflow-hidden">
                          <div 
                            className="h-full bg-zinc-500 transition-all duration-75"
                            style={{ width: `${(val / 255) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// --- Subcomponents ---

function LiveSpectrum({ analyser, isPlaying }: { analyser: AnalyserNode | null, isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!analyser || !isPlaying || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    let animationId: number;
    
    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        
        // Color gradient based on frequency
        const hue = i * (360 / bufferLength);
        ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.8)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
      }
    };
    
    draw();
    
    return () => cancelAnimationFrame(animationId);
  }, [analyser, isPlaying]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={800} 
      height={200} 
      className="absolute inset-0 w-full h-full opacity-60" 
      data-testid="canvas-spectrum"
    />
  );
}

function Meter({ label, value, color, glow }: { label: string, value: number, color: string, glow: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-bold text-zinc-500">
        <span>{label}</span>
        <span className="font-mono text-zinc-400">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-4 bg-black border border-zinc-800 rounded-sm overflow-hidden relative">
        <div 
          className={cn("absolute top-0 left-0 bottom-0 transition-all duration-75", color, pct > 50 && glow)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// --- Helpers ---

function getChannelName(profile: LaserProfile, idx: number) {
  if (profile === "eytse-16") {
    const names = [
      "Mode", "Anim Bank", "Pattern", "Pattern Sub", 
      "X-Pos", "Y-Pos", "Rotation", "Rot Sub", 
      "Zoom", "Zoom Sub", "Strobe", "Red", 
      "Green", "Blue", "Grating", "Grating Rot"
    ];
    return names[idx] || `CH${idx+1}`;
  } else if (profile === "generic-7") {
    const names = [
      "Mode", "Pattern", "Strobe", "Zoom", 
      "X-Pos", "Y-Pos", "Color"
    ];
    return names[idx] || `CH${idx+1}`;
  }
  return `CH${idx+1}`;
}

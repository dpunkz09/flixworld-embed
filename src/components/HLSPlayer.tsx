"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { proxyUrl, type StreamData, type Subtitle } from "@/lib/api";
import { loadThumbnailVTT, getThumbnailAt, type ThumbnailCue } from "@/lib/thumbnails";

interface HLSPlayerProps {
  data: StreamData;
  thumbnailsUrl?: string;
  subtitles?: Subtitle[];
  defaultSubs?: Subtitle[];
}

function formatTime(s: number): string {
  if (!s || isNaN(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "…";
  if (bytesPerSec >= 1_000_000) return `${(bytesPerSec / 1_000_000).toFixed(1)} MB/s`;
  return `${Math.round(bytesPerSec / 1_000)} KB/s`;
}

export default function HLSPlayer({ data, thumbnailsUrl, subtitles, defaultSubs }: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevVolume = useRef(1);

  // HLS state
  const [sourceIndex, setSourceIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<{ height: number; bitrate: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);

  // Playback state
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(true); // start muted for guaranteed autoplay
  const [fullscreen, setFullscreen] = useState(false);
  const [shown, setShown] = useState(true);

  // UI panels
  const [panel, setPanel] = useState<null | "settings" | "quality" | "source" | "subtitles" | "subtitle-style">(null);

  // Progress hover
  const [hoverX, setHoverX] = useState(0);
  const [hoverTime, setHoverTime] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Thumbnails
  const [thumbCues, setThumbCues] = useState<ThumbnailCue[]>([]);
  const thumbCache = useRef<Record<string, HTMLImageElement>>({});

  // Aspect ratio modes: contain (default) | fill (stretch) | 16:9 (crop) | 4:3 (crop)
  type AspectMode = "contain" | "fill" | "16:9" | "4:3";
  const aspectModes: AspectMode[] = ["contain", "fill", "16:9", "4:3"];
  const [aspectMode, setAspectMode] = useState<AspectMode>("contain");
  const cycleAspect = () => setAspectMode(m => aspectModes[(aspectModes.indexOf(m) + 1) % aspectModes.length]);

  // Buffering indicator (shown after 600ms delay)
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferPct, setBufferPct] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null); // bytes/sec
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedSampleRef = useRef<{ bytes: number; time: number } | null>(null);

  // Subtitles — unified track list built from both `subtitles` (VTT) and `default_subs` (SRT)
  interface SubTrack {
    id: string;        // unique key used as activeSubId
    label: string;     // display name
    url: string;       // fetch URL routed through our server-side proxy
    format: "vtt" | "srt";
  }

  // Build SubTrack list — merges default_subs + subtitles, both Subtitle[] with direct_download_url
  const buildSubTracks = useCallback((
    subs: Subtitle[] | undefined,
    defaults: Subtitle[] | undefined,
  ): SubTrack[] => {
    // Mirror the reference: default_subs first, then wyzie subtitles, dedupe by id
    const all = [...(defaults ?? []), ...(subs ?? [])].filter(s => Boolean(s.direct_download_url));
    const seenIds = new Set<string>();
    const langCount: Record<string, number> = {};
    const unique = all.filter(s => {
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });
    return unique.map(s => {
      const lang = s.language.toUpperCase();
      langCount[lang] = (langCount[lang] ?? 0) + 1;
      const count = langCount[lang];
      const label = count === 1 ? lang : `${lang} ${count}`;
      return {
        id: s.id,
        label,
        url: s.direct_download_url!,
        format: (s.format === "srt" ? "srt" : "vtt") as "vtt" | "srt",
      };
    });
  }, []);

  const [subTracks, setSubTracks] = useState<SubTrack[]>(() =>
    buildSubTracks(subtitles, defaultSubs)
  );

  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [subCues, setSubCues] = useState<{ start: number; end: number; text: string }[]>([]);
  const [activeCue, setActiveCue] = useState<string | null>(null);

  // Subtitle appearance
  const [subColor, setSubColor] = useState("#ffffff");
  const [subSize, setSubSize] = useState(16); // px
  const [subPosition, setSubPosition] = useState<"bottom" | "top" | "middle">("bottom");

  // ── Controls visibility ───────────────────────────────────────────────────
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShown(false);
        setPanel(null);
      }
    }, 3200);
  }, []);

  const revealControls = useCallback(() => {
    setShown(true);
    scheduleHide();
  }, [scheduleHide]);

  // ── HLS loader ────────────────────────────────────────────────────────────
  const loadSource = useCallback((idx: number) => {
    const video = videoRef.current;
    if (!video || !data.stream_urls?.[idx]) return;
    setIsLoading(true);
    setError(null);
    setLevels([]);
    setCurrentLevel(-1);
    setPlaying(false);
    hlsRef.current?.destroy();
    hlsRef.current = null;

    const src = proxyUrl(data.stream_urls[idx]);

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, backBufferLength: 60 });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_, d) => {
        setLevels(d.levels.map(l => ({ height: l.height, bitrate: l.bitrate })));
        setIsLoading(false);
        // Try normal play; if blocked by autoplay policy, fall back to muted play
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => setCurrentLevel(d.level));
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else { setError("Stream failed. Try another source."); setIsLoading(false); }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.onloadedmetadata = () => {
        setIsLoading(false);
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      };
      video.onerror = () => { setError("Stream failed."); setIsLoading(false); };
    } else {
      setError("HLS not supported in this browser.");
      setIsLoading(false);
    }
  }, [data.stream_urls]);

  useEffect(() => {
    loadSource(sourceIndex);
    return () => { hlsRef.current?.destroy(); };
  }, [sourceIndex, loadSource]);

  // Load thumbnail VTT
  useEffect(() => {
    if (!thumbnailsUrl) return;
    loadThumbnailVTT(thumbnailsUrl).then(cues => {
      setThumbCues(cues);
      if (cues.length > 0) {
        const img = new Image(); img.src = cues[0].url;
        thumbCache.current[cues[0].url] = img;
      }
    });
  }, [thumbnailsUrl]);

  // ── Subtitle loader (VTT + SRT) ──────────────────────────────────────────
  useEffect(() => {
    if (!activeSubId) { setSubCues([]); setActiveCue(null); return; }
    const track = subTracks.find(t => t.id === activeSubId);
    if (!track) return;

    const toSec = (t: string): number => {
      // Handles both HH:MM:SS.mmm (VTT) and HH:MM:SS,mmm (SRT)
      const clean = t.replace(",", ".");
      const parts = clean.split(":").map(Number);
      return parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts[0] * 60 + parts[1];
    };

    const parseVTT = (text: string) => {
      const cues: { start: number; end: number; text: string }[] = [];
      const blocks = text.replace(/\r\n/g, "\n").split(/\n\n+/);
      for (const block of blocks) {
        const lines = block.trim().split("\n");
        const timeLine = lines.find(l => l.includes("-->"));
        if (!timeLine) continue;
        const [startStr, endStr] = timeLine.split("-->").map(s => s.trim().split(" ")[0]);
        const textLines = lines.slice(lines.indexOf(timeLine) + 1)
          .join("\n")
          .replace(/<[^>]+>/g, "")   // strip inline VTT tags
          .trim();
        if (textLines) cues.push({ start: toSec(startStr), end: toSec(endStr), text: textLines });
      }
      return cues;
    };

    const parseSRT = (text: string) => {
      const cues: { start: number; end: number; text: string }[] = [];
      const blocks = text.replace(/\r\n/g, "\n").split(/\n\n+/);
      for (const block of blocks) {
        const lines = block.trim().split("\n");
        // Skip numeric sequence line
        const timeLine = lines.find(l => l.includes("-->"));
        if (!timeLine) continue;
        const [startStr, endStr] = timeLine.split("-->").map(s => s.trim());
        const textLines = lines.slice(lines.indexOf(timeLine) + 1)
          .join("\n")
          .replace(/<[^>]+>/g, "")   // strip HTML-style tags
          .trim();
        if (textLines) cues.push({ start: toSec(startStr), end: toSec(endStr), text: textLines });
      }
      return cues;
    };

    fetch(track.url)
      .then(r => r.text())
      .then(text => {
        setSubCues(track.format === "srt" ? parseSRT(text) : parseVTT(text));
      })
      .catch(() => setSubCues([]));
  }, [activeSubId, subTracks]);

  // ── Active cue tracker ────────────────────────────────────────────────────
  useEffect(() => {
    if (!subCues.length) { setActiveCue(null); return; }
    const cue = subCues.find(c => currentTime >= c.start && currentTime <= c.end);
    setActiveCue(cue ? cue.text : null);
  }, [currentTime, subCues]);

  // ── Video events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => { setPlaying(true); scheduleHide(); };
    const onPause = () => { setPlaying(false); setShown(true); if (hideTimer.current) clearTimeout(hideTimer.current); };
    const onTime = () => {
      setCurrentTime(v.currentTime);
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onDur = () => setDuration(v.duration);
    const onVol = () => { setVolume(v.volume); setMuted(v.muted); };
    const onFs = () => {
      const isFs = !!document.fullscreenElement;
      setFullscreen(isFs);
      // Unlock orientation whenever native fullscreen exits (e.g. swipe-back on mobile)
      if (!isFs) {
        try { screen.orientation.unlock(); } catch { /* not supported */ }
      }
    };

    // Buffering detection — show indicator only after 600 ms stall
    const onWaiting = () => {
      if (bufferTimer.current) clearTimeout(bufferTimer.current);
      bufferTimer.current = setTimeout(() => {
        setIsBuffering(true);
        // Snapshot current bytes for speed calc
        speedSampleRef.current = {
          bytes: performance.now(), // use time; we'll derive speed from buffered time gained
          time: performance.now(),
        };
      }, 600);
    };
    const onCanPlay = () => {
      if (bufferTimer.current) { clearTimeout(bufferTimer.current); bufferTimer.current = null; }
      setIsBuffering(false);
      setDownloadSpeed(null);
      speedSampleRef.current = null;
    };

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("volumechange", onVol);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("playing", onCanPlay);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("volumechange", onVol);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("playing", onCanPlay);
      document.removeEventListener("fullscreenchange", onFs);
      if (bufferTimer.current) clearTimeout(bufferTimer.current);
    };
  }, [scheduleHide]);

  // ── Buffering progress & speed poll ─────────────────────────────────────
  useEffect(() => {
    if (!isBuffering) return;
    const v = videoRef.current;
    if (!v) return;

    // Track buffered-ahead seconds at the start of the stall to estimate speed
    let prevBufferedEnd = 0;
    let prevPollTime = performance.now();
    if (v.buffered.length) prevBufferedEnd = v.buffered.end(v.buffered.length - 1);

    const interval = setInterval(() => {
      if (!v) return;
      const dur = v.duration || 0;
      const cur = v.currentTime;

      // Update buffer fill %
      let bufferedEnd = cur;
      if (v.buffered.length) bufferedEnd = v.buffered.end(v.buffered.length - 1);
      setBufferPct(dur > 0 ? Math.min(100, ((bufferedEnd - cur) / Math.max(1, dur - cur)) * 100) : 0);

      // Estimate speed: seconds buffered / elapsed → multiply by assumed bitrate for kbps display
      const now = performance.now();
      const elapsedSec = (now - prevPollTime) / 1000;
      const gainedSec = bufferedEnd - prevBufferedEnd;
      if (elapsedSec > 0 && gainedSec >= 0) {
        // Use HLS level bitrate if available, else assume 2 Mbps for the conversion
        const bitrate = hlsRef.current && hlsRef.current.currentLevel >= 0
          ? (hlsRef.current.levels[hlsRef.current.currentLevel]?.bitrate ?? 2_000_000)
          : 2_000_000;
        const bytesPerSec = gainedSec > 0 ? (gainedSec * bitrate) / 8 : 0;
        setDownloadSpeed(bytesPerSec);
      }
      prevBufferedEnd = bufferedEnd;
      prevPollTime = now;
    }, 400);

    return () => clearInterval(interval);
  }, [isBuffering]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v || (e.target as HTMLElement).tagName === "INPUT") return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); v.paused ? v.play() : v.pause(); revealControls(); break;
        case "ArrowRight": e.preventDefault(); v.currentTime = Math.min(v.currentTime + 5, v.duration); revealControls(); break;
        case "ArrowLeft": e.preventDefault(); v.currentTime = Math.max(v.currentTime - 5, 0); revealControls(); break;
        case "ArrowUp": e.preventDefault(); v.volume = Math.min(v.volume + 0.1, 1); revealControls(); break;
        case "ArrowDown": e.preventDefault(); v.volume = Math.max(v.volume - 0.1, 0); revealControls(); break;
        case "m": v.muted = !v.muted; revealControls(); break;
        case "f": toggleFullscreen(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealControls]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const togglePlay = () => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); };
  const toggleMute = () => {
    const v = videoRef.current; if (!v) return;
    if (v.muted || v.volume === 0) { v.muted = false; v.volume = prevVolume.current || 1; }
    else { prevVolume.current = v.volume; v.muted = true; }
  };
  const toggleFullscreen = async () => {
    const c = containerRef.current;
    if (!c) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      // Unlock orientation when leaving fullscreen on mobile
      try { screen.orientation.unlock(); } catch { /* not supported */ }
    } else {
      await c.requestFullscreen();
      // Lock to landscape on mobile after entering fullscreen
      try {
        await (screen.orientation as any).lock("landscape");
      } catch { /* desktop or browser doesn't support orientation lock */ }
    }
  };

  // ── Progress helpers ──────────────────────────────────────────────────────
  const seekTo = useCallback((clientX: number) => {
    const bar = progressRef.current; const v = videoRef.current;
    if (!bar || !v || !duration) return;
    const { left, width } = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - left) / width));
    v.currentTime = pct * duration;
  }, [duration]);

  const updateHover = useCallback((clientX: number) => {
    const bar = progressRef.current; if (!bar || !duration) return;
    const { left, width } = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - left) / width));
    setHoverX(pct * 100);  // store as percentage for tooltip left positioning
    setHoverTime(pct * duration);
  }, [duration]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => { seekTo(e.clientX); updateHover(e.clientX); };
    const onUp = (e: MouseEvent) => { seekTo(e.clientX); setDragging(false); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, seekTo, updateHover]);

  // derived
  const playedPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;
  const effVol = muted ? 0 : volume;
  const isTV = !!(data.season && data.episode);
  const qualityLabel = currentLevel === -1 ? "Auto" : levels[currentLevel]?.height ? `${levels[currentLevel].height}p` : "Auto";

  const volumeIconName = muted || effVol === 0
    ? "volume_off"
    : effVol < 0.3
    ? "volume_mute"
    : effVol < 0.7
    ? "volume_down"
    : "volume_up";

  return (
    <div
      ref={containerRef}
      className="relative bg-black overflow-hidden"
      style={{ width: "100%", height: "100%", cursor: shown ? "default" : "none", userSelect: "none" }}
      onMouseMove={revealControls}
      onMouseLeave={() => { if (videoRef.current && !videoRef.current.paused) { setShown(false); setPanel(null); } }}
    >
      {/* ── Video ── */}
      <video
        ref={videoRef}
        className="w-full h-full"
        playsInline
        muted
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        style={{
          display: "block",
          objectFit: aspectMode === "contain" ? "contain" : aspectMode === "fill" ? "fill" : "cover",
          ...(aspectMode === "16:9" && { aspectRatio: "16/9" }),
          ...(aspectMode === "4:3"  && { aspectRatio: "4/3"  }),
        }}
      />

      {/* ── Overlays ── */}
      <>
          {/* ── Muted autoplay prompt ── */}
          {muted && playing && !isLoading && (
            <button
              onClick={() => { const v = videoRef.current; if (!v) return; v.muted = false; setMuted(false); }}
              className="absolute z-40 pointer-events-auto"
              style={{ top: 16, right: 16, display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 99, padding: "6px 14px 6px 10px", cursor: "pointer" }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 20, color: "white" }}>volume_off</span>
              <span style={{ color: "white", fontSize: 13, fontWeight: 600 }}>Tap to unmute</span>
            </button>
          )}

          {/* ── Loading spinner ── */}
          {isLoading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
              {data.backdrop && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.backdrop} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.07]" />
              )}
              <div className="relative z-10">
                <svg className="w-14 h-14 animate-spin" viewBox="0 0 50 50">
                  <circle className="opacity-20" cx="25" cy="25" r="20" fill="none" strokeWidth="4" stroke="white"/>
                  <circle cx="25" cy="25" r="20" fill="none" strokeWidth="4" stroke="white"
                    strokeDasharray="80" strokeDashoffset="60" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
              </div>
              <p className="text-white/60 text-sm font-medium">{error}</p>
              {sourceIndex < (data.stream_urls?.length ?? 0) - 1 && (
                <button onClick={() => { setSourceIndex(i => i + 1); setPanel(null); }}
                  className="px-6 py-2 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors">
                  Try Source {sourceIndex + 2}
                </button>
              )}
            </div>
          )}

          {/* ── Mid-playback buffering indicator ── */}
          {isBuffering && !isLoading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
              <div className="relative z-10 flex flex-col items-center gap-3">
                <svg className="w-14 h-14 animate-spin" viewBox="0 0 50 50">
                  <circle className="opacity-20" cx="25" cy="25" r="20" fill="none" strokeWidth="4" stroke="white"/>
                  <circle cx="25" cy="25" r="20" fill="none" strokeWidth="4" stroke="white"
                    strokeDasharray="80" strokeDashoffset="60" strokeLinecap="round"/>
                </svg>
                <div
                  className="flex flex-col items-center gap-1.5"
                  style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", borderRadius: 10, padding: "8px 18px", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <div style={{ width: 140, height: 3, background: "rgba(255,255,255,0.18)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${bufferPct}%`, background: "white", borderRadius: 99, transition: "width 0.35s ease" }} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 500, letterSpacing: "0.02em" }}>
                      Buffering {Math.round(bufferPct)}%
                    </span>
                    {downloadSpeed !== null && downloadSpeed > 0 && (
                      <>
                        <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>·</span>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 500 }}>
                          {formatSpeed(downloadSpeed)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* ── Title — upper-mid ── */}
          {shown && (
            <div className="absolute inset-x-0 z-20 flex flex-col items-center pointer-events-none" style={{ top: "10%" }}>
              <div style={{
                //background: "rgba(0,0,0,0.45)",
                //backdropFilter: "blur(12px)",
                //WebkitBackdropFilter: "blur(12px)",
                //border: "1px solid rgba(255,255,255,0.08)",
                //borderRadius: 12,
                padding: "8px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                maxWidth: "60%",
              }}>
                <span style={{
                  color: "white",
                  fontSize: 24,
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                  textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                  textAlign: "center",
                  lineHeight: 1.3,
                }}>
                  {data.title}
                </span>
                {isTV && (
                  <span style={{
                    color: "rgba(255,255,255,0.45)",
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                  }}>
                    Season {data.season} &nbsp;·&nbsp; Episode {data.episode}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Centre controls (rewind / play-pause / forward) ── */}
          {!isLoading && shown && (
            <div className="absolute inset-0 z-10 flex items-center pointer-events-none">
              {/* Left quarter — rewind */}
              <div className="flex-1 flex items-center justify-center pointer-events-auto">
                <button
                  onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, currentTime - 10); }}
                  className="flex items-center justify-center w-12 h-12 rounded-full hover:bg-white/15 transition-colors text-white">
                  <span className="material-symbols-rounded" style={{ fontSize: 32 }}>keyboard_double_arrow_left</span>
                </button>
              </div>

              {/* Centre — play/pause */}
              <div className="pointer-events-auto">
                <button
                  onClick={togglePlay}
                  className="flex items-center justify-center w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 hover:bg-black/60 transition-colors text-white">
                  <span className="material-symbols-rounded" style={{ fontSize: 36 }}>
                    {playing ? "pause" : "play_arrow"}
                  </span>
                </button>
              </div>

              {/* Right quarter — forward */}
              <div className="flex-1 flex items-center justify-center pointer-events-auto">
                <button
                  onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.min(duration, currentTime + 10); }}
                  className="flex items-center justify-center w-12 h-12 rounded-full hover:bg-white/15 transition-colors text-white">
                  <span className="material-symbols-rounded" style={{ fontSize: 32 }}>keyboard_double_arrow_right</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Settings panel ── */}
          {panel && (
            <div
              className="absolute bottom-[72px] right-3 z-50"
              style={{
                borderRadius: 16,
                background: "rgba(10,10,12,0.92)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(255,255,255,0.07)",
                width: 272,
                boxShadow: "0 24px 64px rgba(0,0,0,0.8), 0 0 0 0.5px rgba(255,255,255,0.04)",
                overflow: "hidden",
              }}
              onClick={e => e.stopPropagation()}
            >
              {panel === "settings" && (
                <>
                  {/* Header */}
                  <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Settings</span>
                  </div>

                  {/* Quality row */}
                  <button onClick={() => setPanel("quality")}
                    className="w-full flex items-center justify-between group transition-colors"
                    style={{ padding: "11px 16px", background: "transparent" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="flex items-center gap-3">
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span className="material-symbols-rounded" style={{ fontSize: 16, color: "rgb(167,139,250)" }}>hd</span>
                      </div>
                      <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 13.5, fontWeight: 500 }}>Quality</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 500, background: "rgba(255,255,255,0.07)", padding: "2px 8px", borderRadius: 6 }}>{qualityLabel}</span>
                      <span className="material-symbols-rounded" style={{ fontSize: 16, color: "rgba(255,255,255,0.25)" }}>chevron_right</span>
                    </div>
                  </button>

                  {/* Source row */}
                  <button onClick={() => setPanel("source")}
                    className="w-full flex items-center justify-between transition-colors"
                    style={{ padding: "11px 16px", background: "transparent" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="flex items-center gap-3">
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span className="material-symbols-rounded" style={{ fontSize: 16, color: "rgb(96,165,250)" }}>play_circle</span>
                      </div>
                      <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 13.5, fontWeight: 500 }}>Source</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 500, background: "rgba(255,255,255,0.07)", padding: "2px 8px", borderRadius: 6 }}>S{sourceIndex + 1}</span>
                      <span className="material-symbols-rounded" style={{ fontSize: 16, color: "rgba(255,255,255,0.25)" }}>chevron_right</span>
                    </div>
                  </button>

                  {/* Subtitles row */}
                  <button
                    onClick={() => { if (subTracks.length > 0) setPanel("subtitles"); }}
                    disabled={subTracks.length === 0}
                    className="w-full flex items-center justify-between transition-colors"
                    style={{ padding: "11px 16px", background: "transparent", opacity: subTracks.length === 0 ? 0.4 : 1, cursor: subTracks.length === 0 ? "default" : "pointer" }}
                    onMouseEnter={e => { if (subTracks.length > 0) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="flex items-center gap-3">
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span className="material-symbols-rounded" style={{ fontSize: 16, color: "rgb(52,211,153)" }}>closed_caption</span>
                      </div>
                      <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 13.5, fontWeight: 500 }}>Subtitles</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ color: activeSubId ? "rgb(52,211,153)" : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 500, background: activeSubId ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.07)", padding: "2px 8px", borderRadius: 6 }}>
                        {subTracks.length === 0 ? "None" : activeSubId ? (subTracks.find(t => t.id === activeSubId)?.label ?? "On") : "Off"}
                      </span>
                      {subTracks.length > 0 && <span className="material-symbols-rounded" style={{ fontSize: 16, color: "rgba(255,255,255,0.25)" }}>chevron_right</span>}
                    </div>
                  </button>
                  <div style={{ height: 6 }} />
                </>
              )}

              {/* ── Subtitles panel ── */}
              {panel === "subtitles" && (
                <>
                  {/* Header with back */}
                  <div className="flex items-center gap-2" style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <button onClick={() => setPanel("settings")}
                      style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                      <span className="material-symbols-rounded" style={{ fontSize: 16, color: "rgba(255,255,255,0.7)" }}>arrow_back_ios</span>
                    </button>
                    <span style={{ color: "white", fontSize: 13.5, fontWeight: 600 }}>Subtitles</span>
                    <div style={{ marginLeft: "auto", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 6, padding: "1px 7px" }}>
                      <span style={{ color: "rgb(52,211,153)", fontSize: 11, fontWeight: 600 }}>{subTracks.length} tracks</span>
                    </div>
                  </div>

                  {/* Appearance row */}
                  <button onClick={() => setPanel("subtitle-style")}
                    className="w-full flex items-center justify-between transition-colors"
                    style={{ padding: "10px 16px", background: "transparent", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="flex items-center gap-3">
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span className="material-symbols-rounded" style={{ fontSize: 15, color: "rgb(251,191,36)" }}>text_fields</span>
                      </div>
                      <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 500 }}>Appearance</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div style={{ width: 14, height: 14, borderRadius: "50%", background: subColor, border: "1px solid rgba(255,255,255,0.3)", flexShrink: 0 }} />
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, background: "rgba(255,255,255,0.07)", padding: "2px 8px", borderRadius: 6 }}>{subSize}px</span>
                      <span className="material-symbols-rounded" style={{ fontSize: 16, color: "rgba(255,255,255,0.25)" }}>chevron_right</span>
                    </div>
                  </button>

                  {/* Off option */}
                  <button onClick={() => { setActiveSubId(null); setPanel("settings"); }}
                    className="w-full flex items-center justify-between transition-colors"
                    style={{ padding: "10px 16px", background: activeSubId === null ? "rgba(255,255,255,0.06)" : "transparent" }}
                    onMouseEnter={e => { if (activeSubId !== null) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { if (activeSubId !== null) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div className="flex items-center gap-3">
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span className="material-symbols-rounded" style={{ fontSize: 15, color: "rgba(255,255,255,0.4)" }}>block</span>
                      </div>
                      <span style={{ color: activeSubId === null ? "white" : "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: activeSubId === null ? 600 : 400 }}>Off</span>
                    </div>
                    {activeSubId === null && (
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span className="material-symbols-rounded" style={{ fontSize: 12, color: "black", fontWeight: 700 }}>check</span>
                      </div>
                    )}
                  </button>

                  {/* Track list */}
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {subTracks.map((track, idx) => {
                      const isActive = activeSubId === track.id;
                      const colours = [
                        { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.35)", text: "rgb(96,165,250)" },
                        { bg: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.35)", text: "rgb(167,139,250)" },
                        { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.35)", text: "rgb(251,191,36)" },
                        { bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.35)",  text: "rgb(252,165,165)" },
                        { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.35)", text: "rgb(52,211,153)" },
                      ];
                      const c = colours[idx % colours.length];
                      return (
                        <button key={track.id}
                          onClick={() => { setActiveSubId(track.id); setPanel("settings"); }}
                          className="w-full flex items-center justify-between transition-colors"
                          style={{ padding: "10px 16px", background: isActive ? "rgba(255,255,255,0.06)" : "transparent" }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                        >
                          <div className="flex items-center gap-3">
                            <div style={{ width: 28, height: 28, borderRadius: 7, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ color: c.text, fontSize: 10, fontWeight: 700, letterSpacing: "0.03em" }}>{track.label.slice(0, 2)}</span>
                            </div>
                            <span style={{ color: isActive ? "white" : "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: isActive ? 600 : 400 }}>{track.label}</span>
                          </div>
                          {isActive && (
                            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span className="material-symbols-rounded" style={{ fontSize: 12, color: "black", fontWeight: 700 }}>check</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ height: 6 }} />
                </>
              )}

              {/* ── Subtitle style panel ── */}
              {panel === "subtitle-style" && (
                <>
                  <div className="flex items-center gap-2" style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <button onClick={() => setPanel("subtitles")}
                      style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                      <span className="material-symbols-rounded" style={{ fontSize: 16, color: "rgba(255,255,255,0.7)" }}>arrow_back_ios</span>
                    </button>
                    <span style={{ color: "white", fontSize: 13.5, fontWeight: 600 }}>Appearance</span>
                  </div>

                  <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Preview */}
                    <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: 8, padding: "10px", textAlign: "center", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <span style={{ color: subColor, fontSize: subSize, fontWeight: 600, textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                        Subtitle preview text
                      </span>
                    </div>

                    {/* Font size */}
                    <div>
                      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Font Size</span>
                        <span style={{ color: "white", fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.1)", padding: "1px 8px", borderRadius: 5 }}>{subSize}px</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {[12, 14, 16, 20, 24, 28].map(sz => (
                          <button key={sz} onClick={() => setSubSize(sz)}
                            style={{
                              flex: 1, padding: "5px 0", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
                              background: subSize === sz ? "white" : "rgba(255,255,255,0.08)",
                              color: subSize === sz ? "black" : "rgba(255,255,255,0.6)",
                              border: subSize === sz ? "none" : "1px solid rgba(255,255,255,0.1)",
                            }}>
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Font color */}
                    <div>
                      <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Font Color</span>
                      <div className="flex items-center gap-2">
                        {[
                          { color: "#ffffff", label: "White" },
                          { color: "#facc15", label: "Yellow" },
                          { color: "#86efac", label: "Green" },
                          { color: "#93c5fd", label: "Blue" },
                          { color: "#fca5a5", label: "Red" },
                          { color: "#e2e8f0", label: "Gray" },
                        ].map(({ color, label }) => (
                          <button key={color} onClick={() => setSubColor(color)} title={label}
                            style={{
                              width: 28, height: 28, borderRadius: "50%", cursor: "pointer", flexShrink: 0,
                              background: color,
                              border: subColor === color ? "2px solid white" : "2px solid rgba(255,255,255,0.15)",
                              boxShadow: subColor === color ? "0 0 0 2px rgba(255,255,255,0.3)" : "none",
                            }} />
                        ))}
                        {/* Custom color picker */}
                        <label title="Custom color" style={{ width: 28, height: 28, borderRadius: "50%", cursor: "pointer", flexShrink: 0, overflow: "hidden", border: "2px solid rgba(255,255,255,0.15)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.08)" }}>
                          <span className="material-symbols-rounded" style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", pointerEvents: "none" }}>colorize</span>
                          <input type="color" value={subColor} onChange={e => setSubColor(e.target.value)}
                            style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
                        </label>
                      </div>
                    </div>

                    {/* Position */}
                    <div>
                      <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Position</span>
                      <div className="flex gap-2">
                        {(["top", "middle", "bottom"] as const).map(pos => (
                          <button key={pos} onClick={() => setSubPosition(pos)}
                            style={{
                              flex: 1, padding: "6px 0", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
                              background: subPosition === pos ? "white" : "rgba(255,255,255,0.08)",
                              color: subPosition === pos ? "black" : "rgba(255,255,255,0.6)",
                              border: subPosition === pos ? "none" : "1px solid rgba(255,255,255,0.1)",
                              textTransform: "capitalize",
                            }}>
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reset */}
                    <button onClick={() => { setSubColor("#ffffff"); setSubSize(16); setSubPosition("bottom"); }}
                      style={{ width: "100%", padding: "7px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Reset to defaults
                    </button>
                  </div>
                </>
              )}

              {/* ── Quality panel ── */}
              {panel === "quality" && (
                <>
                  <div className="flex items-center gap-2" style={{ padding: "12px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <button onClick={() => setPanel("settings")}
                      style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                      <span className="material-symbols-rounded" style={{ fontSize: 16, color: "rgba(255,255,255,0.7)" }}>arrow_back_ios</span>
                    </button>
                    <span style={{ color: "white", fontSize: 13.5, fontWeight: 600 }}>Quality</span>
                  </div>
                  {[{ label: "Auto", val: -1 }, ...levels.map((l, i) => ({ label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}k`, val: i }))].map(({ label, val }) => {
                    const isActive = currentLevel === val;
                    return (
                      <button key={val}
                        onClick={() => { if (hlsRef.current) hlsRef.current.currentLevel = val; setCurrentLevel(val); setPanel("settings"); }}
                        className="w-full flex items-center justify-between transition-colors"
                        style={{ padding: "10px 16px", background: isActive ? "rgba(255,255,255,0.06)" : "transparent" }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        <div className="flex items-center gap-3">
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "rgb(167,139,250)", fontSize: 10, fontWeight: 700 }}>{label === "Auto" ? "A" : label.replace("p","")}</span>
                          </div>
                          <span style={{ color: isActive ? "white" : "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: isActive ? 600 : 400 }}>{label}</span>
                        </div>
                        {isActive && (
                          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span className="material-symbols-rounded" style={{ fontSize: 12, color: "black", fontWeight: 700 }}>check</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                  <div style={{ height: 6 }} />
                </>
              )}

              {/* ── Source panel ── */}
              {panel === "source" && (
                <>
                  <div className="flex items-center gap-2" style={{ padding: "12px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <button onClick={() => setPanel("settings")}
                      style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                      <span className="material-symbols-rounded" style={{ fontSize: 16, color: "rgba(255,255,255,0.7)" }}>arrow_back_ios</span>
                    </button>
                    <span style={{ color: "white", fontSize: 13.5, fontWeight: 600 }}>Source</span>
                  </div>
                  {(data.stream_urls || []).map((_, i) => {
                    const isActive = sourceIndex === i;
                    return (
                      <button key={i}
                        onClick={() => { setSourceIndex(i); setPanel(null); }}
                        className="w-full flex items-center justify-between transition-colors"
                        style={{ padding: "10px 16px", background: isActive ? "rgba(255,255,255,0.06)" : "transparent" }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        <div className="flex items-center gap-3">
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "rgb(96,165,250)", fontSize: 10, fontWeight: 700 }}>S{i + 1}</span>
                          </div>
                          <span style={{ color: isActive ? "white" : "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: isActive ? 600 : 400 }}>Source {i + 1}</span>
                        </div>
                        {isActive && (
                          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span className="material-symbols-rounded" style={{ fontSize: 12, color: "black", fontWeight: 700 }}>check</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                  <div style={{ height: 6 }} />
                </>
              )}
            </div>
          )}

          {/* ── Subtitle cue overlay ── */}
          {activeCue && (
            <div className="absolute inset-x-0 z-25 flex justify-center pointer-events-none"
              style={{
                bottom: subPosition === "bottom" ? (shown ? 90 : 24) : undefined,
                top: subPosition === "top" ? (shown ? 64 : 16) : undefined,
                ...(subPosition === "middle" ? { top: "50%", transform: "translateY(-50%)" } : {}),
                transition: "bottom 0.25s ease, top 0.25s ease",
              }}>
              <div style={{
                background: "rgba(0,0,0,0.75)",
                backdropFilter: "blur(4px)",
                borderRadius: 6,
                padding: "5px 14px",
                maxWidth: "80%",
                textAlign: "center",
              }}>
                {activeCue.split("\n").map((line, i) => (
                  <p key={i} style={{
                    color: subColor,
                    fontSize: subSize,
                    fontWeight: 600,
                    lineHeight: 1.45,
                    textShadow: "0 1px 6px rgba(0,0,0,1), 0 0 2px rgba(0,0,0,0.8)",
                    margin: 0,
                  }}>{line}</p>
                ))}
              </div>
            </div>
          )}

          {/* ── Controls overlay ── */}
          <div
            className="absolute inset-0 z-20 flex flex-col justify-end pointer-events-none"
            style={{ opacity: shown ? 1 : 0, transition: "opacity 0.25s ease" }}
          >
            {/* Gradient scrim */}
            <div className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 25%, transparent 60%)", pointerEvents: "none" }} />

            <div className="relative pointer-events-auto" style={{ padding: "0 16px 14px" }}>

              {/* ── Progress bar ── */}
              <div
                ref={progressRef}
                className="relative mb-3"
                style={{ height: 40, cursor: "pointer" }}
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
                onMouseMove={e => { revealControls(); updateHover(e.clientX); }}
                onMouseDown={e => { e.preventDefault(); setDragging(true); seekTo(e.clientX); }}
              >
                {/* ── Thumbnail preview tooltip ── */}
                {(hovering || dragging) && duration > 0 && (() => {
                  const cue = getThumbnailAt(thumbCues, hoverTime);
                  if (cue && !thumbCache.current[cue.url]) {
                    const img = new Image(); img.src = cue.url;
                    thumbCache.current[cue.url] = img;
                  }
                  const barEl = progressRef.current;
                  const barW = barEl ? barEl.getBoundingClientRect().width : 1000;
                  const thumbW = cue ? cue.w : 160;
                  const rawLeft = (hoverX / 100) * barW;
                  const clampedLeft = Math.max(thumbW / 2, Math.min(barW - thumbW / 2, rawLeft));
                  return (
                    <div className="absolute pointer-events-none" style={{
                      bottom: 44,
                      left: clampedLeft,
                      transform: "translateX(-50%)",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                      zIndex: 60,
                    }}>
                      {cue && (
                        <div style={{
                          width: cue.w,
                          height: cue.h,
                          borderRadius: 6,
                          border: "2px solid rgba(255,255,255,0.2)",
                          boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
                          flexShrink: 0,
                          backgroundImage: `url(${cue.url})`,
                          backgroundPosition: `-${cue.x}px -${cue.y}px`,
                          backgroundSize: `${cue.sheetW}px auto`,
                          backgroundRepeat: "no-repeat",
                        }} />
                      )}
                      <div style={{
                        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
                        border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5,
                        padding: "2px 8px", color: "white", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                      }}>
                        {formatTime(hoverTime)}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Track + thumb — vertically centred in hit zone ── */}
                {/* Outer flex row handles vertical alignment so thumb and track share the same axis */}
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center",
                }}>
                  {/* Track wrapper — grows on hover */}
                  <div style={{
                    position: "relative", width: "100%",
                    height: hovering || dragging ? 6 : 4,
                    transition: "height 0.15s ease",
                    borderRadius: 99,
                    background: "rgba(255,255,255,0.15)",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)",
                  }}>
                    {/* Buffered */}
                    <div style={{
                      position: "absolute", inset: 0,
                      width: `${bufferedPct}%`,
                      borderRadius: 99,
                      background: "rgba(255,255,255,0.28)",
                      transition: "width 0.3s linear",
                    }} />
                    {/* Played — bright with subtle glow */}
                    <div style={{
                      position: "absolute", inset: 0,
                      width: `${playedPct}%`,
                      borderRadius: 99,
                      background: "linear-gradient(90deg, rgba(255,255,255,0.9) 0%, #fff 100%)",
                      boxShadow: "0 0 8px rgba(255,255,255,0.4)",
                    }} />

                    {/* Scrubber thumb — centred on track using top/translate */}
                    <div style={{
                      position: "absolute",
                      top: "50%",
                      left: `${playedPct}%`,
                      transform: "translate(-50%, -50%)",
                      width: hovering || dragging ? 15 : 12,
                      height: hovering || dragging ? 15 : 12,
                      borderRadius: "50%",
                      background: "white",
                      boxShadow: "0 0 0 2px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.6)",
                      opacity: hovering || dragging ? 1 : 0,
                      transition: "opacity 0.15s ease, width 0.15s ease, height 0.15s ease",
                      pointerEvents: "none",
                    }} />
                  </div>
                </div>
              </div>

              {/* ── Button row ── */}
              <div className="flex items-center gap-0.5">

                {/* Volume */}
                <div className="flex items-center group/vol">
                  <button onClick={toggleMute}
                    className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10 transition-colors text-white">
                    <span className="material-symbols-rounded" style={{ fontSize: 22 }}>{volumeIconName}</span>
                  </button>
                  {/* Slider — expands on hover */}
                  <div className="overflow-hidden transition-all duration-200 flex items-center"
                    style={{ width: 0 }}
                    ref={el => { if (el) { el.style.width = "0px"; el.parentElement?.addEventListener("mouseenter", () => { el.style.width = "72px"; }); el.parentElement?.addEventListener("mouseleave", () => { el.style.width = "0px"; }); } }}>
                    <input type="range" min={0} max={1} step={0.02} value={effVol}
                      onChange={e => { const v = videoRef.current; if (!v) return; const val = parseFloat(e.target.value); v.volume = val; v.muted = val === 0; if (val > 0) prevVolume.current = val; }}
                      className="w-[72px] accent-white cursor-pointer"
                      style={{ height: 3 }}
                    />
                  </div>
                </div>

                {/* Time */}
                <span className="text-white/80 text-xs font-medium tabular-nums ml-1 select-none">
                  {formatTime(currentTime)}
                  <span className="text-white/35 mx-1">/</span>
                  {formatTime(duration)}
                </span>

                <div className="flex-1" />

                {/* Subtitles / CC — always visible; dims when no tracks available */}
                <button
                  onClick={e => { e.stopPropagation(); if (subTracks.length > 0) setPanel(p => p === "subtitles" ? null : "subtitles"); }}
                  title={subTracks.length === 0 ? "No subtitles available" : "Subtitles"}
                  className="flex items-center justify-center w-9 h-9 rounded-full transition-colors"
                  style={{
                    color: activeSubId ? "white" : "rgba(255,255,255,0.45)",
                    opacity: subTracks.length === 0 ? 0.3 : 1,
                    cursor: subTracks.length === 0 ? "default" : "pointer",
                  }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 22 }}>
                    {activeSubId ? "closed_caption" : "closed_caption_disabled"}
                  </span>
                </button>

                {/* Settings */}
                <button
                  onClick={e => { e.stopPropagation(); setPanel(p => p ? null : "settings"); }}
                  className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10 transition-colors text-white">
                  <span
                    className="material-symbols-rounded"
                    style={{ fontSize: 22, transform: panel === "settings" ? "rotate(30deg)" : "rotate(0deg)", transition: "transform 0.3s ease" }}>
                    settings
                  </span>
                </button>

                {/* Aspect ratio */}
                <div className="relative group/aspect">
                  <button
                    onClick={cycleAspect}
                    className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10 transition-colors text-white">
                    <span className="material-symbols-rounded" style={{ fontSize: 22 }}>aspect_ratio</span>
                  </button>
                  {/* Tooltip */}
                  <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2 pointer-events-none opacity-0 group-hover/aspect:opacity-100 transition-opacity duration-150">
                    <div style={{
                      background: "rgba(0,0,0,0.82)",
                      backdropFilter: "blur(8px)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 6,
                      padding: "3px 10px",
                      color: "white",
                      fontSize: 11,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}>
                      {aspectMode}
                    </div>
                  </div>
                </div>

                {/* Fullscreen */}
                <button onClick={toggleFullscreen}
                  className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10 transition-colors text-white">
                  <span className="material-symbols-rounded" style={{ fontSize: 22 }}>
                    {fullscreen ? "fullscreen_exit" : "fullscreen"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </>
    </div>
  );
}

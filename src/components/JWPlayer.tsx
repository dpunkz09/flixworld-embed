"use client";

import { useEffect, useRef, useState } from "react";
import type { StreamData, StreamSource, SubtitleTrack } from "@/lib/api";
import TitleOverlay from "./TitleOverlay";
import ServerOverlay from "./ServerOverlay";
import type { ServerState } from "@/lib/servers";

// JW Player loaded from CDN — no npm package
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwplayer: (id: string) => any;
  }
  interface ScreenOrientation {
    lock(orientation: "any" | "natural" | "landscape" | "portrait" | "portrait-primary" | "portrait-secondary" | "landscape-primary" | "landscape-secondary"): Promise<void>;
    unlock(): void;
  }
}

const JW_LICENSE_KEY = process.env.NEXT_PUBLIC_JW_LICENSE_KEY ?? "";
const JW_SCRIPT_URL  = "//ssl.p.jwpcdn.com/player/v/8.22.0/jwplayer.js";

// ---------------------------------------------------------------------------
// Watch-progress helpers (localStorage)
// ---------------------------------------------------------------------------

function progressKey(data: StreamData): string | null {
  if (!data.tmdbId) return null;
  return data.season
    ? `wp:${data.tmdbId}:${data.season}:${data.episode}`
    : `wp:${data.tmdbId}`;
}

function loadSavedProgress(key: string | null): number {
  if (!key) return 0;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const { t } = JSON.parse(raw) as { t: number };
    return typeof t === "number" && t > 5 ? t : 0;
  } catch {
    return 0;
  }
}

function saveProgress(key: string | null, t: number, dur: number) {
  if (!key || !dur || t < 5) return;
  if (dur - t < 30) {
    try { localStorage.removeItem(key); } catch { /* quota */ }
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify({ t: Math.floor(t) }));
  } catch { /* quota */ }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface JWPlayerProps {
  data: StreamData;
  /** Sources from the currently active server — replaces data.sources */
  activeSources: StreamSource[];
  /** Subtitles from the currently active server */
  activeSubtitles: SubtitleTrack[];
  /** Server states for the overlay panel */
  servers: ServerState[];
  /** ID of the currently active server */
  activeServerId: string;
  /** Called when the user picks a different server in the overlay */
  onServerSelect: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JWPlayer({
  data,
  activeSources,
  activeSubtitles,
  servers,
  activeServerId,
  onServerSelect,
}: JWPlayerProps) {
  const containerId  = "jw-player-container";
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef    = useRef<any>(null);
  const saveTimerRef = useRef<number>(0);

  const [overlayMount, setOverlayMount] = useState<Element | null>(null);
  const [playerReady, setPlayerReady]   = useState(false);

  const pKey = progressKey(data);

  // ── Build JW playlist from the active sources ──────────────────────────
  function buildPlaylist(sources: StreamSource[], subtitles: SubtitleTrack[]) {
    const jwSources = sources.map((s) => ({
      file: s.url,
      // JW Player respects type for HLS vs MP4 selection
      type: s.language === "hls" || s.url.includes(".m3u8")
        ? "application/x-mpegurl"
        : "video/mp4",
      label: s.language,
    }));

    const tracks = subtitles.map((s) => ({
      file: s.file,
      label: s.label,
      kind: "captions",
    }));

    return [{ sources: jwSources, ...(tracks.length ? { tracks } : {}) }];
  }

  // ── Initial setup ──────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    const savedTime = loadSavedProgress(pKey);

    const setupPlayer = () => {
      if (!isMounted || !containerRef.current) return;

      const player = window.jwplayer(containerId);
      playerRef.current = player;

      player.setup({
        key:      JW_LICENSE_KEY,
        playlist: buildPlaylist(activeSources, activeSubtitles),
        width:    "100%",
        height:   "100%",
        stretching: "uniform",
        autostart:  true,
        mute:       false,
        primary:    "html5",
        ...(savedTime > 0 ? { starttime: savedTime } : {}),
      });

      player.on("time", ({ position, duration }: { position: number; duration: number }) => {
        const now = Date.now();
        if (now - saveTimerRef.current > 5000) {
          saveTimerRef.current = now;
          saveProgress(pKey, position, duration);
        }
      });

      player.on("complete", () => {
        if (pKey) {
          try { localStorage.removeItem(pKey); } catch { /* ignore */ }
        }
      });

      player.on("ready", () => {
        if (!isMounted) return;
        const wrapper = player.getContainer() as Element | null;
        if (wrapper) setOverlayMount(wrapper);
        setPlayerReady(true);
      });

      player.on("fullscreen", ({ fullscreen }: { fullscreen: boolean }) => {
        const orientation = screen?.orientation;
        if (!orientation?.lock) return;
        if (fullscreen) {
          orientation.lock("landscape").catch(() => {});
        } else {
          orientation.unlock();
        }
      });
    };

    const loadAndSetup = () => {
      if (typeof window === "undefined") return;
      if (typeof window.jwplayer === "function") { setupPlayer(); return; }

      const existing = document.getElementById("jwplayer-script");
      if (existing) { existing.addEventListener("load", setupPlayer, { once: true }); return; }

      const script = document.createElement("script");
      script.id    = "jwplayer-script";
      script.src   = JW_SCRIPT_URL;
      script.async = true;
      script.addEventListener("load", setupPlayer, { once: true });
      script.addEventListener("error", () => {
        console.error("[JWPlayer] Failed to load player script from CDN.");
      });
      document.head.appendChild(script);
    };

    loadAndSetup();

    return () => {
      isMounted = false;
      try { playerRef.current?.remove(); } catch { /* ignore */ }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Source switch — fired when the user picks a different server ───────
  // We capture the current playback position, load the new sources, then
  // seek back so the switch feels seamless.
  const prevServerIdRef = useRef(activeServerId);
  useEffect(() => {
    // Skip on first render (initial sources are set via setup above)
    if (prevServerIdRef.current === activeServerId) return;
    prevServerIdRef.current = activeServerId;

    const player = playerRef.current;
    if (!player || !playerReady) return;

    // Capture position before reload
    let resumeAt = 0;
    try { resumeAt = player.getPosition() ?? 0; } catch { /* ignore */ }

    const playlist = buildPlaylist(activeSources, activeSubtitles);

    player.load(playlist);

    // Seek to saved position once the new playlist is buffered
    if (resumeAt > 5) {
      player.once("firstFrame", () => {
        try { player.seek(resumeAt); } catch { /* ignore */ }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServerId, activeSources]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", height: "100%", background: "#000" }}>
      <div
        id={containerId}
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
      />

      {/* TitleOverlay — top-right metadata card */}
      {overlayMount && data.mediaInfo && (
        <TitleOverlay
          info={data.mediaInfo}
          mountEl={overlayMount}
        />
      )}

      {/* ServerOverlay — bottom-left cloud button + server panel */}
      {overlayMount && (
        <ServerOverlay
          servers={servers}
          activeServerId={activeServerId}
          onSelect={onServerSelect}
          mountEl={overlayMount}
        />
      )}
    </div>
  );
}

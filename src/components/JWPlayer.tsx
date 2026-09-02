"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { StreamData, StreamSource, SubtitleTrack } from "@/lib/api";
import TitleOverlay from "./TitleOverlay";
import ServerOverlay from "./ServerOverlay";
import type { ServerState } from "@/lib/servers";

// ---------------------------------------------------------------------------
// Watch-progress helpers (localStorage)
// ---------------------------------------------------------------------------

/** Stable key per piece of content. */
function progressKey(data: StreamData): string {
  return data.season
    ? `wp:${data.tmdbId}:${data.season}:${data.episode}`
    : `wp:${data.tmdbId}`;
}

/** Returns saved position in seconds, or 0 if nothing stored. */
function loadProgress(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const { t } = JSON.parse(raw) as { t: number };
    return typeof t === "number" && t > 5 ? t : 0;
  } catch {
    return 0;
  }
}

/**
 * Persists current position.
 * Skips the last 30 s so a near-finished title doesn't resume mid-credits,
 * and removes the entry instead so it's treated as fully watched.
 * Pass duration as -1 when unknown (e.g. HLS before manifest is parsed) to
 * skip the near-end guard and always save.
 */
function saveProgress(key: string, position: number, duration: number) {
  if (position < 5) return;
  // When duration is known and we're within 30 s of the end, clear the entry
  if (duration > 0 && duration - position < 30) {
    try { localStorage.removeItem(key); } catch { /* quota */ }
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify({ t: Math.floor(position) }));
  } catch { /* quota */ }
}

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
// Playlist builder (module-level pure function — not recreated per render)
// ---------------------------------------------------------------------------

function buildPlaylist(sources: StreamSource[], subtitles: SubtitleTrack[]) {
  const jwSources = sources.map((s) => {
    // Prefer the explicit type field carried from the API.
    // Fall back to URL sniffing — proxy-wrapped URLs preserve ".m3u8" as a
    // plain substring inside the encoded query param, so includes() is safe.
    const isHls =
      s.type === "hls" ||
      (s.type === undefined && (s.url.includes(".m3u8") || /\/hls\d*\//i.test(s.url)));

    return {
      file:  s.url,
      type:  isHls ? "application/x-mpegurl" : "video/mp4",
      label: s.language,
    };
  });

  const tracks = subtitles.map((s) => ({
    file:  s.file,
    label: s.label,
    kind:  "captions",
  }));

  return [{ sources: jwSources, ...(tracks.length ? { tracks } : {}) }];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface JWPlayerProps {
  data: StreamData;
  /** Sources from the currently active server */
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
  // useId produces a stable, unique id — safe if two instances ever coexist
  const uid          = useId();
  const containerId  = `jw-player-${uid.replace(/:/g, "")}`;

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef    = useRef<any>(null);
  const saveTimerRef = useRef<number>(0);

  const [overlayMount, setOverlayMount] = useState<Element | null>(null);
  const [playerReady, setPlayerReady]   = useState(false);

  const pKey = progressKey(data);

  // ── Initial setup ──────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    const savedTime = loadProgress(pKey);

    // Hoisted so the useEffect cleanup can remove the listener even if
    // setupPlayer was called asynchronously (after the script loaded).
    let handleFullscreenChange: (() => void) | null = null;

    const setupPlayer = () => {
      if (!isMounted || !containerRef.current) return;

      const player = window.jwplayer(containerId);
      playerRef.current = player;

      player.setup({
        key:        JW_LICENSE_KEY,
        playlist:   buildPlaylist(activeSources, activeSubtitles),
        width:      "100%",
        height:     "100%",
        stretching: "uniform",
        autostart:  true,
        mute:       false,
        primary:    "html5",
      });

      player.on("time", ({ position, duration }: { position: number; duration: number }) => {
        const now = Date.now();
        if (now - saveTimerRef.current > 5000) {
          saveTimerRef.current = now;
          // duration can be 0 on some HLS streams until the manifest is fully
          // parsed — fall back to a sentinel so we still save position, and
          // skip the "near end" guard when duration is unknown.
          const dur = duration > 0 ? duration : -1;
          saveProgress(pKey, position, dur);
        }
      });

      player.on("complete", () => {
        // saveProgress clears the entry when near the end; call it with
        // duration == position so the "last 30 s" branch always fires.
        try {
          localStorage.removeItem(pKey);
        } catch { /* quota */ }
      });

      player.on("ready", () => {
        if (!isMounted) return;
        const wrapper = player.getContainer() as Element | null;
        if (wrapper) setOverlayMount(wrapper);
        setPlayerReady(true);
        // Seek to saved position once the first frame is rendered.
        // seek() called at "ready" can be ignored on HLS before buffering
        // starts — "firstFrame" is the earliest reliable seek point.
        if (savedTime > 0) {
          player.once("firstFrame", () => {
            try { player.seek(savedTime); } catch { /* ignore */ }
          });
        }
      });

      // ── Orientation lock on fullscreen ──────────────────────────────
      // screen.orientation.lock() requires the *calling* document to be the
      // one that owns the fullscreen element. When the player runs inside an
      // <iframe>, JW's "fullscreen" event fires in the iframe context but the
      // fullscreen element lives in the parent document — so the lock is
      // silently rejected. Listening to the native fullscreenchange event on
      // the document that actually contains the fullscreen element is reliable
      // in both standalone and embedded scenarios.
      handleFullscreenChange = () => {
        const orientation = screen?.orientation;
        if (!orientation?.lock) return;

        const isFullscreen = !!(
          document.fullscreenElement ??
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (document as any).webkitFullscreenElement
        );

        if (isFullscreen) {
          // Only lock on mobile — desktop ignores the request anyway, but
          // skipping it avoids a console rejection on desktop browsers.
          if (window.screen.width < window.screen.height || window.innerWidth <= 1024) {
            orientation.lock("landscape").catch(() => {});
          }
        } else {
          orientation.unlock();
        }
      };

      document.addEventListener("fullscreenchange", handleFullscreenChange);
      document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    };

    const loadAndSetup = () => {
      if (typeof window === "undefined") return;

      // Script already loaded — set up immediately
      if (typeof window.jwplayer === "function") {
        setupPlayer();
        return;
      }

      const existing = document.getElementById("jwplayer-script");
      if (existing) {
        // Script tag exists but may have already fired its load event.
        // Re-check jwplayer availability first to avoid a missed event.
        if (typeof window.jwplayer === "function") {
          setupPlayer();
        } else {
          existing.addEventListener("load", setupPlayer, { once: true });
        }
        return;
      }

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
      if (handleFullscreenChange) {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
        document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      }
      try { playerRef.current?.remove(); } catch { /* ignore */ }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Source/subtitle switch — fired when the user picks a different server
  // Captures the current playback position, loads the new sources, then
  // seeks back so the switch feels seamless.
  const prevServerIdRef = useRef(activeServerId);
  useEffect(() => {
    // Skip the initial render — sources are set via setup above
    if (prevServerIdRef.current === activeServerId) return;
    prevServerIdRef.current = activeServerId;

    const player = playerRef.current;
    if (!player || !playerReady) return;

    let resumeAt = 0;
    try { resumeAt = player.getPosition() ?? 0; } catch { /* ignore */ }

    player.load(buildPlaylist(activeSources, activeSubtitles));

    if (resumeAt > 5) {
      player.once("firstFrame", () => {
        try { player.seek(resumeAt); } catch { /* ignore */ }
      });
    }
    // activeSubtitles included so a subtitle-only change on the same server
    // also triggers a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServerId, activeSources, activeSubtitles]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", height: "100%", background: "#000" }}>
      {/* role + aria-label make the player region reachable as a landmark
          before JW Player injects its own ARIA structure */}
      <div
        id={containerId}
        ref={containerRef}
        role="region"
        aria-label="Video player"
        style={{ width: "100%", height: "100%" }}
      />

      {overlayMount && data.mediaInfo && (
        <TitleOverlay info={data.mediaInfo} mountEl={overlayMount} />
      )}

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

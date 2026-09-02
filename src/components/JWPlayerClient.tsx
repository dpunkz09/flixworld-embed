"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useCallback } from "react";
import type { StreamData, StreamSource, SubtitleTrack } from "@/lib/api";
import {
  preloadServers,
  pickBestSource,
  SERVER_DEFS,
  type ServerState,
} from "@/lib/servers";
import { checkSandbox } from "@/lib/sandboxCheck";

// ---------------------------------------------------------------------------
// Adsterra popunder
// Injected once on mount. Skipped when the embed is loaded inside flixworld.xyz
// (detected via document.referrer and window.location.ancestorOrigins).
// ---------------------------------------------------------------------------

const AD_SCRIPT_URL   = "https://pl31093554.profitableratecpmnetwork.com/e9/3a/8c/e93a8c3c968c832432d59d4ccac84e46.js";
const AD_EXEMPT_HOST  = "flixworld.xyz";

function isExemptFromAds(): boolean {
  try {
    // Check the referrer (set by the parent page in most browsers)
    if (document.referrer) {
      const ref = new URL(document.referrer);
      if (ref.hostname === AD_EXEMPT_HOST || ref.hostname.endsWith(`.${AD_EXEMPT_HOST}`)) {
        return true;
      }
    }
    // Check ancestorOrigins (Chromium only — not available in Firefox/Safari)
    const ancestors = window.location.ancestorOrigins;
    if (ancestors) {
      for (let i = 0; i < ancestors.length; i++) {
        const origin = new URL(ancestors[i]);
        if (origin.hostname === AD_EXEMPT_HOST || origin.hostname.endsWith(`.${AD_EXEMPT_HOST}`)) {
          return true;
        }
      }
    }
  } catch {
    // Malformed URL or cross-origin restriction — fail open (show ads)
  }
  return false;
}

function injectAdScript() {
  if (isExemptFromAds()) return;

  // Popunder ads work by intercepting clicks on the top-level document.
  // When this embed is inside an iframe, we must inject into the parent
  // page's document — not the iframe's — otherwise click events never
  // reach the ad script and the popunder never fires.
  // If window.top is cross-origin (security restriction), fall back to
  // injecting into the iframe document itself (less effective but still works
  // for direct embed.flixworld.xyz visits).
  let targetDoc: Document;
  try {
    // Accessing window.top.document throws a SecurityError when cross-origin
    targetDoc = (window.top ?? window).document;
  } catch {
    targetDoc = document;
  }

  if (targetDoc.querySelector(`script[src="${AD_SCRIPT_URL}"]`)) return;

  const s = document.createElement("script");
  s.src   = AD_SCRIPT_URL;
  s.async = true;
  targetDoc.head.appendChild(s);
}

// JW Player uses browser-only APIs — disable SSR entirely.
const JWPlayer = dynamic(() => import("./JWPlayer"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width:          "100%",
        height:         "100%",
        background:     "#000",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
      }}
    >
      <svg
        style={{ width: 48, height: 48, animation: "spin 1s linear infinite" }}
        viewBox="0 0 50 50"
      >
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <circle cx="25" cy="25" r="20" fill="none" strokeWidth="4" stroke="white" strokeOpacity="0.2" />
        <circle cx="25" cy="25" r="20" fill="none" strokeWidth="4" stroke="white"
          strokeDasharray="80" strokeDashoffset="60" strokeLinecap="round" />
      </svg>
    </div>
  ),
});

// Route subtitle files through the local proxy so that raw \N escape
// sequences (SRT line-break convention) are normalised to real newlines
// before JW Player receives the cue text.
function proxySubtitleUrl(url: string): string {
  return `/api/subtitle?url=${encodeURIComponent(url)}`;
}

interface Props {
  data: StreamData;
}

export default function JWPlayerClient({ data }: Props) {
  // ── Sandbox check ──────────────────────────────────────────────────────
  // Run once on mount. If the iframe is sandboxed without the required
  // allow-* tokens, block the player entirely and show an error instead.
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  useEffect(() => {
    const result = checkSandbox();
    if (!result.ok) setSandboxError(result.reason);
  }, []);

  // ── Server states ──────────────────────────────────────────────────────
  const [servers, setServers] = useState<ServerState[]>(() =>
    SERVER_DEFS.map((def) => ({
      id:     def.id,
      label:  def.label,
      tag:    def.tag,
      status: "idle" as const,
      result: null,
    })),
  );

  // ── Active server — starts with first def (alfa/Videasy, instant) ─────
  const [activeServerId, setActiveServerId] = useState<string>(SERVER_DEFS[0].id);

  // ── Active sources/subtitles fed to JWPlayer ───────────────────────────
  const [activeSources,   setActiveSources]   = useState<StreamSource[]>(data.sources);
  const [activeSubtitles, setActiveSubtitles] = useState<SubtitleTrack[]>(
    data.subtitles.map((s) => ({ ...s, file: proxySubtitleUrl(s.file) })),
  );

  // Synchronous ref — always reflects the latest servers state without
  // the one-render lag a useEffect sync would introduce.
  const serversRef      = useRef(servers);
  serversRef.current    = servers;

  // Track whether the default server has already been overridden by the
  // auto-fallback so we don't repeatedly switch on every preload update.
  const autoFallenBackRef = useRef(false);

  // Track which server id is currently active inside callbacks.
  const activeServerIdRef = useRef(activeServerId);
  activeServerIdRef.current = activeServerId;

  // ── Shared select logic (used by auto-fallback + manual selection) ─────
  const applyServer = useCallback((state: ServerState) => {
    if (!state.result) return;
    const best = pickBestSource(state.result);
    setActiveSources([best]);
    setActiveSubtitles(
      state.result.subtitles.map((s) => ({
        file:  proxySubtitleUrl(s.url),
        label: s.label,
      })),
    );
    setActiveServerId(state.id);
  }, []);

  // ── Preload all servers in parallel on mount ───────────────────────────
  useEffect(() => {
    // Inject popunder ad (skipped when embedded on flixworld.xyz)
    injectAdScript();

    const cancel = preloadServers(data, (updated) => {
      setServers(updated);

      // Auto-fallback: if the current active server has no sources yet
      // (default server returned empty / errored), switch to the first
      // ready server in list order — preserving the user's manual choice
      // once they've picked something.
      if (autoFallenBackRef.current) return;

      const currentId     = activeServerIdRef.current;
      const currentState  = updated.find((s) => s.id === currentId);
      const defaultHasNoSources =
        !currentState?.result?.sources.length &&
        (currentState?.status === "error" || currentState?.status === "ready");

      if (!defaultHasNoSources) return;

      // Find the next server in list order that is already ready with sources
      const fallback = updated.find(
        (s) => s.id !== currentId && s.status === "ready" && (s.result?.sources.length ?? 0) > 0,
      );

      if (fallback) {
        autoFallenBackRef.current = true;
        applyServer(fallback);
      }
    });
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Manual server selection ────────────────────────────────────────────
  const handleServerSelect = useCallback((id: string) => {
    const state = serversRef.current.find((s) => s.id === id);
    if (!state?.result) return;
    // Manual pick disables further auto-fallback
    autoFallenBackRef.current = true;
    applyServer(state);
  }, [applyServer]);

  if (sandboxError) {
    return (
      <div style={{
        width:          "100%",
        height:         "100%",
        background:     "#0a0a0f",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            "12px",
        padding:        "24px",
        fontFamily:     "system-ui, sans-serif",
        textAlign:      "center",
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e50914" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p style={{ color: "#f0f0f5", fontSize: "14px", fontWeight: 600, margin: 0 }}>
          Playback Blocked
        </p>
        <p style={{ color: "#9898a8", fontSize: "12px", margin: 0, maxWidth: "320px", lineHeight: 1.5 }}>
          {sandboxError}
        </p>
      </div>
    );
  }

  return (
    <JWPlayer
      data={data}
      activeSources={activeSources}
      activeSubtitles={activeSubtitles}
      servers={servers}
      activeServerId={activeServerId}
      onServerSelect={handleServerSelect}
    />
  );
}

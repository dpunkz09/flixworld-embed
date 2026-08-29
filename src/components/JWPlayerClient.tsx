"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useCallback } from "react";
import type { StreamData, StreamSource, SubtitleTrack } from "@/lib/api";
import {
  preloadServers,
  pickBestSource,
  SERVER_DEFS,
  type ServerState,
  type ServerSubtitle,
} from "@/lib/servers";

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

interface Props {
  data: StreamData;
}

export default function JWPlayerClient({ data }: Props) {
  // ── Server states — one entry per SERVER_DEF, updated as fetches resolve ──
  const [servers, setServers] = useState<ServerState[]>(() =>
    SERVER_DEFS.map((def) => ({
      id:     def.id,
      label:  def.label,
      tag:    def.tag,
      status: "idle" as const,
      result: null,
    })),
  );

  // ── Active server id — starts with Vidzee (first def, already available) ──
  const [activeServerId, setActiveServerId] = useState<string>(SERVER_DEFS[0].id);

  // ── Active sources/subtitles fed to JWPlayer ──────────────────────────
  const [activeSources, setActiveSources] = useState<StreamSource[]>(
    data.sources,
  );
  const [activeSubtitles, setActiveSubtitles] = useState<SubtitleTrack[]>(
    data.subtitles,
  );

  // Keep a stable ref to servers so onSelect can read latest state
  const serversRef = useRef(servers);
  useEffect(() => { serversRef.current = servers; }, [servers]);

  // ── Preload all servers in parallel once the component mounts ─────────
  useEffect(() => {
    const cancel = preloadServers(data, (updated) => {
      setServers(updated);

      // Promote Vidzee to "ready" immediately using the data we already have
      // (preloadServers calls vidzee.fetch which just wraps data.sources, so
      // this is instant — but we still need the state update to flip "loading"→"ready")
    });
    return cancel;
    // data is stable (server-rendered, never changes between renders)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handle server selection ────────────────────────────────────────────
  const handleServerSelect = useCallback((id: string) => {
    const state = serversRef.current.find((s) => s.id === id);
    if (!state?.result) return;

    const best = pickBestSource(state.result);
    setActiveSources([best]);
    // Map ServerSubtitle → SubtitleTrack ({file, label})
    setActiveSubtitles(
      state.result.subtitles.map((s: ServerSubtitle) => ({
        file: s.url,
        label: s.label,
      })),
    );
    setActiveServerId(id);
  }, []);

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

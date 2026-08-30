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

  // ── Active server — starts with first def (gama/Vidzee, instant) ──────
  const [activeServerId, setActiveServerId] = useState<string>(SERVER_DEFS[0].id);

  // ── Active sources/subtitles fed to JWPlayer ───────────────────────────
  const [activeSources,   setActiveSources]   = useState<StreamSource[]>(data.sources);
  const [activeSubtitles, setActiveSubtitles] = useState<SubtitleTrack[]>(data.subtitles);

  // Assign synchronously in the render body — avoids the one-render lag
  // that a useEffect sync would introduce, ensuring handleServerSelect
  // always reads the latest state.
  const serversRef = useRef(servers);
  serversRef.current = servers;

  // ── Preload all servers in parallel on mount ───────────────────────────
  useEffect(() => {
    const cancel = preloadServers(data, setServers);
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Server selection ───────────────────────────────────────────────────
  const handleServerSelect = useCallback((id: string) => {
    const state = serversRef.current.find((s) => s.id === id);
    if (!state?.result) return;

    const best = pickBestSource(state.result);
    setActiveSources([best]);

    // ServerSubtitle.url → SubtitleTrack.file
    setActiveSubtitles(
      state.result.subtitles.map((s) => ({
        file:  s.url,
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

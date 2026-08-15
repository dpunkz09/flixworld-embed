"use client";

import dynamic from "next/dynamic";
import type { StreamData, Subtitle } from "@/lib/api";

// Disable SSR entirely for the player — it uses browser APIs and has no meaningful
// server-rendered output. This eliminates all hydration mismatches at the root.
const HLSPlayer = dynamic(() => import("./HLSPlayer"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg style={{ width: 48, height: 48, animation: "spin 1s linear infinite" }} viewBox="0 0 50 50">
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <circle cx="25" cy="25" r="20" fill="none" strokeWidth="4" stroke="white" strokeOpacity="0.2"/>
        <circle cx="25" cy="25" r="20" fill="none" strokeWidth="4" stroke="white" strokeDasharray="80" strokeDashoffset="60" strokeLinecap="round"/>
      </svg>
    </div>
  ),
});

interface Props {
  data: StreamData;
  thumbnailsUrl?: string | null;
  subtitles?: Subtitle[];
  defaultSubs?: Subtitle[];
}

export default function HLSPlayerClient({ data, thumbnailsUrl, subtitles, defaultSubs }: Props) {
  return (
    <HLSPlayer
      data={data}
      thumbnailsUrl={thumbnailsUrl ?? undefined}
      subtitles={subtitles}
      defaultSubs={defaultSubs}
    />
  );
}

"use client";

import dynamic from "next/dynamic";
import type { StreamData, Subtitle } from "@/lib/api";

// Disable SSR entirely for the player — it uses browser APIs and has no meaningful
// server-rendered output. This eliminates all hydration mismatches at the root.
const HLSPlayer = dynamic(() => import("./HLSPlayer"), { ssr: false });

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

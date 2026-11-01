import { fetchTVStream, fetchTVStreamVidBolt, type StreamData } from "@/lib/api";
import JWPlayerClient from "@/components/JWPlayerClient";
import { PlayerErrorBoundary } from "@/components/PlayerErrorBoundary";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string; season: string; episode: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, season, episode } = await params;
  return {
    title: `TV ${id} S${season}E${episode} — Flixworld`,
    robots: { index: false, follow: false },
  };
}

export default async function TVEmbed({ params }: Props) {
  const { id, season, episode } = await params;

  // Fetch from both VidNest and VidBolt, merge the results
  let data: StreamData;
  try {
    const [vidnestData, vidboltData] = await Promise.allSettled([
      fetchTVStream(id, season, episode),
      fetchTVStreamVidBolt(id, season, episode),
    ]);

    // Start with VidNest data (or empty if failed)
    if (vidnestData.status === "fulfilled") {
      data = vidnestData.value;
    } else {
      console.error('VidNest API failed:', vidnestData.reason);
      data = {
        tmdbId: id,
        mediaType: "tv" as const,
        season,
        episode,
        sources: [],
        subtitles: [],
      };
    }

    // Merge VidBolt sources if available
    if (vidboltData.status === "fulfilled") {
      data.sources = [...data.sources, ...vidboltData.value.sources];
      data.subtitles = [...data.subtitles, ...vidboltData.value.subtitles];
      // Use VidBolt mediaInfo if VidNest didn't provide it
      if (!data.mediaInfo && vidboltData.value.mediaInfo) {
        data.mediaInfo = vidboltData.value.mediaInfo;
      }
    } else {
      console.error('VidBolt API failed:', vidboltData.reason);
    }
  } catch (error) {
    console.error('Both APIs failed:', error);
    // Create minimal data to show server selector
    data = {
      tmdbId: id,
      mediaType: "tv" as const,
      season,
      episode,
      sources: [],
      subtitles: [],
    };
  }

  // Always show the player - it will try alternative servers if sources are empty
  return (
    <div style={{ width: "100%", height: "100%", background: "#000", overflow: "hidden" }}>
      <PlayerErrorBoundary>
        <JWPlayerClient data={data} />
      </PlayerErrorBoundary>
    </div>
  );
}

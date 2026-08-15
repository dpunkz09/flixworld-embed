import { fetchTVStream } from "@/lib/api";
import HLSPlayerClient from "@/components/HLSPlayerClient";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string; season: string; episode: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, season, episode } = await params;
  try {
    const stream = await fetchTVStream(id, season, episode);
    if (stream.status_code === "200" && stream.data.title) {
      const title = `${stream.data.title} — S${season}E${episode}`;
      return {
        title,
        description: `Watch ${stream.data.title} Season ${season} Episode ${episode} online. Free HD streaming with subtitles.`,
        openGraph: {
          title,
          description: `Watch ${stream.data.title} S${season}E${episode} online. Free HD streaming with subtitles.`,
          images: stream.data.backdrop ? [{ url: stream.data.backdrop }] : [],
          type: "video.episode",
        },
        robots: { index: false, follow: false },
      };
    }
  } catch { /* fall through */ }
  return { title: "TV Player", robots: { index: false, follow: false } };
}

export default async function TVEmbed({ params }: Props) {
  const { id, season, episode } = await params;

  let stream;
  try {
    stream = await fetchTVStream(id, season, episode);
  } catch {
    notFound();
  }

  if (stream.status_code !== "200" || !stream.data.stream_urls.length) {
    notFound();
  }

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000", overflow: "hidden" }}>
      <HLSPlayerClient
        data={stream.data}
        thumbnailsUrl={stream.thumbnails_url}
        subtitles={stream.subtitles}
        defaultSubs={stream.default_subs}
      />
    </div>
  );
}

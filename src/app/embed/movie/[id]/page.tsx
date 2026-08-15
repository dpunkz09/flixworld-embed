import { fetchMovieStream } from "@/lib/api";
import HLSPlayerClient from "@/components/HLSPlayerClient";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const stream = await fetchMovieStream(id);
    if (stream.status_code === "200" && stream.data.title) {
      const title = stream.data.title;
      return {
        title,
        description: `Watch ${title} online. Free HD streaming with subtitles.`,
        openGraph: {
          title,
          description: `Watch ${title} online. Free HD streaming with subtitles.`,
          images: stream.data.backdrop ? [{ url: stream.data.backdrop }] : [],
          type: "video.movie",
        },
        robots: { index: false, follow: false }, // embed pages shouldn't be indexed
      };
    }
  } catch { /* fall through */ }
  return { title: "Movie Player", robots: { index: false, follow: false } };
}

export default async function MovieEmbed({ params }: Props) {
  const { id } = await params;

  let stream;
  try {
    stream = await fetchMovieStream(id);
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

import { fetchTVStream } from "@/lib/api";
import HLSPlayerClient from "@/components/HLSPlayerClient";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string; season: string; episode: string }>;
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

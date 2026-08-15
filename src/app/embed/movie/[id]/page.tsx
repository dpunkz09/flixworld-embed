import { fetchMovieStream } from "@/lib/api";
import HLSPlayerClient from "@/components/HLSPlayerClient";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
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

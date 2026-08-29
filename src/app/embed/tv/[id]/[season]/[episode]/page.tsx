import { fetchTVStream } from "@/lib/api";
import JWPlayerClient from "@/components/JWPlayerClient";
import { notFound } from "next/navigation";
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

  let data;
  try {
    data = await fetchTVStream(id, season, episode);
  } catch {
    notFound();
  }

  if (!data.sources.length) {
    notFound();
  }

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000", overflow: "hidden" }}>
      <JWPlayerClient data={data} />
    </div>
  );
}

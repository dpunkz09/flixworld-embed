import { fetchMovieStream } from "@/lib/api";
import JWPlayerClient from "@/components/JWPlayerClient";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Movie ${id} — Flixworld`,
    robots: { index: false, follow: false },
  };
}

export default async function MovieEmbed({ params }: Props) {
  const { id } = await params;

  // notFound() returns `never` — TypeScript correctly infers data: StreamData
  const data = await fetchMovieStream(id).catch(() => notFound());

  if (!data.sources.length) notFound();

  return (
    <div style={{ width: "100%", height: "100%", background: "#000", overflow: "hidden" }}>
      <JWPlayerClient data={data} />
    </div>
  );
}

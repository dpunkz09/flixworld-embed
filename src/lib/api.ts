import { unstable_cache } from "next/cache";

const API_BASE = process.env.STREAM_API_BASE ?? "";
const API_KEY = process.env.STREAM_API_KEY ?? "";
const PROXY_BASE = process.env.NEXT_PUBLIC_PROXY_BASE_URL ?? process.env.PROXY_BASE_URL ?? "";

function apiFetch(url: string): Promise<Response> {
  return fetch(url, {
    // Cache for 5 minutes — stream URLs are short-lived tokens but re-fetching
    // every request hammers the upstream and causes double fetches (metadata + page)
    next: { revalidate: 300 },
    headers: {
      "X-Api-Key": API_KEY,
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
}

/** Unified subtitle track — both `subtitles` and `default_subs` share this shape */
export interface Subtitle {
  id: string;
  language: string;
  format?: string;
  direct_download_url: string | null;
}

export interface StreamData {
  title: string;
  imdb_id: string;
  file_name: string;
  backdrop: string;
  stream_urls: string[];
  season?: string;
  episode?: string;
}

export interface StreamResponse {
  status_code: string;
  data: StreamData;
  /** Embedded tracks bundled with the file (TV shows, SRT/VTT) */
  default_subs: Subtitle[];
  /** wyzie/OpenSubtitles tracks */
  subtitles: Subtitle[];
  subtitles_provider: string;
  thumbnails_url?: string | null;
}

export function proxyUrl(url: string): string {
  return `${PROXY_BASE}${encodeURIComponent(url)}`;
}

export const fetchMovieStream = unstable_cache(
  async (tmdbId: string): Promise<StreamResponse> => {
    const res = await apiFetch(`${API_BASE}/movie/${tmdbId}`);
    if (!res.ok) throw new Error("Failed to fetch movie stream");
    return res.json();
  },
  ["movie-stream"],
  { revalidate: 300 }
);

export const fetchTVStream = unstable_cache(
  async (tmdbId: string, season: string, episode: string): Promise<StreamResponse> => {
    const res = await apiFetch(`${API_BASE}/tv/${tmdbId}/${season}/${episode}`);
    if (!res.ok) throw new Error("Failed to fetch TV stream");
    return res.json();
  },
  ["tv-stream"],
  { revalidate: 300 }
);

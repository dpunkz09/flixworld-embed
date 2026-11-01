/**
 * Streamed API Client (Primary Source)
 * 
 * Cloudflare Worker-based streaming API that aggregates multiple sources
 * with built-in proxy and subtitle support.
 */

export interface StreamedSource {
  language: string;
  url: string;
  type: "hls";
  quality: string;
}

export interface StreamedSubtitle {
  url: string;
  lang: string;
}

export interface StreamedResponse {
  status: string;
  streams: StreamedSource[];
  subtitles: StreamedSubtitle[];
  totalLanguages?: number;
}

const STREAMED_BASE = "https://long-night-d802.streamed-5.workers.dev";

/**
 * Fetch streams from Streamed API
 * Returns null if not found (404) to allow fallback
 */
export async function fetchStreamed(
  type: "movie" | "tv",
  tmdbId: string,
  season?: string,
  episode?: string
): Promise<StreamedResponse | null> {
  try {
    let url: string;
    if (type === "movie") {
      url = `${STREAMED_BASE}/movie/${tmdbId}`;
    } else {
      url = `${STREAMED_BASE}/tv/${tmdbId}/${season}/${episode}`;
    }

    console.log(`[Streamed] Fetching ${type} ${tmdbId}${season ? ` S${season}E${episode}` : ""}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (response.status === 404) {
      console.log(`[Streamed] Not found (404) - will use fallback`);
      return null;
    }

    if (!response.ok) {
      console.warn(`[Streamed] API error: ${response.status}`);
      return null;
    }

    const data: StreamedResponse = await response.json();

    if (data.status !== "success" || !data.streams || data.streams.length === 0) {
      console.log(`[Streamed] No streams available - will use fallback`);
      return null;
    }

    console.log(`[Streamed] Found ${data.streams.length} streams, ${data.subtitles?.length || 0} subtitles`);
    return data;
  } catch (error) {
    console.warn(`[Streamed] Error:`, error);
    return null;
  }
}

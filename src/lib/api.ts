import { unstable_cache } from "next/cache";

const VIDZEE_BASE   = "https://mp4-server.jpaworx.com/stream/vidzee";
const SUBTITLE_BASE = "https://cache.vdrk.site/v2";
const TMDB_BASE     = "https://api.themoviedb.org/3";
const TMDB_KEY      = process.env.TMDB_API_KEY ?? "";

// ---------------------------------------------------------------------------
// Raw API response shapes — Vidzee
// ---------------------------------------------------------------------------

interface VidzeeStream {
  url: string;
  type: string;
  language: string;
}

interface VidzeeResponse {
  ok: boolean;
  extracted: {
    streams: VidzeeStream[];
  };
}

// ---------------------------------------------------------------------------
// Public types consumed by components
// ---------------------------------------------------------------------------

export interface StreamSource {
  /** Direct URL to the MP4/MKV file */
  url: string;
  language: string;
}

export interface SubtitleTrack {
  /** Human-readable language name, e.g. "English" */
  label: string;
  /** Absolute URL to the .vtt file */
  file: string;
}

/** Normalised TMDB metadata shared between movies and TV episodes */
export interface MediaInfo {
  type: "movie" | "tv";
  /** Main title — movie title or show name */
  title: string;
  /** Tagline (movies) or show overview used as secondary line */
  tagline?: string;
  /** Short overview / episode overview */
  overview?: string;
  /** Episode-specific fields — only present for TV */
  episodeTitle?: string;
  season?: number;
  episode?: number;
  /** e.g. "2h 19m" or "S1 · E1" */
  meta?: string;
  /** TMDB poster path, e.g. "/jSziioSwPVrOy9Yow3XhWIBDjq1.jpg" */
  posterPath?: string;
  /** TMDB backdrop path */
  backdropPath?: string;
  /** Release year */
  year?: number;
  /** 0–10 */
  rating?: number;
  /** Comma-separated genre names */
  genres?: string;
}

export interface StreamData {
  /** TMDB id — used as stable watch-progress key */
  tmdbId: string;
  /** IMDB id (tt…) — passed to the worker for RiveStream lookups */
  imdbId?: string;
  /** "movie" | "tv" — used by the server preloader */
  mediaType?: "movie" | "tv";
  season?: string;
  episode?: string;
  sources: StreamSource[];
  /** Available subtitle/caption tracks (may be empty) */
  subtitles: SubtitleTrack[];
  /** TMDB metadata for the overlay (undefined if fetch failed) */
  mediaInfo?: MediaInfo;
}

// ---------------------------------------------------------------------------
// Fetch helpers — Vidzee
// ---------------------------------------------------------------------------

async function vidzeeGet(url: string): Promise<VidzeeResponse> {
  const res = await fetch(url, {
    next: { revalidate: 300 },
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Vidzee API error ${res.status}: ${url}`);
  const json: VidzeeResponse = await res.json();
  if (!json.ok) throw new Error(`Vidzee returned ok=false for: ${url}`);
  return json;
}

async function subtitleGet(url: string): Promise<SubtitleTrack[]> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 300 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const json: SubtitleTrack[] = await res.json();
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

function toStreamData(
  tmdbId: string,
  json: VidzeeResponse,
  subtitles: SubtitleTrack[],
  mediaInfo: MediaInfo | undefined,
  mediaType: "movie" | "tv",
  season?: string,
  episode?: string,
): StreamData {
  const sources: StreamSource[] = json.extracted.streams.map((s) => ({
    url: s.url,
    language: s.language,
  }));
  return {
    tmdbId,
    mediaType,
    sources,
    subtitles,
    mediaInfo,
    ...(season ? { season, episode } : {}),
  };
}

// ---------------------------------------------------------------------------
// Fetch helpers — TMDB
// ---------------------------------------------------------------------------

function fmtRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function genreNames(genres: { name: string }[]): string {
  return genres?.map((g) => g.name).join(", ") ?? "";
}

async function fetchMovieInfo(tmdbId: string): Promise<MediaInfo | undefined> {
  try {
    const res = await fetch(
      `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await res.json();
    const year = d.release_date ? new Date(d.release_date).getFullYear() : undefined;
    return {
      type: "movie",
      title: d.title ?? d.original_title,
      tagline: d.tagline || undefined,
      overview: d.overview || undefined,
      posterPath: d.poster_path ?? undefined,
      backdropPath: d.backdrop_path ?? undefined,
      year,
      rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : undefined,
      genres: genreNames(d.genres ?? []),
      meta: d.runtime ? fmtRuntime(d.runtime) : undefined,
    };
  } catch {
    return undefined;
  }
}

async function fetchTVInfo(
  tmdbId: string,
  season: string,
  episode: string,
): Promise<MediaInfo | undefined> {
  try {
    const [showRes, epRes] = await Promise.all([
      fetch(`${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`, {
        next: { revalidate: 86400 },
      }),
      fetch(
        `${TMDB_BASE}/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${TMDB_KEY}&language=en-US`,
        { next: { revalidate: 86400 } },
      ),
    ]);
    if (!showRes.ok) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const show: any = await showRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ep: any = epRes.ok ? await epRes.json() : {};
    const sNum = parseInt(season, 10);
    const eNum = parseInt(episode, 10);
    const year = show.first_air_date
      ? new Date(show.first_air_date).getFullYear()
      : undefined;
    return {
      type: "tv",
      title: show.name ?? show.original_name,
      tagline: show.tagline || undefined,
      overview: ep.overview || show.overview || undefined,
      episodeTitle: ep.name || undefined,
      season: sNum,
      episode: eNum,
      posterPath: show.poster_path ?? undefined,
      backdropPath: ep.still_path ?? show.backdrop_path ?? undefined,
      year,
      rating: show.vote_average ? Math.round(show.vote_average * 10) / 10 : undefined,
      genres: genreNames(show.genres ?? []),
      meta: `S${sNum} · E${eNum}`,
    };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Cached public fetch functions
// ---------------------------------------------------------------------------

export const fetchMovieStream = unstable_cache(
  async (tmdbId: string): Promise<StreamData> => {
    const [json, subtitles, mediaInfo] = await Promise.all([
      vidzeeGet(`${VIDZEE_BASE}/movie/${tmdbId}`),
      subtitleGet(`${SUBTITLE_BASE}/movie/${tmdbId}/`),
      fetchMovieInfo(tmdbId),
    ]);
    return toStreamData(tmdbId, json, subtitles, mediaInfo, "movie");
  },
  ["vidzee-movie"],
  { revalidate: 300 },
);

export const fetchTVStream = unstable_cache(
  async (tmdbId: string, season: string, episode: string): Promise<StreamData> => {
    const [json, subtitles, mediaInfo] = await Promise.all([
      vidzeeGet(`${VIDZEE_BASE}/tv/${tmdbId}/${season}/${episode}`),
      subtitleGet(`${SUBTITLE_BASE}/tv/${tmdbId}/${season}/${episode}`),
      fetchTVInfo(tmdbId, season, episode),
    ]);
    return toStreamData(tmdbId, json, subtitles, mediaInfo, "tv", season, episode);
  },
  ["vidzee-tv"],
  { revalidate: 300, tags: ["vidzee-tv"] },
);

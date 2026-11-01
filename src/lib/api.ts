import { unstable_cache } from "next/cache";
import { fetchVidsrcMovie, fetchVidsrcTV, type VidsrcStreamData } from "./vidsrc";

// TMDB API for metadata
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_KEY = process.env.TMDB_API_KEY ?? "";

// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------
// Vidsrc types are imported from ./vidsrc.ts

// ---------------------------------------------------------------------------
// Minimal TMDB response shapes (avoids `any`, catches field-name typos)
// ---------------------------------------------------------------------------

interface TmdbMovie {
  title?: string;
  original_title?: string;
  tagline?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  vote_average?: number;
  runtime?: number;
  genres?: { name: string }[];
}

interface TmdbShow {
  name?: string;
  original_name?: string;
  tagline?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date?: string;
  vote_average?: number;
  genres?: { name: string }[];
}

interface TmdbEpisode {
  name?: string;
  overview?: string;
  still_path?: string;
}

// ---------------------------------------------------------------------------
// Public types consumed by components
// ---------------------------------------------------------------------------

export interface StreamSource {
  /** Direct URL to the stream (HLS playlist or MP4/MKV file) */
  url: string;
  language: string;
  /** Stream type — used by JW Player to pick the correct parser */
  type?: "hls" | "mp4";
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
  title: string;
  tagline?: string;
  overview?: string;
  episodeTitle?: string;
  season?: number;
  episode?: number;
  /** e.g. "2h 19m" or "S1 · E1" */
  meta?: string;
  posterPath?: string;
  backdropPath?: string;
  year?: number;
  /** 0–10 */
  rating?: number;
  genres?: string;
}

export interface StreamData {
  /** TMDB id — used as stable watch-progress key */
  tmdbId: string;
  imdbId?: string;
  mediaType?: "movie" | "tv";
  season?: string;
  episode?: string;
  sources: StreamSource[];
  subtitles: SubtitleTrack[];
  mediaInfo?: MediaInfo;
}

// ---------------------------------------------------------------------------
// Fetch helpers — Vidsrc
// ---------------------------------------------------------------------------

function toStreamData(
  tmdbId: string,
  vidsrcData: VidsrcStreamData,
  mediaInfo: MediaInfo | undefined,
  mediaType: "movie" | "tv",
  season?: string,
  episode?: string
): StreamData {
  // Vidsrc returns fully tokenized URLs ready to use
  const sources: StreamSource[] = vidsrcData.sources.map((s) => ({
    url: s.url,
    language: s.quality,
    type: s.type,
  }));

  const subtitles: SubtitleTrack[] = vidsrcData.subtitles.map((sub) => ({
    label: sub.label,
    file: sub.file,
  }));

  return {
    tmdbId,
    mediaType,
    sources,
    subtitles,
    mediaInfo,
    // Only spread season+episode when both are present
    ...(season && episode ? { season, episode } : {}),
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
    const d: TmdbMovie = await res.json();
    const year = d.release_date ? new Date(d.release_date).getFullYear() : undefined;
    return {
      type:        "movie",
      title:       d.title ?? d.original_title ?? "Unknown",
      tagline:     d.tagline     || undefined,
      overview:    d.overview    || undefined,
      posterPath:  d.poster_path   ?? undefined,
      backdropPath:d.backdrop_path ?? undefined,
      year,
      rating:  d.vote_average ? Math.round(d.vote_average * 10) / 10 : undefined,
      genres:  genreNames(d.genres ?? []),
      meta:    d.runtime ? fmtRuntime(d.runtime) : undefined,
    };
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[fetchMovieInfo] Failed for tmdbId=${tmdbId}`);
    }
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
    const show: TmdbShow    = await showRes.json();
    const ep: TmdbEpisode   = epRes.ok ? await epRes.json() : {};
    const sNum = parseInt(season,  10);
    const eNum = parseInt(episode, 10);
    const year = show.first_air_date
      ? new Date(show.first_air_date).getFullYear()
      : undefined;
    return {
      type:         "tv",
      title:        show.name ?? show.original_name ?? "Unknown",
      tagline:      show.tagline  || undefined,
      overview:     ep.overview   || show.overview || undefined,
      episodeTitle: ep.name       || undefined,
      season:       sNum,
      episode:      eNum,
      posterPath:   show.poster_path   ?? undefined,
      backdropPath: ep.still_path ?? show.backdrop_path ?? undefined,
      year,
      rating:  show.vote_average ? Math.round(show.vote_average * 10) / 10 : undefined,
      genres:  genreNames(show.genres ?? []),
      meta:    `S${sNum} · E${eNum}`,
    };
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[fetchTVInfo] Failed for tmdbId=${tmdbId} S${season}E${episode}`);
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Cached public fetch functions
// ---------------------------------------------------------------------------

export const fetchMovieStream = unstable_cache(
  async (tmdbId: string): Promise<StreamData> => {
    const [vidsrcData, mediaInfo] = await Promise.all([
      fetchVidsrcMovie(tmdbId),
      fetchMovieInfo(tmdbId),
    ]);
    return toStreamData(tmdbId, vidsrcData, mediaInfo, "movie");
  },
  ["vidsrc-movie"],
  { revalidate: 300, tags: ["vidsrc-movie"] }
);

export const fetchTVStream = unstable_cache(
  async (tmdbId: string, season: string, episode: string): Promise<StreamData> => {
    const [vidsrcData, mediaInfo] = await Promise.all([
      fetchVidsrcTV(tmdbId, season, episode),
      fetchTVInfo(tmdbId, season, episode),
    ]);
    return toStreamData(tmdbId, vidsrcData, mediaInfo, "tv", season, episode);
  },
  ["vidsrc-tv"],
  { revalidate: 300, tags: ["vidsrc-tv"] }
);

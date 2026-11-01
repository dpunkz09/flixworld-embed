import { unstable_cache } from "next/cache";

// Use the new VidNest Worker API (discovered and documented)
const VIDNEST_BASE  = "https://long-night-d802.streamed-5.workers.dev";
const VIDRIFT_BASE  = "https://embed.vidrift.net/api/boot";
const VIDBOLT_BASE  = "https://vidbolt.xyz/api/resolve";
const TMDB_BASE     = "https://api.themoviedb.org/3";
const TMDB_KEY      = process.env.TMDB_API_KEY ?? "";

// ---------------------------------------------------------------------------
// Raw API response shapes — VidNest Worker
// ---------------------------------------------------------------------------

interface VidNestStream {
  url: string;
  type: string;
  language: string;
  quality: string;
}

interface VidNestSubtitle {
  lang: string;
  language?: string;
  url: string;
}

interface VidNestResponse {
  status: string;
  streams: VidNestStream[];
  subtitles: VidNestSubtitle[];
}

// ---------------------------------------------------------------------------
// Raw API response shapes — VidRift API
// ---------------------------------------------------------------------------

interface VidRiftRung {
  width: number;
  height: number;
}

interface VidRiftOrionStream {
  index: number;
  url: string;
  proxyUrl: string;
  type: "hls" | "mp4";
  provider: string;
  direct: boolean;
  name: string;
  rungs?: VidRiftRung[];
  subtitleListUrl: string;
}

interface VidRiftMeta {
  tmdbId: string;
  type: "movie" | "tv";
  season: number | null;
  episode: number | null;
  playbackToken: string;
  orionStreams: VidRiftOrionStream[];
}

interface VidRiftResponse {
  meta: VidRiftMeta;
}

// ---------------------------------------------------------------------------
// Raw API response shapes — VidBolt API
// ---------------------------------------------------------------------------

interface VidBoltSource {
  url: string;
  kind: "hls" | "mp4";
  quality: string;
  language: string;
}

interface VidBoltSubtitle {
  url: string;
  label: string;
  lang: string;
}

interface VidBoltStream {
  server: string;
  sources: VidBoltSource[];
  subtitles?: VidBoltSubtitle[]; // Optional
}

interface VidBoltResponse {
  stream: VidBoltStream;
}

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
// Fetch helpers — VidNest Worker
// ---------------------------------------------------------------------------

async function vidnestGet(url: string): Promise<VidNestResponse> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      "Referer": "https://vidnest.fun/",
      "Origin": "https://vidnest.fun",
    },
  });
  if (!res.ok) throw new Error(`VidNest API error ${res.status}: ${url}`);
  const json: VidNestResponse = await res.json();
  if (json.status !== "success") throw new Error(`VidNest returned status=${json.status} for: ${url}`);
  return json;
}

// ---------------------------------------------------------------------------
// Fetch helpers — VidRift API
// ---------------------------------------------------------------------------

async function vidriftGet(url: string): Promise<VidRiftResponse> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      "Referer": "https://embed.vidrift.net/",
    },
  });
  if (!res.ok) throw new Error(`VidRift API error ${res.status}: ${url}`);
  const json: VidRiftResponse = await res.json();
  return json;
}

// ---------------------------------------------------------------------------
// Fetch helpers — VidBolt API
// ---------------------------------------------------------------------------

async function vidboltGet(url: string): Promise<VidBoltResponse> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`VidBolt API error ${res.status}: ${url}`);
  const json: VidBoltResponse = await res.json();
  
  // Validate response structure
  if (!json.stream) {
    throw new Error(`VidBolt API returned invalid response: missing stream object`);
  }
  
  return json;
}

function toStreamData(
  tmdbId: string,
  json: VidNestResponse,
  mediaInfo: MediaInfo | undefined,
  mediaType: "movie" | "tv",
  season?: string,
  episode?: string,
): StreamData {
  // Get Cloudflare Worker proxy URL from environment
  const WORKER_PROXY = process.env.NEXT_PUBLIC_HLS_PROXY;
  
  if (!WORKER_PROXY) {
    throw new Error(
      "NEXT_PUBLIC_HLS_PROXY environment variable is not set. " +
      "Please deploy the Cloudflare Worker and add its URL to .env.local"
    );
  }
  
  // Proxy all stream URLs through Cloudflare Worker for CORS
  const sources: StreamSource[] = json.streams.map((s) => ({
    url: `${WORKER_PROXY}?url=${encodeURIComponent(s.url)}`,
    language: s.language,
    type: "hls" as const,
  }));

  // Proxy subtitle URLs as well
  const subtitles: SubtitleTrack[] = json.subtitles.map((sub) => ({
    label: sub.lang,
    file: `${WORKER_PROXY}?url=${encodeURIComponent(sub.url)}`,
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

function toStreamDataFromVidRift(
  tmdbId: string,
  json: VidRiftResponse,
  mediaInfo: MediaInfo | undefined,
  mediaType: "movie" | "tv",
  season?: string,
  episode?: string,
): StreamData {
  const token = json.meta.playbackToken;
  const baseUrl = "https://embed.vidrift.net";

  // Convert Orion streams to StreamSource format
  const sources: StreamSource[] = json.meta.orionStreams.map((stream) => {
    const fullUrl = stream.url.startsWith("http") ? stream.url : `${baseUrl}${stream.url}`;
    return {
      url: `${fullUrl}?token=${token}`,
      language: stream.name.replace("Orion · ", ""), // Extract language from name
      type: stream.type === "mp4" ? "mp4" : "hls",
    };
  });

  // For subtitles, we'd need to fetch the subtitleListUrl to get the actual subtitle tracks
  // For now, return empty array (can be enhanced later if needed)
  const subtitles: SubtitleTrack[] = [];

  return {
    tmdbId,
    mediaType,
    sources,
    subtitles,
    mediaInfo,
    ...(season && episode ? { season, episode } : {}),
  };
}

function toStreamDataFromVidBolt(
  tmdbId: string,
  json: VidBoltResponse,
  mediaInfo: MediaInfo | undefined,
  mediaType: "movie" | "tv",
  season?: string,
  episode?: string,
): StreamData {
  // Convert VidBolt sources to StreamSource format
  const sources: StreamSource[] = (json.stream?.sources || []).map((source) => ({
    url: source.url,
    language: source.language,
    type: source.kind === "mp4" ? "mp4" : "hls",
  }));

  // Convert VidBolt subtitles to SubtitleTrack format (with safety check)
  const subtitles: SubtitleTrack[] = (json.stream?.subtitles || []).map((sub) => ({
    label: sub.label,
    file: sub.url,
  }));

  return {
    tmdbId,
    mediaType,
    sources,
    subtitles,
    mediaInfo,
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
    const [json, mediaInfo] = await Promise.all([
      vidnestGet(`${VIDNEST_BASE}/movie/${tmdbId}`),
      fetchMovieInfo(tmdbId),
    ]);
    return toStreamData(tmdbId, json, mediaInfo, "movie");
  },
  ["vidnest-movie"],
  { revalidate: 300, tags: ["vidnest-movie"] },
);

export const fetchTVStream = unstable_cache(
  async (tmdbId: string, season: string, episode: string): Promise<StreamData> => {
    const [json, mediaInfo] = await Promise.all([
      vidnestGet(`${VIDNEST_BASE}/tv/${tmdbId}/${season}/${episode}`),
      fetchTVInfo(tmdbId, season, episode),
    ]);
    return toStreamData(tmdbId, json, mediaInfo, "tv", season, episode);
  },
  ["vidnest-tv"],
  { revalidate: 300, tags: ["vidnest-tv"] },
);

// ---------------------------------------------------------------------------
// VidRift API functions (alternative streaming source)
// ---------------------------------------------------------------------------

export const fetchMovieStreamVidRift = unstable_cache(
  async (tmdbId: string): Promise<StreamData> => {
    const [json, mediaInfo] = await Promise.all([
      vidriftGet(`${VIDRIFT_BASE}/movie/${tmdbId}`),
      fetchMovieInfo(tmdbId),
    ]);
    return toStreamDataFromVidRift(tmdbId, json, mediaInfo, "movie");
  },
  ["vidrift-movie"],
  { revalidate: 300, tags: ["vidrift-movie"] },
);

export const fetchTVStreamVidRift = unstable_cache(
  async (tmdbId: string, season: string, episode: string): Promise<StreamData> => {
    const [json, mediaInfo] = await Promise.all([
      vidriftGet(`${VIDRIFT_BASE}/tv/${tmdbId}/${season}/${episode}`),
      fetchTVInfo(tmdbId, season, episode),
    ]);
    return toStreamDataFromVidRift(tmdbId, json, mediaInfo, "tv", season, episode);
  },
  ["vidrift-tv"],
  { revalidate: 300, tags: ["vidrift-tv"] },
);

// ---------------------------------------------------------------------------
// VidBolt API functions (alternative streaming source)
// ---------------------------------------------------------------------------

export const fetchMovieStreamVidBolt = unstable_cache(
  async (tmdbId: string): Promise<StreamData> => {
    const [json, mediaInfo] = await Promise.all([
      vidboltGet(`${VIDBOLT_BASE}?type=movie&id=${tmdbId}`),
      fetchMovieInfo(tmdbId),
    ]);
    return toStreamDataFromVidBolt(tmdbId, json, mediaInfo, "movie");
  },
  ["vidbolt-movie"],
  { revalidate: 300, tags: ["vidbolt-movie"] },
);

export const fetchTVStreamVidBolt = unstable_cache(
  async (tmdbId: string, season: string, episode: string): Promise<StreamData> => {
    const [json, mediaInfo] = await Promise.all([
      vidboltGet(`${VIDBOLT_BASE}?type=tv&id=${tmdbId}&season=${season}&episode=${episode}`),
      fetchTVInfo(tmdbId, season, episode),
    ]);
    return toStreamDataFromVidBolt(tmdbId, json, mediaInfo, "tv", season, episode);
  },
  ["vidbolt-tv"],
  { revalidate: 300, tags: ["vidbolt-tv"] },
);

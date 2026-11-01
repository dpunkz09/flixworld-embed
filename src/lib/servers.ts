/**
 * VidNest Direct Streaming - No Proxy Needed!
 * 
 * VidNest Worker API returns direct HLS streams that work without proxy.
 * All streams are fetched from: https://long-night-d802.streamed-5.workers.dev
 * 
 * The server-side fetch in api.ts gets the default streams.
 * This file is simplified since we don't need multiple server sources anymore -
 * VidNest already aggregates multiple sources and returns the best ones.
 */

import type { StreamData, StreamSource } from "./api";
import { fetchMovieStreamVidRift, fetchTVStreamVidRift } from "./api";

// ---------------------------------------------------------------------------
// Public types (kept for compatibility)
// ---------------------------------------------------------------------------

export type ServerStatus = "idle" | "loading" | "ready" | "error";

export interface ServerSource {
  url: string;
  quality: string;
  server: string;
  type: "hls" | "mp4";
}

export interface ServerSubtitle {
  url: string;
  label: string;
  lang: string;
}

export interface ServerResult {
  sources: ServerSource[];
  subtitles: ServerSubtitle[];
}

export interface ServerState {
  id: string;
  label: string;
  tag: string;
  status: ServerStatus;
  result: ServerResult | null;
  error?: string;
}

export interface ServerDef {
  id: string;
  label: string;
  tag: string;
  /** VidNest/VidBolt language key or VidRift indicator */
  key: string;
  /** If true, this server fetches from VidRift API */
  isVidRift?: boolean;
  fetch: (data: StreamData, signal?: AbortSignal) => Promise<ServerResult | null>;
}

// ---------------------------------------------------------------------------
// Server definitions - Now just organize VidNest streams by language
// ---------------------------------------------------------------------------

const SERVER_LIST: Array<{ id: string; label: string; tag: string; key: string; isVidRift?: boolean }> = [
  // VidNest servers (original)
  { id: "original", label: "Original", tag: "1080p", key: "Original" },
  { id: "hindi",    label: "Hindi",    tag: "1080p", key: "Hindi"    },
  { id: "arabic",   label: "Arabic",   tag: "1080p", key: "Arabic"   },
  { id: "french",   label: "French",   tag: "1080p", key: "French"   },
  { id: "spanish",  label: "Spanish",  tag: "720p",  key: "Spanish"  },
  
  // VidRift servers (alternative source)
  { id: "vidrift-original", label: "VidRift Original", tag: "1080p", key: "Original", isVidRift: true },
  { id: "vidrift-hindi",    label: "VidRift Hindi",    tag: "1080p", key: "Hindi",    isVidRift: true },
  { id: "vidrift-tamil",    label: "VidRift Tamil",    tag: "1080p", key: "Tamil",    isVidRift: true },
  { id: "vidrift-french",   label: "VidRift French",   tag: "1080p", key: "French",   isVidRift: true },
  
  // VidBolt servers (from pre-loaded data)
  { id: "vidbolt-english", label: "VidBolt English", tag: "1080p", key: "English" },
  { id: "vidbolt-french",  label: "VidBolt French",  tag: "1080p", key: "French" },
  { id: "vidbolt-spanish", label: "VidBolt Spanish", tag: "1080p", key: "Spanish" },
  { id: "vidbolt-arabic",  label: "VidBolt Arabic",  tag: "1080p", key: "Arabic sub" },
  { id: "vidbolt-russian", label: "VidBolt Russian", tag: "1080p", key: "Russian" },
];

/**
 * Build a ServerDef for a given language.
 * If isVidRift is true, fetches from VidRift API. Otherwise uses pre-fetched data.
 */
function makeDef(
  entry: (typeof SERVER_LIST)[number],
  isDefault: boolean,
): ServerDef {
  return {
    ...entry,
    fetch: async (data: StreamData, signal?: AbortSignal) => {
      if (signal?.aborted) return null;
      
      // If this is a VidRift server, fetch from VidRift API
      if (entry.isVidRift) {
        try {
          let vidriftData: StreamData;
          
          // Determine if movie or TV show
          if (data.mediaType === "tv" && data.season && data.episode) {
            vidriftData = await fetchTVStreamVidRift(data.tmdbId, data.season, data.episode);
          } else {
            vidriftData = await fetchMovieStreamVidRift(data.tmdbId);
          }
          
          if (signal?.aborted) return null;
          
          // Filter by language
          const matchingSource = vidriftData.sources.find(
            s => s.language.toLowerCase() === entry.key.toLowerCase()
          );
          
          if (!matchingSource) return null;
          
          return {
            sources: [{
              url: matchingSource.url,
              quality: entry.key,
              server: entry.label,
              type: matchingSource.type ?? "hls",
            }],
            subtitles: (vidriftData.subtitles ?? []).map((s) => ({
              url: s.file,
              label: s.label,
              lang: "en",
            })),
          };
        } catch (error) {
          console.error(`VidRift fetch failed for ${entry.label}:`, error);
          return null;
        }
      }
      
      // VidNest/VidBolt: filter from pre-fetched streams
      const matchingSource = data.sources.find(
        s => s.language.toLowerCase() === entry.key.toLowerCase()
      );
      
      if (!matchingSource) {
        // If language not found, return the first available stream
        if (isDefault && data.sources.length > 0) {
          const fallback = data.sources[0];
          return {
            sources: [{
              url: fallback.url,
              quality: fallback.language,
              server: entry.label,
              type: fallback.type ?? "hls",
            }],
            subtitles: (data.subtitles ?? []).map((s) => ({
              url: s.file,
              label: s.label,
              lang: "en",
            })),
          };
        }
        return null;
      }

      return {
        sources: [{
          url: matchingSource.url,
          quality: entry.key,
          server: entry.label,
          type: matchingSource.type ?? "hls",
        }],
        subtitles: (data.subtitles ?? []).map((s) => ({
          url: s.file,
          label: s.label,
          lang: "en",
        })),
      };
    },
  };
}

export const SERVER_DEFS: ServerDef[] = SERVER_LIST.map((entry, i) =>
  makeDef(entry, i === 0),
);

// ---------------------------------------------------------------------------
// Preloader
// Fires all server fetches in parallel. Returns a cancel function that
// aborts every in-flight request immediately (not just a flag-flip).
// ---------------------------------------------------------------------------

export function preloadServers(
  data: StreamData,
  onUpdate: (states: ServerState[]) => void,
): () => void {
  // Single controller aborts all concurrent fetches on cancel
  const controller = new AbortController();

  let states: ServerState[] = SERVER_DEFS.map((def) => ({
    id:     def.id,
    label:  def.label,
    tag:    def.tag,
    status: "loading" as const,
    result: null,
  }));

  onUpdate([...states]);

  SERVER_DEFS.forEach((def, idx) => {
    def
      .fetch(data, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        // Immutable update — avoids shared-mutation fragility
        states = states.map((s, i) =>
          i === idx
            ? { ...s, status: result ? "ready" : "error", result, error: result ? undefined : "No sources" }
            : s,
        );
        onUpdate([...states]);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        states = states.map((s, i) =>
          i === idx ? { ...s, status: "error", result: null, error: "Failed" } : s,
        );
        onUpdate([...states]);
      });
  });

  return () => controller.abort();
}

// ---------------------------------------------------------------------------
// Helper — pick highest-quality source from a ServerResult
// ---------------------------------------------------------------------------

export function pickBestSource(result: ServerResult): StreamSource {
  const ranked = [...result.sources].sort((a, b) => {
    // parseInt with radix 10; non-numeric strings (e.g. "Auto", "HD") → 0
    const qa = parseInt(a.quality, 10) || 0;
    const qb = parseInt(b.quality, 10) || 0;
    return qb - qa;
  });
  const best = ranked[0];
  return { url: best.url, language: best.quality, type: best.type };
}

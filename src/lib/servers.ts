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
  /** VidNest language key */
  key: string;
  fetch: (data: StreamData, signal?: AbortSignal) => Promise<ServerResult | null>;
}

// ---------------------------------------------------------------------------
// Server definitions - Now just organize VidNest streams by language
// ---------------------------------------------------------------------------

const SERVER_LIST: Array<{ id: string; label: string; tag: string; key: string }> = [
  { id: "original", label: "Original", tag: "1080p", key: "Original" },
  { id: "hindi",    label: "Hindi",    tag: "1080p", key: "Hindi"    },
  { id: "arabic",   label: "Arabic",   tag: "1080p", key: "Arabic"   },
  { id: "french",   label: "French",   tag: "1080p", key: "French"   },
  { id: "spanish",  label: "Spanish",  tag: "720p",  key: "Spanish"  },
];

/**
 * Build a ServerDef for a given language.
 * Since VidNest returns all streams at once, we just filter by language.
 */
function makeDef(
  entry: (typeof SERVER_LIST)[number],
  isDefault: boolean,
): ServerDef {
  return {
    ...entry,
    fetch: async (data: StreamData, signal?: AbortSignal) => {
      if (signal?.aborted) return null;
      
      // VidNest already fetched all streams - filter by language
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

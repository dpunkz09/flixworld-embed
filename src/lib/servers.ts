/**
 * Vidsrc.sh Multi-Server Support
 * 
 * Vidsrc returns multiple stream URLs (typically 3) from different CDN servers.
 * This file organizes them and provides fallback mechanisms.
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
// Server definitions - Vidsrc provides multiple CDN servers
// ---------------------------------------------------------------------------

const SERVER_LIST: Array<{ id: string; label: string; tag: string }> = [
  { id: "server1", label: "Server 1", tag: "HD" },
  { id: "server2", label: "Server 2", tag: "HD" },
  { id: "server3", label: "Server 3", tag: "HD" },
];

/**
 * Build a ServerDef for a given server index.
 * Vidsrc returns all streams at once, we just organize them by index.
 */
function makeDef(
  entry: (typeof SERVER_LIST)[number],
  index: number,
): ServerDef {
  return {
    ...entry,
    key: entry.id,
    fetch: async (data: StreamData, signal?: AbortSignal) => {
      if (signal?.aborted) return null;
      
      // Get the stream at this index
      const source = data.sources[index];
      
      if (!source) {
        return null;
      }

      return {
        sources: [{
          url: source.url,
          quality: source.language || "HD",
          server: entry.label,
          type: source.type ?? "hls",
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
  makeDef(entry, i),
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

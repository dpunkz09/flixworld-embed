/**
 * Server registry + preload logic for the server-switching overlay.
 *
 * Two top-level backends are defined:
 *   1. Vidzee      — reuses the server-side sources already in StreamData (instant)
 *   2. RiveStream  — fetches from the Cloudflare Worker; the single response is
 *                    then split into one entry per CDN sub-server
 *                    (e.g. "RiveStream • Quasar", "RiveStream • PrimeVids", …)
 *                    so each appears as its own selectable row in the overlay.
 */

import type { StreamData, StreamSource } from "./api";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ServerStatus = "idle" | "loading" | "ready" | "error";

export interface ServerSource {
  url: string;
  quality: string;
  server: string;
  type: "hls" | "mp4";
  headers?: Record<string, string>;
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
  /** Short tag shown on the badge */
  tag: string;
  status: ServerStatus;
  result: ServerResult | null;
  error?: string;
}

export interface ServerDef {
  id: string;
  label: string;
  tag: string;
  fetch: (data: StreamData) => Promise<ServerResult | null>;
}

// ---------------------------------------------------------------------------
// Worker URL
// ---------------------------------------------------------------------------

const WORKER_URL =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_OTT_WORKER_URL ||
      process.env.OTT_WORKER_URL)) ||
  "https://ott-worker.dpunkz09.workers.dev";

// ---------------------------------------------------------------------------
// Raw worker response shape
// ---------------------------------------------------------------------------

interface WorkerSource {
  url: string;
  quality: string;
  server: string;
  type: string;
  headers?: Record<string, string>;
}

interface WorkerResponse {
  ok: boolean;
  sources?: WorkerSource[];
}

// ---------------------------------------------------------------------------
// Helper: extract the sub-server name from a full server string
//
//   "RiveStream • Quasar"  → "Quasar"
//   "RiveStream • PrimeVids" → "PrimeVids"
//   "RiveStream • Citadel" → "Citadel"
//   "Quasar"               → "Quasar"   (fallback — already short)
// ---------------------------------------------------------------------------

function subServerName(raw: string): string {
  const bullet = raw.indexOf("•");
  if (bullet !== -1) return raw.slice(bullet + 1).trim();
  return raw.trim();
}

// Stable display order for known sub-servers
const SUB_SERVER_ORDER = ["Quasar", "PrimeVids", "Citadel", "HindiCast", "FlowCast"];

function subServerOrder(name: string): number {
  const idx = SUB_SERVER_ORDER.indexOf(name);
  return idx === -1 ? SUB_SERVER_ORDER.length : idx;
}

// Tag badge per sub-server
function subServerTag(name: string): string {
  if (name === "Quasar")    return "HLS";
  if (name === "PrimeVids") return "CDN";
  if (name === "Citadel")   return "HLS";
  if (name === "HindiCast") return "HI";
  if (name === "FlowCast")  return "MP4";
  return "HLS";
}

// ---------------------------------------------------------------------------
// Server definitions
// ---------------------------------------------------------------------------

const vidzeeServer: ServerDef = {
  id: "vidzee",
  label: "Vidzee",
  tag: "HD",
  fetch: async (data) => {
    if (!data.sources.length) return null;
    return {
      sources: data.sources.map((s) => ({
        url: s.url,
        quality: s.language ?? "Auto",
        server: "Vidzee",
        type: "mp4" as const,
      })),
      subtitles: (data.subtitles ?? []).map((s) => ({
        url: s.file,
        label: s.label,
        lang: "en",
      })),
    };
  },
};

/**
 * Placeholder entry — used only to show a loading spinner in the panel
 * while the real worker fetch is in flight. `preloadServers` replaces this
 * with individual sub-server entries once the worker responds.
 */
const riveStreamPlaceholder: ServerDef = {
  id: "rivestream",
  label: "RiveStream",
  tag: "HLS",
  // fetch is never actually called by preloadServers — the function handles
  // RiveStream specially so it can expand into multiple entries.
  fetch: async () => null,
};

export const SERVER_DEFS: ServerDef[] = [vidzeeServer, riveStreamPlaceholder];

// ---------------------------------------------------------------------------
// Fetch the worker and split sources into per-sub-server ServerResults
// ---------------------------------------------------------------------------

async function fetchRiveStreamSubServers(
  data: StreamData,
): Promise<Map<string, ServerResult>> {
  const id = data.imdbId ?? data.tmdbId;
  if (!id) return new Map();

  // Treat as TV if mediaType says so OR if season/episode are present —
  // guards against stale cache entries that predate the mediaType field.
  const isMovie = data.mediaType === "tv" || data.season
    ? false
    : (data.mediaType ?? "movie") === "movie";

  let url: string;

  if (isMovie) {
    const qs = new URLSearchParams({ tmdbId: data.tmdbId });
    if (data.imdbId) qs.set("imdbId", data.imdbId);
    url = `${WORKER_URL}/movie/${encodeURIComponent(id)}?${qs}`;
  } else {
    const season = data.season ?? "1";
    const episode = data.episode ?? "1";
    const qs = new URLSearchParams({ tmdbId: data.tmdbId, season, episode });
    if (data.imdbId) qs.set("imdbId", data.imdbId);
    url = `${WORKER_URL}/tv/${encodeURIComponent(id)}/${season}/${episode}?${qs}`;
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(40_000) });
  if (!res.ok) return new Map();

  const json = (await res.json()) as WorkerResponse;
  if (!json.ok || !json.sources?.length) return new Map();

  // Always use vdrk.site subtitles (already in data.subtitles from server-side fetch).
  // Worker subtitles are ignored — vdrk.site is the canonical subtitle source for all servers.
  const subtitles: ServerSubtitle[] = (data.subtitles ?? []).map((s) => ({
    url: s.file,
    label: s.label,
    lang: "en",
  }));

  // Group sources by sub-server name
  const groups = new Map<string, ServerSource[]>();
  for (const s of json.sources) {
    if (!s.url) continue;
    const name = subServerName(s.server ?? "RiveStream");
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push({
      url: s.url,
      quality: s.quality ?? "Auto",
      server: name,
      type: (s.type === "hls" ? "hls" : "mp4") as "hls" | "mp4",
      ...(s.headers ? { headers: s.headers } : {}),
    });
  }

  // Build a ServerResult per group; all share the same subtitles
  const results = new Map<string, ServerResult>();
  for (const [name, sources] of groups) {
    results.set(name, { sources, subtitles });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Preloader — fires all fetches in parallel, calls onUpdate incrementally
// ---------------------------------------------------------------------------

export function preloadServers(
  data: StreamData,
  onUpdate: (states: ServerState[]) => void,
): () => void {
  // Start with Vidzee loading + RiveStream placeholder loading
  const states: ServerState[] = SERVER_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    tag: def.tag,
    status: "loading" as const,
    result: null,
  }));

  onUpdate([...states]);

  let cancelled = false;

  // ── Vidzee (index 0) ──────────────────────────────────────────────────
  vidzeeServer
    .fetch(data)
    .then((result) => {
      if (cancelled) return;
      states[0] = {
        ...states[0],
        status: result ? "ready" : "error",
        result,
        error: result ? undefined : "No sources available",
      };
      onUpdate([...states]);
    })
    .catch(() => {
      if (cancelled) return;
      states[0] = { ...states[0], status: "error", result: null, error: "Failed" };
      onUpdate([...states]);
    });

  // ── RiveStream sub-servers (replaces placeholder at index 1) ──────────
  fetchRiveStreamSubServers(data)
    .then((subServers) => {
      if (cancelled) return;

      if (subServers.size === 0) {
        // Nothing came back — mark placeholder as error
        states[1] = { ...states[1], status: "error", result: null, error: "No sources available" };
        onUpdate([...states]);
        return;
      }

      // Sort sub-servers into a stable display order, then build new states
      const sorted = [...subServers.entries()].sort(
        ([a], [b]) => subServerOrder(a) - subServerOrder(b),
      );

      // Replace the placeholder (index 1) with the first sub-server,
      // then append the rest
      const newEntries: ServerState[] = sorted.map(([name, result]) => ({
        id: `rivestream:${name}`,
        label: `RiveStream • ${name}`,
        tag: subServerTag(name),
        status: "ready" as const,
        result,
      }));

      // Splice: remove the placeholder, insert all sub-server entries
      states.splice(1, 1, ...newEntries);
      onUpdate([...states]);
    })
    .catch(() => {
      if (cancelled) return;
      states[1] = { ...states[1], status: "error", result: null, error: "Failed" };
      onUpdate([...states]);
    });

  return () => { cancelled = true; };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pick the best single source from a ServerResult.
 * Sorts by highest numeric quality, falls back to first entry.
 */
export function pickBestSource(result: ServerResult): StreamSource {
  const ranked = [...result.sources].sort((a, b) => {
    const qa = parseInt(a.quality) || 0;
    const qb = parseInt(b.quality) || 0;
    return qb - qa;
  });
  const best = ranked[0];
  return {
    url: best.url,
    language: best.quality,
  };
}

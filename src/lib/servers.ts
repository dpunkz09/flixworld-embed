/**
 * Server registry + preload logic for the server-switching overlay.
 *
 * All servers call the fw-api at FW_API_BASE (localhost:4444 in production,
 * falling back to https://mp4-server.jpaworx.com). The /api/stream proxy
 * route handles all client-side requests server-side, so the API is never
 * called directly from the browser.
 *
 * The first server (alfa / Videasy) reuses the sources already fetched
 * server-side and passed in via StreamData — instant, no extra request.
 * Every other server is fetched client-side during preload and resolves
 * independently so the UI updates incrementally.
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
  /** jpaworx stream key, e.g. "vidzee", "allmovies" */
  key: string;
  fetch: (data: StreamData, signal?: AbortSignal) => Promise<ServerResult | null>;
}

// ---------------------------------------------------------------------------
// Raw API response shape (shared across all servers)
// ---------------------------------------------------------------------------

interface JpaStream {
  url: string;
  type: string;
  language: string;
  quality?: string;
}

/** Source entry used by servers like ophim (klikxxi) that return `sources[]` */
interface JpaSource {
  url: string;
  type: string;
  quality?: string;
}

interface JpaExtracted {
  /** Present on most servers */
  streams?: JpaStream[];
  /** Present on ophim/klikxxi — same concept, different key */
  sources?: JpaSource[];
  /** Present on catflix/alfa/zeta/filxer — direct URL with no array */
  url?: string;
  /** HLS flag set by catflix / videasy / zeta */
  type?: string;
  /** Multiple quality variants — zeta (nextgencloudfabric) */
  all_urls?: string[];
}

interface JpaResponse {
  ok: boolean;
  extracted?: JpaExtracted;
}

// Token injected at build time from NEXT_PUBLIC_INTERNAL_API_TOKEN.
// Sent as a header on every /api/stream request so the route can reject
// requests that don't originate from this app.
const INTERNAL_TOKEN = process.env.NEXT_PUBLIC_INTERNAL_API_TOKEN ?? "";

function buildUrl(key: string, data: StreamData): string {
  const isTV = data.mediaType === "tv" || !!data.season;
  const qs = new URLSearchParams({ key, type: isTV ? "tv" : "movie", tmdbId: data.tmdbId });
  if (isTV) {
    qs.set("season",  data.season  ?? "1");
    qs.set("episode", data.episode ?? "1");
  }
  return `/api/stream?${qs}`;
}

async function fetchJpa(
  key: string,
  data: StreamData,
  signal?: AbortSignal,
): Promise<JpaStream[] | null> {
  const url = buildUrl(key, data);
  try {
    // Combine caller's signal with a per-request timeout
    const timeout = AbortSignal.timeout(20_000);
    const combined = signal
      ? AbortSignal.any([signal, timeout])
      : timeout;

    const res = await fetch(url, {
      signal: combined,
      headers: { "x-internal-token": INTERNAL_TOKEN },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as JpaResponse;
    if (!json.ok || !json.extracted) return null;

    const ext = json.extracted;

    // ── streams[] — most servers ──────────────────────────────────────────
    if (ext.streams?.length) return ext.streams;

    // ── sources[] — ophim/klikxxi ─────────────────────────────────────────
    if (ext.sources?.length) {
      return ext.sources
        .filter((s) => s.url)
        .map((s) => ({
          url:      s.url,
          type:     s.type ?? "hls",
          // JpaSource has no language field; use quality as the display label
          language: s.quality ?? "Auto",
          quality:  s.quality,
        }));
    }

    // ── flat url — catflix/buzz, alfa/videasy, filxer/rogflix, zeta ───────
    if (ext.url) {
      // zeta has all_urls[] with multiple quality variants — use those first
      if (ext.all_urls?.length) {
        return ext.all_urls.map((u, i) => ({
          url:      u,
          type:     ext.type ?? (u.includes(".m3u8") ? "hls" : "mp4"),
          language: `Quality ${i + 1}`,
          quality:  `${i + 1}`,
        }));
      }

      return [{
        url:      ext.url,
        type:     ext.type ?? (ext.url.includes(".m3u8") ? "hls" : "mp4"),
        language: "Auto",
      }];
    }

    return null;
  } catch {
    return null;
  }
}

function toServerResult(
  streams: JpaStream[],
  label: string,
  data: StreamData,
): ServerResult {
  // vdrk.site subtitles already in data — reuse for every server
  const subtitles: ServerSubtitle[] = (data.subtitles ?? []).map((s) => ({
    url:   s.file,
    label: s.label,
    lang:  "en",
  }));

  const sources: ServerSource[] = streams
    .filter((s) => s.url)
    .map((s) => {
      // Primary: trust the type string from the API
      // Fallback: sniff from URL — .m3u8 extension, or HLS path segments (/hls/, /hls2/, /hls3/)
      const hlsType =
        s.type === "hls" ||
        s.type === "m3u8" ||
        s.type === "application/x-mpegurl";
      const hlsUrl =
        s.url.includes(".m3u8") ||
        /\/hls\d*\//i.test(s.url);
      return {
        url:     s.url,
        quality: s.quality ?? s.language ?? "Auto",
        server:  label,
        type:    (hlsType || hlsUrl ? "hls" : "mp4") as "hls" | "mp4",
      };
    });

  return { sources, subtitles };
}

// ---------------------------------------------------------------------------
// Server definitions
// ---------------------------------------------------------------------------

const SERVER_LIST: Array<{ id: string; label: string; tag: string; key: string }> = [
  { id: "alfa",    label: "Alfa",    tag: "HD",    key: "videasy"            },
  { id: "gama",    label: "Gama",    tag: "HD",    key: "vidzee"             },
  { id: "catflix", label: "Catflix", tag: "HD",    key: "buzz"               },
  { id: "lamda",   label: "Lamda",   tag: "MULTI", key: "allmovies"          },
  { id: "hexa",    label: "Hexa",    tag: "HD",    key: "vidlink"            },
  { id: "ophim",   label: "Ophim",   tag: "HD",    key: "klikxxi"            },
  { id: "beta",    label: "Beta",    tag: "HD",    key: "vidxyz"             },
  { id: "sigma",   label: "Sigma",   tag: "HD",    key: "hollymoviehd"       },
  { id: "filxer",  label: "Filxer",  tag: "HD",    key: "rogflix"            },
  { id: "zeta",    label: "Zeta",    tag: "HD",    key: "nextgencloudfabric" },
];

/**
 * Build a ServerDef for a given entry.
 * The first entry (alfa/videasy) reuses data.sources — instant, no request.
 * All others call the jpaworx API.
 */
function makeDef(
  entry: (typeof SERVER_LIST)[number],
  isDefault: boolean,
): ServerDef {
  return {
    ...entry,
    fetch: async (data: StreamData, signal?: AbortSignal) => {
      if (isDefault) {
        if (!data.sources.length) return null;
        return toServerResult(
          data.sources.map((s) => ({
            url:      s.url,
            // Carry through the type set by api.ts; fall back to URL sniffing
            type:     s.type ?? (s.url.includes(".m3u8") ? "hls" : "mp4"),
            language: s.language ?? "Auto",
          })),
          entry.label,
          data,
        );
      }

      const streams = await fetchJpa(entry.key, data, signal);
      if (!streams) return null;
      return toServerResult(streams, entry.label, data);
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

import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for mp4-server.jpaworx.com stream endpoints.
 * Called client-side from servers.ts to work around the missing CORS headers
 * on the upstream API.
 *
 * Usage:
 *   GET /api/stream?key=allmovies&type=movie&tmdbId=27205
 *   GET /api/stream?key=allmovies&type=tv&tmdbId=94997&season=1&episode=1
 */

const JPA_BASE = "https://mp4-server.jpaworx.com";

/** Keys that are allowed to be proxied — prevents this route being used as
 *  an open proxy for arbitrary upstream URLs. */
const ALLOWED_KEYS = new Set([
  "buzz",
  "allmovies",
  "vidlink",
  "klikxxi",
  "vidxyz",
  "hollymoviehd",
  "vidzee",
  "videasy",
  "rogflix",
  "nextgencloudfabric",
]);

export async function GET(req: NextRequest) {
  const p       = req.nextUrl.searchParams;
  const key     = p.get("key");
  const type    = p.get("type");   // "movie" | "tv"
  const tmdbId  = p.get("tmdbId");
  const season  = p.get("season");
  const episode = p.get("episode");

  // ── Validation ─────────────────────────────────────────────
  if (!key || !ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ ok: false, error: "Invalid key" }, { status: 400 });
  }
  if (type !== "movie" && type !== "tv") {
    return NextResponse.json({ ok: false, error: "type must be movie or tv" }, { status: 400 });
  }
  if (!tmdbId) {
    return NextResponse.json({ ok: false, error: "Missing tmdbId" }, { status: 400 });
  }
  if (type === "tv" && (!season || !episode)) {
    return NextResponse.json({ ok: false, error: "TV requires season and episode" }, { status: 400 });
  }

  // ── Build upstream URL ──────────────────────────────────────
  const upstream =
    type === "tv"
      ? `${JPA_BASE}/stream/${key}/tv/${tmdbId}/${season}/${episode}`
      : `${JPA_BASE}/stream/${key}/movie/${tmdbId}`;

  // ── Fetch ───────────────────────────────────────────────────
  try {
    const res = await fetch(upstream, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      // Do NOT add next.revalidate here — fw-api already handles caching in
      // Redis with a short TTL tuned to upstream token lifetimes.
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Upstream ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();

    return NextResponse.json(data, {
      status: 200,
      headers: {
        // Tell the browser not to cache either — tokens expire quickly.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream fetch failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

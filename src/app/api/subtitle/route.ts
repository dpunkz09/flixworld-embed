import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.STREAM_API_KEY ?? "";

/**
 * Allowed origins for subtitle proxying.
 * Prevents this route being used as an open SSRF proxy for arbitrary URLs.
 */
const ALLOWED_ORIGINS = new Set([
  "api.flixworld.xyz",
  "cache.vdrk.site",
  "sub.wyzie.ru",
  "subs.wyzie.ru",
  "opensubtitles.com",
  "opensubtitles.org",
]);

/**
 * Proxy for subtitle files.
 * Usage: GET /api/subtitle?url=<encoded-subtitle-url>
 *
 * Handles both:
 *  - wyzie VTT:  direct_download_url already points to api.flixworld.xyz/api/stream/subtitle?url=...
 *  - default SRT/VTT: direct CDN URLs (no auth needed, but we proxy for CORS)
 */
export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return new NextResponse("Missing url param", { status: 400 });
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(rawUrl);
    // Validate it's an https URL from an allowed origin
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "https:") {
      return new NextResponse("Only HTTPS subtitle URLs are allowed", { status: 400 });
    }
    if (!ALLOWED_ORIGINS.has(parsed.hostname)) {
      return new NextResponse(`Subtitle origin not allowed: ${parsed.hostname}`, { status: 403 });
    }
  } catch {
    return new NextResponse("Invalid url param", { status: 400 });
  }

  // Only send the API key for requests that go to our stream API
  const headers: Record<string, string> = {};
  if (targetUrl.startsWith("https://api.flixworld.xyz/")) {
    headers["X-Api-Key"] = API_KEY;
  }

  try {
    const upstream = await fetch(targetUrl, { headers, cache: "no-store" });
    if (!upstream.ok) {
      return new NextResponse(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
      });
    }

    const rawText = await upstream.text();
    // SRT/ASS/SSA files use \N (or \n) as an in-cue line-break escape.
    // WebVTT uses a literal newline instead, so replace all \N occurrences
    // (case-insensitive to catch both \N and \n escape variants) with a real
    // newline before handing the text to the browser/player.
    const text = rawText.replace(/\\N/gi, "\n");
    const contentType = upstream.headers.get("content-type") ?? "text/plain";

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type":                contentType,
        "Cache-Control":               "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Failed to fetch subtitle", { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.STREAM_API_KEY ?? "";

/**
 * Proxy for subtitle files that require the API key.
 * Usage: GET /api/subtitle?url=<encoded-subtitle-url>
 *
 * Handles both:
 *  - wyzie VTT:  direct_download_url already points to api.flixworld.xyz/api/stream/subtitle?url=...
 *  - default SRT: direct CDN URLs (no auth needed, but we proxy for CORS)
 */
export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return new NextResponse("Missing url param", { status: 400 });
  }

  const targetUrl = decodeURIComponent(rawUrl);

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

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") ?? "text/plain";

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Failed to fetch subtitle", { status: 502 });
  }
}

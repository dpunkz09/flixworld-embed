import { NextRequest, NextResponse } from "next/server";

/**
 * CORS proxy for VidNest HLS streams and subtitles.
 * 
 * JW Player makes cross-origin requests to VidNest's CDN which doesn't return
 * proper CORS headers. This proxy fetches the content server-side and adds
 * the necessary CORS headers.
 * 
 * Usage:
 *   /api/proxy?url=https://long-night-d802.streamed-5.workers.dev/hls/.../master.m3u8
 */

const ALLOWED_ORIGINS = [
  "long-night-d802.streamed-5.workers.dev",
  "embed.vidrift.net",
];

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get("url");

  if (!targetUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  // Validate URL is from an allowed origin
  try {
    const parsed = new URL(targetUrl);
    if (!ALLOWED_ORIGINS.includes(parsed.hostname)) {
      return new NextResponse(`Origin not allowed: ${parsed.hostname}`, { status: 403 });
    }
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  try {
    // Fetch the content from VidNest
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers.get("user-agent") || "Mozilla/5.0",
        "Referer": "https://vidnest.fun/",
        "Origin": "https://vidnest.fun",
      },
      // Don't cache - let Next.js handle caching
      cache: "no-store",
    });

    if (!response.ok) {
      return new NextResponse(`Upstream error: ${response.status}`, {
        status: response.status,
      });
    }

    // Get content type from upstream
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    
    // For m3u8 playlists, we need to rewrite the URLs to go through our proxy
    let body: string | ReadableStream<Uint8Array> | null;
    
    if (contentType.includes("application/vnd.apple.mpegurl") || 
        contentType.includes("application/x-mpegurl") ||
        targetUrl.includes(".m3u8")) {
      // Parse and rewrite URLs in the m3u8 playlist
      const text = await response.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
      
      // Rewrite relative URLs to go through our proxy
      const rewritten = text.split("\n").map(line => {
        // Skip comments and empty lines
        if (line.startsWith("#") || !line.trim()) return line;
        
        // If line is a URL, rewrite it
        if (line.includes(".ts") || line.includes(".m3u8")) {
          // Handle relative URLs
          const fullUrl = line.startsWith("http") ? line : baseUrl + line;
          return `/api/proxy?url=${encodeURIComponent(fullUrl)}`;
        }
        
        return line;
      }).join("\n");
      
      body = rewritten;
    } else {
      // For video segments, stream the body directly
      body = response.body;
    }

    // Return with CORS headers
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
        "Access-Control-Expose-Headers": "Content-Length, Content-Range",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[Proxy Error]", error);
    return new NextResponse("Proxy error", { status: 502 });
  }
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range",
    },
  });
}

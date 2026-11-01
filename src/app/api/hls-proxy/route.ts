import { NextRequest, NextResponse } from "next/server";

/**
 * HLS Proxy for vidsrc.sh streams
 * 
 * Proxies M3U8 playlist and segment requests with proper referer headers
 * to bypass IP restrictions and CORS issues.
 */
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        { error: "Missing url parameter" },
        { status: 400 }
      );
    }

    // Decode the URL
    const targetUrl = decodeURIComponent(url);

    // Validate URL is from allowed domains
    const allowedDomains = [
      "zephyrandzinnia.space",
      "kettlerivercrafts.space",
      "lunascripts.space",
      "northchesters.space",
    ];

    const urlObj = new URL(targetUrl);
    if (!allowedDomains.some((domain) => urlObj.hostname.includes(domain))) {
      return NextResponse.json(
        { error: "Domain not allowed" },
        { status: 403 }
      );
    }

    // Fetch with proper headers
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://stellarconductornexus.com/",
        Origin: "https://stellarconductornexus.com",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[HLS Proxy] Upstream error: ${response.status} for ${targetUrl}`,
        errorText.substring(0, 200)
      );
      return NextResponse.json(
        { error: `Upstream error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get original content type or detect from URL
    let contentType = response.headers.get("content-type");
    
    // If no content-type or it's generic, infer from URL
    if (!contentType || contentType.includes("text/html") || contentType.includes("application/octet-stream")) {
      if (targetUrl.includes(".m3u8")) {
        contentType = "application/vnd.apple.mpegurl";
      } else if (targetUrl.includes(".html") || targetUrl.includes("page-")) {
        // .html files are actually TS segments (MPEG transport stream)
        contentType = "video/mp2t";
      } else if (targetUrl.includes(".ts")) {
        contentType = "video/mp2t";
      }
    }
    
    contentType = contentType || "application/vnd.apple.mpegurl";
    
    // For video segments, return binary data
    const isPlaylist = contentType.includes("mpegurl") || contentType.includes("x-mpegurl") || targetUrl.includes(".m3u8");
    
    let body: string | ArrayBuffer;
    if (isPlaylist) {
      body = await response.text();
    } else {
      // Binary segment data
      body = await response.arrayBuffer();
    }

    // If it's a playlist, rewrite URLs to go through this proxy
    if (isPlaylist && typeof body === "string") {
      const baseUrl = new URL(targetUrl);
      const baseOrigin = `${baseUrl.protocol}//${baseUrl.host}`;
      const basePath = targetUrl.substring(0, targetUrl.lastIndexOf("/"));

      // Rewrite relative URLs in the playlist
      body = body
        .split("\n")
        .map((line) => {
          if (line.startsWith("#") || !line.trim()) {
            return line;
          }

          let absoluteUrl: string;
          if (line.startsWith("http://") || line.startsWith("https://")) {
            absoluteUrl = line;
          } else if (line.startsWith("/")) {
            absoluteUrl = baseOrigin + line;
          } else {
            absoluteUrl = basePath + "/" + line;
          }

          // Proxy the URL
          const proxyUrl = `/api/hls-proxy?url=${encodeURIComponent(absoluteUrl)}`;
          return proxyUrl;
        })
        .join("\n");
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[HLS Proxy] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * Vidsrc.sh API Client
 * 
 * Complete implementation of vidsrc.sh stream extraction with all 6 security layers:
 * 1. Landing token (vs)
 * 2. Player token (vs)
 * 3. API token (apiToken - JWT)
 * 4. ChaCha20 encryption
 * 5. WASM decryption
 * 6. Stream token generation
 */

import { unstable_cache } from "next/cache";

const VIDSRC_BASE = "https://vidsrc.sh";
const STELLAR_BASE = "https://stellarconductornexus.com";
const DATA_BASE = "https://data.vidsrc.sh";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VidsrcStreamSource {
  url: string;
  quality: string;
  type: "hls";
}

export interface VidsrcStreamData {
  title: string;
  file_name: string;
  backdrop?: string;
  sources: VidsrcStreamSource[];
  subtitles: Array<{ label: string; file: string }>;
}

interface VidsrcLandingResponse {
  src: string;
}

interface VidsrcConfig {
  playerUrl: string;
  metaApi: string;
}

interface VidsrcPlayerConfig {
  api: string;
  apiToken: string;
  metaApi: string;
}

interface VidsrcStreamResponse {
  status_code: string;
  data: {
    title: string;
    imdb_id: string;
    file_name: string;
    backdrop: string;
    stream_urls: string | string[]; // Encrypted string or decrypted array
  };
  vs?: {
    w: number;
    wasm_url: string;
  };
}

// ---------------------------------------------------------------------------
// HTTP Helper
// ---------------------------------------------------------------------------

async function fetchWithHeaders(
  url: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "*/*",
      ...headers,
    },
    next: { revalidate: 0 }, // Don't cache these requests as tokens expire
  });
}

// ---------------------------------------------------------------------------
// Token & URL Extraction
// ---------------------------------------------------------------------------

async function getLandingToken(
  type: "movie" | "tv",
  id: string
): Promise<string> {
  const url = `${VIDSRC_BASE}/vs_src.php?type=${type}&id=${id}`;
  const response = await fetchWithHeaders(url, {
    Referer: `${VIDSRC_BASE}/embed/${type}/${id}`,
  });

  if (!response.ok) {
    throw new Error(`Failed to get landing token: ${response.status}`);
  }

  const data: VidsrcLandingResponse = await response.json();
  return data.src;
}

async function getPlayerUrl(landingUrl: string): Promise<string> {
  const response = await fetchWithHeaders(landingUrl, {
    Referer: VIDSRC_BASE,
  });

  if (!response.ok) {
    throw new Error(`Failed to get landing page: ${response.status}`);
  }

  const html = await response.text();
  const cfgMatch = html.match(/window\.CFG\s*=\s*({[^}]+})/);

  if (!cfgMatch) {
    throw new Error("Could not find CFG in landing page");
  }

  const cfg: VidsrcConfig = JSON.parse(cfgMatch[1].replace(/\\u0026/g, "&"));
  const baseUrl = new URL(landingUrl).origin;
  return baseUrl + cfg.playerUrl;
}

async function getApiToken(playerUrl: string, landingUrl: string): Promise<{
  api: string;
  apiToken: string;
}> {
  const response = await fetchWithHeaders(playerUrl, {
    Referer: landingUrl,
  });

  if (!response.ok) {
    throw new Error(`Failed to get player page: ${response.status}`);
  }

  const html = await response.text();
  const configMatch = html.match(/window\.CONFIG\s*=\s*({[\s\S]*?});/);

  if (!configMatch) {
    throw new Error("Could not find CONFIG in player page");
  }

  const config: VidsrcPlayerConfig = JSON.parse(
    configMatch[1].replace(/\\u0026/g, "&")
  );

  return {
    api: config.api,
    apiToken: config.apiToken,
  };
}

// ---------------------------------------------------------------------------
// WASM Decryption
// ---------------------------------------------------------------------------

async function decryptStreamUrls(
  encrypted: string,
  wasmUrl: string
): Promise<string[]> {
  // Download WASM module
  const wasmResponse = await fetch(wasmUrl);
  if (!wasmResponse.ok) {
    throw new Error(`Failed to download WASM: ${wasmResponse.status}`);
  }

  const wasmBuffer = await wasmResponse.arrayBuffer();
  const wasmModule = await WebAssembly.compile(wasmBuffer);
  const wasmInstance = await WebAssembly.instantiate(wasmModule, {});

  const exports = wasmInstance.exports as {
    alloc: (size: number) => number;
    decrypt: (ptr: number, length: number) => number;
    memory: WebAssembly.Memory;
  };

  // Decode base64
  const encryptedBinary = Buffer.from(encrypted, "base64");

  // Allocate memory in WASM
  const ptr = exports.alloc(encryptedBinary.length);
  const memory = new Uint8Array(exports.memory.buffer);
  memory.set(encryptedBinary, ptr);

  // Decrypt (ChaCha20)
  const outputLength = exports.decrypt(ptr, encryptedBinary.length);

  // Read decrypted data (skip first 12 bytes - nonce)
  const decrypted = new TextDecoder().decode(
    new Uint8Array(exports.memory.buffer, ptr + 12, outputLength)
  );

  // Split by newlines and filter empty
  return decrypted.split("\n").filter((u) => u.trim());
}

// ---------------------------------------------------------------------------
// Stream Token Generation
// ---------------------------------------------------------------------------

async function generateStreamToken(streamUrl: string): Promise<string> {
  const url = new URL(streamUrl);
  const origin = `${url.protocol}//${url.host}`;
  const tokenUrl = `${origin}/generate.php`;

  try {
    const response = await fetchWithHeaders(tokenUrl);

    if (!response.ok) {
      console.warn(
        `Failed to get stream token from ${tokenUrl}: ${response.status}`
      );
      return "";
    }

    let token = await response.text();
    token = token.trim();

    // Try to parse as JSON if possible
    try {
      const json = JSON.parse(token);
      if (typeof json === "string") {
        return json;
      } else if (json.token) {
        return json.token;
      } else if (json.data) {
        return json.data;
      }
    } catch {
      // Not JSON, use as-is
    }

    return token;
  } catch (error) {
    console.warn(`Error generating stream token:`, error);
    return "";
  }
}

function applyStreamToken(url: string, token: string): string {
  if (!token) return url;

  // Check for __TOKEN__ placeholder
  if (url.includes("__TOKEN__")) {
    return url.replace(/__TOKEN__/g, token);
  }

  // Append as query parameter
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

function proxyM3U8Url(url: string): string {
  // Use local Next.js API route as proxy
  return `/api/hls-proxy?url=${encodeURIComponent(url)}`;
}

// ---------------------------------------------------------------------------
// Subtitle Fetching (vdrk.site API)
// ---------------------------------------------------------------------------

async function fetchSubtitles(
  type: "movie" | "tv",
  tmdbId: string,
  season?: string,
  episode?: string
): Promise<Array<{ label: string; file: string }>> {
  try {
    let url: string;
    if (type === "movie") {
      url = `https://cache.vdrk.site/v2/movie/${tmdbId}`;
    } else {
      url = `https://cache.vdrk.site/v2/tv/${tmdbId}/${season}/${episode}`;
    }

    const response = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      console.warn(`[Vidsrc] Failed to fetch subtitles: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data || [];
  } catch (error) {
    console.warn(`[Vidsrc] Subtitle fetch error:`, error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main Fetch Functions
// ---------------------------------------------------------------------------

async function fetchVidsrcStream(
  type: "movie" | "tv",
  id: string,
  season?: string,
  episode?: string
): Promise<VidsrcStreamData> {
  console.log(`[Vidsrc] Fetching ${type} ${id}${season ? ` S${season}E${episode}` : ""}`);

  // Step 1: Get landing token
  const landingUrl = await getLandingToken(type, id);
  console.log(`[Vidsrc] Got landing URL`);

  // Step 2: Get player URL
  const playerUrl = await getPlayerUrl(landingUrl);
  console.log(`[Vidsrc] Got player URL`);

  // Step 3: Get API token
  const { api, apiToken } = await getApiToken(playerUrl, landingUrl);
  console.log(`[Vidsrc] Got API token`);

  // Step 4: Fetch encrypted stream data
  const streamApiUrl = api + "&api_token=" + encodeURIComponent(apiToken);
  const streamResponse = await fetchWithHeaders(streamApiUrl, {
    Referer: playerUrl,
    Accept: "application/json",
  });

  if (!streamResponse.ok) {
    throw new Error(`Stream API error: ${streamResponse.status}`);
  }

  const streamData: VidsrcStreamResponse = await streamResponse.json();

  if (streamData.status_code !== "200") {
    throw new Error(`Stream API returned status ${streamData.status_code}`);
  }

  console.log(`[Vidsrc] Got stream data`);

  // Step 5: Decrypt if needed
  let m3u8Urls: string[];

  if (typeof streamData.data.stream_urls === "string") {
    // Encrypted - need to decrypt
    if (!streamData.vs?.wasm_url) {
      throw new Error("Encrypted stream URLs but no WASM URL provided");
    }

    console.log(`[Vidsrc] Decrypting stream URLs...`);
    m3u8Urls = await decryptStreamUrls(
      streamData.data.stream_urls,
      streamData.vs.wasm_url
    );
    console.log(`[Vidsrc] Decrypted ${m3u8Urls.length} URLs`);
  } else if (Array.isArray(streamData.data.stream_urls)) {
    // Already plain text
    m3u8Urls = streamData.data.stream_urls;
  } else {
    throw new Error("Invalid stream_urls format");
  }

  // Step 6: Generate stream tokens for each URL and proxy them
  console.log(`[Vidsrc] Generating stream tokens...`);
  const sourcesWithTokens = await Promise.all(
    m3u8Urls.map(async (url, index) => {
      const token = await generateStreamToken(url);
      const tokenedUrl = applyStreamToken(url, token);
      const proxiedUrl = proxyM3U8Url(tokenedUrl);
      
      return {
        url: proxiedUrl,
        quality: `Server ${index + 1}`,
        type: "hls" as const,
      };
    })
  );

  console.log(`[Vidsrc] Generated ${sourcesWithTokens.length} proxied URLs`);

  // Step 7: Fetch subtitles from vdrk.site
  console.log(`[Vidsrc] Fetching subtitles...`);
  const subtitles = await fetchSubtitles(type, id, season, episode);
  console.log(`[Vidsrc] Found ${subtitles.length} subtitle tracks`);

  return {
    title: streamData.data.title,
    file_name: streamData.data.file_name,
    backdrop: streamData.data.backdrop,
    sources: sourcesWithTokens,
    subtitles: subtitles,
  };
}

// ---------------------------------------------------------------------------
// Cached Public API
// ---------------------------------------------------------------------------

export const fetchVidsrcMovie = unstable_cache(
  async (tmdbId: string): Promise<VidsrcStreamData> => {
    return fetchVidsrcStream("movie", tmdbId);
  },
  ["vidsrc-movie"],
  { revalidate: 300, tags: ["vidsrc-movie"] }
);

export const fetchVidsrcTV = unstable_cache(
  async (
    tmdbId: string,
    season: string,
    episode: string
  ): Promise<VidsrcStreamData> => {
    return fetchVidsrcStream("tv", tmdbId, season, episode);
  },
  ["vidsrc-tv"],
  { revalidate: 300, tags: ["vidsrc-tv"] }
);

export interface ThumbnailCue {
  start: number;  // seconds
  end: number;    // seconds
  url: string;    // absolute image URL
  x: number;      // crop x offset in the sprite sheet
  y: number;      // crop y offset in the sprite sheet
  w: number;      // tile width
  h: number;      // tile height
  sheetW: number; // full sprite sheet pixel width (for background-size)
}

function parseSeconds(ts: string): number {
  // Accepts HH:MM:SS or MM:SS (with optional .mmm)
  const parts = ts.trim().split(":");
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
}

export async function loadThumbnailVTT(vttUrl: string): Promise<ThumbnailCue[]> {
  try {
    const res = await fetch(vttUrl, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const text = await res.text();

    // Derive base URL (everything before the last path segment)
    const base = vttUrl.substring(0, vttUrl.lastIndexOf("/") + 1);
    // Derive origin for absolute-path resolution
    const origin = new URL(vttUrl).origin;

    const raw: Omit<ThumbnailCue, "sheetW">[] = [];
    const blocks = text.split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.trim().split("\n").filter(l => l.trim() && !l.startsWith("WEBVTT") && !l.startsWith("NOTE"));
      if (lines.length < 2) continue;

      // Find the timestamp line (contains "-->")
      const tsLine = lines.find(l => l.includes("-->"));
      if (!tsLine) continue;

      const [startStr, endStr] = tsLine.split("-->").map(s => s.trim());
      const start = parseSeconds(startStr);
      const end = parseSeconds(endStr);

      // The URL line (last non-empty line after timestamp)
      const urlLine = lines[lines.length - 1].trim();

      // Parse #xywh=x,y,w,h fragment
      const hashIdx = urlLine.indexOf("#xywh=");
      let x = 0, y = 0, w = 160, h = 90;
      let rawUrl = urlLine;

      if (hashIdx !== -1) {
        const coords = urlLine.substring(hashIdx + 6).split(",").map(Number);
        [x, y, w, h] = coords;
        rawUrl = urlLine.substring(0, hashIdx);
      }

      // Resolve URL: absolute, origin-relative, or base-relative
      let resolvedUrl: string;
      if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
        resolvedUrl = rawUrl;
      } else if (rawUrl.startsWith("/")) {
        resolvedUrl = origin + rawUrl;
      } else {
        resolvedUrl = base + rawUrl;
      }

      raw.push({ start, end, url: resolvedUrl, x, y, w, h });
    }

    // Calculate sheetW per image URL: max(x + w) across all cues for that image
    const sheetWidths = new Map<string, number>();
    for (const c of raw) {
      const cur = sheetWidths.get(c.url) ?? 0;
      sheetWidths.set(c.url, Math.max(cur, c.x + c.w));
    }

    return raw.map(c => ({ ...c, sheetW: sheetWidths.get(c.url) ?? c.w }));
  } catch {
    return [];
  }
}

export function getThumbnailAt(cues: ThumbnailCue[], time: number): ThumbnailCue | null {
  if (!cues.length) return null;
  // Binary search for the cue containing `time`
  let lo = 0, hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].end <= time) lo = mid + 1;
    else if (cues[mid].start > time) hi = mid - 1;
    else return cues[mid];
  }
  // Fallback: clamp to nearest
  return cues[Math.max(0, Math.min(lo, cues.length - 1))];
}

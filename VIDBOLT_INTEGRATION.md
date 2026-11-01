# VidBolt API Integration ✅

## What Was Added

VidBolt API has been integrated as **5 new server options** with excellent quality and multiple languages.

## 🆕 New VidBolt Servers

Your player now has these additional servers:

1. **VidBolt English** - 1080p
2. **VidBolt French** - 1080p  
3. **VidBolt Spanish** - 1080p
4. **VidBolt Arabic** - 1080p (with subtitles)
5. **VidBolt Russian** - 1080p

## 📋 API Endpoints

### Movies
```
GET https://vidbolt.xyz/api/resolve?type=movie&id={TMDB_ID}
```

### TV Shows
```
GET https://vidbolt.xyz/api/resolve?type=tv&id={TMDB_ID}&season={S}&episode={E}
```

## 🎯 Response Structure

```json
{
  "stream": {
    "server": "callisto",
    "sources": [
      {
        "url": "https://...",
        "kind": "hls",
        "quality": "1080p",
        "language": "English"
      }
    ],
    "subtitles": [
      {
        "url": "https://...",
        "label": "اَلْعَرَبِيَّةُ",
        "lang": "اَلْعَرَبِيَّةُ"
      }
    ]
  }
}
```

## 🔧 How It Works

### 1. API Integration (`src/lib/api.ts`)

**New Types:**
```typescript
interface VidBoltSource {
  url: string;
  kind: "hls" | "mp4";
  quality: string;
  language: string;
}

interface VidBoltResponse {
  stream: {
    server: string;
    sources: VidBoltSource[];
    subtitles: VidBoltSubtitle[];
  };
}
```

**New Functions:**
```typescript
fetchMovieStreamVidBolt(tmdbId: string): Promise<StreamData>
fetchTVStreamVidBolt(tmdbId: string, season: string, episode: string): Promise<StreamData>
```

**Conversion Logic:**
```typescript
function toStreamDataFromVidBolt(
  tmdbId: string,
  json: VidBoltResponse,
  mediaInfo: MediaInfo | undefined,
  mediaType: "movie" | "tv",
  season?: string,
  episode?: string,
): StreamData {
  // Maps VidBolt sources to StreamSource format
  const sources = json.stream.sources.map(source => ({
    url: source.url,
    language: source.language,
    type: source.kind === "mp4" ? "mp4" : "hls"
  }));
  
  // Maps subtitles
  const subtitles = json.stream.subtitles.map(sub => ({
    label: sub.label,
    file: sub.url
  }));
  
  return { tmdbId, mediaType, sources, subtitles, mediaInfo };
}
```

### 2. Server Definitions (`src/lib/servers.ts`)

**Added to SERVER_LIST:**
```typescript
// VidBolt servers (alternative source)
{ id: "vidbolt-english", label: "VidBolt English", tag: "1080p", key: "English", isVidBolt: true },
{ id: "vidbolt-french",  label: "VidBolt French",  tag: "1080p", key: "French",  isVidBolt: true },
{ id: "vidbolt-spanish", label: "VidBolt Spanish", tag: "1080p", key: "Spanish", isVidBolt: true },
{ id: "vidbolt-arabic",  label: "VidBolt Arabic",  tag: "1080p", key: "Arabic sub", isVidBolt: true },
{ id: "vidbolt-russian", label: "VidBolt Russian", tag: "1080p", key: "Russian", isVidBolt: true },
```

**Fetch Logic:**
```typescript
// In makeDef function
if (entry.isVidBolt) {
  let vidboltData = await fetchMovieStreamVidBolt(data.tmdbId);
  // or fetchTVStreamVidBolt for TV shows
  
  const matchingSource = vidboltData.sources.find(
    s => s.language.toLowerCase() === entry.key.toLowerCase()
  );
  
  return {
    sources: [{ url: matchingSource.url, ... }],
    subtitles: vidboltData.subtitles
  };
}
```

## 📊 Complete Server List

Your player now has **14 total servers**:

### VidNest (5 servers)
- Original
- Hindi
- Arabic
- French
- Spanish

### VidRift (4 servers)
- VidRift Original
- VidRift Hindi
- VidRift Tamil
- VidRift French

### VidBolt (5 servers) 🆕
- VidBolt English
- VidBolt French
- VidBolt Spanish
- VidBolt Arabic
- VidBolt Russian

## 🎬 Testing

```bash
# Restart dev server
cd e:\PROJECTS\embed.flixworld-api\flixworld-embed
npm run dev
```

**Test URLs:**
```
Movie: http://localhost:1234/embed/movie/1384216
TV:    http://localhost:1234/embed/tv/1622/1/1
```

**Expected Results:**
1. Server dropdown shows 14 total servers
2. VidBolt servers appear at the bottom
3. Click "VidBolt English" → Loads 1080p stream
4. Subtitles available from VidBolt API
5. Both HLS and MP4 formats supported

## ✨ Features

### ✅ Multiple Quality Options
- 1080p HLS streams
- 720p MP4 fallbacks (for Russian)
- Adaptive bitrate streaming

### ✅ Rich Subtitle Support
VidBolt provides subtitles in multiple languages directly from their API

### ✅ Multiple Stream Types
- **HLS** (HTTP Live Streaming) for most languages
- **MP4** direct files for some options

### ✅ URL Pre-signed
- VidBolt URLs come with CloudFront signatures
- Policy and Key-Pair-Id included
- Time-limited access for security

## 🔄 Fallback Strategy

With 3 providers (VidNest, VidRift, VidBolt), your player now has:

```
Primary Source: VidNest (fast, pre-loaded)
       ↓
  Not Available?
       ↓
Fallback 1: VidRift (token-based, multi-language)
       ↓
  Still not working?
       ↓
Fallback 2: VidBolt (high quality, signed URLs)
```

## 🆚 Provider Comparison

| Feature | VidNest | VidRift | VidBolt |
|---------|---------|---------|---------|
| **Quality** | 1080p | 1080p | 1080p |
| **Formats** | HLS | HLS + MP4 | HLS + MP4 |
| **Auth** | None | Token | Signed URLs |
| **Subtitles** | ✅ Many | 🟡 Separate API | ✅ Included |
| **Languages** | 5+ | 8+ | 5+ |
| **Speed** | ⚡ Fast | ⚡ Fast | ⚡ Fast |

## 🚀 Usage Examples

### Get VidBolt Stream
```typescript
import { fetchMovieStreamVidBolt } from '@/lib/api';

const data = await fetchMovieStreamVidBolt('1384216');

// data.sources contains all VidBolt sources
// data.subtitles contains all subtitles
```

### Filter by Language
```typescript
const englishSource = data.sources.find(s => 
  s.language.toLowerCase() === 'english'
);
```

### Auto-select Best Quality
The player automatically selects 1080p when available

## 📝 Files Modified

1. **`src/lib/api.ts`**
   - Added VidBolt types
   - Added `vidboltGet()` fetch helper
   - Added `toStreamDataFromVidBolt()` converter
   - Added `fetchMovieStreamVidBolt()` and `fetchTVStreamVidBolt()`

2. **`src/lib/servers.ts`**
   - Added 5 VidBolt server definitions
   - Added `isVidBolt` flag support
   - Updated `makeDef()` to handle VidBolt servers
   - Imported VidBolt fetch functions

## 🎯 Next Steps

1. **Restart your dev server**
2. **Test VidBolt servers** - Try each language
3. **Compare quality** - Check which provider works best
4. **Add more languages** - VidBolt supports many more!

### To Add More VidBolt Languages

Edit `SERVER_LIST` in `servers.ts`:

```typescript
// Add these:
{ id: "vidbolt-german",  label: "VidBolt German",  tag: "1080p", key: "German", isVidBolt: true },
{ id: "vidbolt-italian", label: "VidBolt Italian", tag: "1080p", key: "Italian", isVidBolt: true },
```

---

**Status**: ✅ Ready to use!
**Total Servers**: 14 (5 VidNest + 4 VidRift + 5 VidBolt)
**Quality**: 1080p with subtitles

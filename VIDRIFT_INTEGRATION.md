# VidRift API Integration

## ✅ What Was Added

The VidRift API has been integrated into `src/lib/api.ts` as an alternative streaming source alongside VidNest.

## 📋 New Functions

### For Movies
```typescript
import { fetchMovieStreamVidRift } from '@/lib/api';

const streamData = await fetchMovieStreamVidRift('1283515');
```

### For TV Shows
```typescript
import { fetchTVStreamVidRift } from '@/lib/api';

const streamData = await fetchTVStreamVidRift('1622', '1', '1');
```

## 🔧 How It Works

### 1. API Endpoints
```
Movie: https://embed.vidrift.net/api/boot/movie/{TMDB_ID}
TV:    https://embed.vidrift.net/api/boot/tv/{TMDB_ID}/{SEASON}/{EPISODE}
```

### 2. Authentication
- Includes `Referer: https://embed.vidrift.net/` header
- Extracts `playbackToken` from response
- Appends token to all HLS URLs as query parameter

### 3. Stream Processing
```typescript
// VidRift returns streams like:
{
  "meta": {
    "playbackToken": "eyJ0bWRi...",
    "orionStreams": [
      {
        "url": "/api/orion/{hash}/master.m3u8",
        "name": "Orion · Original",
        "type": "hls"
      }
    ]
  }
}

// Converted to:
{
  url: "https://embed.vidrift.net/api/orion/{hash}/master.m3u8?token=eyJ0bWRi...",
  language: "Original",
  type: "hls"
}
```

## 🎯 Key Features

### ✅ Implemented
- **Token Authentication**: Automatically appends playback token to URLs
- **Multiple Languages**: Supports Original, Hindi, Tamil, Telugu, Malayalam, Kannada, French, Russian
- **HLS & MP4**: Handles both streaming formats
- **Type Safety**: Full TypeScript interfaces for API responses
- **Caching**: Uses Next.js `unstable_cache` with 5-minute revalidation
- **TMDB Integration**: Fetches metadata in parallel with stream data

### 📝 To Do (Optional Enhancements)
- Subtitle fetching from `subtitleListUrl` endpoints
- Quality selection from `rungs` data (resolution information)
- Fallback logic between VidNest and VidRift
- Error handling for expired tokens

## 🔄 Usage Example

```typescript
// In your page component
import { fetchMovieStreamVidRift } from '@/lib/api';

export default async function MoviePage({ params }: { params: { id: string } }) {
  const streamData = await fetchMovieStreamVidRift(params.id);
  
  return (
    <VideoPlayer
      sources={streamData.sources}
      subtitles={streamData.subtitles}
      mediaInfo={streamData.mediaInfo}
    />
  );
}
```

## 🆚 VidNest vs VidRift

| Feature | VidNest | VidRift |
|---------|---------|---------|
| **Formats** | HLS only | HLS + MP4 |
| **Languages** | Multiple | Multiple (8+) |
| **Authentication** | None required | Token required |
| **Subtitles** | ✅ Included | 🟡 Endpoint available |
| **Quality Info** | Quality string | Resolution data (rungs) |
| **CORS** | Needs proxy | Direct access with token |

## 📦 Response Structure

### VidRift API Response
```typescript
interface VidRiftResponse {
  meta: {
    tmdbId: string;
    type: "movie" | "tv";
    playbackToken: string;  // JWT token
    orionStreams: Array<{
      url: string;           // Relative or absolute
      name: string;          // "Orion · Language"
      type: "hls" | "mp4";
      rungs?: Array<{        // Quality variants
        width: number;
        height: number;
      }>;
      subtitleListUrl: string;
    }>;
  };
}
```

### Converted StreamData
```typescript
interface StreamData {
  tmdbId: string;
  mediaType: "movie" | "tv";
  sources: Array<{
    url: string;      // With token appended
    language: string; // Cleaned language name
    type: "hls" | "mp4";
  }>;
  subtitles: SubtitleTrack[];
  mediaInfo?: MediaInfo;
}
```

## 🚀 Next Steps

1. **Test the integration**:
   ```bash
   # In your Next.js app
   npm run dev
   ```

2. **Try a test page**:
   ```typescript
   // app/test-vidrift/page.tsx
   import { fetchMovieStreamVidRift } from '@/lib/api';
   
   export default async function TestPage() {
     const data = await fetchMovieStreamVidRift('1283515');
     return <pre>{JSON.stringify(data, null, 2)}</pre>;
   }
   ```

3. **Implement fallback logic** (optional):
   ```typescript
   async function getStreamWithFallback(tmdbId: string) {
     try {
       return await fetchMovieStreamVidRift(tmdbId);
     } catch (error) {
       console.warn('VidRift failed, trying VidNest:', error);
       return await fetchMovieStream(tmdbId);
     }
   }
   ```

## 📚 Related Files

- `src/lib/api.ts` - Main integration (updated)
- `../VIDRIFT_API_GUIDE.md` - Detailed API documentation
- `../vidrift-token-appender.js` - Standalone testing script

## ⚠️ Important Notes

1. **Token Expiration**: VidRift tokens expire (check JWT `exp` field)
2. **Referer Required**: Always include `Referer: https://embed.vidrift.net/`
3. **URL Format**: Some URLs are relative, must prepend base URL
4. **No CORS Proxy Needed**: VidRift URLs work directly (unlike VidNest)

---

**Integration Complete** ✅

# Flixworld Embed Player

Next.js-based video embed player using **vidsrc.sh** for streaming and TMDB for metadata.

## 🎯 Features

- **Vidsrc.sh Integration** - Fully tokenized streaming with 6-layer security
- **No Proxy Required** - Direct M3U8 playback with proper tokens
- **Multi-CDN Fallback** - 3 servers per stream for reliability
- **JW Player** - Professional HTML5 video player
- **TMDB Metadata** - Rich movie/TV show information
- **Server Components** - Fast SSR with Next.js 15

## 🚀 Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env.local
   ```
   
   Add your TMDB API key (optional, for metadata):
   ```env
   TMDB_API_KEY=your_key_here
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```

4. **Access the embed**:
   - Movie: `http://localhost:1234/embed/movie/155`
   - TV: `http://localhost:1234/embed/tv/1396/1/1`

## 📝 Usage

### Movie Embed
```
/embed/movie/{tmdb_id}
```
Example: `/embed/movie/155` (The Dark Knight)

### TV Show Embed
```
/embed/tv/{tmdb_id}/{season}/{episode}
```
Example: `/embed/tv/1396/1/1` (Breaking Bad S01E01)

## 🏗️ Architecture

### Vidsrc.sh Integration

The player uses vidsrc.sh with complete token management:

```
Request → Landing Token → Player Token → API Token
    ↓
Encrypted Streams → WASM Decrypt → Stream Tokens
    ↓
Fully Playable M3U8 URLs
```

**Key Features:**
- ✅ All 6 security layers handled automatically
- ✅ ChaCha20 WASM decryption server-side
- ✅ JWT stream tokens per CDN
- ✅ No proxy required - CORS built-in
- ✅ Multi-server fallback (3 CDNs)

See [VIDSRC_INTEGRATION.md](./VIDSRC_INTEGRATION.md) for technical details.

## 📂 Project Structure

```
src/
├── app/
│   └── embed/
│       ├── movie/[id]/page.tsx       # Movie embed route
│       └── tv/[id]/[season]/[episode]/page.tsx  # TV embed route
├── components/
│   ├── JWPlayerClient.tsx            # Video player component
│   └── PlayerErrorBoundary.tsx       # Error handling
└── lib/
    ├── vidsrc.ts                     # Vidsrc.sh API client ⭐
    ├── api.ts                        # Public API wrapper
    ├── servers.ts                    # Multi-server support
    └── thumbnails.ts                 # VTT thumbnail support
```

## 🔧 Configuration

### Environment Variables

```env
# TMDB API Key (optional - for metadata)
TMDB_API_KEY=your_key_here

# JW Player License (optional)
NEXT_PUBLIC_JW_LICENSE_KEY=your_license
```

**Note:** No proxy or additional API keys needed for streaming!

## 🎬 API Reference

### fetchMovieStream(tmdbId: string)
```typescript
import { fetchMovieStream } from "@/lib/api";

const data = await fetchMovieStream("155");
// Returns: StreamData with tokenized M3U8 URLs
```

### fetchTVStream(tmdbId: string, season: string, episode: string)
```typescript
import { fetchTVStream } from "@/lib/api";

const data = await fetchTVStream("1396", "1", "1");
// Returns: StreamData with tokenized M3U8 URLs
```

## 🔐 Security & Tokens

All token management is handled automatically:

1. **Landing Token** - Access landing page
2. **Player Token** - Access player page
3. **API Token** - JWT for stream API
4. **Encryption** - ChaCha20 via WASM
5. **Stream Tokens** - JWT per CDN (4hr lifetime)

Tokens are:
- ✅ Generated server-side
- ✅ IP-bound (CIDR range)
- ✅ Time-limited
- ✅ Never exposed to client

## 🚀 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy!

### Other Platforms

Works on any Node.js platform:
- Netlify
- Railway
- Render
- AWS/GCP/Azure

**Requirements:**
- Node.js 18+
- WebAssembly support (for decryption)

## 📊 Performance

- **Initial Load**: ~2s (full token chain)
- **Cached**: ~50ms (Next.js cache)
- **Cache Duration**: 5 minutes
- **Multi-CDN**: Automatic failover

## 🐛 Troubleshooting

### "No sources found"
- Content may not be available on vidsrc
- Check TMDB ID is correct

### "Failed to get token"
- Vidsrc.sh may be temporarily down
- Wait and retry

### Player not loading
- Check JW Player license key
- Verify all tokens generated successfully

## 📚 Documentation

- [VIDSRC_INTEGRATION.md](./VIDSRC_INTEGRATION.md) - Technical implementation details
- [AGENTS.md](./AGENTS.md) - Next.js agent rules

## 🎉 Benefits Over Previous Implementation

| Feature | Old (VidNest) | New (Vidsrc) |
|---------|--------------|--------------|
| Proxy Required | ✅ Yes | ❌ No |
| Setup Complexity | High | Low |
| Token Management | Manual | Automatic |
| Multi-Server | Language-based | CDN-based |
| CORS | Need proxy | Built-in |
| Encryption | None | ChaCha20 |
| Security Layers | 0 | 6 |

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please read the technical docs first.

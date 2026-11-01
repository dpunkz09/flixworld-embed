import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_NAME = "Flixworld API";
const SITE_URL = "https://embed.flixworld.xyz";
const SITE_DESCRIPTION =
  "Free video streaming embed API for movies and TV shows. Integrate HLS streams into any website with a single iframe — subtitles, thumbnail scrubbing, and quality selection included.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Dark scrollbars / form controls, and a matching browser UI colour on mobile
  colorScheme: "dark",
  themeColor: "#0b0f1a",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "video streaming API",
    "movie embed",
    "TV show embed",
    "HLS player",
    "TMDB embed",
    "free streaming",
    "flixworld",
    "vidsrc alternative",
  ],
  authors: [{ name: "Flixworld", url: "https://flixworld.xyz" }],
  creator: "Flixworld",
  publisher: "Flixworld",
  category: "technology",
  formatDetection: { telephone: false, email: false, address: false },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  // "./" resolves to each route's own URL. A fixed SITE_URL here would make
  // every page (including every embed route) declare the homepage as canonical.
  alternates: {
    canonical: "./",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to reduce font + poster TTFB */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://image.tmdb.org" />
        {/* Narrow axes to reduce payload — filled, weight 400 only.
            display=block: an icon font should stay invisible while loading,
            not flash its ligature names ("movie", "closed_caption") as text. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0&display=block"
        />
        {/* Preload JW Player script for faster initialization.
            Only the embed player needs this — if you add app/embed/layout.tsx,
            move this tag there so the landing page doesn't fetch it. */}
        <link
          rel="preload"
          href="https://ssl.p.jwpcdn.com/player/v/8.22.0/jwplayer.js"
          as="script"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
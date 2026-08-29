import type { Metadata } from "next";
import "./globals.css";

const SITE_NAME = "Flixworld API";
const SITE_URL = "https://embed.flixworld.xyz";
const SITE_DESCRIPTION =
  "Free video streaming embed API for movies and TV shows. Integrate HLS streams into any website with a single iframe — subtitles, thumbnail scrubbing, and quality selection included.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
  alternates: {
    canonical: SITE_URL,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to reduce font TTFB */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Narrow axes to reduce payload — filled, weight 400 only */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0&display=swap"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't expose Next.js version in response headers
  poweredByHeader: false,

  // Compress responses
  compress: true,

  // Strict mode catches double-render issues in dev
  reactStrictMode: true,

  async headers() {
    return [
      {
        // Allow embed pages to be iframed from anywhere
        source: "/embed/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          // Suppress the browser's Permissions-Policy violation for `unload`,
          // which JW Player's CDN scripts attempt to register internally.
          // The `unload` event is deprecated and blocked in cross-origin iframes
          // by default; this header silences the console warning without
          // affecting playback or functionality.
          { key: "Permissions-Policy", value: "unload=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

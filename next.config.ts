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
        ],
      },
      {
        // Cache static assets aggressively
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;

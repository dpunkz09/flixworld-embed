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
        // Allow embed pages to be iframed from anywhere.
        // X-Frame-Options is intentionally omitted — "ALLOWALL" is not a valid
        // value per spec and is ignored by browsers. The CSP frame-ancestors
        // directive is the correct modern mechanism.
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          // Suppress the browser's Permissions-Policy violation for `unload`,
          // which JW Player's CDN scripts attempt to register internally.
          { key: "Permissions-Policy", value: "unload=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

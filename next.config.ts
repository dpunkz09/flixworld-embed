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
          {
            key: "Permissions-Policy",
            // unload   — suppress JW Player CDN violation noise
            // fullscreen — must be explicitly delegated for iframes to enter
            //              fullscreen; listing it here documents intent even
            //              though the parent iframe's allow= attr controls it.
            value: "unload=(), fullscreen=*",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

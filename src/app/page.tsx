import type { Metadata } from "next";
import ApiTester from "@/components/ApiTester";

export const metadata: Metadata = {
  title: "Flixworld API — Free Video Streaming Embed API",
  description:
    "Embed free HD movie and TV show streams into any website with a single iframe. Powered by Flixworld API — subtitles, thumbnail scrubbing, and multi-source support included.",
  openGraph: {
    title: "Flixworld API — Free Video Streaming Embed API",
    description:
      "Embed free HD movie and TV show streams into any website with a single iframe.",
    type: "website",
  },
};

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", background: "#0b0f1a", color: "white", fontFamily: "system-ui, -apple-system, sans-serif", overflowX: "hidden" }}>

      {/* ── Nav ── */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 40px", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", top: 0, background: "rgba(11,15,26,0.9)", backdropFilter: "blur(12px)", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
            <span style={{ color: "#f5c518" }}>Flix</span>world
          </span>
          <span style={{ fontSize: 11, background: "rgba(245,197,24,0.15)", border: "1px solid rgba(245,197,24,0.3)", color: "#f5c518", borderRadius: 4, padding: "1px 7px", fontWeight: 600 }}>API</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a href="https://flixworld.xyz" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", textDecoration: "none", padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", transition: "all 0.2s" }}>
            flixworld.xyz
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div style={{ position: "relative", padding: "80px 24px 64px", textAlign: "center", overflow: "hidden" }}>
        {/* Glow orbs */}
        <div style={{ position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)", width: 600, height: 400, background: "radial-gradient(ellipse, rgba(245,197,24,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 40, left: "20%", width: 300, height: 300, background: "radial-gradient(ellipse, rgba(99,102,241,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(245,197,24,0.1)", border: "1px solid rgba(245,197,24,0.25)", borderRadius: 99, padding: "5px 14px", marginBottom: 24 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>Free · No API key required for embed</span>
          </div>

          <h1 style={{ fontSize: "clamp(32px, 6vw, 64px)", fontWeight: 800, lineHeight: 1.1, margin: "0 0 16px", letterSpacing: "-0.03em" }}>
            Next generation<br />
            <span style={{ color: "#f5c518" }}>Video Streaming API</span>
          </h1>

          <p style={{ fontSize: "clamp(14px, 2vw, 18px)", color: "rgba(255,255,255,0.5)", maxWidth: 560, margin: "0 auto 40px", lineHeight: 1.7 }}>
            Free streaming links for movies and TV episodes that can be effortlessly integrated into your website through our embed links and API.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="#test" style={{ padding: "12px 28px", borderRadius: 8, background: "#f5c518", color: "#0b0f1a", fontSize: 14, fontWeight: 700, textDecoration: "none", letterSpacing: "0.02em" }}>
              Try it now
            </a>
            <a href="#docs" style={{ padding: "12px 28px", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "white", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              Documentation
            </a>
          </div>
        </div>
      </div>

      {/* ── Live Test ── */}
      <div id="test" style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px 64px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>Live Player Test</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Enter a TMDB ID to preview the embed player instantly</p>
        </div>
        <ApiTester />
      </div>

      {/* ── Features ── */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "56px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, textAlign: "center", marginBottom: 40 }}>Everything you need to stream</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
            {[
              { icon: "movie", title: "Movies", desc: "Full movie library via TMDB ID" },
              { icon: "tv", title: "TV Shows", desc: "Any season and episode by number" },
              { icon: "closed_caption", title: "Subtitles", desc: "Multi-language VTT subtitles included" },
              { icon: "hd", title: "HD Quality", desc: "Auto quality selection up to 1080p" },
              { icon: "schedule", title: "Resume Playback", desc: "Watch progress saved locally" },
              { icon: "code", title: "Single iframe", desc: "One line of HTML to embed anywhere" },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "20px" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(245,197,24,0.12)", border: "1px solid rgba(245,197,24,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 20, color: "#f5c518" }}>{icon}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Docs ── */}
      <div id="docs" style={{ maxWidth: 960, margin: "0 auto", padding: "56px 24px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 32 }}>API Reference</h2>

        {/* Endpoints */}
        <div style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>Embed URLs</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { badge: "MOVIE", color: "#a78bfa", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.25)", url: "/embed/movie/{tmdb_id}", example: "/embed/movie/550" },
              { badge: "TV", color: "#60a5fa", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.25)", url: "/embed/tv/{tmdb_id}/{season}/{episode}", example: "/embed/tv/94997/1/1" },
            ].map(({ badge, color, bg, border, url, example }) => (
              <div key={badge} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ background: bg, border: `1px solid ${border}`, color, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 8px", borderRadius: 5 }}>{badge}</span>
                  <code style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontFamily: "monospace" }}>{url}</code>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>Example: {example}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "24px", textAlign: "center" }}>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>
          Powered by{" "}
          <a href="https://flixworld.xyz" target="_blank" rel="noopener noreferrer"
            style={{ color: "rgba(245,197,24,0.7)", textDecoration: "none" }}>
            Flixworld.xyz
          </a>
        </span>
      </div>

    </main>
  );
}

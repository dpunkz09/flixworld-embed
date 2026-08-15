import ApiTester from "@/components/ApiTester";

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "white", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Hero ── */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "48px 24px 40px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 99, padding: "4px 14px", marginBottom: 20 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>API Online</span>
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.02em", background: "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.6) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          FlixWorld Embed API
        </h1>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.45)", maxWidth: 520, margin: "0 auto", lineHeight: 1.6 }}>
          Embed HLS movie and TV streams into any page with a single iframe. Subtitles, thumbnail scrubbing, and quality selection included.
        </p>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>

        {/* ── Live Tester (client component) ── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>Live Test</h2>
          <ApiTester />
        </section>

        {/* ── Endpoints ── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>Embed URLs</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              {
                method: "Movie",
                color: "#a78bfa",
                bg: "rgba(139,92,246,0.12)",
                border: "rgba(139,92,246,0.25)",
                url: "/embed/movie/{tmdb_id}",
                example: "/embed/movie/550",
                desc: "Embed a movie stream by TMDB ID",
              },
              {
                method: "TV",
                color: "#60a5fa",
                bg: "rgba(59,130,246,0.12)",
                border: "rgba(59,130,246,0.25)",
                url: "/embed/tv/{tmdb_id}/{season}/{episode}",
                example: "/embed/tv/94997/1/1",
                desc: "Embed a TV episode by TMDB ID, season and episode number",
              },
            ].map(({ method, color, bg, border, url, example, desc }) => (
              <div key={method} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ background: bg, border: `1px solid ${border}`, color, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", padding: "2px 10px", borderRadius: 6 }}>{method}</span>
                  <code style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", fontFamily: "monospace" }}>{url}</code>
                </div>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>{desc}</p>
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Example:</span>
                  <code style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>{example}</code>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Parameters ── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>Parameters</h2>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
            {[
              { param: "tmdb_id", type: "number", required: true,  desc: "TMDB content ID — find it at themoviedb.org" },
              { param: "season",  type: "number", required: true,  desc: "Season number (TV only, starts at 1)" },
              { param: "episode", type: "number", required: true,  desc: "Episode number (TV only, starts at 1)" },
            ].map(({ param, type, required, desc }, i, arr) => (
              <div key={param} style={{ display: "grid", gridTemplateColumns: "140px 70px 1fr", alignItems: "center", gap: 16, padding: "12px 20px", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <code style={{ fontSize: 13, color: "#a78bfa", fontFamily: "monospace" }}>{param}</code>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.05)", borderRadius: 4, padding: "1px 7px", textAlign: "center" }}>{type}</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                  {required && <span style={{ color: "#f87171", fontSize: 10, fontWeight: 700, marginRight: 6 }}>REQUIRED</span>}
                  {desc}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "20px 24px", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
          Powered by{" "}
          <a href="https://flixworld.xyz" target="_blank" rel="noopener noreferrer"
            style={{ color: "rgba(255,255,255,0.45)", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
            Flixworld.xyz
          </a>
        </span>
      </div>

    </main>
  );
}

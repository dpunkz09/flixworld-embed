"use client";

import { useState, useEffect } from "react";

type Mode = "movie" | "tv";

const DEFAULT_IDS: Record<Mode, string> = { movie: "1628071", tv: "108978" };

export default function ApiTester() {
  const [mode, setMode] = useState<Mode>("movie");
  const [tmdbId, setTmdbId] = useState(DEFAULT_IDS.movie);
  const [season, setSeason] = useState("1");
  const [episode, setEpisode] = useState("1");
  const [embedUrl, setEmbedUrl] = useState(`/embed/movie/${DEFAULT_IDS.movie}`);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const buildUrl = (m: Mode, id: string, s: string, e: string) =>
    m === "movie" ? `/embed/movie/${id}` : `/embed/tv/${id}/${s}/${e}`;

  const handleModeChange = (m: Mode) => {
    const id = DEFAULT_IDS[m];
    setMode(m);
    setTmdbId(id);
    setEmbedUrl(buildUrl(m, id, season, episode));
  };

  const handleTest = () => {
    setEmbedUrl(buildUrl(mode, tmdbId || DEFAULT_IDS[mode], season || "1", episode || "1"));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleTest();
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: "8px 12px",
    color: "white",
    fontSize: 14,
    outline: "none",
    fontFamily: "monospace",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>

      {/* Controls */}
      <div style={{ padding: "20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8 }}>
          {(["movie", "tv"] as Mode[]).map(m => (
            <button key={m} onClick={() => handleModeChange(m)}
              style={{
                padding: "6px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
                background: mode === m ? "white" : "rgba(255,255,255,0.07)",
                color: mode === m ? "black" : "rgba(255,255,255,0.5)",
                border: mode === m ? "none" : "1px solid rgba(255,255,255,0.1)",
              }}>
              {m === "movie" ? (
                <><span className="material-symbols-rounded" style={{ fontSize: 16 }}>movie</span> Movie</>
              ) : (
                <><span className="material-symbols-rounded" style={{ fontSize: 16 }}>tv</span> TV Show</>
              )}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>TMDB ID</label>
            <input
              type="number"
              value={tmdbId}
              onChange={e => setTmdbId(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={DEFAULT_IDS[mode]}
              style={inputStyle}
            />
          </div>
          {mode === "tv" && (
            <>
              <div style={{ flex: "0 1 90px" }}>
                <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Season</label>
                <input
                  type="number"
                  value={season}
                  onChange={e => setSeason(e.target.value)}
                  onKeyDown={handleKeyDown}
                  min="1"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: "0 1 90px" }}>
                <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Episode</label>
                <input
                  type="number"
                  value={episode}
                  onChange={e => setEpisode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  min="1"
                  style={inputStyle}
                />
              </div>
            </>
          )}
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "flex-end" }}>
            <button onClick={handleTest}
              style={{ padding: "8px 22px", borderRadius: 8, background: "white", color: "black", fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none", whiteSpace: "nowrap" }}>
              ▶ Test
            </button>
          </div>
        </div>

        {/* URL preview */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "8px 12px" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>URL</span>
          <code style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "monospace", wordBreak: "break-all" }}>
            {origin}{buildUrl(mode, tmdbId || DEFAULT_IDS[mode], season || "1", episode || "1")}
          </code>
        </div>
      </div>

      {/* Player preview */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#000" }}>
        <iframe
          key={embedUrl}
          src={embedUrl}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>

    </div>
  );
}

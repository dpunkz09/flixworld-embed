import type { Metadata } from "next";
import { Inter } from "next/font/google";
import ApiTester from "@/components/ApiTester";

// Scoped to this route, so embed/player pages don't download it.
const inter = Inter({ subsets: ["latin"], display: "swap" });

const EMBED_ORIGIN = "https://embed.flixworld.xyz";

const TITLE = "Flixworld API — Free Video Streaming Embed API";
const DESCRIPTION =
  "Embed free HD movie and TV show streams into any website with a single iframe. Powered by Flixworld API — subtitles, thumbnail scrubbing, and multi-source support included.";

export const metadata: Metadata = {
  // `absolute` skips the layout's "%s — Flixworld API" template, which would
  // otherwise append the site name a second time.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  // Next replaces (not merges) the layout's openGraph object, so repeat the
  // fields the layout set.
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Flixworld API",
    title: TITLE,
    description: "Embed free HD movie and TV show streams into any website with a single iframe.",
  },
};

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  { href: "#test", label: "Live test" },
  { href: "#features", label: "Features" },
  { href: "#docs", label: "Docs" },
];

const FEATURES = [
  { icon: "movie", title: "Movies", desc: "Full movie library via TMDB ID" },
  { icon: "tv", title: "TV Shows", desc: "Any season and episode by number" },
  { icon: "closed_caption", title: "Subtitles", desc: "Multi-language VTT subtitles included" },
  { icon: "hd", title: "HD Quality", desc: "Auto quality selection up to 1080p" },
  { icon: "schedule", title: "Resume Playback", desc: "Watch progress saved locally" },
  { icon: "code", title: "Single iframe", desc: "One line of HTML to embed anywhere" },
];

const ENDPOINTS = [
  { kind: "movie", badge: "MOVIE", url: "/embed/movie/{tmdb_id}", example: "/embed/movie/550" },
  {
    kind: "tv",
    badge: "TV",
    url: "/embed/tv/{tmdb_id}/{season}/{episode}",
    example: "/embed/tv/94997/1/1",
  },
] as const;

const PARAMS = [
  { name: "tmdb_id", type: "number", desc: "The title's ID on TMDB (themoviedb.org)." },
  { name: "season", type: "number", desc: "Season number. TV embeds only." },
  { name: "episode", type: "number", desc: "Episode number within the season. TV embeds only." },
];

// Embed snippet shown in the hero. Kinds: p = punctuation, t = tag,
// a = attribute, s = string, n = plain.
type Tok = readonly [kind: "p" | "t" | "a" | "s" | "n", text: string];
const SNIPPET: Tok[][] = [
  [["p", "<"], ["t", "iframe"]],
  [["n", "  "], ["a", "src"], ["p", "="], ["s", `"${EMBED_ORIGIN}/embed/movie/550"`]],
  [
    ["n", "  "],
    ["a", "width"],
    ["p", "="],
    ["s", '"100%"'],
    ["n", " "],
    ["a", "height"],
    ["p", "="],
    ["s", '"100%"'],
  ],
  [["n", "  "], ["a", "allowfullscreen"]],
  [["p", "></"], ["t", "iframe"], ["p", ">"]],
];

// ---------------------------------------------------------------------------
// Styles — bundled so the page doesn't depend on Tailwind or globals.css.
// Everything is prefixed `fw-` and scoped to the elements below, so it can't
// leak into <ApiTester />.
// ---------------------------------------------------------------------------

const CSS = `
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}

.fw{
  --bg:#0b0f1a;--gold:#f5c518;--line:rgba(255,255,255,.07);--card:rgba(255,255,255,.035);
  --muted:rgba(255,255,255,.6);--faint:rgba(255,255,255,.42);
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  min-height:100vh;background:var(--bg);color:#f4f6fb;
  overflow-x:clip; /* not "hidden": that would make this a scroll container and break the sticky nav */
  -webkit-font-smoothing:antialiased;
}
.fw-nav-in,.fw-wrap,.fw-hero,.fw-card,.fw-ep,.fw-param,.fw-pre,.fw-code{box-sizing:border-box}

/* Skip link + focus */
.fw-skip{
  position:absolute;left:1rem;top:-4rem;z-index:100;padding:.6rem 1rem;border-radius:.5rem;
  background:var(--gold);color:#0b0f1a;font-size:.875rem;font-weight:700;text-decoration:none;
  transition:top .15s;
}
.fw-skip:focus{top:1rem}
.fw-skip:focus-visible,.fw-brand:focus-visible,.fw-link:focus-visible,.fw-ext:focus-visible,
.fw-btn:focus-visible,.fw-foot a:focus-visible,.fw-pre:focus-visible{
  outline:2px solid var(--gold);outline-offset:3px;border-radius:.5rem;
}

/* Nav */
.fw-nav{
  position:sticky;top:0;z-index:50;border-bottom:1px solid var(--line);
  background:rgba(11,15,26,.82);
  -webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);
}
.fw-nav-in{
  display:flex;align-items:center;justify-content:space-between;gap:1rem;
  max-width:72rem;margin:0 auto;padding:.85rem clamp(1rem,4vw,2.5rem);
}
.fw-brand{
  display:flex;align-items:center;gap:.6rem;color:inherit;text-decoration:none;
  font-size:1.375rem;font-weight:800;letter-spacing:-.02em;line-height:1;
}
.fw-brand b{color:var(--gold);font-weight:inherit}
.fw-tag{
  padding:.15rem .5rem;border-radius:.3rem;font-size:.6875rem;font-weight:700;letter-spacing:.04em;
  color:var(--gold);background:rgba(245,197,24,.14);border:1px solid rgba(245,197,24,.3);
}
.fw-nav-r{display:flex;align-items:center;gap:.25rem}
.fw-link{
  padding:.45rem .8rem;border-radius:.5rem;font-size:.875rem;color:var(--muted);text-decoration:none;
  transition:color .15s,background .15s;
}
.fw-link:hover{color:#fff;background:rgba(255,255,255,.06)}
.fw-ext{
  display:inline-flex;align-items:center;gap:.4rem;margin-left:.4rem;padding:.45rem .85rem;
  border-radius:.55rem;border:1px solid rgba(255,255,255,.14);font-size:.8125rem;line-height:1.2;
  color:var(--muted);text-decoration:none;transition:color .15s,border-color .15s,background .15s;
}
.fw-ext:hover{color:#fff;border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.05)}
@media (max-width:720px){.fw-link{display:none}.fw-ext{margin-left:0}}

/* Hero */
.fw-hero{
  position:relative;isolation:isolate;overflow:hidden;text-align:center;
  padding:clamp(3.5rem,9vw,6rem) 1.5rem clamp(3rem,7vw,4.5rem);
}
.fw-hero::before{
  content:"";position:absolute;inset:0;z-index:-2;
  background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
  background-size:44px 44px;
  -webkit-mask-image:radial-gradient(ellipse 70% 80% at 50% 0,#000 30%,transparent 75%);
  mask-image:radial-gradient(ellipse 70% 80% at 50% 0,#000 30%,transparent 75%);
}
.fw-hero::after{
  content:"";position:absolute;z-index:-1;top:-6rem;left:50%;
  width:min(52rem,120vw);height:26rem;transform:translateX(-50%);pointer-events:none;
  background:radial-gradient(ellipse at center,rgba(245,197,24,.12),transparent 65%),
    radial-gradient(ellipse 40% 60% at 25% 60%,rgba(99,102,241,.1),transparent 70%);
}
.fw-badge{
  display:inline-flex;align-items:center;gap:.55rem;margin-bottom:1.5rem;padding:.35rem .9rem;
  border-radius:999px;font-size:.75rem;font-weight:500;line-height:1.4;color:rgba(255,255,255,.78);
  background:rgba(245,197,24,.09);border:1px solid rgba(245,197,24,.25);
}
.fw-dot{position:relative;width:.4rem;height:.4rem;border-radius:50%;background:#4ade80}
.fw-dot::after{
  content:"";position:absolute;inset:0;border-radius:inherit;background:inherit;
  animation:fw-ping 2s cubic-bezier(0,0,.2,1) infinite;
}
@keyframes fw-ping{75%,100%{transform:scale(3);opacity:0}}
.fw-h1{
  margin:0 0 1rem;font-size:clamp(2.25rem,6vw,4rem);font-weight:800;line-height:1.08;
  letter-spacing:-.035em;text-wrap:balance;
}
.fw-grad{
  background:linear-gradient(90deg,#f5c518,#ffe27a 50%,#f5c518);
  -webkit-background-clip:text;background-clip:text;color:transparent;
}
.fw-lead{
  max-width:36rem;margin:0 auto 2rem;font-size:clamp(.9375rem,2vw,1.125rem);
  line-height:1.7;color:var(--muted);text-wrap:pretty;
}
.fw-cta{display:flex;flex-wrap:wrap;justify-content:center;gap:.75rem}
.fw-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.8rem 1.7rem;
  border-radius:.6rem;font-size:.875rem;font-weight:700;line-height:1.2;letter-spacing:.01em;
  text-decoration:none;transition:transform .15s,background .15s,box-shadow .15s,border-color .15s;
}
.fw-btn-primary{background:var(--gold);color:#0b0f1a;box-shadow:0 6px 24px -6px rgba(245,197,24,.5)}
.fw-btn-primary:hover{background:#ffd633;transform:translateY(-1px);box-shadow:0 10px 30px -8px rgba(245,197,24,.6)}
.fw-btn-ghost{
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#fff;font-weight:600;
}
.fw-btn-ghost:hover{background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.26)}

/* Embed snippet window */
.fw-code{
  max-width:40rem;margin:clamp(2.5rem,6vw,3.5rem) auto 0;text-align:left;overflow:hidden;
  border-radius:.9rem;border:1px solid var(--line);background:rgba(8,11,20,.85);
  box-shadow:0 24px 60px -20px rgba(0,0,0,.7);
}
.fw-code-bar{
  display:flex;align-items:center;gap:.4rem;padding:.65rem .9rem;
  border-bottom:1px solid var(--line);background:rgba(255,255,255,.03);
}
.fw-d{width:.6rem;height:.6rem;border-radius:50%;background:rgba(255,255,255,.14)}
.fw-file{margin-left:.5rem;font:400 .75rem/1 var(--mono);color:var(--faint)}
.fw-pre{margin:0;padding:1rem 1.1rem;overflow-x:auto;font:400 .8125rem/1.7 var(--mono);color:#e2e8f0}
.fw-pre code{font:inherit;user-select:all} /* one click selects the whole snippet */
.fw-line{display:block;min-height:1.7em}
.t-p{color:#64748b}.t-t{color:#7dd3fc}.t-a{color:#fde68a}.t-s{color:#86efac}

/* Sections */
.fw-wrap{max-width:60rem;margin:0 auto;padding:0 clamp(1rem,4vw,1.5rem)}
.fw-sec{padding:clamp(3rem,7vw,4.5rem) 0;scroll-margin-top:4.5rem}
.fw-band{background:rgba(255,255,255,.02);border-block:1px solid var(--line)}
.fw-head{margin-bottom:2rem;text-align:center}
.fw-eyebrow{
  display:block;margin-bottom:.6rem;font-size:.75rem;font-weight:700;letter-spacing:.14em;
  text-transform:uppercase;color:var(--gold);
}
.fw-h2{margin:0;font-size:clamp(1.5rem,3.4vw,2rem);font-weight:700;line-height:1.2;letter-spacing:-.025em}
.fw-sub{margin:.5rem 0 0;font-size:.9375rem;color:var(--faint)}

/* Features */
.fw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1.25rem}
.fw-card{
  padding:1.35rem;border-radius:.9rem;background:var(--card);border:1px solid rgba(255,255,255,.07);
  transition:transform .2s,border-color .2s,background .2s;
}
.fw-card:hover{transform:translateY(-3px);border-color:rgba(245,197,24,.28);background:rgba(255,255,255,.055)}
.fw-ico{
  display:grid;place-items:center;width:2.6rem;height:2.6rem;margin-bottom:1rem;border-radius:.7rem;
  background:rgba(245,197,24,.12);border:1px solid rgba(245,197,24,.22);
}
/* Fixed box + clipping: if the icon font is slow, ligature text can't spill out */
.fw-sym{display:inline-block;width:20px;height:20px;overflow:hidden;color:var(--gold);line-height:1}
.fw-card-t{margin:0 0 .35rem;font-size:1rem;font-weight:600;line-height:1.3}
.fw-card-d{margin:0;font-size:.875rem;line-height:1.55;color:var(--faint)}

/* Docs */
.fw-h3{
  margin:0 0 .9rem;font-size:.75rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  color:rgba(255,255,255,.4);
}
.fw-eps{display:flex;flex-direction:column;gap:.75rem;margin-bottom:2.5rem}
.fw-ep{padding:1rem 1.15rem;border-radius:.75rem;background:var(--card);border:1px solid rgba(255,255,255,.07)}
.fw-ep[data-k="movie"]{--c:#a78bfa;--bg-c:rgba(139,92,246,.12);--bd-c:rgba(139,92,246,.25)}
.fw-ep[data-k="tv"]{--c:#60a5fa;--bg-c:rgba(59,130,246,.12);--bd-c:rgba(59,130,246,.25)}
.fw-ep-top{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;margin-bottom:.5rem}
.fw-pill{
  padding:.15rem .55rem;border-radius:.35rem;font-size:.625rem;font-weight:700;letter-spacing:.09em;
  color:var(--c);background:var(--bg-c);border:1px solid var(--bd-c);
}
.fw-path{font:500 .8125rem/1.5 var(--mono);color:rgba(255,255,255,.88);overflow-wrap:anywhere}
.fw-path em{font-style:normal;color:var(--c)}
.fw-ex{margin:0;font:400 .75rem/1.5 var(--mono);color:rgba(255,255,255,.4);overflow-wrap:anywhere;user-select:all}
.fw-params{margin:0;overflow:hidden;border-radius:.75rem;background:var(--card);border:1px solid rgba(255,255,255,.07)}
.fw-param{display:grid;grid-template-columns:9rem 5.5rem 1fr;gap:1rem;align-items:baseline;padding:.8rem 1.15rem}
.fw-param + .fw-param{border-top:1px solid var(--line)}
.fw-param dt{font:600 .8125rem/1.5 var(--mono);color:var(--gold)}
.fw-param dd{margin:0;font-size:.8125rem;line-height:1.5;color:var(--muted)}
.fw-param dd.ty{font-family:var(--mono);color:var(--faint)}
@media (max-width:600px){.fw-param{grid-template-columns:1fr;gap:.2rem}}

/* Footer */
.fw-foot{border-top:1px solid var(--line);padding:1.75rem 1.5rem;text-align:center;font-size:.8125rem;color:rgba(255,255,255,.3)}
.fw-foot a{color:rgba(245,197,24,.75);text-decoration:none;transition:color .15s}
.fw-foot a:hover{color:var(--gold)}

@media (prefers-reduced-motion:reduce){
  .fw-dot::after{animation:none}
  .fw-skip,.fw-link,.fw-ext,.fw-btn,.fw-card,.fw-foot a{transition:none}
  .fw-card:hover,.fw-btn-primary:hover{transform:none}
}
`;

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Path({ url }: { url: string }) {
  // Highlight the {placeholders} in an endpoint path
  return (
    <code className="fw-path">
      {url.split(/(\{[^}]+\})/).map((part, i) =>
        part.startsWith("{") ? <em key={i}>{part}</em> : <span key={i}>{part}</span>,
      )}
    </code>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  return (
    <div className={`fw ${inter.className}`}>
      <style>{CSS}</style>
      <a className="fw-skip" href="#main">
        Skip to content
      </a>

      {/* ── Nav ── */}
      <header className="fw-nav">
        <div className="fw-nav-in">
          <a className="fw-brand" href="/" aria-label="Flixworld API home">
            <span>
              <b>Flix</b>world
            </span>
            <span className="fw-tag">API</span>
          </a>

          <nav className="fw-nav-r" aria-label="Primary">
            {NAV_LINKS.map(({ href, label }) => (
              <a key={href} className="fw-link" href={href}>
                {label}
              </a>
            ))}
            <a
              className="fw-ext"
              href="https://flixworld.xyz"
              target="_blank"
              rel="noopener noreferrer"
            >
              flixworld.xyz
              <ExternalIcon />
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* ── Hero ── */}
        <section className="fw-hero" aria-labelledby="hero-h">
          <div className="fw-badge">
            <span className="fw-dot" aria-hidden="true" />
            Free · No API key required for embed
          </div>

          <h1 id="hero-h" className="fw-h1">
            Next generation
            <br />
            <span className="fw-grad">Video Streaming API</span>
          </h1>

          <p className="fw-lead">
            Free streaming links for movies and TV episodes that can be effortlessly integrated into
            your website through our embed links and API.
          </p>

          <div className="fw-cta">
            <a className="fw-btn fw-btn-primary" href="#test">
              Try it now
            </a>
            <a className="fw-btn fw-btn-ghost" href="#docs">
              Documentation
            </a>
          </div>

          <div className="fw-code">
            <div className="fw-code-bar" aria-hidden="true">
              <span className="fw-d" />
              <span className="fw-d" />
              <span className="fw-d" />
              <span className="fw-file">embed.html</span>
            </div>
            <pre className="fw-pre" tabIndex={0}>
              <code>
                {SNIPPET.map((line, i) => (
                  <span key={i} className="fw-line">
                    {line.map(([kind, text], j) => (
                      <span key={j} className={`t-${kind}`}>
                        {text}
                      </span>
                    ))}
                  </span>
                ))}
              </code>
            </pre>
          </div>
        </section>

        {/* ── Live Test ── */}
        <section id="test" className="fw-sec" aria-labelledby="test-h" style={{ paddingTop: 0 }}>
          <div className="fw-wrap">
            <div className="fw-head">
              <span className="fw-eyebrow">Playground</span>
              <h2 id="test-h" className="fw-h2">
                Live Player Test
              </h2>
              <p className="fw-sub">Enter a TMDB ID to preview the embed player instantly</p>
            </div>
            <ApiTester />
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="fw-sec fw-band" aria-labelledby="features-h">
          <div className="fw-wrap">
            <div className="fw-head">
              <span className="fw-eyebrow">Features</span>
              <h2 id="features-h" className="fw-h2">
                Everything you need to stream
              </h2>
            </div>
            <div className="fw-grid">
              {FEATURES.map(({ icon, title, desc }) => (
                <div key={title} className="fw-card">
                  <div className="fw-ico">
                    <span
                      className="material-symbols-rounded fw-sym"
                      style={{ fontSize: 20 }}
                      aria-hidden="true"
                    >
                      {icon}
                    </span>
                  </div>
                  <h3 className="fw-card-t">{title}</h3>
                  <p className="fw-card-d">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Docs ── */}
        <section id="docs" className="fw-sec" aria-labelledby="docs-h">
          <div className="fw-wrap">
            <div className="fw-head" style={{ textAlign: "left" }}>
              <span className="fw-eyebrow">Docs</span>
              <h2 id="docs-h" className="fw-h2">
                API Reference
              </h2>
            </div>

            <h3 className="fw-h3">Embed URLs</h3>
            <div className="fw-eps">
              {ENDPOINTS.map(({ kind, badge, url, example }) => (
                <div key={kind} className="fw-ep" data-k={kind}>
                  <div className="fw-ep-top">
                    <span className="fw-pill">{badge}</span>
                    <Path url={url} />
                  </div>
                  <p className="fw-ex">
                    Example: {EMBED_ORIGIN}
                    {example}
                  </p>
                </div>
              ))}
            </div>

            <h3 className="fw-h3">Parameters</h3>
            <dl className="fw-params">
              {PARAMS.map(({ name, type, desc }) => (
                <div key={name} className="fw-param">
                  <dt>{name}</dt>
                  <dd className="ty">{type}</dd>
                  <dd>{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="fw-foot">
        Powered by{" "}
        <a href="https://flixworld.xyz" target="_blank" rel="noopener noreferrer">
          Flixworld.xyz
        </a>
      </footer>
    </div>
  );
}
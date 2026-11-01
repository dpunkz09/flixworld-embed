// Bundled styles keep this screen self-contained: it is often shown inside a
// third-party iframe, so it scales with the smaller viewport side (vmin).
const CSS = `
.nf{
  position:relative;display:flex;align-items:center;justify-content:center;
  min-height:100vh;min-height:100dvh;padding:clamp(16px,5vmin,48px);
  overflow:hidden;background:#000;color:#fff;text-align:center;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
.nf::before{
  content:"";position:absolute;left:50%;top:42%;
  width:min(90vmin,640px);aspect-ratio:1;transform:translate(-50%,-50%);
  background:radial-gradient(closest-side,rgba(229,9,20,.22),transparent 72%);
  pointer-events:none;
}
.nf-inner{
  position:relative;display:flex;flex-direction:column;align-items:center;
  gap:clamp(6px,1.6vmin,12px);max-width:30rem;
}
.nf-icon{width:clamp(32px,8vmin,48px);height:clamp(32px,8vmin,48px);color:rgba(255,255,255,.32)}
.nf-code{
  margin:0;font-size:clamp(3.5rem,22vmin,9rem);font-weight:900;line-height:.95;letter-spacing:-.04em;
  background:linear-gradient(180deg,#ff3b44 0%,#e50914 55%,#7a050b 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
}
.nf-title{margin:0;font-size:clamp(1rem,3.4vmin,1.375rem);font-weight:700;line-height:1.3}
.nf-text{margin:0;font-size:clamp(.75rem,2.3vmin,.9375rem);line-height:1.6;color:rgba(255,255,255,.55)}
.nf-link{
  margin-top:clamp(6px,1.8vmin,14px);padding:.55em 1.1em;border-radius:999px;
  font-size:clamp(.75rem,2.2vmin,.875rem);font-weight:600;color:rgba(255,255,255,.8);
  text-decoration:none;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);
  transition:background .15s,border-color .15s,color .15s;
}
.nf-link:hover{color:#fff;background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.3)}
.nf-link:focus-visible{outline:2px solid #e50914;outline-offset:3px}
@media (prefers-reduced-motion:reduce){.nf-link{transition:none}}
`;

export default function NotFound() {
  return (
    <>
      <style>{CSS}</style>
      <main className="nf">
        <div className="nf-inner">
          <svg
            className="nf-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M10 8.5v7l5.5-3.5-5.5-3.5z" />
            <path d="M4.5 4.5l15 15" />
          </svg>

          <p className="nf-code" aria-hidden="true">
            404
          </p>
          <h1 className="nf-title">Stream not found or unavailable.</h1>
          <p className="nf-text">
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Error 404.{" "}
            </span>
            The link may be broken, or this title isn&rsquo;t available right now. If you run this
            site, check the TMDB ID, season and episode in the embed URL.
          </p>

          <a className="nf-link" href="/#docs" target="_blank" rel="noopener noreferrer">
            Embed documentation
          </a>
        </div>
      </main>
    </>
  );
}
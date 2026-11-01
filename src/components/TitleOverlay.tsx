"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { MediaInfo } from "@/lib/api";

const TMDB_IMG = "https://image.tmdb.org/t/p";

// The class JW Player sets on its wrapper when the user is inactive (controls hidden)
const INACTIVE_CLASS = "jw-flag-user-inactive";

interface Props {
  info: MediaInfo;
  /** The JW Player wrapper element — overlay is portalled inside it so it
   *  travels into fullscreen with the player. */
  mountEl: Element;
}

// ---------------------------------------------------------------------------
// Icons (sized in em so they scale with the overlay)
// ---------------------------------------------------------------------------

function StarIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Styles — bundled here so the component has no external CSS dependency.
// Everything is sized in em; the root font-size scales with the player width.
// ---------------------------------------------------------------------------

const CSS = `
.to-root{
  position:absolute;inset:0;z-index:1500;pointer-events:none;user-select:none;
  font-family:inherit;line-height:1.25;color:#fff;
  opacity:1;visibility:visible;
  transition:opacity 300ms ease,visibility 0s linear 0s;
}
.to-root[data-hidden="true"]{
  opacity:0;visibility:hidden;
  transition:opacity 300ms ease,visibility 0s linear 300ms;
}
.to-root *{box-sizing:border-box;margin:0}

/* Soft scrim so text stays readable over bright video */
.to-scrim{
  position:absolute;inset:0 0 auto 0;height:60%;
  background:linear-gradient(to bottom,
    rgba(0,0,0,.82) 0%,rgba(0,0,0,.5) 38%,rgba(0,0,0,.16) 75%,transparent 100%);
}

.to-card{
  position:absolute;top:0;right:0;
  display:flex;flex-direction:row-reverse;align-items:flex-start;gap:1em;
  max-width:var(--to-max-w);padding:1.1em 1.1em 0;
}

/* Poster */
.to-poster{
  flex:none;width:5.5em;aspect-ratio:2/3;border-radius:.55em;overflow:hidden;
  background:rgba(255,255,255,.08);
  box-shadow:0 8px 24px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.14);
}
.to-poster img{
  display:block;width:100%;height:100%;object-fit:cover;
  opacity:0;transition:opacity 300ms ease;
}
.to-poster[data-loaded="true"] img{opacity:1}

/* Text */
.to-text{
  min-width:0;display:flex;flex-direction:column;align-items:flex-end;gap:.45em;
  text-align:right;text-shadow:0 1px 8px rgba(0,0,0,.7);
}
.to-title{
  max-width:100%;
  font-size:1.8em;font-weight:800;letter-spacing:-.015em;line-height:1.12;
  text-shadow:0 2px 14px rgba(0,0,0,.75);
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;
  text-wrap:balance;overflow-wrap:anywhere;
}
.to-sub{
  display:flex;align-items:center;justify-content:flex-end;gap:.6em;
  max-width:100%;min-width:0;font-size:1em;color:rgba(255,255,255,.88);
}
.to-chip{
  flex:none;padding:.18em .6em;border-radius:.45em;
  background:rgba(255,255,255,.16);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);
  font-size:.82em;font-weight:700;letter-spacing:.05em;font-variant-numeric:tabular-nums;
}
.to-ep{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.to-tagline{
  max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-style:italic;color:rgba(255,255,255,.78);
}
.to-meta-row{
  display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:.35em .7em;
  font-size:.9em;font-weight:500;color:rgba(255,255,255,.72);
}
.to-rating{
  display:inline-flex;align-items:center;gap:.3em;padding:.15em .6em;border-radius:999px;
  background:rgba(245,197,24,.16);color:#f8d34a;
  box-shadow:inset 0 0 0 1px rgba(245,197,24,.35);
  font-weight:700;font-variant-numeric:tabular-nums;text-shadow:none;
}

@media (prefers-reduced-motion:reduce){
  .to-root,.to-poster img{transition:none}
}
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TitleOverlay({ info, mountEl }: Props) {
  // true = controls visible → overlay visible, false = controls hidden → overlay hidden
  const [controlsVisible, setControlsVisible] = useState(true);
  const [containerW, setContainerW] = useState(0);
  // Track poster load/fail per URL so a new title resets the state automatically
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // Track the player's width so the overlay scales with it
  useEffect(() => {
    if (!mountEl) return;
    
    // Set initial width before creating observer
    const el = mountEl as HTMLElement;
    setContainerW(el.offsetWidth ?? 0);
    
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(mountEl);
    
    return () => ro.disconnect();
  }, [mountEl]);

  // Mirror JW Player's controls visibility. It toggles `jw-flag-user-inactive`
  // on the wrapper when controls hide/show; we watch that class.
  useEffect(() => {
    if (!mountEl) return;
    const update = () => setControlsVisible(!mountEl.classList.contains(INACTIVE_CLASS));
    update();
    const mo = new MutationObserver(update);
    mo.observe(mountEl, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [mountEl]);

  // Sizing: one base unit (px) that scales with the player, everything else is em
  const cw = containerW || 640;
  const u = Math.min(20, Math.max(12, Math.round(cw * 0.0155 * 10) / 10));
  // On narrow players, drop the poster and keep the card clear of the server selector
  const compact = cw < 480;
  const rootStyle = {
    fontSize: u,
    "--to-max-w": compact ? "52%" : "62%",
  } as CSSProperties;

  // Display values
  const posterUrl = info.posterPath ? `${TMDB_IMG}/w185${info.posterPath}` : null;
  const poster2x = info.posterPath ? `${TMDB_IMG}/w342${info.posterPath}` : null;
  const showPoster = !compact && !!posterUrl && failedUrl !== posterUrl;

  const metaLine = [info.year ? String(info.year) : "", info.genres, info.meta]
    .filter(Boolean)
    .join(" · ");

  const isEpisode = info.type === "tv" && !!info.episodeTitle;
  const epLabel =
    isEpisode && info.season != null && info.episode != null
      ? `S${info.season} · E${info.episode}`
      : null;
  const tagline = !isEpisode && info.tagline ? info.tagline : null;

  // TMDB reports 0 for "no rating yet" — don't show ★ 0.0
  const rating =
    typeof info.rating === "number" && info.rating > 0 ? info.rating.toFixed(1) : null;

  const overlay = (
    <>
      <style>{CSS}</style>
      <div className="to-root" data-hidden={!controlsVisible} style={rootStyle}>
        <div className="to-scrim" />

        <div className="to-card">
          {showPoster && posterUrl && (
            <div className="to-poster" data-loaded={loadedUrl === posterUrl}>
              <img
                key={posterUrl}
                src={posterUrl}
                srcSet={poster2x ? `${posterUrl} 1x, ${poster2x} 2x` : undefined}
                alt=""
                aria-hidden="true"
                draggable={false}
                decoding="async"
                // Cached images can finish loading before onLoad is attached
                ref={(el) => {
                  if (el?.complete && el.naturalWidth > 0) setLoadedUrl(posterUrl);
                }}
                onLoad={() => setLoadedUrl(posterUrl)}
                onError={() => setFailedUrl(posterUrl)}
              />
            </div>
          )}

          <div className="to-text">
            <div className="to-title">{info.title}</div>

            {isEpisode && (
              <div className="to-sub">
                {epLabel && <span className="to-chip">{epLabel}</span>}
                <span className="to-ep">{info.episodeTitle}</span>
              </div>
            )}
            {tagline && <div className="to-tagline">{tagline}</div>}

            {(metaLine || rating) && (
              <div className="to-meta-row">
                {rating && (
                  <span className="to-rating">
                    <StarIcon />
                    {rating}
                  </span>
                )}
                {metaLine && <span>{metaLine}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(overlay, mountEl);
}
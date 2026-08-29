"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { MediaInfo } from "@/lib/api";

const TMDB_IMG = "https://image.tmdb.org/t/p";

// CSS transition duration (ms)
const FADE_MS = 300;

// The class JW Player sets on its wrapper when the user is inactive (controls hidden)
const INACTIVE_CLASS = "jw-flag-user-inactive";

interface Props {
  info: MediaInfo;
  /** The JW Player wrapper element — overlay is portalled inside it so it
   *  travels into fullscreen with the player. */
  mountEl: Element;
}

export default function TitleOverlay({ info, mountEl }: Props) {
  // true  = controls visible → overlay visible
  // false = controls hidden  → overlay hidden
  const [controlsVisible, setControlsVisible] = useState(true);
  const [containerW, setContainerW]           = useState(0);

  // ---------- observe container width for proportional sizing ----------
  useEffect(() => {
    if (!mountEl) return;
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(mountEl);
    setContainerW((mountEl as HTMLElement).offsetWidth ?? 0);
    return () => ro.disconnect();
  }, [mountEl]);

  // ---------- mirror JW Player controls visibility via MutationObserver ----------
  // JW Player toggles `jw-flag-user-inactive` on the wrapper element when the
  // controls hide/show. We watch that class and keep the overlay in sync.
  useEffect(() => {
    if (!mountEl) return;

    const update = () => {
      setControlsVisible(!mountEl.classList.contains(INACTIVE_CLASS));
    };

    // Set initial state
    update();

    const mo = new MutationObserver(update);
    mo.observe(mountEl, { attributes: true, attributeFilter: ["class"] });

    return () => mo.disconnect();
  }, [mountEl]);

  // ---------- proportional sizes based on actual container width ----------
  const cw = containerW || 400;

  const posterW   = Math.round(cw * 0.09);
  const gap       = Math.round(cw * 0.022);
  const pad       = Math.round(cw * 0.032);
  const titleSize = Math.max(11, Math.round(cw * 0.034));
  const subSize   = Math.max(9,  Math.round(cw * 0.026));
  const metaSize  = Math.max(8,  Math.round(cw * 0.020));
  const borderR   = Math.max(4,  Math.round(cw * 0.010));

  // ---------- derived display values ----------
  const posterUrl = info.posterPath
    ? `${TMDB_IMG}/w185${info.posterPath}`
    : null;

  const metaParts: string[] = [];
  if (info.year)   metaParts.push(String(info.year));
  if (info.genres) metaParts.push(info.genres);
  if (info.meta)   metaParts.push(info.meta);
  const metaLine = metaParts.join(" · ");

  const subtitle =
    info.type === "tv" && info.episodeTitle
      ? `S${info.season} · E${info.episode}  —  ${info.episodeTitle}`
      : info.tagline || undefined;

  const stars = info.rating != null ? `★ ${info.rating.toFixed(1)}` : null;

  const overlay = (
    <div
      style={{
        position:      "absolute",
        inset:         0,
        zIndex:        1500,
        pointerEvents: "none",
        opacity:       controlsVisible ? 1 : 0,
        transition:    `opacity ${FADE_MS}ms ease`,
        background:
          "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)",
        display:        "flex",
        alignItems:     "flex-start",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          display:       "flex",
          alignItems:    "flex-start",
          flexDirection: "row-reverse",
          gap,
          padding:       `${pad}px ${pad}px 0`,
          maxWidth:      "60%",
          // Card itself also doesn't need pointer events — it's informational only
          pointerEvents: "none",
        }}
      >
        {posterUrl && (
          <img
            src={posterUrl}
            alt=""
            aria-hidden="true"
            style={{
              width:        posterW,
              flexShrink:   0,
              borderRadius: borderR,
              boxShadow:    "0 4px 16px rgba(0,0,0,0.6)",
              display:      "block",
            }}
          />
        )}

        <div style={{ minWidth: 0, textAlign: "right" }}>
          <div
            style={{
              color:        "#fff",
              fontSize:     titleSize,
              fontWeight:   700,
              lineHeight:   1.2,
              textShadow:   "0 2px 8px rgba(0,0,0,0.8)",
              whiteSpace:   "nowrap",
              overflow:     "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {info.title}
          </div>

          {subtitle && (
            <div
              style={{
                color:        "rgba(255,255,255,0.8)",
                fontSize:     subSize,
                marginTop:    Math.round(gap * 0.25),
                textShadow:   "0 1px 6px rgba(0,0,0,0.8)",
                whiteSpace:   "nowrap",
                overflow:     "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {subtitle}
            </div>
          )}

          {metaLine && (
            <div
              style={{
                color:          "rgba(255,255,255,0.6)",
                fontSize:       metaSize,
                marginTop:      Math.round(gap * 0.3),
                display:        "flex",
                alignItems:     "center",
                justifyContent: "flex-end",
                gap:            Math.round(gap * 0.4),
                flexWrap:       "wrap",
              }}
            >
              <span>{metaLine}</span>
              {stars && (
                <>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span style={{ color: "#f5c518" }}>{stars}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, mountEl);
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ServerState } from "@/lib/servers";

// Matches JW Player's inactive-controls class
const INACTIVE_CLASS = "jw-flag-user-inactive";
const FADE_MS = 250;

interface Props {
  servers: ServerState[];
  activeServerId: string;
  onSelect: (id: string) => void;
  mountEl: Element;
}

// ---------------------------------------------------------------------------
// Icons (inline SVG — no extra deps)
// ---------------------------------------------------------------------------

function CloudIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function SpinnerIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ animation: "srv-spin 0.8s linear infinite" }}
    >
      <circle cx="12" cy="12" r="9" strokeOpacity="0.2" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ErrorIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ServerOverlay({
  servers,
  activeServerId,
  onSelect,
  mountEl,
}: Props) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [containerW, setContainerW] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Container width for proportional sizing ────────────────────────────
  useEffect(() => {
    if (!mountEl) return;
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(mountEl);
    setContainerW((mountEl as HTMLElement).offsetWidth ?? 0);
    return () => ro.disconnect();
  }, [mountEl]);

  // ── Mirror JW Player controls visibility ──────────────────────────────
  useEffect(() => {
    if (!mountEl) return;
    const update = () => {
      const inactive = mountEl.classList.contains(INACTIVE_CLASS);
      setControlsVisible(!inactive);
      // Close panel when controls auto-hide
      if (inactive) setPanelOpen(false);
    };
    update();
    const mo = new MutationObserver(update);
    mo.observe(mountEl, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [mountEl]);

  // ── Close panel on outside click ──────────────────────────────────────
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    // Capture phase so JW Player doesn't swallow the event
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [panelOpen]);

  // ── Proportional sizes ─────────────────────────────────────────────────
  const cw = containerW || 480;
  const btnSize   = Math.max(28, Math.round(cw * 0.055));
  const iconSize  = Math.max(14, Math.round(btnSize * 0.52));
  const pad       = Math.max(8,  Math.round(cw * 0.022));
  const fontSize  = Math.max(11, Math.round(cw * 0.026));
  const tagSize   = Math.max(9,  Math.round(cw * 0.020));
  const borderR   = Math.max(6,  Math.round(cw * 0.012));
  const panelW    = Math.min(260, Math.round(cw * 0.44));
  const rowH      = Math.max(36, Math.round(cw * 0.072));

  // How many servers are still loading
  const loadingCount = servers.filter((s) => s.status === "loading").length;
  const hasAnyReady  = servers.some((s) => s.status === "ready");

  // ── Status badge colours ───────────────────────────────────────────────
  function statusColor(status: ServerState["status"], isActive: boolean) {
    if (isActive) return "#22c55e";   // green
    if (status === "loading") return "rgba(255,255,255,0.45)";
    if (status === "ready")   return "rgba(255,255,255,0.7)";
    return "rgba(255,255,255,0.25)";  // error
  }

  // ── Cloud button pulse when loading ───────────────────────────────────
  const buttonPulse = loadingCount > 0 && !hasAnyReady;

  const overlay = (
    <>
      {/* Keyframe injection — once per page */}
      <style>{`
        @keyframes srv-spin { to { transform: rotate(360deg); } }
        @keyframes srv-pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
      `}</style>

      {/* Wrapper — top-left corner, opposite TitleOverlay (top-right) */}
      <div
        style={{
          position:      "absolute",
          inset:         0,
          zIndex:        1500,
          pointerEvents: "none",
          opacity:       controlsVisible ? 1 : 0,
          transition:    `opacity ${FADE_MS}ms ease`,
          display:       "flex",
          alignItems:    "flex-start",
          justifyContent:"flex-start",
        }}
      >
        <div
          style={{
            padding:       `${pad * 1.6}px 0 0 ${pad * 1.6}px`,
            pointerEvents: "auto",
            position:      "relative",
          }}
          ref={panelRef}
        >
          {/* ── Server panel ────────────────────────────────────────── */}
          {panelOpen && (
            <div
              role="menu"
              aria-label="Select streaming server"
              style={{
                position:      "absolute",
                top:           `calc(100% + 8px)`,
                left:          0,
                width:         panelW,
                background:    "rgba(10,10,15,0.92)",
                backdropFilter:"blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                borderRadius:  borderR + 2,
                border:        "1px solid rgba(255,255,255,0.12)",
                boxShadow:     "0 8px 32px rgba(0,0,0,0.7)",
                overflow:      "hidden",
                animation:     `srv-fadein ${FADE_MS}ms ease`,
              }}
            >
              {/* Panel header */}
              <div
                style={{
                  padding:       `${Math.round(rowH * 0.28)}px ${pad}px`,
                  fontSize:      tagSize + 1,
                  fontWeight:    600,
                  color:         "rgba(255,255,255,0.4)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  borderBottom:  "1px solid rgba(255,255,255,0.08)",
                }}
              >
                Servers
                {loadingCount > 0 && (
                  <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.25)" }}>
                    ({loadingCount} loading…)
                  </span>
                )}
              </div>

              {/* Server rows */}
              {servers.map((srv) => {
                const isActive  = srv.id === activeServerId;
                const isLoading = srv.status === "loading";
                const isError   = srv.status === "error";
                const isReady   = srv.status === "ready";
                const canSelect = isReady && !isActive;

                return (
                  <button
                    key={srv.id}
                    role="menuitem"
                    aria-current={isActive ? "true" : undefined}
                    disabled={!canSelect && !isActive}
                    onClick={() => {
                      if (canSelect) {
                        onSelect(srv.id);
                        setPanelOpen(false);
                      }
                    }}
                    style={{
                      display:       "flex",
                      alignItems:    "center",
                      gap:           Math.round(pad * 0.7),
                      width:         "100%",
                      height:        rowH,
                      padding:       `0 ${pad}px`,
                      background:    isActive
                        ? "rgba(34,197,94,0.12)"
                        : "transparent",
                      border:        "none",
                      borderBottom:  "1px solid rgba(255,255,255,0.05)",
                      cursor:        canSelect ? "pointer" : "default",
                      textAlign:     "left",
                      transition:    "background 150ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (canSelect)
                        (e.currentTarget as HTMLElement).style.background =
                          "rgba(255,255,255,0.07)";
                    }}
                    onMouseLeave={(e) => {
                      if (canSelect)
                        (e.currentTarget as HTMLElement).style.background =
                          isActive ? "rgba(34,197,94,0.12)" : "transparent";
                    }}
                  >
                    {/* Status icon */}
                    <span
                      style={{
                        color: statusColor(srv.status, isActive),
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {isActive  && <CheckIcon size={iconSize} />}
                      {isLoading && <SpinnerIcon size={iconSize} />}
                      {isError   && <ErrorIcon size={iconSize} />}
                      {isReady && !isActive && (
                        <span
                          style={{
                            width:        iconSize * 0.55,
                            height:       iconSize * 0.55,
                            borderRadius: "50%",
                            background:   "rgba(255,255,255,0.35)",
                            display:      "block",
                          }}
                        />
                      )}
                    </span>

                    {/* Label */}
                    <span
                      style={{
                        flex:       1,
                        fontSize,
                        fontWeight: isActive ? 600 : 400,
                        color:      isActive
                          ? "#fff"
                          : isError
                          ? "rgba(255,255,255,0.3)"
                          : "rgba(255,255,255,0.85)",
                        overflow:     "hidden",
                        whiteSpace:   "nowrap",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {srv.label}
                    </span>

                    {/* Tag badge */}
                    <span
                      style={{
                        fontSize:     tagSize,
                        fontWeight:   700,
                        padding:      `2px ${Math.round(tagSize * 0.55)}px`,
                        borderRadius: tagSize * 0.4,
                        background:   isActive
                          ? "rgba(34,197,94,0.25)"
                          : "rgba(255,255,255,0.08)",
                        color: isActive
                          ? "#86efac"
                          : isError
                          ? "rgba(255,255,255,0.2)"
                          : "rgba(255,255,255,0.5)",
                        letterSpacing: "0.04em",
                        flexShrink:    0,
                      }}
                    >
                      {srv.tag}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Cloud toggle button ──────────────────────────────────── */}
          <button
            aria-label={panelOpen ? "Close server selector" : "Open server selector"}
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((p) => !p)}
            style={{
              width:        btnSize,
              height:       btnSize,
              borderRadius: "50%",
              background:   panelOpen
                ? "rgba(255,255,255,0.18)"
                : "rgba(0,0,0,0.55)",
              border:       `1.5px solid ${panelOpen
                ? "rgba(255,255,255,0.35)"
                : "rgba(255,255,255,0.18)"}`,
              backdropFilter:       "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              cursor:  "pointer",
              display: "flex",
              alignItems:     "center",
              justifyContent: "center",
              color:          panelOpen ? "#fff" : "rgba(255,255,255,0.75)",
              transition:     "background 150ms ease, border-color 150ms ease, color 150ms ease",
              animation:      buttonPulse ? "srv-pulse 1.4s ease infinite" : "none",
              // Dot indicator when loading
              boxShadow: loadingCount > 0 && !buttonPulse
                ? `0 0 0 2px rgba(234,179,8,0.7)`
                : panelOpen
                ? "0 4px 16px rgba(0,0,0,0.5)"
                : "none",
            }}
          >
            <CloudIcon size={iconSize} />
          </button>
        </div>
      </div>

      {/* Fade-in keyframe for panel — slides down from button */}
      <style>{`
        @keyframes srv-fadein {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );

  return createPortal(overlay, mountEl);
}

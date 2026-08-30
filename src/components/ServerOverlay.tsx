"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ServerState } from "@/lib/servers";

const INACTIVE_CLASS = "jw-flag-user-inactive";
const FADE_MS = 200;

interface Props {
  servers: ServerState[];
  activeServerId: string;
  onSelect: (id: string) => void;
  mountEl: Element;
}

// ---------------------------------------------------------------------------
// Minimal icons
// ---------------------------------------------------------------------------

function ServerIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
      <line x1="6" y1="6" x2="6.01" y2="6"/>
      <line x1="6" y1="18" x2="6.01" y2="18"/>
    </svg>
  );
}

function SpinnerIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      aria-hidden="true"
      style={{ animation: "srv-spin 0.75s linear infinite", display: "block" }}>
      <circle cx="12" cy="12" r="9" strokeOpacity="0.15"/>
      <path d="M12 3a9 9 0 0 1 9 9"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ServerOverlay({ servers, activeServerId, onSelect, mountEl }: Props) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [panelOpen, setPanelOpen]             = useState(false);
  const [containerW, setContainerW]           = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Container width for proportional sizing
  useEffect(() => {
    if (!mountEl) return;
    const ro = new ResizeObserver((e) => setContainerW(e[0]?.contentRect.width ?? 0));
    ro.observe(mountEl);
    setContainerW((mountEl as HTMLElement).offsetWidth ?? 0);
    return () => ro.disconnect();
  }, [mountEl]);

  // Sync with JW Player controls visibility
  useEffect(() => {
    if (!mountEl) return;
    const update = () => {
      const inactive = mountEl.classList.contains(INACTIVE_CLASS);
      setControlsVisible(!inactive);
      if (inactive) setPanelOpen(false);
    };
    update();
    const mo = new MutationObserver(update);
    mo.observe(mountEl, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [mountEl]);

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [panelOpen]);

  // Derived state
  const loadingCount = servers.filter((s) => s.status === "loading").length;
  const activeServer = servers.find((s) => s.id === activeServerId);
  const readyCount   = servers.filter((s) => s.status === "ready").length;

  // Proportional sizing
  const cw       = containerW || 640;
  const pad      = Math.max(10, Math.round(cw * 0.024));
  const chipH    = Math.max(28, Math.round(cw * 0.052));
  const chipFont = Math.max(10, Math.round(cw * 0.022));
  const panelW   = Math.min(320, Math.max(240, Math.round(cw * 0.42)));
  const btnFont  = Math.max(10, Math.round(cw * 0.022));
  const btnPadX  = Math.max(8,  Math.round(cw * 0.018));
  const btnPadY  = Math.max(5,  Math.round(cw * 0.011));

  const overlay = (
    <>
      {/* Full-cover positioning layer */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1500,
        pointerEvents: "none",
        opacity: controlsVisible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease`,
        display: "flex", alignItems: "flex-start", justifyContent: "flex-start",
      }}>
        <div
          ref={wrapRef}
          style={{
            padding: `${pad * 1.4}px 0 0 ${pad * 1.4}px`,
            pointerEvents: "auto",
            position: "relative",
          }}
        >
          {/* ── Trigger pill ── */}
          <button
            aria-label={panelOpen ? "Close server selector" : "Choose streaming server"}
            aria-expanded={panelOpen}
            aria-haspopup="true"
            onClick={() => setPanelOpen((p) => !p)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: `${btnPadY}px ${btnPadX}px`,
              background: panelOpen
                ? "rgba(255,255,255,0.15)"
                : "rgba(0,0,0,0.6)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: `1px solid ${panelOpen ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)"}`,
              borderRadius: 999,
              cursor: "pointer",
              color: "#fff",
              fontSize: btnFont,
              fontWeight: 600,
              fontFamily: "inherit",
              letterSpacing: "0.01em",
              transition: "background 150ms, border-color 150ms",
              boxShadow: loadingCount > 0
                ? "0 0 0 1.5px rgba(234,179,8,0.6)"
                : "0 2px 12px rgba(0,0,0,0.5)",
              whiteSpace: "nowrap",
            }}
          >
            {/* Icon: spinner while loading, server icon when done */}
            {loadingCount > 0
              ? <SpinnerIcon size={Math.round(btnFont * 1.3)} />
              : <ServerIcon  size={Math.round(btnFont * 1.3)} />
            }

            {/* Label: active server name */}
            <span style={{ opacity: 0.9 }}>
              {activeServer?.label ?? "Server"}
            </span>

            {/* Ready count badge */}
            {readyCount > 0 && (
              <span style={{
                fontSize: Math.max(8, btnFont - 2),
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.6)",
                letterSpacing: 0,
              }}>
                {readyCount}
              </span>
            )}

            {/* Chevron */}
            <svg width={Math.round(btnFont * 0.85)} height={Math.round(btnFont * 0.85)}
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
              style={{
                opacity: 0.6,
                transform: panelOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
              }}>
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>

          {/* ── Server panel ── */}
          {panelOpen && (
            <div
              role="menu"
              aria-label="Select streaming server"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                width: panelW,
                background: "rgba(8,8,12,0.96)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                boxShadow: "0 16px 48px rgba(0,0,0,0.8), 0 0 0 0.5px rgba(255,255,255,0.05)",
                overflow: "hidden",
                animation: `srv-slidein ${FADE_MS}ms ease`,
              }}
            >
              {/* Panel header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: `${Math.round(pad * 0.8)}px ${pad}px`,
                borderBottom: "1px solid rgba(255,255,255,0.07)",
              }}>
                <span style={{
                  fontSize: Math.max(9, chipFont - 1),
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.35)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}>
                  Servers
                </span>
                {loadingCount > 0 && (
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: Math.max(9, chipFont - 1),
                    color: "rgba(234,179,8,0.7)",
                    fontWeight: 600,
                  }}>
                    <SpinnerIcon size={Math.max(9, chipFont - 1)} />
                    {loadingCount} loading
                  </span>
                )}
              </div>

              {/* Server chip grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: Math.round(pad * 0.4),
                padding: Math.round(pad * 0.7),
              }}>
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
                      aria-current={isActive || undefined}
                      disabled={isLoading || isError}
                      onClick={() => {
                        if (canSelect) { onSelect(srv.id); setPanelOpen(false); }
                      }}
                      className={canSelect ? "srv-chip-hover" : undefined}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 3,
                        height: chipH,
                        borderRadius: 8,
                        border: isActive
                          ? "1px solid rgba(99,179,237,0.5)"
                          : "1px solid rgba(255,255,255,0.07)",
                        background: isActive
                          ? "rgba(99,179,237,0.15)"
                          : isReady
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(255,255,255,0.02)",
                        cursor: canSelect ? "pointer" : isLoading ? "wait" : "not-allowed",
                        padding: "0 4px",
                        transition: "background 120ms, border-color 120ms",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {/* Status indicator dot / spinner */}
                      <span style={{ position: "absolute", top: 4, right: 5 }}>
                        {isActive && (
                          <span style={{
                            width: 5, height: 5, borderRadius: "50%",
                            background: "#63b3ed", display: "block",
                            boxShadow: "0 0 5px #63b3ed",
                          }}/>
                        )}
                        {isLoading && <SpinnerIcon size={8} />}
                        {isError && (
                          <span style={{
                            width: 5, height: 5, borderRadius: "50%",
                            background: "rgba(239,68,68,0.6)", display: "block",
                          }}/>
                        )}
                      </span>

                      {/* Label */}
                      <span style={{
                        fontSize: chipFont,
                        fontWeight: isActive ? 700 : 500,
                        color: isActive
                          ? "#e2eeff"
                          : isError
                          ? "rgba(255,255,255,0.2)"
                          : isLoading
                          ? "rgba(255,255,255,0.3)"
                          : "rgba(255,255,255,0.8)",
                        letterSpacing: "0.01em",
                        lineHeight: 1,
                      }}>
                        {srv.label}
                      </span>

                      {/* Tag */}
                      <span style={{
                        fontSize: Math.max(8, chipFont - 2),
                        fontWeight: 600,
                        color: isActive
                          ? "rgba(99,179,237,0.8)"
                          : "rgba(255,255,255,0.2)",
                        letterSpacing: "0.04em",
                        lineHeight: 1,
                      }}>
                        {srv.tag}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(overlay, mountEl);
}

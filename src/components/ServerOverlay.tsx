"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import type { ServerState } from "@/lib/servers";

const INACTIVE_CLASS = "jw-flag-user-inactive";

interface Props {
  servers: ServerState[];
  activeServerId: string;
  onSelect: (id: string) => void;
  mountEl: Element;
}

// ---------------------------------------------------------------------------
// Icons (sized in em so they scale with the overlay)
// ---------------------------------------------------------------------------

const svgBase = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function ServerIcon() {
  return (
    <svg {...svgBase} strokeWidth="2">
      <rect x="2" y="3" width="20" height="8" rx="2" />
      <rect x="2" y="13" width="20" height="8" rx="2" />
      <path d="M6 7h.01M6 17h.01" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg {...svgBase} strokeWidth="2.5" className="so-spin">
      <circle cx="12" cy="12" r="9" strokeOpacity="0.2" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg {...svgBase} strokeWidth="2.5" className="so-chevron">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...svgBase} strokeWidth="3">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Styles — bundled here so the component has no external CSS dependency.
// Everything is sized in em; the root font-size scales with the player width.
// ---------------------------------------------------------------------------

const CSS = `
.so-root{
  --so-accent:#7cc4ff;--so-ok:#4ade80;--so-warn:#fbbf24;--so-bad:#f87171;
  position:absolute;inset:0;z-index:1500;pointer-events:none;
  font-family:inherit;line-height:1.2;color:#fff;
  opacity:1;visibility:visible;
  transition:opacity 200ms ease,visibility 0s linear 0s;
}
.so-root[data-hidden="true"]{
  opacity:0;visibility:hidden;
  transition:opacity 200ms ease,visibility 0s linear 200ms;
}
.so-root *{box-sizing:border-box;margin:0}
.so-wrap{position:absolute;top:1.1em;left:1.1em;max-width:var(--so-max-w);pointer-events:auto}

/* Trigger */
.so-trigger{
  display:inline-flex;align-items:center;gap:.6em;
  max-width:min(18em,var(--so-max-w));height:2.6em;padding:0 .85em 0 .8em;
  color:inherit;font:inherit;font-weight:600;letter-spacing:.01em;white-space:nowrap;cursor:pointer;
  background:rgba(14,14,18,.6);
  -webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);
  border:1px solid rgba(255,255,255,.14);border-radius:999px;
  box-shadow:0 4px 18px rgba(0,0,0,.45);
  transition:background 150ms,border-color 150ms,transform 150ms;
}
.so-trigger:hover{background:rgba(32,32,40,.72);border-color:rgba(255,255,255,.28)}
.so-trigger:active{transform:scale(.97)}
.so-trigger[data-open="true"]{background:rgba(32,32,40,.82);border-color:rgba(124,196,255,.55)}
.so-trigger:focus-visible,.so-item:focus-visible{outline:2px solid var(--so-accent);outline-offset:2px}
.so-trigger-icon{display:inline-flex;font-size:1.15em;color:var(--so-accent)}
.so-trigger[data-loading="true"] .so-trigger-icon{color:var(--so-warn)}
.so-trigger-label{min-width:0;overflow:hidden;text-overflow:ellipsis}
.so-trigger-count{
  flex:none;padding:.2em .55em;border-radius:999px;
  background:rgba(255,255,255,.1);color:rgba(255,255,255,.65);
  font-size:.8em;font-weight:700;font-variant-numeric:tabular-nums;
}
.so-chevron{flex:none;opacity:.6;transition:transform 200ms ease}
.so-trigger[data-open="true"] .so-chevron{transform:rotate(180deg)}

/* Panel */
.so-panel{
  position:absolute;top:calc(100% + .5em);left:0;
  display:flex;flex-direction:column;
  width:21em;max-width:var(--so-max-w);max-height:var(--so-max-h);
  background:rgba(12,12,16,.94);
  -webkit-backdrop-filter:blur(24px) saturate(1.3);backdrop-filter:blur(24px) saturate(1.3);
  border:1px solid rgba(255,255,255,.1);border-radius:1em;overflow:hidden;
  box-shadow:0 24px 64px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.05);
  transform-origin:top left;
  animation:so-pop 180ms cubic-bezier(.2,.8,.2,1);
}
.so-head{
  display:flex;align-items:center;justify-content:space-between;gap:1em;
  padding:.85em 1em .7em;
  font-size:.78em;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:rgba(255,255,255,.4);
}
.so-head-status{
  display:inline-flex;align-items:center;gap:.5em;
  letter-spacing:0;text-transform:none;font-weight:600;font-variant-numeric:tabular-nums;
}
.so-head-status .so-spin{color:var(--so-warn)}
.so-progress{height:2px;flex:none;background:rgba(255,255,255,.06)}
.so-progress > span{
  display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#fcd34d);
  transition:width 300ms ease,opacity 300ms ease;
}
.so-progress > span[data-done="true"]{opacity:0}

/* Rows */
.so-list{
  display:flex;flex-direction:column;gap:.15em;padding:.4em;
  overflow-y:auto;overscroll-behavior:contain;
  scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.2) transparent;
}
.so-item{
  display:flex;align-items:center;gap:.75em;width:100%;
  padding:.75em .85em;border:0;border-radius:.7em;
  background:transparent;color:rgba(255,255,255,.88);
  font:inherit;text-align:left;cursor:pointer;
  transition:background 120ms,box-shadow 120ms;
}
.so-item:focus-visible{outline-offset:-2px}
.so-item:hover:not([aria-disabled="true"]){background:rgba(255,255,255,.07)}
.so-item[aria-checked="true"]{
  background:rgba(124,196,255,.14);color:#eaf4ff;
  box-shadow:inset 0 0 0 1px rgba(124,196,255,.4);
}
.so-item[aria-disabled="true"]{color:rgba(255,255,255,.32);cursor:not-allowed}
.so-item[data-status="loading"]{cursor:progress}
.so-item-main{display:flex;align-items:center;gap:.6em;flex:1;min-width:0}
.so-item-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.so-item[aria-checked="true"] .so-item-label{font-weight:700}
.so-item-tag{
  flex:none;padding:.15em .5em;border-radius:.4em;
  background:rgba(255,255,255,.08);color:rgba(255,255,255,.5);
  font-size:.72em;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
}
.so-item[aria-checked="true"] .so-item-tag{background:rgba(124,196,255,.2);color:rgba(190,224,255,.9)}
.so-item-state{
  display:inline-flex;align-items:center;gap:.4em;flex:none;
  font-size:.82em;font-weight:600;color:rgba(255,255,255,.45);
}
.so-item[aria-checked="true"] .so-item-state{color:var(--so-accent);font-size:1em}
.so-item[data-status="loading"] .so-item-state{color:var(--so-warn)}

/* Status dot */
.so-dot{flex:none;width:.55em;height:.55em;border-radius:50%}
.so-dot[data-status="ready"]{background:var(--so-ok);box-shadow:0 0 .6em rgba(74,222,128,.55)}
.so-dot[data-status="loading"]{background:var(--so-warn);animation:so-pulse 1.2s ease-in-out infinite}
.so-dot[data-status="error"]{background:var(--so-bad);opacity:.75}

.so-spin{display:block;animation:so-spin .8s linear infinite}

@keyframes so-spin{to{transform:rotate(360deg)}}
@keyframes so-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes so-pop{
  from{opacity:0;transform:translateY(-.4em) scale(.97)}
  to{opacity:1;transform:none}
}

@media (pointer:coarse){
  .so-item{padding:.95em .9em}
}
@media (prefers-reduced-motion:reduce){
  .so-panel,.so-dot[data-status="loading"]{animation:none}
  .so-root,.so-trigger,.so-chevron{transition:none}
}
`;

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
  const [box, setBox] = useState({ w: 0, h: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Track the player's size so the overlay scales with it
  useEffect(() => {
    if (!mountEl) return;
    const measure = () => {
      const r = mountEl.getBoundingClientRect();
      setBox((p) => (p.w === r.width && p.h === r.height ? p : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(mountEl);
    return () => ro.disconnect();
  }, [mountEl]);

  // Follow JW Player's controls visibility
  useEffect(() => {
    if (!mountEl) return;
    const update = () => setControlsVisible(!mountEl.classList.contains(INACTIVE_CLASS));
    update();
    const mo = new MutationObserver(update);
    mo.observe(mountEl, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [mountEl]);

  // Close on outside press
  useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [panelOpen]);

  // Move focus into the menu when it opens (active row first)
  useEffect(() => {
    if (!panelOpen) return;
    const items = wrapRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
    if (!items?.length) return;
    const target =
      Array.from(items).find((el) => el.getAttribute("aria-checked") === "true") ?? items[0];
    target.focus({ preventScroll: true });
  }, [panelOpen]);

  // Keyboard handling. Native listeners (not React props) so we can stop the
  // event before the player sees it — otherwise Space / arrows would
  // play-pause or seek the video while the menu is in use.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      const trigger = triggerRef.current;

      if (!panelOpen) {
        if (e.key === "ArrowDown" && e.target === trigger) {
          e.preventDefault();
          setPanelOpen(true);
        }
        return;
      }

      const items = Array.from(wrap.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
      const i = items.indexOf(document.activeElement as HTMLElement);
      const focusAt = (n: number) => items[(n + items.length) % items.length]?.focus();

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          setPanelOpen(false);
          trigger?.focus();
          break;
        case "ArrowDown":
          e.preventDefault();
          focusAt(i + 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          focusAt(i < 0 ? items.length - 1 : i - 1);
          break;
        case "Home":
          e.preventDefault();
          focusAt(0);
          break;
        case "End":
          e.preventDefault();
          focusAt(items.length - 1);
          break;
        case "Tab":
          trigger?.focus();
          setPanelOpen(false);
          break;
      }
    };
    // Double-clicking a row shouldn't toggle fullscreen
    const stop = (e: Event) => e.stopPropagation();

    wrap.addEventListener("keydown", onKeyDown);
    wrap.addEventListener("dblclick", stop);
    return () => {
      wrap.removeEventListener("keydown", onKeyDown);
      wrap.removeEventListener("dblclick", stop);
    };
  }, [panelOpen]);

  // Derived state (optimized with useMemo to avoid filtering on every render)
  const { total, loadingCount, readyCount, errorCount, active, progress } = useMemo(() => {
    let loading = 0;
    let ready = 0;
    let error = 0;
    let activeServer: ServerState | null = null;

    for (const s of servers) {
      if (s.status === "loading") loading++;
      else if (s.status === "ready") ready++;
      else if (s.status === "error") error++;
      if (s.id === activeServerId) activeServer = s;
    }

    const total = servers.length;
    const progressValue = total ? (ready + error) / total : 1;

    return {
      total,
      loadingCount: loading,
      readyCount: ready,
      errorCount: error,
      active: activeServer,
      progress: progressValue,
    };
  }, [servers, activeServerId]);

  // Sizing: one base unit (px) that scales with the player, everything else is em
  const cw = box.w || 640;
  const ch = box.h || 360;
  const u = Math.min(20, Math.max(12, Math.round(cw * 0.0155 * 10) / 10));
  const edge = u * 1.1;
  const rootStyle = {
    fontSize: u,
    "--so-max-w": `${Math.max(180, cw - edge * 2)}px`,
    "--so-max-h": `${Math.max(140, ch - edge * 2 - u * 3.2)}px`,
  } as CSSProperties;

  // Stay visible while the menu is open, even if JW Player hides its controls
  const hidden = !controlsVisible && !panelOpen;

  const choose = (srv: ServerState) => {
    if (srv.status !== "ready") return;
    if (srv.id !== activeServerId) onSelect(srv.id);
    setPanelOpen(false);
    triggerRef.current?.focus();
  };

  const overlay = (
    <>
      <style>{CSS}</style>
      <div className="so-root" data-hidden={hidden} style={rootStyle}>
        <div ref={wrapRef} className="so-wrap">
          {/* Trigger */}
          <button
            ref={triggerRef}
            type="button"
            className="so-trigger"
            data-open={panelOpen}
            data-loading={loadingCount > 0}
            aria-haspopup="menu"
            aria-expanded={panelOpen}
            aria-controls={panelOpen ? panelId : undefined}
            aria-label={`Server: ${active?.label ?? "none"}. Change server`}
            onClick={() => setPanelOpen((p) => !p)}
          >
            <span className="so-trigger-icon">
              {loadingCount > 0 ? <SpinnerIcon /> : <ServerIcon />}
            </span>
            <span className="so-trigger-label">{active?.label ?? "Server"}</span>
            {total > 1 && (
              <span className="so-trigger-count">
                {readyCount}/{total}
              </span>
            )}
            <ChevronIcon />
          </button>

          {/* Panel */}
          {panelOpen && (
            <div id={panelId} role="menu" aria-label="Streaming servers" className="so-panel">
              <div className="so-head">
                <span>Language</span>
                <span className="so-head-status" aria-live="polite">
                  {loadingCount > 0 && <SpinnerIcon />}
                  {readyCount} of {total} ready
                </span>
              </div>
              <div className="so-progress" aria-hidden="true">
                <span
                  data-done={loadingCount === 0}
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>

              <div className="so-list">
                {servers.map((srv) => {
                  const isActive = srv.id === activeServerId;
                  const isLoading = srv.status === "loading";
                  const isError = srv.status === "error";

                  return (
                    <button
                      key={srv.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      aria-disabled={isLoading || isError}
                      tabIndex={-1}
                      className="so-item"
                      data-status={srv.status}
                      onClick={() => choose(srv)}
                    >
                      <span className="so-dot" data-status={srv.status} aria-hidden="true" />
                      <span className="so-item-main">
                        <span className="so-item-label">{srv.label}</span>
                        {srv.tag && <span className="so-item-tag">{srv.tag}</span>}
                      </span>
                      <span className="so-item-state">
                        {isLoading ? (
                          <>
                            <SpinnerIcon />
                            Connecting
                          </>
                        ) : isError ? (
                          "Unavailable"
                        ) : isActive ? (
                          <CheckIcon />
                        ) : null}
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
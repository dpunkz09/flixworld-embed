/**
 * sandboxCheck.ts
 *
 * Detects whether this page is running inside a sandboxed <iframe> that
 * restricts required capabilities. Three independent probes are used so
 * that bypassing one doesn't automatically bypass the others.
 *
 * Only runs when window.self !== window.top (i.e. actually inside an iframe).
 * Direct visits to embed.flixworld.xyz are never affected.
 *
 * Probes:
 *
 *  1. frameElement attribute read
 *     When allow-same-origin IS present the iframe document can access its
 *     own <iframe> node via window.frameElement. We read the sandbox attr
 *     directly — ironically, allow-same-origin is what *enables* this probe.
 *     Throws SecurityError when allow-same-origin is absent (caught silently).
 *
 *  2. document.domain assignment
 *     Setting document.domain = document.domain throws a SecurityError inside
 *     a sandboxed iframe even when allow-same-origin is granted. Chromium
 *     includes the word "sandbox" in the error message string.
 *
 *  3. PDF plugin object instantiation
 *     Creating an <object> with a PDF data URI fails (onerror) inside a
 *     sandboxed iframe because plugin/embed instantiation is blocked.
 *     Only attempted on Chrome (where the PDF plugin is present) to avoid
 *     false positives on Firefox/Safari.
 */

export type SandboxCallback = () => void;

/**
 * Run all sandbox probes. Calls `onDetected` synchronously if any
 * synchronous probe fires. The PDF probe is asynchronous and will call
 * `onDetected` later if it fires.
 *
 * Safe to call on SSR — all checks are guarded by typeof window.
 */
export function detectSandbox(onDetected: SandboxCallback): void {
  if (typeof window === "undefined") return;

  // Not inside an iframe — nothing to check.
  if (window.self === window.top) return;

  // ── Probe 1: read sandbox attribute off window.frameElement ────────────
  // allow-same-origin lets the iframe document access its own <iframe> node.
  // If the sandbox attr is present, block immediately.
  try {
    if (window.frameElement?.hasAttribute("sandbox")) {
      onDetected();
      return;
    }
  } catch {
    // SecurityError = allow-same-origin is NOT granted.
    // The iframe is sandboxed but without same-origin — still sandboxed.
    // Fall through to probe 2.
  }

  // ── Probe 2: document.domain assignment ────────────────────────────────
  // Blocked in sandboxed iframes regardless of allow-same-origin.
  // Chromium error message contains "sandbox"; use that as the signal.
  try {
    // eslint-disable-next-line no-self-assign
    document.domain = document.domain;
  } catch (err) {
    try {
      if (String(err).toLowerCase().includes("sandbox")) {
        onDetected();
        return;
      }
    } catch {
      // Stringification failed — treat as sandboxed to be safe.
      onDetected();
      return;
    }
  }

  // ── Probe 3: PDF plugin object (Chrome only) ───────────────────────────
  // Plugin instantiation is blocked in sandboxed iframes.
  // Skip on non-Chrome to avoid false positives.
  try {
    if (!window.navigator.plugins.namedItem("Chrome PDF Viewer")) return;

    const obj = document.createElement("object");
    // Minimal valid PDF encoded as base64 data URI
    obj.data = "data:application/pdf;base64,aG1t";
    obj.style.cssText =
      "position:absolute;top:-9999px;left:-9999px;visibility:hidden;width:1px;height:1px;";
    obj.onerror = () => {
      obj.parentNode?.removeChild(obj);
      onDetected();
    };
    obj.onload = () => {
      obj.parentNode?.removeChild(obj);
    };
    document.body.appendChild(obj);
  } catch {
    // Ignore — probe not applicable.
  }
}

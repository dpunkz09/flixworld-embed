/**
 * sandboxCheck.ts
 *
 * Detects whether this page is running inside a sandboxed <iframe> that
 * would break the player. A sandboxed iframe without the correct `allow-*`
 * tokens blocks:
 *
 *   - localStorage / sessionStorage  (no allow-same-origin)
 *   - document.cookie                (no allow-same-origin)
 *   - Element.requestFullscreen      (no allow-fullscreen)
 *   - screen.orientation.lock        (no allow-orientation-lock, or no fullscreen)
 *   - popups / navigation            (no allow-popups / allow-top-navigation)
 *
 * We test the capabilities directly rather than reading any property that
 * could be spoofed by the embedder, so the check works across all browsers.
 */

export interface SandboxResult {
  /** true = all required capabilities are available */
  ok: boolean;
  /** Human-readable reason when ok=false */
  reason: string;
}

export function checkSandbox(): SandboxResult {
  // ── 1. localStorage ──────────────────────────────────────────────────
  // Blocked when sandbox lacks `allow-same-origin`. Throws SecurityError.
  try {
    const probe = "__fw_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
  } catch {
    return {
      ok: false,
      reason:
        'This embed requires "allow-same-origin" on the iframe sandbox attribute.',
    };
  }

  // ── 2. Fullscreen API ────────────────────────────────────────────────
  // requestFullscreen is removed from the element prototype when the iframe
  // lacks `allow-fullscreen`. Check the prototype rather than calling it
  // (calling it outside a user gesture throws anyway).
  if (
    typeof document.documentElement.requestFullscreen !== "function" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (document.documentElement as any).webkitRequestFullscreen !== "function"
  ) {
    return {
      ok: false,
      reason:
        'This embed requires "allow-fullscreen" on the iframe sandbox attribute.',
    };
  }

  // ── 3. Scripts must be allowed ───────────────────────────────────────
  // If we reached this point JS is running, so allow-scripts is present.
  // Nothing to check explicitly.

  return { ok: true, reason: "" };
}

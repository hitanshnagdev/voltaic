/**
 * Upload size limit, configurable via the UPLOAD_MAX_BYTES environment
 * variable. Defaults to 50 MB.
 *
 * Why ops-tunable: real construction bid sets routinely break 100 MB
 * (the UCCS bid-set drawings PDF is 43 MB before raster, and a typical
 * full-discipline submittal package can be 200 MB+). The right ceiling
 * varies by deployment — local dev wants a tight cap to fail fast, prod
 * wants a generous one to handle real customer inputs. Hard-coding the
 * cap means redeploying to change it. An env knob means flipping a
 * Vercel project setting and bouncing the function.
 *
 * The helper is a pure function so it can be unit-tested without
 * Next.js, Clerk, or any of the upload route's other dependencies.
 */

const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Return the configured maximum upload size in bytes.
 *
 * Precedence:
 *   1. UPLOAD_MAX_BYTES env var, if it parses to a positive finite number.
 *   2. The hard-coded 50 MB default.
 *
 * Malformed env values fall back silently rather than throwing — boot-
 * time misconfiguration of an env var should not turn into a 5xx storm
 * on every upload. Operators see the default size in the upload error
 * payload either way.
 */
export function getMaxUploadBytes(): number {
  const raw = process.env.UPLOAD_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_UPLOAD_BYTES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_UPLOAD_BYTES;
  return Math.floor(n);
}

/** Round to the nearest whole MB for human-readable error responses. */
export function bytesToMb(n: number): number {
  return Math.round(n / 1024 / 1024);
}

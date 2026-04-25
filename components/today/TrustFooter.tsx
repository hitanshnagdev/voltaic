/**
 * The non-negotiable footer that appears under every finding card and at
 * the bottom of the Today view. CLAUDE.md frames this as a product
 * principle, not a styling choice — every AI claim is rendered with this
 * disclaimer so a PM never confuses a flagged finding for a verified
 * decision.
 */
export function TrustFooter() {
  return (
    <div className="text-[11px] italic text-[var(--color-muted)]">
      AI-flagged · Engineer verifies before action. Citations link to source
      documents.
    </div>
  );
}

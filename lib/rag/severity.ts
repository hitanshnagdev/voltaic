/**
 * Severity ladder + decision function for finding severity.
 *
 * Every rule decides severity from the same three signals:
 *   - the verdict (compliant / non_compliant / uncertain)
 *   - the evidence quality (spec-cited primary vs. project-default fallback)
 *   - the magnitude band (zero margin / clear margin / etc.)
 *
 * Capturing that decision in one function keeps the Today view consistent
 * across rule types. Otherwise every new rule reinvents the same `if`s
 * slightly differently and the user sees three different ladders.
 *
 * Severity tiers map directly to UI color and ordering:
 *   - hot   → coral, top of the Today feed, requires action
 *   - warm  → gold, middle, tight or weakly-cited
 *   - cool  → sage, bottom, informational
 */

export type Severity = "hot" | "warm" | "cool";

export type EvidenceQuality =
  /** Both sides backed by a primary citation (e.g. spec + submittal). */
  | "primary"
  /** At least one side relies on a fallback (e.g. project_setting). */
  | "fallback"
  /** One side is missing entirely. */
  | "incomplete";

export type MagnitudeBand =
  /** Numeric comparison passed with positive margin. */
  | "compliant_margin"
  /** Numeric comparison passed exactly (==). Tight, but compliant. */
  | "compliant_zero_margin"
  /** Numeric comparison failed. */
  | "non_compliant"
  /** Verdict is uncertain — no comparison was made. */
  | "uncertain";

export type SeverityInput = {
  evidenceQuality: EvidenceQuality;
  magnitude: MagnitudeBand;
};

/**
 * The single decision function. All rules call this rather than open-coding
 * if/else over verdict + evidence + magnitude.
 *
 * Calibration:
 *   - non_compliant + primary       → hot   (high-trust failure, surface loud)
 *   - non_compliant + fallback      → warm  (weaker input, downgrade)
 *   - compliant_zero_margin         → warm  (tight, surfaceable)
 *   - compliant_margin              → cool
 *   - uncertain                     → cool
 *   - non_compliant + incomplete    → warm  (we know enough to flag, not to escalate)
 */
export function severityFor(input: SeverityInput): Severity {
  const { evidenceQuality, magnitude } = input;

  if (magnitude === "non_compliant") {
    if (evidenceQuality === "primary") return "hot";
    return "warm";
  }
  if (magnitude === "compliant_zero_margin") return "warm";
  return "cool";
}

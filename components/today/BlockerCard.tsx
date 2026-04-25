import type { FindingForToday } from "@/lib/db/findings";

type Props = {
  finding: FindingForToday;
};

/**
 * One card per `kind='rule'` finding. The visual border-left tracks
 * severity (hot=clay, warm=gold, cool=no accent), borrowing the existing
 * `blocker-row` styles from globals.css to stay consistent with the v6
 * mock without forking the CSS.
 *
 * Each card renders:
 *   - severity chip (hot/warm/cool)
 *   - kind:rule_id badge (e.g. "rule:aic")
 *   - title + summary
 *   - equipment tags (joined when multiple)
 *   - confidence chip
 *   - primary evidence cite "Cited in <doc>, page N"
 */
export function BlockerCard({ finding }: Props) {
  const tone = finding.severity;
  const borderVariant =
    tone === "hot" ? "compliance" : tone === "warm" ? "dependency" : "";
  const tagLine =
    finding.equipmentTags.length > 0
      ? finding.equipmentTags.join(", ")
      : "Unspecified equipment";
  const primary =
    finding.evidence.find((e) => e.role === "primary") ?? finding.evidence[0];
  const cite = primary?.documentName
    ? `Cited in ${primary.documentName}${
        primary.pageNum != null ? `, page ${primary.pageNum}` : ""
      }`
    : null;
  const kindLabel = finding.ruleId
    ? `rule:${finding.ruleId}`
    : finding.kind;

  return (
    <div className={`blocker-row ${borderVariant}`.trim()}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`tti ${tone}`}>{tone.toUpperCase()}</span>
          <span className="kind-badge">{kindLabel}</span>
          <span className="text-sm font-medium text-[var(--color-ink)]">
            {finding.title}
          </span>
        </div>
        <div className="mt-0.5 text-[12px] text-[var(--color-ink-soft)]">
          {finding.summary}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-muted-soft)]">
          <span className="font-mono">{tagLine}</span>
          <span>·</span>
          <span>conf {(finding.confidence * 100).toFixed(0)}%</span>
          {cite && (
            <>
              <span>·</span>
              <span>{cite}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

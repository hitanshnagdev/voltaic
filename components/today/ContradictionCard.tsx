import type { FindingForToday } from "@/lib/db/findings";

type Props = {
  finding: FindingForToday;
};

/**
 * Distinct card variant for `kind='contradiction'` findings (CLAUDE.md
 * core principle 9). Where a rule card cites one piece of evidence, a
 * contradiction card cites *two or more* sources side-by-side so the PM
 * can see the disagreement at a glance.
 *
 * Visual identity: clay border-left (per CLAUDE.md palette
 * "Contradiction: --clay") and a leading "CONTRADICTION" label rather
 * than the severity word. Severity still drives the chip color in case a
 * downgrade lands later.
 */
export function ContradictionCard({ finding }: Props) {
  const tagLine =
    finding.equipmentTags.length > 0
      ? finding.equipmentTags.join(", ")
      : "Unspecified equipment";
  // Contradictions have multiple primary evidence rows by construction —
  // surface up to four to keep the card scannable.
  const cites = finding.evidence
    .filter((e) => e.role === "primary")
    .slice(0, 4);

  return (
    <div className="blocker-row compliance">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tti hot">CONTRADICTION</span>
          <span className="kind-badge">{finding.kind}</span>
          <span className="text-sm font-medium text-[var(--color-ink)]">
            {finding.title}
          </span>
        </div>
        <div className="mt-0.5 text-[12px] text-[var(--color-ink-soft)]">
          {finding.summary}
        </div>
        {cites.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[11px] text-[var(--color-ink-soft)]">
            {cites.map((c, i) => (
              <li key={`${c.sourceId ?? "no-id"}-${i}`} className="flex gap-2">
                <span className="text-[var(--color-muted-soft)]">
                  Source {i + 1}:
                </span>
                <span>
                  {c.documentName ?? "Unknown document"}
                  {c.pageNum != null ? `, page ${c.pageNum}` : ""}
                  {c.snippet && (
                    <span className="ml-1 text-[var(--color-muted)]">
                      — &ldquo;{truncate(c.snippet, 120)}&rdquo;
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-muted-soft)]">
          <span className="font-mono">{tagLine}</span>
          <span>·</span>
          <span>conf {(finding.confidence * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1).trimEnd()}…`;
}

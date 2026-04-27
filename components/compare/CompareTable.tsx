import type { CompareData, CompareGroup, CompareRow } from "@/lib/db/compare";

/**
 * Renders the per-submittal compliance table. Phase B PR 3 — reads
 * from the spec-driven path: each row is one spec checklist item +
 * the matching submittal response, with verdict computed by the
 * comparator. Replaces the prior hardcoded panelboard schema rendering.
 *
 * Server component — no interactivity beyond hover. Inline expand /
 * PDF drilldown is Phase C.
 */
export function CompareTable({ data }: { data: CompareData }) {
  return (
    <div className="space-y-6">
      {data.groups.map((g) => (
        <GroupSection key={g.name} group={g} />
      ))}
    </div>
  );
}

function GroupSection({ group }: { group: CompareGroup }) {
  return (
    <section className="paper overflow-hidden">
      <header
        className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2.5"
        style={{ background: "var(--color-cream-deep)" }}
      >
        <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">
          {group.name}
        </h3>
        <div className="text-[11px] tabular-nums text-[var(--color-muted)]">
          {group.passCount}/{group.evaluatedCount} pass
        </div>
      </header>
      <table className="w-full table-fixed text-left text-[13px]">
        <colgroup>
          <col style={{ width: "44px" }} />
          <col style={{ width: "26%" }} />
          <col style={{ width: "30%" }} />
          <col style={{ width: "30%" }} />
          <col />
        </colgroup>
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-soft)]">
            <th className="py-1.5 pl-4"></th>
            <th className="py-1.5">Attribute</th>
            <th className="py-1.5">Required</th>
            <th className="py-1.5">Submitted</th>
            <th className="py-1.5 pr-4">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-line-soft)]">
          {group.rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Row({ row }: { row: CompareRow }) {
  return (
    <>
      <tr>
        <td className="py-3 pl-4 align-top">{verdictDot(row.verdict)}</td>
        <td className="py-3 align-top">
          <div className="font-medium text-[var(--color-ink)]">
            {humanizeAttribute(row.attribute)}
          </div>
          {row.specRef && (
            <div className="mt-0.5 font-mono text-[10.5px] text-[var(--color-muted-soft)]">
              {row.specRef}
            </div>
          )}
        </td>
        <td className="py-3 align-top text-[var(--color-ink-soft)]">
          {row.requiredDisplay || <Faint>—</Faint>}
        </td>
        <td className="py-3 align-top text-[var(--color-ink-soft)]">
          {row.submittedDisplay ?? <Faint>—</Faint>}
          {row.submittalRef && (
            <div className="mt-0.5 font-mono text-[10.5px] text-[var(--color-muted-soft)]">
              {row.submittalRef}
            </div>
          )}
        </td>
        <td className="py-3 pr-4 align-top">
          <VerdictChip row={row} />
        </td>
      </tr>
      {row.reason && (
        <tr>
          <td />
          <td colSpan={4} className="px-0 pb-3">
            <div className="rounded border border-[var(--color-line-soft)] bg-[var(--color-cream-deep)] px-3 py-2 text-[12px] text-[var(--color-ink-soft)]">
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-[var(--color-muted)]">
                {reasonLabel(row.verdict)}{" "}
              </span>
              <span>{row.reason}</span>
              {row.submittalQuote && (
                <div className="mt-1 italic text-[var(--color-muted)]">
                  &quot;{row.submittalQuote}&quot;
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Faint({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--color-muted-soft)]">{children}</span>;
}

function reasonLabel(v: CompareRow["verdict"]): string {
  if (v === "non_compliant") return "Finding";
  if (v === "missing_value") return "Missing";
  if (v === "uncertain") return "Verify";
  if (v === "not_assigned") return "Setup";
  return "";
}

function humanizeAttribute(a: string): string {
  // "aic_ka" → "AIC kA", "enclosure_nema" → "Enclosure NEMA",
  // "other_thermographic_max_temp_rise" → "Thermographic Max Temp Rise"
  let s = a.startsWith("other_") ? a.slice(6) : a;
  s = s.replace(/_/g, " ");
  // Uppercase common acronyms
  s = s.replace(/\b(aic|sccr|nema|ul|ieee|ansi|nec|nfpa|spd|cb|mcb|mlo|mccb|kva|kw|va)\b/gi, (m) => m.toUpperCase());
  // Title-case the rest
  s = s.replace(/\b\w/g, (c) => c.toUpperCase());
  return s;
}

function verdictDot(v: CompareRow["verdict"]) {
  const base = "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]";
  if (v === "compliant") {
    return (
      <span
        className={base}
        style={{ background: "var(--color-sage-tint)", color: "#3a5844" }}
        title="Compliant"
      >
        ✓
      </span>
    );
  }
  if (v === "non_compliant") {
    return (
      <span
        className={base}
        style={{ background: "var(--color-clay-tint)", color: "var(--color-clay)" }}
        title="Non-compliant"
      >
        ✗
      </span>
    );
  }
  if (v === "uncertain") {
    return (
      <span
        className={base}
        style={{ background: "var(--color-gold-tint)", color: "#87602B" }}
        title="Uncertain"
      >
        ?
      </span>
    );
  }
  // missing_value, not_assigned
  return (
    <span
      className={`${base} border border-dashed border-[var(--color-line-strong)]`}
      style={{ color: "var(--color-muted)" }}
      title="Missing data"
    >
      ⚠
    </span>
  );
}

function VerdictChip({ row }: { row: CompareRow }) {
  if (row.verdict === "compliant") return <ChipNeutral>OK</ChipNeutral>;
  if (row.verdict === "non_compliant")
    return <ChipColored tone="hot">FLAG</ChipColored>;
  if (row.verdict === "uncertain")
    return <ChipColored tone="warm">VERIFY</ChipColored>;
  if (row.verdict === "missing_value")
    return <ChipNeutral muted>MISSING</ChipNeutral>;
  if (row.verdict === "not_assigned")
    return <ChipNeutral muted>SETUP</ChipNeutral>;
  return <ChipNeutral muted>—</ChipNeutral>;
}

function ChipColored({
  tone,
  children,
}: {
  tone: "hot" | "warm";
  children: React.ReactNode;
}) {
  const style =
    tone === "hot"
      ? { background: "var(--color-clay-tint)", color: "var(--color-clay)" }
      : { background: "var(--color-gold-tint)", color: "#87602B" };
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide"
      style={style}
    >
      {children}
    </span>
  );
}

function ChipNeutral({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className="inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide"
      style={{
        borderColor: "var(--color-line)",
        color: muted ? "var(--color-muted-soft)" : "var(--color-ink-soft)",
        background: muted ? "transparent" : "var(--color-paper)",
      }}
    >
      {children}
    </span>
  );
}

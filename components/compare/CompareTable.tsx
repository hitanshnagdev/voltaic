import type { CompareData, CompareGroup, CompareRow } from "@/lib/db/compare";

/**
 * Renders the per-equipment compliance table. Image 2 of the design
 * exploration: grouped attribute rows with pass/fail dots, summary
 * counts per group, and a finding-card row inline under any non-trivial
 * row (non_compliant / uncertain / missing).
 *
 * Server component — no interactivity beyond hover. Expand-row /
 * inline drill-down lands in a future PR (Phase C); for v1 the
 * non-trivial rows show a one-line `reason` and link to /today for
 * the full finding card when one exists.
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
            <Row key={row.attribute} row={row} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Row({ row }: { row: CompareRow }) {
  const dot = verdictDot(row.verdict);
  return (
    <>
      <tr>
        <td className="py-3 pl-4 align-top">{dot}</td>
        <td className="py-3 align-top">
          <div className="font-medium text-[var(--color-ink)]">
            {row.attribute}
          </div>
          {row.specRef && (
            <div className="mt-0.5 font-mono text-[10.5px] text-[var(--color-muted-soft)]">
              {row.specRef}
            </div>
          )}
        </td>
        <td className="py-3 align-top text-[var(--color-ink-soft)]">
          {row.required ?? <Faint>—</Faint>}
        </td>
        <td className="py-3 align-top text-[var(--color-ink-soft)]">
          {row.submitted ?? <Faint>—</Faint>}
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
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Faint({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[var(--color-muted-soft)]">{children}</span>
  );
}

function reasonLabel(v: CompareRow["verdict"]): string {
  if (v === "non_compliant") return "Finding";
  if (v === "missing_value") return "Missing";
  if (v === "missing_requirement") return "Note";
  if (v === "uncertain") return "Verify";
  if (v === "not_extracted") return "Coverage gap";
  return "";
}

function verdictDot(v: CompareRow["verdict"]) {
  const base =
    "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]";
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
        style={{
          background: "var(--color-clay-tint)",
          color: "var(--color-clay)",
        }}
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
  if (v === "informational") {
    return (
      <span
        className={`${base} border border-[var(--color-line)]`}
        style={{ color: "var(--color-muted)" }}
        title="Informational"
      >
        ·
      </span>
    );
  }
  // missing_value, missing_requirement, not_extracted
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
  if (row.verdict === "compliant")
    return <ChipNeutral>OK</ChipNeutral>;
  if (row.verdict === "non_compliant" && row.severity === "hot")
    return <ChipColored tone="hot">HIGH</ChipColored>;
  if (row.verdict === "non_compliant")
    return <ChipColored tone="warm">FLAG</ChipColored>;
  if (row.verdict === "uncertain")
    return <ChipColored tone="warm">VERIFY</ChipColored>;
  if (row.verdict === "missing_value")
    return <ChipNeutral muted>MISSING</ChipNeutral>;
  if (row.verdict === "missing_requirement")
    return <ChipNeutral muted>NO SPEC</ChipNeutral>;
  if (row.verdict === "not_extracted")
    return <ChipNeutral muted>NOT YET</ChipNeutral>;
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

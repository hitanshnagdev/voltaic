"use client";

import { useMemo, useState } from "react";
import type {
  CompareData,
  CompareRow,
  CompareVerdict,
} from "@/lib/db/compare";

/**
 * Per-submittal compliance table — Airtable-style.
 *
 * Filters out missing_value/not_assigned rows (only shows the 97-ish
 * requirements the submittal actually addresses). Top filter bar
 * supports a single status pill (All/Compliant/Not Compliant/Verify)
 * and a multi-select category dropdown. Categories come from the
 * existing per-attribute heuristic in lib/db/compare.ts; categories
 * with zero visible rows in the current filter are hidden from the
 * dropdown.
 *
 * Verify column is intentionally absent — user wants to spec it
 * separately. The compare row's evidence quote + page already lives
 * in submittal_checklist_responses.evidenceQuote and we'll surface
 * it via the Verify column in the next pass.
 */
type StatusKey = "all" | "compliant" | "non_compliant" | "uncertain";

const STATUS_PILLS: Array<{ key: StatusKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "compliant", label: "Compliant" },
  { key: "non_compliant", label: "Not compliant" },
  { key: "uncertain", label: "Verify" },
];

export function CompareTableV2({ data }: { data: CompareData }) {
  const [status, setStatus] = useState<StatusKey>("all");
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const [categoryOpen, setCategoryOpen] = useState(false);

  const allRows = useMemo(
    () => data.groups.flatMap((g) => g.rows),
    [data.groups],
  );

  // Hide rows the user said are noise: spec items the submittal didn't
  // address. Compare table is now exclusively about apples-to-apples
  // comparison rows.
  const visibleBase = useMemo(
    () =>
      allRows.filter(
        (r) =>
          r.verdict === "compliant" ||
          r.verdict === "non_compliant" ||
          r.verdict === "uncertain",
      ),
    [allRows],
  );

  const allCategories = useMemo(() => {
    const seen = new Set<string>();
    for (const r of visibleBase) seen.add(r.group);
    return Array.from(seen);
  }, [visibleBase]);

  const counts = useMemo(() => countByStatus(visibleBase), [visibleBase]);

  const filteredRows = useMemo(() => {
    return visibleBase.filter((r) => {
      if (status !== "all" && r.verdict !== status) return false;
      if (hiddenCategories.has(r.group)) return false;
      return true;
    });
  }, [visibleBase, status, hiddenCategories]);

  const toggleCategory = (cat: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };
  const enableAllCategories = () => setHiddenCategories(new Set());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_PILLS.map((p) => (
          <StatusPill
            key={p.key}
            label={p.label}
            count={countFor(p.key, counts)}
            active={status === p.key}
            tone={toneFor(p.key)}
            onClick={() => setStatus(p.key)}
          />
        ))}
        <div className="ml-auto flex items-center gap-2">
          <CategoryFilter
            allCategories={allCategories}
            hidden={hiddenCategories}
            onToggle={toggleCategory}
            onClear={enableAllCategories}
            open={categoryOpen}
            onOpenChange={setCategoryOpen}
          />
        </div>
      </div>

      <div className="paper overflow-hidden">
        <table className="w-full table-fixed text-left text-[13px]">
          <colgroup>
            <col style={{ width: "44px" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "23%" }} />
            <col style={{ width: "23%" }} />
            <col style={{ width: "16%" }} />
            <col />
          </colgroup>
          <thead>
            <tr
              className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-soft)]"
              style={{ background: "var(--color-cream-deep)" }}
            >
              <th className="border-b border-[var(--color-line)] py-2 pl-4"></th>
              <th className="border-b border-[var(--color-line)] py-2">
                Attribute
              </th>
              <th className="border-b border-[var(--color-line)] py-2">
                Required
              </th>
              <th className="border-b border-[var(--color-line)] py-2">
                Submitted
              </th>
              <th className="border-b border-[var(--color-line)] py-2">
                Category
              </th>
              <th className="border-b border-[var(--color-line)] py-2 pr-4">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <Row key={row.id} row={row} zebra={i % 2 === 1} />
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-[12px] text-[var(--color-muted)]"
                >
                  No rows match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-1 text-[10.5px] text-[var(--color-muted-soft)]">
        Showing {filteredRows.length} of {visibleBase.length} addressed
        requirements · {allRows.length - visibleBase.length} spec items the
        submittal is silent on are hidden ·{" "}
        <span className="italic">Engineer verification required</span>
      </div>
    </div>
  );
}

// ---------- table row ----------

function Row({ row, zebra }: { row: CompareRow; zebra: boolean }) {
  return (
    <tr
      style={{
        background: zebra
          ? "color-mix(in srgb, var(--color-cream-deep) 35%, transparent)"
          : "transparent",
      }}
      className="hover:bg-[var(--color-cream-deep)]"
    >
      <td className="border-b border-[var(--color-line-soft)] py-2.5 pl-4 align-middle">
        {verdictDot(row.verdict)}
      </td>
      <td className="border-b border-[var(--color-line-soft)] py-2.5 align-middle">
        <div className="font-medium text-[var(--color-ink)]">
          {humanizeAttribute(row.attribute)}
        </div>
        {row.specRef && (
          <div className="mt-0.5 font-mono text-[10.5px] text-[var(--color-muted-soft)]">
            {row.specRef}
          </div>
        )}
      </td>
      <td className="border-b border-[var(--color-line-soft)] py-2.5 align-middle text-[var(--color-ink-soft)]">
        {row.requiredDisplay || <Faint>—</Faint>}
      </td>
      <td className="border-b border-[var(--color-line-soft)] py-2.5 align-middle text-[var(--color-ink-soft)]">
        {row.submittedDisplay ?? <Faint>—</Faint>}
        {row.submittalRef && (
          <div className="mt-0.5 font-mono text-[10.5px] text-[var(--color-muted-soft)]">
            {row.submittalRef}
          </div>
        )}
      </td>
      <td className="border-b border-[var(--color-line-soft)] py-2.5 align-middle">
        <CategoryChip name={row.group} />
      </td>
      <td className="border-b border-[var(--color-line-soft)] py-2.5 pr-4 align-middle">
        <VerdictChip verdict={row.verdict} />
      </td>
    </tr>
  );
}

function Faint({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--color-muted-soft)]">{children}</span>;
}

function CategoryChip({ name }: { name: string }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10.5px] font-medium"
      style={{
        background: "var(--color-line-soft)",
        color: "var(--color-muted)",
      }}
    >
      {name}
    </span>
  );
}

// ---------- filter bar ----------

function StatusPill(props: {
  label: string;
  count: number;
  active: boolean;
  tone: "neutral" | "sage" | "clay" | "gold";
  onClick: () => void;
}) {
  const tones: Record<typeof props.tone, { bg: string; fg: string; ring: string }> = {
    neutral: {
      bg: "var(--color-paper)",
      fg: "var(--color-ink-soft)",
      ring: "var(--color-line-strong)",
    },
    sage: {
      bg: "var(--color-sage-tint)",
      fg: "#3a5844",
      ring: "var(--color-sage)",
    },
    clay: {
      bg: "var(--color-clay-tint)",
      fg: "var(--color-clay)",
      ring: "var(--color-clay)",
    },
    gold: {
      bg: "var(--color-gold-tint)",
      fg: "#87602B",
      ring: "var(--color-gold)",
    },
  };
  const t = tones[props.tone];
  return (
    <button
      onClick={props.onClick}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition"
      style={{
        background: props.active ? t.bg : "var(--color-paper)",
        color: props.active ? t.fg : "var(--color-muted)",
        borderColor: props.active ? t.ring : "var(--color-line)",
      }}
    >
      {props.label}
      <span
        className="rounded-full px-1.5 py-0 text-[10.5px] font-mono font-semibold"
        style={{
          background: props.active ? "rgba(255,255,255,0.55)" : "var(--color-cream-deep)",
          color: props.active ? t.fg : "var(--color-muted-soft)",
        }}
      >
        {props.count}
      </span>
    </button>
  );
}

function CategoryFilter(props: {
  allCategories: string[];
  hidden: Set<string>;
  onToggle: (cat: string) => void;
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const visibleCount = props.allCategories.length - props.hidden.size;
  const isFiltered = props.hidden.size > 0;
  return (
    <div className="relative">
      <button
        onClick={() => props.onOpenChange(!props.open)}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium"
        style={{
          background: isFiltered ? "var(--color-coral-tint)" : "var(--color-paper)",
          color: isFiltered ? "var(--color-coral-dark)" : "var(--color-muted)",
          borderColor: isFiltered
            ? "var(--color-coral-tint-2)"
            : "var(--color-line)",
        }}
      >
        Category
        <span className="font-mono text-[10.5px] text-[var(--color-muted-soft)]">
          {visibleCount}/{props.allCategories.length}
        </span>
        <svg
          className={`h-3 w-3 transition ${props.open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {props.open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => props.onOpenChange(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] shadow-lg">
            <div className="border-b border-[var(--color-line-soft)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Filter categories
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {props.allCategories.map((cat) => {
                const checked = !props.hidden.has(cat);
                return (
                  <li key={cat}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-[var(--color-cream-deep)]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => props.onToggle(cat)}
                        className="h-3.5 w-3.5 accent-[var(--color-coral)]"
                      />
                      <span className="text-[var(--color-ink)]">{cat}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {props.hidden.size > 0 && (
              <button
                onClick={props.onClear}
                className="block w-full border-t border-[var(--color-line-soft)] px-3 py-2 text-left text-[11.5px] text-[var(--color-coral-dark)] hover:bg-[var(--color-coral-tint)]"
              >
                Clear filter
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- helpers ----------

function countByStatus(rows: CompareRow[]) {
  let compliant = 0;
  let nonCompliant = 0;
  let uncertain = 0;
  for (const r of rows) {
    if (r.verdict === "compliant") compliant++;
    else if (r.verdict === "non_compliant") nonCompliant++;
    else if (r.verdict === "uncertain") uncertain++;
  }
  return { all: rows.length, compliant, non_compliant: nonCompliant, uncertain };
}

function countFor(key: StatusKey, c: ReturnType<typeof countByStatus>): number {
  return c[key];
}

function toneFor(key: StatusKey): "neutral" | "sage" | "clay" | "gold" {
  if (key === "compliant") return "sage";
  if (key === "non_compliant") return "clay";
  if (key === "uncertain") return "gold";
  return "neutral";
}

function humanizeAttribute(a: string): string {
  let s = a.startsWith("other_") ? a.slice(6) : a;
  s = s.replace(/_/g, " ");
  s = s.replace(
    /\b(aic|sccr|nema|ul|ieee|ansi|nec|nfpa|spd|cb|mcb|mlo|mccb|kva|kw|va)\b/gi,
    (m) => m.toUpperCase(),
  );
  s = s.replace(/\b\w/g, (c) => c.toUpperCase());
  return s;
}

function verdictDot(v: CompareVerdict) {
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
        style={{ background: "var(--color-clay-tint)", color: "var(--color-clay)" }}
        title="Non-compliant"
      >
        ✗
      </span>
    );
  }
  return (
    <span
      className={base}
      style={{ background: "var(--color-gold-tint)", color: "#87602B" }}
      title="Verify"
    >
      ?
    </span>
  );
}

function VerdictChip({ verdict }: { verdict: CompareVerdict }) {
  if (verdict === "compliant")
    return (
      <span
        className="inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide"
        style={{ background: "var(--color-sage-tint)", color: "#3a5844" }}
      >
        OK
      </span>
    );
  if (verdict === "non_compliant")
    return (
      <span
        className="inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide"
        style={{ background: "var(--color-clay-tint)", color: "var(--color-clay)" }}
      >
        FLAG
      </span>
    );
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide"
      style={{ background: "var(--color-gold-tint)", color: "#87602B" }}
    >
      VERIFY
    </span>
  );
}

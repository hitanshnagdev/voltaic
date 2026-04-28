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
 * - Hides verdict='missing_value'/'not_assigned' rows; only shows the
 *   submittal's apples-to-apples comparison rows (~97 of 176 in the demo).
 * - Top filter bar: status pills (counts) + multi-select category dropdown.
 * - Tight rows (~36px) with row numbers, inline spec/submittal pages, and
 *   a Verify column whose icon reveals the underlying spec + submittal
 *   quotes on hover (no modal, no click).
 * - Sortable headers: # · Status · Attribute · Category cycle through
 *   asc/desc on click.
 */
type StatusKey = "all" | "compliant" | "non_compliant" | "uncertain";
type SortKey = "row" | "status" | "attribute" | "category";
type SortDir = "asc" | "desc";

const STATUS_PILLS: Array<{ key: StatusKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "compliant", label: "Compliant" },
  { key: "non_compliant", label: "Not compliant" },
  { key: "uncertain", label: "Verify" },
];

// Status sort order (high severity first when descending). FLAG > VERIFY > OK.
const STATUS_RANK: Record<CompareVerdict, number> = {
  non_compliant: 3,
  uncertain: 2,
  compliant: 1,
  missing_value: 0,
  not_assigned: 0,
};

export function CompareTableV2({ data }: { data: CompareData }) {
  const [status, setStatus] = useState<StatusKey>("all");
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const [categoryOpen, setCategoryOpen] = useState(false);
  // Default sort surfaces FLAG rows at the top — that's what PMs care
  // about most, and the Airtable convention is "most-actionable first".
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);

  const allRows = useMemo(
    () => data.groups.flatMap((g) => g.rows),
    [data.groups],
  );

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
    const rows = visibleBase.filter((r) => {
      if (status !== "all" && r.verdict !== status) return false;
      if (hiddenCategories.has(r.group)) return false;
      return true;
    });
    return sortRows(rows, sortKey, sortDir);
  }, [visibleBase, status, hiddenCategories, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Sensible default per column.
      setSortDir(key === "status" ? "desc" : "asc");
    }
  };

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
        <table className="w-full table-fixed text-left text-[12.5px]">
          <colgroup>
            <col style={{ width: "36px" }} />
            <col style={{ width: "44px" }} />
            <col style={{ width: "28%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "60px" }} />
            <col />
          </colgroup>
          <thead>
            <tr
              className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-soft)]"
              style={{ background: "var(--color-cream-deep)" }}
            >
              <SortableTh
                label="#"
                onClick={() => onSort("row")}
                active={sortKey === "row"}
                dir={sortDir}
                first
              />
              <SortableTh
                label=""
                onClick={() => onSort("status")}
                active={sortKey === "status"}
                dir={sortDir}
                title="Status"
              />
              <SortableTh
                label="Attribute"
                onClick={() => onSort("attribute")}
                active={sortKey === "attribute"}
                dir={sortDir}
              />
              <Th label="Required" />
              <Th label="Submitted" />
              <SortableTh
                label="Category"
                onClick={() => onSort("category")}
                active={sortKey === "category"}
                dir={sortDir}
              />
              <Th label="Verify" alignRight />
              <Th label="" alignRight />
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <Row
                key={row.id}
                row={row}
                rowNumber={i + 1}
                zebra={i % 2 === 1}
                hovered={hoverRowId === row.id}
                onHover={(h) => setHoverRowId(h ? row.id : null)}
              />
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
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

function Row(props: {
  row: CompareRow;
  rowNumber: number;
  zebra: boolean;
  hovered: boolean;
  onHover: (h: boolean) => void;
}) {
  const { row } = props;
  return (
    <tr
      style={{
        background: props.zebra
          ? "color-mix(in srgb, var(--color-cream-deep) 35%, transparent)"
          : "transparent",
      }}
      className="hover:bg-[var(--color-cream-deep)]"
      onMouseEnter={() => props.onHover(true)}
      onMouseLeave={() => props.onHover(false)}
    >
      <td className="border-b border-[var(--color-line-soft)] px-2 py-1.5 align-middle font-mono text-[10.5px] text-[var(--color-muted-soft)]">
        {props.rowNumber}
      </td>
      <td className="border-b border-[var(--color-line-soft)] py-1.5 pl-1 align-middle">
        {verdictDot(row.verdict)}
      </td>
      <td className="border-b border-[var(--color-line-soft)] px-2 py-1.5 align-middle">
        <span className="font-medium text-[var(--color-ink)]">
          {humanizeAttribute(row.attribute)}
        </span>
      </td>
      <td className="border-b border-[var(--color-line-soft)] px-2 py-1.5 align-middle text-[var(--color-ink-soft)]">
        {row.requiredDisplay || <Faint>—</Faint>}
      </td>
      <td className="border-b border-[var(--color-line-soft)] px-2 py-1.5 align-middle text-[var(--color-ink-soft)]">
        <span>{row.submittedDisplay ?? <Faint>—</Faint>}</span>
        {row.submittalRef && (
          <span className="ml-1.5 font-mono text-[10px] text-[var(--color-muted-soft)]">
            {row.submittalRef}
          </span>
        )}
      </td>
      <td className="border-b border-[var(--color-line-soft)] px-2 py-1.5 align-middle">
        <CategoryChip name={row.group} />
      </td>
      <td className="relative border-b border-[var(--color-line-soft)] py-1.5 pr-2 align-middle text-right">
        <VerifyButton row={row} hovered={props.hovered} />
      </td>
      <td className="border-b border-[var(--color-line-soft)] py-1.5 pr-3 align-middle text-right">
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
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        background: "var(--color-line-soft)",
        color: "var(--color-muted)",
      }}
    >
      {name}
    </span>
  );
}

function VerifyButton({
  row,
  hovered,
}: {
  row: CompareRow;
  hovered: boolean;
}) {
  const hasEvidence = row.specRef || row.specQuote || row.submittalQuote;
  if (!hasEvidence) {
    return <span className="text-[var(--color-muted-soft)]">—</span>;
  }
  return (
    <div className="relative inline-block">
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-cream-deep)] hover:text-[var(--color-coral-dark)]"
        title="Hover to see source"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8h.01M12 12v4m9-4a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </span>
      {hovered && <VerifyPopover row={row} />}
    </div>
  );
}

function VerifyPopover({ row }: { row: CompareRow }) {
  return (
    <div
      className="absolute right-0 top-6 z-20 w-[420px] rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] p-3 text-left shadow-xl"
      // Allow the popover to extend left of the cell since it's wide.
      style={{ transform: "translateX(0)" }}
    >
      <div className="grid gap-3">
        {row.specQuote && (
          <Pane
            kindLabel="SPEC"
            kindColor="var(--color-coral-dark)"
            kindBg="var(--color-coral-tint)"
            sourceRef={row.specRef}
            quote={row.specQuote}
          />
        )}
        {row.submittalQuote && (
          <Pane
            kindLabel="SUBMITTAL"
            kindColor="var(--color-slate-blue)"
            kindBg="var(--color-slate-blue-tint)"
            sourceRef={row.submittalRef}
            quote={row.submittalQuote}
          />
        )}
        {!row.specQuote && !row.submittalQuote && (
          <div className="text-[12px] text-[var(--color-muted)]">
            No verbatim quote captured for this row.
          </div>
        )}
      </div>
    </div>
  );
}

function Pane(props: {
  kindLabel: string;
  kindColor: string;
  kindBg: string;
  sourceRef: string | null;
  quote: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider"
          style={{ background: props.kindBg, color: props.kindColor }}
        >
          {props.kindLabel}
        </span>
        {props.sourceRef && (
          <span className="font-mono text-[10.5px] text-[var(--color-muted)]">
            {props.sourceRef}
          </span>
        )}
      </div>
      <blockquote
        className="rounded border-l-2 px-2 py-1 text-[12px] leading-[1.55] text-[var(--color-ink-soft)]"
        style={{ borderColor: props.kindColor, background: props.kindBg }}
      >
        {props.quote}
      </blockquote>
    </div>
  );
}

// ---------- header cells (sortable + plain) ----------

function Th(props: { label: string; alignRight?: boolean }) {
  return (
    <th
      className={`border-b border-[var(--color-line)] px-2 py-1.5 ${
        props.alignRight ? "text-right" : ""
      }`}
    >
      {props.label}
    </th>
  );
}

function SortableTh(props: {
  label: string;
  onClick: () => void;
  active: boolean;
  dir: SortDir;
  first?: boolean;
  title?: string;
}) {
  return (
    <th
      className={`select-none border-b border-[var(--color-line)] py-1.5 ${
        props.first ? "pl-3 pr-1" : "px-2"
      }`}
    >
      <button
        type="button"
        onClick={props.onClick}
        title={props.title ?? props.label}
        className={`inline-flex items-center gap-1 hover:text-[var(--color-ink-soft)] ${
          props.active ? "text-[var(--color-ink-soft)]" : ""
        }`}
      >
        <span>{props.label}</span>
        {props.active && (
          <span className="font-mono text-[9px]">
            {props.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </button>
    </th>
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

function sortRows(rows: CompareRow[], key: SortKey, dir: SortDir): CompareRow[] {
  if (key === "row") {
    return dir === "asc" ? rows : [...rows].reverse();
  }
  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === "status") {
      cmp = STATUS_RANK[a.verdict] - STATUS_RANK[b.verdict];
    } else if (key === "attribute") {
      cmp = humanizeAttribute(a.attribute).localeCompare(
        humanizeAttribute(b.attribute),
      );
    } else if (key === "category") {
      cmp = a.group.localeCompare(b.group);
    }
    if (cmp === 0) cmp = a.attribute.localeCompare(b.attribute); // stable tiebreak
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
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
    "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold";
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
        className="inline-block rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-wide"
        style={{ background: "var(--color-sage-tint)", color: "#3a5844" }}
      >
        OK
      </span>
    );
  if (verdict === "non_compliant")
    return (
      <span
        className="inline-block rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-wide"
        style={{ background: "var(--color-clay-tint)", color: "var(--color-clay)" }}
      >
        FLAG
      </span>
    );
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-wide"
      style={{ background: "var(--color-gold-tint)", color: "#87602B" }}
    >
      VERIFY
    </span>
  );
}

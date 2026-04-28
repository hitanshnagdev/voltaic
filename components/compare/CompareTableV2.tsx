"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CompareData,
  CompareRow,
  CompareVerdict,
} from "@/lib/db/compare";

/**
 * Per-submittal compliance table — Airtable-style replica of the
 * design mock.
 *
 * Layout:
 *   - Toolbar row: 5 status pills (All · Compliant · Not compliant ·
 *     Verify · Missing) with colored dots and counts; Filter button
 *     + search on the right.
 *   - Table: tight rows, # column, narrow status dot column, attribute
 *     (with inline italic reasoning subtext on flagged rows), required,
 *     submitted (red text when non-compliant, page suffix), category
 *     pill, verify (FLAG/VERIFY/MISSING pill on non-OK rows only),
 *     row ⋯ menu.
 *
 * Default sort: status descending (FLAG > VERIFY > MISSING > OK), so
 * the most-actionable rows are at the top. Click any header to sort
 * by that column.
 */

type StatusKey = "all" | "compliant" | "non_compliant" | "uncertain" | "missing";
type SortKey = "row" | "status" | "attribute" | "category";
type SortDir = "asc" | "desc";

const STATUS_PILLS: Array<{
  key: StatusKey;
  label: string;
  dot: string | null;
}> = [
  { key: "all", label: "All", dot: null },
  { key: "compliant", label: "Compliant", dot: "var(--color-sage)" },
  { key: "non_compliant", label: "Not compliant", dot: "var(--color-clay)" },
  { key: "uncertain", label: "Verify", dot: "var(--color-gold)" },
  { key: "missing", label: "Missing", dot: "var(--color-muted-soft)" },
];

const STATUS_RANK: Record<CompareVerdict, number> = {
  non_compliant: 4,
  uncertain: 3,
  missing_value: 2,
  not_assigned: 1,
  compliant: 0,
};

export function CompareTableV2({ data }: { data: CompareData }) {
  const [status, setStatus] = useState<StatusKey>("all");
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const allRows = useMemo(
    () => data.groups.flatMap((g) => g.rows),
    [data.groups],
  );

  const allCategories = useMemo(() => {
    const seen = new Set<string>();
    for (const r of allRows) seen.add(r.group);
    return Array.from(seen);
  }, [allRows]);

  const counts = useMemo(() => countByStatus(allRows), [allRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = allRows.filter((r) => {
      if (!matchesStatus(r.verdict, status)) return false;
      if (hiddenCategories.has(r.group)) return false;
      if (q) {
        const hay = [
          r.attribute,
          r.requiredDisplay,
          r.submittedDisplay ?? "",
          r.group,
          r.reason ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortRows(rows, sortKey, sortDir);
  }, [allRows, status, hiddenCategories, search, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
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
  const filterActive = hiddenCategories.size > 0;

  return (
    <div>
      <Toolbar>
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_PILLS.map((p) => (
            <StatusPill
              key={p.key}
              label={p.label}
              count={counts[p.key]}
              dotColor={p.dot}
              active={status === p.key}
              onClick={() => setStatus(p.key)}
            />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <FilterButton
            active={filterActive}
            count={hiddenCategories.size}
            open={filterOpen}
            onToggle={() => setFilterOpen((v) => !v)}
            onClose={() => setFilterOpen(false)}
            allCategories={allCategories}
            hidden={hiddenCategories}
            onToggleCategory={toggleCategory}
            onClear={enableAllCategories}
          />
          <SearchControl
            value={search}
            onChange={setSearch}
            open={searchOpen}
            onOpenChange={setSearchOpen}
          />
        </div>
      </Toolbar>

      <div className="border-x border-b border-[var(--color-line)] bg-[var(--color-paper)]">
        <table className="w-full table-fixed text-left text-[12.5px]">
          <colgroup>
            <col style={{ width: "44px" }} />
            <col style={{ width: "44px" }} />
            <col style={{ width: "30%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "60px" }} />
            <col style={{ width: "32px" }} />
          </colgroup>
          <thead>
            <tr
              className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]"
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
                label="Status"
                onClick={() => onSort("status")}
                active={sortKey === "status"}
                dir={sortDir}
                center
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
              <Th label="Verify" />
              <Th label="" />
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <Row key={row.id} row={row} rowNumber={i + 1} />
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

      <div className="mt-2 px-1 text-[10.5px] text-[var(--color-muted-soft)]">
        Showing {filteredRows.length} of {allRows.length} requirements ·{" "}
        <span className="italic">Engineer verification required</span>
      </div>
    </div>
  );
}

// ---------- table row ----------

function Row({ row, rowNumber }: { row: CompareRow; rowNumber: number }) {
  const flagged =
    row.verdict === "non_compliant" || row.verdict === "uncertain";
  return (
    <tr className="group hover:bg-[var(--color-cream-deep)]">
      <td className="border-b border-[var(--color-line-soft)] px-2 py-2 align-top text-right font-mono text-[10.5px] text-[var(--color-muted-soft)]">
        {rowNumber}
      </td>
      <td className="border-b border-[var(--color-line-soft)] py-2 align-top">
        <div className="flex items-center justify-center">
          {verdictDot(row.verdict)}
        </div>
      </td>
      <td className="border-b border-[var(--color-line-soft)] px-2 py-2 align-top">
        <div className="font-medium text-[var(--color-ink)]">
          {humanizeAttribute(row.attribute)}
        </div>
        {flagged && row.reason && (
          <div className="mt-0.5 text-[11px] italic text-[var(--color-muted)]">
            {row.reason}
          </div>
        )}
      </td>
      <td className="border-b border-[var(--color-line-soft)] px-2 py-2 align-top text-[var(--color-ink-soft)]">
        {row.requiredDisplay || <Faint>—</Faint>}
      </td>
      <td className="border-b border-[var(--color-line-soft)] px-2 py-2 align-top">
        <SubmittedValue row={row} />
      </td>
      <td className="border-b border-[var(--color-line-soft)] px-2 py-2 align-top">
        <CategoryChip name={row.group} />
      </td>
      <td className="border-b border-[var(--color-line-soft)] px-2 py-2 align-top">
        <VerifyCell verdict={row.verdict} />
      </td>
      <td className="border-b border-[var(--color-line-soft)] py-2 pr-2 align-top">
        <RowMenu row={row} />
      </td>
    </tr>
  );
}

function SubmittedValue({ row }: { row: CompareRow }) {
  if (row.submittedDisplay == null) {
    return <Faint>—</Faint>;
  }
  const isBad =
    row.verdict === "non_compliant" || row.verdict === "uncertain";
  return (
    <span>
      <span style={{ color: isBad ? "var(--color-clay)" : "var(--color-ink-soft)" }}>
        {row.submittedDisplay}
      </span>
      {row.submittalRef && (
        <span className="ml-1.5 font-mono text-[10px] text-[var(--color-muted-soft)]">
          {row.submittalRef}
        </span>
      )}
    </span>
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

function VerifyCell({ verdict }: { verdict: CompareVerdict }) {
  if (verdict === "compliant") return null;
  if (verdict === "non_compliant") {
    return (
      <span
        className="inline-block rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-wide"
        style={{ background: "var(--color-clay-tint)", color: "var(--color-clay)" }}
      >
        FLAG
      </span>
    );
  }
  if (verdict === "uncertain") {
    return (
      <span
        className="inline-block rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-wide"
        style={{ background: "var(--color-gold-tint)", color: "#87602B" }}
      >
        VERIFY
      </span>
    );
  }
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-wide"
      style={{
        background: "var(--color-cream-deep)",
        color: "var(--color-muted-soft)",
      }}
    >
      MISSING
    </span>
  );
}

// ---------- ⋯ row menu ----------

function RowMenu({ row }: { row: CompareRow }) {
  const [open, setOpen] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-muted-soft)] opacity-0 hover:bg-[var(--color-line-soft)] hover:text-[var(--color-ink-soft)] group-hover:opacity-100"
        title="Row actions"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-30 w-48 overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] shadow-lg">
          <MenuItem
            label="View source"
            onClick={() => {
              setShowSource(true);
              setOpen(false);
            }}
            disabled={!row.specQuote && !row.submittalQuote}
          />
          <MenuItem label="Mark as verified" onClick={() => setOpen(false)} comingSoon />
          <MenuItem label="Draft RFI" onClick={() => setOpen(false)} comingSoon />
          <MenuItem label="Dismiss" onClick={() => setOpen(false)} comingSoon />
        </div>
      )}
      {showSource && (
        <SourceModal row={row} onClose={() => setShowSource(false)} />
      )}
    </div>
  );
}

function MenuItem(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] text-[var(--color-ink-soft)] hover:bg-[var(--color-cream-deep)] disabled:cursor-not-allowed disabled:text-[var(--color-muted-soft)]"
    >
      {props.label}
      {props.comingSoon && (
        <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-muted-soft)]">
          soon
        </span>
      )}
    </button>
  );
}

function SourceModal({
  row,
  onClose,
}: {
  row: CompareRow;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-[rgba(20,18,15,0.30)]"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 z-40 w-[560px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line-soft)] px-4 py-2.5">
          <div className="text-[13px] font-medium text-[var(--color-ink)]">
            Source for {humanizeAttribute(row.attribute)}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-cream-deep)]"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="grid gap-3 p-4">
          {row.specQuote && (
            <SourcePane
              label="SPEC"
              labelColor="var(--color-coral-dark)"
              labelBg="var(--color-coral-tint)"
              quote={row.specQuote}
              sourceRef={row.specRef}
            />
          )}
          {row.submittalQuote && (
            <SourcePane
              label="SUBMITTAL"
              labelColor="var(--color-slate-blue)"
              labelBg="var(--color-slate-blue-tint)"
              quote={row.submittalQuote}
              sourceRef={row.submittalRef}
            />
          )}
          {!row.specQuote && !row.submittalQuote && (
            <div className="text-[12px] text-[var(--color-muted)]">
              No verbatim quote captured for this row.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SourcePane(props: {
  label: string;
  labelColor: string;
  labelBg: string;
  quote: string;
  sourceRef: string | null;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider"
          style={{ background: props.labelBg, color: props.labelColor }}
        >
          {props.label}
        </span>
        {props.sourceRef && (
          <span className="font-mono text-[10.5px] text-[var(--color-muted)]">
            {props.sourceRef}
          </span>
        )}
      </div>
      <blockquote
        className="rounded border-l-2 px-2 py-1 text-[12px] leading-[1.55] text-[var(--color-ink-soft)]"
        style={{ borderColor: props.labelColor, background: props.labelBg }}
      >
        {props.quote}
      </blockquote>
    </div>
  );
}

// ---------- toolbar pieces ----------

function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border border-[var(--color-line)] border-b-[var(--color-line)] bg-[var(--color-cream)] px-3 py-2">
      {children}
    </div>
  );
}

function StatusPill(props: {
  label: string;
  count: number;
  dotColor: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition"
      style={{
        background: props.active ? "var(--color-paper)" : "transparent",
        color: props.active ? "var(--color-ink)" : "var(--color-muted)",
        boxShadow: props.active
          ? "inset 0 0 0 1px var(--color-line-strong)"
          : "none",
      }}
    >
      {props.dotColor && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: props.dotColor }}
        />
      )}
      <span>{props.label}</span>
      <span
        className="font-mono text-[10.5px] tabular-nums"
        style={{
          color: props.active
            ? "var(--color-muted)"
            : "var(--color-muted-soft)",
        }}
      >
        {props.count}
      </span>
    </button>
  );
}

function FilterButton(props: {
  active: boolean;
  count: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  allCategories: string[];
  hidden: Set<string>;
  onToggleCategory: (cat: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={props.onToggle}
        className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition"
        style={{
          background: props.active ? "var(--color-coral-tint)" : "transparent",
          color: props.active ? "var(--color-coral-dark)" : "var(--color-muted)",
          boxShadow: props.active
            ? "inset 0 0 0 1px var(--color-coral-tint-2)"
            : "none",
        }}
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
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
          />
        </svg>
        Filter
        {props.count > 0 && (
          <span className="font-mono text-[10px]">·{props.count}</span>
        )}
      </button>
      {props.open && (
        <>
          <div className="fixed inset-0 z-10" onClick={props.onClose} />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] shadow-lg">
            <div className="border-b border-[var(--color-line-soft)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Categories
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
                        onChange={() => props.onToggleCategory(cat)}
                        className="h-3.5 w-3.5 accent-[var(--color-coral)]"
                      />
                      <span className="text-[var(--color-ink)]">{cat}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {props.count > 0 && (
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

function SearchControl(props: {
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="relative flex items-center">
      {props.open ? (
        <input
          autoFocus
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onBlur={() => {
            if (!props.value) props.onOpenChange(false);
          }}
          placeholder="Search rows…"
          className="w-44 rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-line-strong)]"
        />
      ) : (
        <button
          onClick={() => props.onOpenChange(true)}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-cream-deep)] hover:text-[var(--color-ink-soft)]"
          title="Search rows"
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
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

// ---------- header cells ----------

function Th(props: { label: string }) {
  return (
    <th className="border-b border-[var(--color-line)] px-2 py-1.5">
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
  center?: boolean;
}) {
  return (
    <th
      className={`select-none border-b border-[var(--color-line)] py-1.5 ${
        props.first ? "pr-1 pl-2 text-right" : "px-2"
      } ${props.center ? "text-center" : ""}`}
    >
      <button
        type="button"
        onClick={props.onClick}
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

// ---------- helpers ----------

function matchesStatus(verdict: CompareVerdict, key: StatusKey): boolean {
  if (key === "all") return true;
  if (key === "compliant") return verdict === "compliant";
  if (key === "non_compliant") return verdict === "non_compliant";
  if (key === "uncertain") return verdict === "uncertain";
  if (key === "missing") {
    return verdict === "missing_value" || verdict === "not_assigned";
  }
  return false;
}

function countByStatus(rows: CompareRow[]) {
  let compliant = 0;
  let nonCompliant = 0;
  let uncertain = 0;
  let missing = 0;
  for (const r of rows) {
    if (r.verdict === "compliant") compliant++;
    else if (r.verdict === "non_compliant") nonCompliant++;
    else if (r.verdict === "uncertain") uncertain++;
    else if (r.verdict === "missing_value" || r.verdict === "not_assigned")
      missing++;
  }
  return {
    all: rows.length,
    compliant,
    non_compliant: nonCompliant,
    uncertain,
    missing,
  };
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
    if (cmp === 0) cmp = a.attribute.localeCompare(b.attribute);
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
  if (v === "uncertain") {
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
  return (
    <span
      className={`${base} border border-dashed border-[var(--color-line-strong)]`}
      style={{ color: "var(--color-muted-soft)" }}
      title="Missing"
    >
      ·
    </span>
  );
}

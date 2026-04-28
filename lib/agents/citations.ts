import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import type { SerializedCitation } from "@/lib/db/agents";

/**
 * Citation marker syntax: `[#N]` where N is the 1-based index of an
 * atom in the retrieved list. The orchestrator passes atoms numbered
 * 1..K in the user message; the model echoes those numbers when it
 * cites; we re-bind them server-side to atom metadata.
 *
 * Hallucinated indices (model writes `[#9]` when we only sent 5
 * atoms) are silently dropped — surfacing a chip that points nowhere
 * is worse than dropping it. The visible response still reads fine
 * because the marker text is left in place; only the click-target
 * binding is omitted.
 */
const MARKER_RE = /\[#(\d+)\]/g;

export type AtomWithDoc = RetrievedAtom & {
  documentName?: string | null;
};

export function buildContextBlock(atoms: AtomWithDoc[]): string {
  if (atoms.length === 0) {
    return "<context>\n(no relevant passages found in the project corpus)\n</context>";
  }
  const lines = atoms.map((atom, i) => {
    const n = i + 1;
    const path = formatCsiPath(atom);
    const page = atom.pageNum != null ? `p.${atom.pageNum}` : "";
    const docName = atom.documentName ?? "spec document";
    const header = [path, page, `— ${docName}`].filter(Boolean).join(" ");
    const body = atom.content.replace(/\s+/g, " ").trim();
    return `[#${n}] ${header}\n${body}`;
  });
  return `<context>\n${lines.join("\n\n")}\n</context>`;
}

export function buildDocumentsBlock(
  docs: Array<{ filename: string; docType: string | null }>,
  limit = 50,
): string {
  if (docs.length === 0) return "";
  const lines = docs
    .slice(0, limit)
    .map((d) => `- ${d.docType ?? "doc"}: ${d.filename}`);
  const truncated =
    docs.length > limit ? `\n(+ ${docs.length - limit} more)` : "";
  return `<documents>\n${lines.join("\n")}${truncated}\n</documents>`;
}

export function formatCsiPath(atom: RetrievedAtom): string {
  const parts: string[] = [];
  if (atom.csiSection) parts.push(atom.csiSection);
  const pieces = [atom.csiPart, atom.csiArticle, atom.csiParagraph]
    .filter(Boolean)
    .join("/");
  if (pieces) parts.push(`§${pieces}`);
  return parts.join(" ");
}

/**
 * Find every `[#N]` marker in the assistant's text, dedup, drop any
 * index that doesn't map to an atom in `atoms`, and return one
 * SerializedCitation per cited atom.
 *
 * Order of citations in the output matches first-mention order in the
 * text — the UI surfaces them in a "Sources" footer in that order.
 */
export function extractCitations(
  text: string,
  atoms: AtomWithDoc[],
): SerializedCitation[] {
  const seen = new Set<number>();
  const out: SerializedCitation[] = [];
  for (const m of text.matchAll(MARKER_RE)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1 || n > atoms.length) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    const atom = atoms[n - 1];
    out.push({
      index: n,
      atom: {
        id: atom.id,
        sourceKind: atom.sourceKind,
        documentId: atom.documentId,
        documentName: atom.documentName ?? null,
        pageNum: atom.pageNum,
        csiSection: atom.csiSection,
        csiPath: formatCsiPath(atom),
        snippet: atom.content.slice(0, 240),
      },
    });
  }
  return out;
}

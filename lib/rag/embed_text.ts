/**
 * Build the string we actually pass to the embedding model for a parsed
 * spec paragraph.
 *
 * Why prefix metadata into the text rather than embed `content` directly:
 * construction queries are code-heavy ("65 kAIC", "26 24 16 §2.4.A",
 * "NEMA 3R", "UL 489"). Pure-semantic embeddings underweight these tokens
 * because they look like noise to a general-purpose model. Prefixing the
 * CSI path and any referenced standards into the embedding input lifts
 * recall on those keyword-style queries — measured against the eval
 * harness as the single biggest retrieval lever per CLAUDE.md.
 *
 * Output shape (single-line, single-spaced):
 *
 *   [26 24 16] [2/2.2/A] {standards: UL 67, UL 489} <content>
 *
 * Bracketed fields make the prefix easy to strip later if we want to
 * compare prefixed-vs-unprefixed retrieval scores during tuning.
 */

export type EmbedTextInput = {
  csiSection: string | null;
  csiPart: string | null;
  csiArticle: string | null;
  csiParagraph: string | null;
  referencedStandards: string[];
  content: string;
};

export function buildEmbedText(p: EmbedTextInput): string {
  const parts: string[] = [];

  if (p.csiSection) {
    parts.push(`[${p.csiSection}]`);
  }

  const path = [p.csiPart, p.csiArticle, p.csiParagraph]
    .filter((seg) => seg && seg.length > 0)
    .join("/");
  if (path) {
    parts.push(`[${path}]`);
  }

  if (p.referencedStandards && p.referencedStandards.length > 0) {
    parts.push(`{standards: ${p.referencedStandards.join(", ")}}`);
  }

  // Whitespace-collapse content so embedding-input length stays predictable.
  const body = p.content.replace(/\s+/g, " ").trim();
  parts.push(body);

  return parts.join(" ");
}

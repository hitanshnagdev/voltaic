/**
 * State-machine parser that converts CSI Division-26 spec text into a
 * structured list of paragraphs. Pure function; no I/O.
 *
 * Input is an array of per-page strings (`pages`). The parser walks lines,
 * maintains a cursor through the CSI hierarchy
 * (section → part → article → paragraph), accumulates body text into the
 * current paragraph, and emits one `ParsedParagraph` per paragraph the
 * specialist cares about.
 *
 * Emission rules (v1, deliberately simple):
 *   - Every paragraph header ("A.", "B.", ...) opens a new paragraph.
 *   - Body text up to the NEXT header is that paragraph's content.
 *   - Sub-paragraphs ("1.", "a.") are kept as inline content, not separate
 *     rows. This matches how folks actually cite — "see 2.2.A" — and keeps
 *     the downstream row count sane.
 *   - If the spec has text *before* the first paragraph header under an
 *     article (rare but it happens in PART 1 boilerplate), we emit a single
 *     "anchor" paragraph with paragraph=null so nothing is lost.
 *   - Section/part/article headers with no body do not emit.
 */

import {
  matchLine,
  type CsiLineMatch,
} from "./csi";
import { classify, type RequirementType } from "./classify";
import { extractStandards } from "./standards";

export type ParsedParagraph = {
  csiSection: string | null;
  csiPart: string | null;
  csiArticle: string | null;
  csiParagraph: string | null;
  /** Title of the enclosing article (e.g. "PANELBOARDS"). */
  articleTitle: string | null;
  /** Body text with inline sub-paragraphs preserved. Whitespace-normalized. */
  content: string;
  pageNum: number | null;
  requirementType: RequirementType;
  referencedStandards: string[];
};

type Cursor = {
  section: string | null;
  part: string | null;
  article: string | null;
  articleTitle: string | null;
  paragraph: string | null;
  pageNum: number | null;
};

type Pending = {
  cursor: Cursor;
  /** Lines accumulated for the paragraph under the cursor. */
  buf: string[];
};

function emptyCursor(): Cursor {
  return {
    section: null,
    part: null,
    article: null,
    articleTitle: null,
    paragraph: null,
    pageNum: null,
  };
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function finalize(p: Pending | null): ParsedParagraph | null {
  if (!p) return null;
  // No section context → we're in pre-spec cover/TOC matter. Drop.
  if (!p.cursor.section) return null;
  const body = normalize(p.buf.join(" "));
  if (!body) return null;
  return {
    csiSection: p.cursor.section,
    csiPart: p.cursor.part,
    csiArticle: p.cursor.article,
    csiParagraph: p.cursor.paragraph,
    articleTitle: p.cursor.articleTitle,
    content: body,
    pageNum: p.cursor.pageNum,
    requirementType: classify({
      content: body,
      article: p.cursor.article,
      articleTitle: p.cursor.articleTitle,
    }),
    referencedStandards: extractStandards(body),
  };
}

function applyHeader(cursor: Cursor, header: CsiLineMatch): Cursor {
  switch (header.kind) {
    case "section":
      return {
        ...cursor,
        section: header.section,
        part: null,
        article: null,
        articleTitle: null,
        paragraph: null,
      };
    case "part":
      return {
        ...cursor,
        part: header.part,
        article: null,
        articleTitle: null,
        paragraph: null,
      };
    case "article":
      return {
        ...cursor,
        // If we saw an article before seeing a PART, infer the part from
        // the article number's leading digit. Defensive; some PDFs elide
        // "PART 2 - PRODUCTS" when the article number makes it obvious.
        part: cursor.part ?? header.part,
        article: header.article,
        articleTitle: header.title,
        paragraph: null,
      };
    case "paragraph":
      return { ...cursor, paragraph: header.paragraph };
  }
}

export function parseSpec(pages: string[]): ParsedParagraph[] {
  const out: ParsedParagraph[] = [];
  let pending: Pending | null = null;
  let cursor: Cursor = emptyCursor();

  const flush = () => {
    const finalized = finalize(pending);
    if (finalized) out.push(finalized);
    pending = null;
  };

  const openPending = (cur: Cursor, firstLine: string | null) => {
    pending = {
      cursor: { ...cur },
      buf: firstLine ? [firstLine] : [],
    };
  };

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageNum = pageIdx + 1;
    const lines = pages[pageIdx].split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.replace(/\u00A0/g, " "); // non-breaking → space
      if (!line.trim()) continue;

      const header = matchLine(line);

      if (header) {
        // Closing out the previous paragraph before applying the new cursor.
        flush();

        cursor = applyHeader(cursor, header);
        if (cursor.pageNum == null) cursor.pageNum = pageNum;

        if (header.kind === "paragraph") {
          // Start a new pending paragraph seeded with the lead text.
          cursor.pageNum = pageNum;
          openPending(cursor, header.lead);
        }
        continue;
      }

      // Body text — accumulate into the current (or implicit) pending.
      if (!pending) {
        // There's body text in an article before any paragraph header.
        // Emit it under a null-paragraph anchor so nothing is dropped.
        cursor.pageNum = pageNum;
        openPending(cursor, null);
      }
      // refine pageNum to the last page that contributed content
      pending!.cursor.pageNum = pending!.cursor.pageNum ?? pageNum;
      pending!.buf.push(line.trim());
    }
  }

  flush();
  return out;
}

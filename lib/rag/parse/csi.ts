/**
 * CSI MasterFormat line-level recognizers for Division-XX specifications.
 *
 * A CSI section looks like:
 *
 *   SECTION 26 24 16 - PANELBOARDS
 *
 *     PART 1 - GENERAL
 *       1.1 RELATED DOCUMENTS
 *         A. Drawings and general provisions of the Contract...
 *         B. ...
 *       1.2 SUMMARY
 *         A. ...
 *     PART 2 - PRODUCTS
 *       2.1 MANUFACTURERS
 *       2.2 PANELBOARDS
 *         A. Short-Circuit Current Rating: Minimum 22 kAIC symmetrical at 480V
 *     PART 3 - EXECUTION
 *
 * These functions are pure: they look at a single line and report the
 * structural token they see (or null). Body text handling lives in spec.ts.
 */

export type CsiSectionHeader = {
  kind: "section";
  /** Canonicalized CSI number, always "NN NN NN" (single spaces). */
  section: string;
  /** Section title; whitespace-collapsed. */
  title: string;
};

export type CsiPartHeader = {
  kind: "part";
  /** "1" | "2" | "3" */
  part: string;
  title: string;
};

export type CsiArticleHeader = {
  kind: "article";
  /** Full dotted number, e.g. "2.2" or "2.2.1". */
  article: string;
  /** First number before the dot, e.g. "2". Used to pair with the part. */
  part: string;
  title: string;
};

export type CsiParagraphHeader = {
  kind: "paragraph";
  /** Single uppercase letter, e.g. "A". */
  paragraph: string;
  /** Text that followed the "A." on the same line. */
  lead: string;
};

export type CsiLineMatch =
  | CsiSectionHeader
  | CsiPartHeader
  | CsiArticleHeader
  | CsiParagraphHeader;

// ----------------------------------------------------------------------------
// regexes
// ----------------------------------------------------------------------------

// 6-digit CSI number with flexible whitespace: "26 24 16", "26  24  16",
// "262416" — normalize to "26 24 16". Optionally supports a trailing ".NN"
// fragment (sub-section numbers exist in some MasterFormat extensions).
const CSI_NUMBER = /(\d{2})[\s]*(\d{2})[\s]*(\d{2})(?:\.(\d+))?/;

// Section heading. Some master specs (UFGS, BSD) prefix headings with the
// literal word "SECTION"; others (university and agency master specs like
// UMN, U-Houston) write the heading as a bare CSI number followed by the
// title. Both must parse, so the "SECTION " prefix is optional. False
// positives from TOCs and body text are filtered in `matchSection` below.
const SECTION_RE = new RegExp(
  `^\\s*(?:SECTION\\s+)?${CSI_NUMBER.source}\\s*[-–—:]?\\s+(.+?)\\s*$`,
  "i",
);

// Patterns that look like section headings but are actually TOC entries:
//   - "26 05 00 GENERAL ELECTRICAL REQUIREMENTS ......3"  (dotted leaders)
//   - "26 05 00 GENERAL ELECTRICAL REQUIREMENTS 3"        (trailing page num)
const DOTTED_LEADERS = /\.{3,}/;
const TRAILING_PAGE_NUM = /\s+\d+\s*$/;

const PART_RE = /^\s*PART\s+(\d+)\s*[-–—:]?\s*(.+?)\s*$/i;

// 2-level ("2.2") or 3-level ("2.2.1") article numbers. We reject matches
// that look like body text by anchoring at line start and requiring at least
// two whitespace chars OR end-of-line after the number (articles are
// "<num>  <TITLE>" where the title is usually uppercase).
const ARTICLE_RE = /^\s*(\d+)\.(\d+)(?:\.(\d+))?\s+([A-Z][A-Z0-9][A-Z0-9\s\-'/&().]+?)\s*$/;

// A paragraph header is "A. <text>" at the start of a line (optionally
// indented). We permit a following space or tab.
const PARAGRAPH_RE = /^\s*([A-Z])\.\s+(.+?)\s*$/;

// ----------------------------------------------------------------------------
// recognizers
// ----------------------------------------------------------------------------

/** Normalize "26  24  16" or "262416" → "26 24 16". */
export function normalizeCsiNumber(
  d1: string,
  d2: string,
  d3: string,
  sub?: string,
): string {
  return sub ? `${d1} ${d2} ${d3}.${sub}` : `${d1} ${d2} ${d3}`;
}

export function matchSection(line: string): CsiSectionHeader | null {
  const m = line.match(SECTION_RE);
  if (!m) return null;
  const [, d1, d2, d3, sub, rawTitle] = m;
  if (!rawTitle) return null;
  const title = rawTitle.trim().replace(/\s+/g, " ");
  if (!title) return null;

  // Filter false positives that the looser regex now lets through.
  // - TOC entries: "26 05 00 GENERAL REQUIREMENTS ......3"
  // - TOC entries with bare page number: "26 05 00 GENERAL REQUIREMENTS 3"
  // - Body-text references: "26 24 16 panelboards shall be NEMA 1"
  //   (real CSI section titles are uppercase; body refs are sentence case)
  if (DOTTED_LEADERS.test(title)) return null;
  if (TRAILING_PAGE_NUM.test(title)) return null;
  if (!/^[A-Z]/.test(title)) return null;

  return {
    kind: "section",
    section: normalizeCsiNumber(d1, d2, d3, sub),
    title,
  };
}

export function matchPart(line: string): CsiPartHeader | null {
  const m = line.match(PART_RE);
  if (!m) return null;
  const [, part, rawTitle] = m;
  return {
    kind: "part",
    part,
    title: rawTitle.trim().replace(/\s+/g, " "),
  };
}

export function matchArticle(line: string): CsiArticleHeader | null {
  const m = line.match(ARTICLE_RE);
  if (!m) return null;
  const [, p, a, sub, title] = m;
  const article = sub ? `${p}.${a}.${sub}` : `${p}.${a}`;
  return {
    kind: "article",
    article,
    part: p,
    title: title.trim().replace(/\s+/g, " "),
  };
}

export function matchParagraph(line: string): CsiParagraphHeader | null {
  // Avoid false-positive on "A." inside references like "Table A.1" or "see A.".
  // Simple heuristic: the line's leading content must be exactly "<letter>."
  // at column 0 (after whitespace), with a mandatory gap before body text.
  const m = line.match(PARAGRAPH_RE);
  if (!m) return null;
  const [, letter, rest] = m;
  // Reject lines that look like table captions or cross-refs. Body text
  // rarely starts with a short fragment ending in a period mid-letter; the
  // word "and" etc. would not pass the pattern anyway.
  if (rest.length < 2) return null;
  return {
    kind: "paragraph",
    paragraph: letter,
    lead: rest.trim(),
  };
}

/**
 * Try each recognizer in priority order. Returns the first structural match
 * or null for a body-text line.
 */
export function matchLine(line: string): CsiLineMatch | null {
  return (
    matchSection(line) ??
    matchPart(line) ??
    matchArticle(line) ??
    matchParagraph(line)
  );
}

/**
 * Extracts citations of industry standards from spec body text.
 *
 * Output items are normalized to "<ORG> <NUMBER>" form, e.g.:
 *   "NEC 110.26", "UL 67", "NEMA 250", "NFPA 70 110.26", "IEEE 142"
 *
 * We only accept recognized prefixes to keep precision high — false positives
 * poison downstream retrieval more than they help recall, and these citations
 * are used for filtering (e.g. "find me all UL-67-referencing paragraphs").
 *
 * The NEC is special-cased: "National Electrical Code 110.26" and bare
 * "110.26" in a clauses-about-working-clearances paragraph get mapped to
 * "NEC 110.26" — but only when the article context confirms (handled in
 * classify.ts via the requirement_type). Here we only recognize explicit
 * citations.
 */

const ORG_ALTERNATION = [
  "NEC",
  "NFPA",
  "UL",
  "NEMA",
  "ANSI",
  "IEEE",
  "OSHA",
  "CSA",
  "IEC",
  "ISO",
  "ASTM",
  "ICC",
  "NETA",
  "NECA",
].join("|");

// Shapes we recognize:
//   "UL 67"                 basic
//   "NEC 110.26"            dotted number
//   "IEEE C62.41"           leading letter
//   "NEMA 250-2018"         year-suffixed
//   "ANSI/IEEE 1547"        dual org
//   "NEMA PB 1"             org + subdivision code + number
//   "NFPA 70E-2024"         E-suffix + year
//
// We permit:
//   - optional "ORG/" dual prefix (e.g. ANSI/IEEE)
//   - optional 1-4 uppercase-letter subdivision (e.g. PB, MG) between the
//     org and the number
//   - standard number: optional single leading letter, digits, then any
//     number of ".", "-", "/" separated alphanum groups
const CITATION_RE = new RegExp(
  `\\b(?:(${ORG_ALTERNATION})\\/)?(${ORG_ALTERNATION})\\s+` +
    `(?:([A-Z]{1,4})\\s+)?` +
    // optional leading letter (IEEE C62.41), digits, optional trailing
    // letter (NFPA 70E), optional dotted/dashed/slashed alphanum groups
    `([A-Z]?\\d+[A-Z]?(?:[.\\-\\/][A-Z0-9]+)*)` +
    `\\b`,
  "g",
);

// "National Electrical Code" expanded form → "NEC".
const NEC_EXPANSION_RE = /\bNational\s+Electrical\s+Code\b/gi;

export function extractStandards(text: string): string[] {
  const found = new Set<string>();

  // First, expand "National Electrical Code" → "NEC" so the main regex
  // picks up "NEC 110.26" when the source says the long form.
  const normalized = text.replace(NEC_EXPANSION_RE, "NEC");

  for (const m of normalized.matchAll(CITATION_RE)) {
    const dual = m[1];
    const org = m[2];
    const subdiv = m[3];
    const num = m[4];
    const orgPart = dual ? `${dual}/${org}` : org;
    const label = subdiv
      ? `${orgPart} ${subdiv} ${num}`
      : `${orgPart} ${num}`;
    found.add(label);
  }

  return [...found];
}

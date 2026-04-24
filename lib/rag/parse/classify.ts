/**
 * Heuristic `requirement_type` classifier for a single spec paragraph.
 *
 * This is the cheap, deterministic first pass. It's intentionally
 * conservative — if the signal is weak we return "other" and let a later
 * LLM pass re-classify only the ambiguous ones.
 *
 * Ordering matters: we check in descending specificity because a paragraph
 * about AIC may also mention "enclosure" in passing; the primary
 * requirement type is the one that dominates.
 */

export type RequirementType =
  | "aic"
  | "sccr"
  | "enclosure"
  | "conductor"
  | "clearance"
  | "grounding"
  | "approved_manufacturer"
  | "other";

export type ClassifyInput = {
  content: string;
  /** Context hint — e.g. "2.1" for the MANUFACTURERS article. */
  article?: string | null;
  /** Context hint — article title, e.g. "MANUFACTURERS". */
  articleTitle?: string | null;
};

type Rule = {
  type: RequirementType;
  /** Patterns that must ALL match at least one of the alternatives. */
  any: RegExp[];
  /** Patterns that must NOT match. */
  not?: RegExp[];
};

// Listed in priority order. First match wins.
const RULES: Rule[] = [
  // AIC / interrupting capacity — specific numeric signal.
  {
    type: "aic",
    any: [
      /\b(?:kAIC|AIC)\b/,
      /\binterrupting\s+(?:capacity|rating|current)\b/i,
    ],
  },

  // SCCR — withstand rating (distinct from AIC; applies to equipment not
  // breakers). Keep separate because the downstream rule engine needs it.
  {
    type: "sccr",
    any: [
      /\bSCCR\b/,
      /\bshort[-\s]?circuit\s+current\s+rating\b/i,
      /\bwithstand\s+rating\b/i,
    ],
  },

  // Approved manufacturers — almost always under article 2.1 with that
  // exact title, followed by a bulleted list of vendors.
  {
    type: "approved_manufacturer",
    any: [
      /\bapproved\s+manufacturers?\b/i,
      /\bacceptable\s+manufacturers?\b/i,
      /\bsubject\s+to\s+compliance\s+with\s+requirements,\s+provide\b/i,
    ],
  },

  // Enclosure rating — NEMA 1/3R/4X/12 are the common ones.
  {
    type: "enclosure",
    any: [
      /\bNEMA\s+(?:1|3R|4|4X|12)\b/,
      /\benclosure\s+type\b/i,
      /\bindoor\s+enclosure\b/i,
      /\boutdoor\s+enclosure\b/i,
    ],
  },

  // Working clearance / dedicated space — NEC 110.26 territory.
  {
    type: "clearance",
    any: [
      /\bworking\s+(?:clearance|space)\b/i,
      /\bdedicated\s+electrical\s+space\b/i,
      /\b110\.26\b/,
    ],
  },

  // Grounding & bonding.
  {
    type: "grounding",
    any: [
      /\bgrounding\b/i,
      /\bbonding\b/i,
      /\bground\s+electrode\b/i,
      /\bequipment\s+ground\b/i,
    ],
    // Don't let a one-off "ground" (as in "on the ground floor") win.
    not: [/\bground\s+floor\b/i],
  },

  // Conductors — AWG sizes, copper/aluminum, insulation types.
  {
    type: "conductor",
    any: [
      /\b(?:copper|aluminum)\s+(?:conductor|wire|cable)s?\b/i,
      /#\d+\s*AWG\b/i,
      /\bTHHN\b|\bTHWN\b|\bXHHW\b/,
      /\binsulated\s+conductors?\b/i,
    ],
  },
];

export function classify(input: ClassifyInput): RequirementType {
  const text = input.content;
  const title = input.articleTitle ?? "";

  // Article-title override: "MANUFACTURERS" is always approved_manufacturer.
  if (/\bMANUFACTURERS?\b/i.test(title)) return "approved_manufacturer";

  for (const rule of RULES) {
    if (rule.not && rule.not.some((re) => re.test(text))) continue;
    if (rule.any.some((re) => re.test(text))) return rule.type;
  }
  return "other";
}

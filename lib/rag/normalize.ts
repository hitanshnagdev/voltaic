/**
 * Tag and value normalizers for equipment cross-reference.
 *
 * The dedup question is "is `MDP-A` the same equipment as `MDP A`,
 * `mdp_a`, or `MDPA`?" — we treat all four as the same canonical tag
 * by uppercasing and stripping separators. The raw form a doc actually
 * used is preserved separately as a `tag_alias` so we can render it back
 * in citations.
 *
 * Pure functions, no I/O. Used by submittal/drawing/panel-schedule
 * parsers when they write rows.
 */

/**
 * Canonicalize an equipment tag for dedup purposes.
 *
 *   "MDP-A"        → "MDPA"
 *   "MDP A"        → "MDPA"
 *   "mdp_a"        → "MDPA"
 *   "MDP.A"        → "MDPA"
 *   "PP-1A"        → "PP1A"
 *   "  panel-1  "  → "PANEL1"
 *
 * Returns null when input is empty or normalizes to an empty string.
 */
export function normalizeEquipmentTag(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const stripped = trimmed.replace(/[\s\-_.]/g, "").toUpperCase();
  return stripped.length > 0 ? stripped : null;
}

/**
 * Parse a kAIC/AIC value string into a numeric kA value.
 *
 *   "65 kAIC"       → 65
 *   "65 kA"         → 65
 *   "65,000 AIC"    → 65   (Amps with comma separator → kA)
 *   "65000 AIC"     → 65
 *   "22"            → 22   (bare number assumed kA when context says AIC)
 *
 * Returns null when no kA-shaped number is present.
 */
export function normalizeAicKa(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  // "<num> kA" or "<num> kAIC"
  const kaMatch = text.match(/(\d+(?:\.\d+)?)\s*k\s*A(?:IC)?\b/i);
  if (kaMatch) {
    const n = Number(kaMatch[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // Amps form (with optional thousands separators)
  const aMatch = text.match(/(\d{1,3}(?:,\d{3})+|\d{3,6})\s*A(?:IC)?\b/i);
  if (aMatch) {
    const n = Number(aMatch[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 1000) return n / 1000;
    if (Number.isFinite(n) && n > 0 && n < 1000) return n; // already kA-scale
  }

  // Bare number — caller is expected to have inferred AIC context.
  // Heuristic: if it's >= 1000 the model returned amperes by mistake; scale
  // to kA. Real-world AIC ratings span ~10–200 kA, never above 1000 kA.
  const bare = text.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (bare) {
    const n = Number(bare[1]);
    if (Number.isFinite(n) && n >= 1000) return n / 1000;
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

/**
 * Canonicalize a NEMA enclosure rating string.
 *
 *   "NEMA 3R"       → "3R"
 *   "Type 3R"       → "3R"
 *   "3R"            → "3R"
 *   "nema-4x"       → "4X"
 *   "Indoor 1"      → "1"
 */
export function normalizeNemaRating(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const m = text.match(/(?:NEMA|Type)?\s*[\-_]?\s*(\d+[A-Z]?)/i);
  if (!m) return null;
  return m[1].toUpperCase();
}

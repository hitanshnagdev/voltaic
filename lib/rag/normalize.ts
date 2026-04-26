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
 *   "MDP-A"           → "MDPA"
 *   "MDP A"           → "MDPA"
 *   "mdp_a"           → "MDPA"
 *   "MDP.A"           → "MDPA"
 *   "PP-1A"           → "PP1A"
 *   "  panel-1  "     → "PANEL1"
 *   "T-UCCS-LA/LC"    → "TUCCSLALC"   (paired transformer designations
 *                                       common on real one-line diagrams
 *                                       — see UCCS bid set, sheet E2.x)
 *
 * Why slash collapses with the other separators: real construction
 * documents use "/" as a paired-output marker (one transformer feeding
 * two panels: T-A/B). The dedup question is "is this the same physical
 * piece of equipment?" — which it is, regardless of how many downstream
 * outputs it serves. The slash is part of the *name* the engineer chose,
 * not a structural separator. Treating "/" like "-" / "_" / "." keeps
 * dedup behavior consistent with how the rest of the punctuation is
 * already handled.
 *
 * Returns null when input is empty or normalizes to an empty string.
 */
export function normalizeEquipmentTag(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const stripped = trimmed.replace(/[\s\-_./]/g, "").toUpperCase();
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
 * Canonicalize the line-to-line system voltage.
 *
 * Accepts either an already-numeric value from the model or a raw
 * voltage label and extracts the integer line-to-line value:
 *
 *   480           → 480
 *   "480Y/277V"   → 480     (wye — line-to-line = 480)
 *   "208Y/120V"   → 208
 *   "240V"        → 240
 *   "480/277"     → 480
 *   "600 VAC"     → 600
 *
 * Returns one of the standard system voltages (208 | 240 | 277 | 480 | 600)
 * when present, otherwise the parsed integer if it looks plausible
 * (50 ≤ v ≤ 1000), otherwise null. The standard-voltage clamp catches
 * cases where the model returns the line-to-neutral value (120, 277)
 * for a wye system; we keep them since a 277V single-phase load is real.
 */
export function normalizeVoltageSystemV(
  raw: number | string | null | undefined,
): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const n = Math.round(raw);
    return n >= 50 && n <= 1000 ? n : null;
  }
  const text = raw.trim();
  if (!text) return null;

  // Wye notation "<LL>Y/<LN>V" — take the LL value (the first number).
  const wye = text.match(/(\d{2,4})\s*Y\s*\/\s*\d{2,4}/i);
  if (wye) {
    const n = Number(wye[1]);
    if (Number.isFinite(n) && n >= 50 && n <= 1000) return n;
  }

  // Slash-separated "<LL>/<LN>" — take the LL value.
  const slash = text.match(/(\d{2,4})\s*\/\s*\d{2,4}/);
  if (slash) {
    const n = Number(slash[1]);
    if (Number.isFinite(n) && n >= 50 && n <= 1000) return n;
  }

  // Bare number with optional V/VAC suffix.
  const bare = text.match(/(\d{2,4})\s*(?:V(?:AC)?)?/i);
  if (bare) {
    const n = Number(bare[1]);
    if (Number.isFinite(n) && n >= 50 && n <= 1000) return n;
  }

  return null;
}

/**
 * Canonicalize phase to integer 1 or 3. Real electrical equipment is
 * single-phase or three-phase; "2-phase" is a historical curiosity not
 * worth modeling. Anything else returns null.
 */
export function normalizePhase(
  raw: number | string | null | undefined,
): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    return raw === 1 || raw === 3 ? raw : null;
  }
  const m = raw.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n === 1 || n === 3 ? n : null;
}

/**
 * Canonicalize wire count to integer 2, 3, or 4. (Single-phase 2-wire,
 * single-phase 3-wire / three-phase 3-wire delta, three-phase 4-wire
 * wye are the only real-world distributions.)
 */
export function normalizeWires(
  raw: number | string | null | undefined,
): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    return raw === 2 || raw === 3 || raw === 4 ? raw : null;
  }
  const m = raw.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n === 2 || n === 3 || n === 4 ? n : null;
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

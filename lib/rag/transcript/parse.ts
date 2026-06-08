/**
 * Tolerant transcript parser → utterances.
 *
 * Handles the three shapes we see in the wild:
 *   1. VTT / SRT cues (with `-->` timestamp lines, optional `<v Name>` tags)
 *   2. "Speaker: text" line exports (Otter / Fireflies / Granola / Meet)
 *   3. Plain paragraphs (no speakers, no timestamps)
 *
 * Pure + dependency-free so it's unit-testable. Refined over time as we see
 * real provider formats.
 */

export type ParsedUtterance = {
  speaker: string | null;
  startMs: number | null;
  endMs: number | null;
  content: string;
};

const TS = /(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/; // HH:MM:SS(.mmm)
const ARROW = /-->/;

function toMs(h: string, m: string, s: string, ms?: string): number {
  return ((+h * 60 + +m) * 60 + +s) * 1000 + (ms ? +ms.padEnd(3, "0") : 0);
}

// "<v John Doe>text</v>" → { speaker: "John Doe", text }
function stripVtag(line: string): { speaker: string | null; text: string } {
  const v = line.match(/<v\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/i);
  if (v) return { speaker: v[1].trim(), text: v[2].trim() };
  return { speaker: null, text: line };
}

// "John Doe: text" / "John (00:12): text" → split the speaker prefix.
// Guards: prefix must be short (<= 5 words) and not look like a sentence.
function splitSpeakerPrefix(text: string): {
  speaker: string | null;
  text: string;
} {
  const m = text.match(/^([A-Za-z][\w .'-]{0,40}?)(?:\s*\([^)]*\))?:\s+([\s\S]*)$/);
  if (m && m[1].trim().split(/\s+/).length <= 5 && !/[.?!]$/.test(m[1].trim())) {
    return { speaker: m[1].trim(), text: m[2].trim() };
  }
  return { speaker: null, text };
}

export function parseTranscript(raw: string): ParsedUtterance[] {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  return ARROW.test(text) ? parseCues(text) : parseLines(text);
}

function parseCues(text: string): ParsedUtterance[] {
  const blocks = text.split(/\n{2,}/);
  const out: ParsedUtterance[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const arrowIdx = lines.findIndex((l) => ARROW.test(l));
    if (arrowIdx === -1) continue;
    const [left, right] = lines[arrowIdx].split(ARROW);
    const sm = left?.match(TS);
    const em = right?.match(TS);
    const startMs = sm ? toMs(sm[1], sm[2], sm[3], sm[4]) : null;
    const endMs = em ? toMs(em[1], em[2], em[3], em[4]) : null;
    const textLines = lines.slice(arrowIdx + 1);
    if (textLines.length === 0) continue;
    const v = stripVtag(textLines.join(" "));
    let speaker = v.speaker;
    let content = v.text;
    if (!speaker) {
      const sp = splitSpeakerPrefix(content);
      speaker = sp.speaker;
      content = sp.text;
    }
    content = content.replace(/<[^>]+>/g, "").trim();
    if (content) out.push({ speaker, startMs, endMs, content });
  }
  return mergeAdjacent(out);
}

function parseLines(text: string): ParsedUtterance[] {
  // Prefer blank-line-separated paragraphs; fall back to single lines.
  let blocks = text
    .split(/\n{2,}/)
    .map((b) => b.replace(/\n/g, " ").trim())
    .filter(Boolean);
  if (blocks.length <= 1) {
    blocks = text
      .split(/\n/)
      .map((b) => b.trim())
      .filter(Boolean);
  }
  const out: ParsedUtterance[] = [];
  for (const b of blocks) {
    const sp = splitSpeakerPrefix(b);
    if (sp.text) {
      out.push({ speaker: sp.speaker, startMs: null, endMs: null, content: sp.text });
    }
  }
  return mergeAdjacent(out);
}

// VTT splits a single sentence across cues; merge consecutive turns by the
// same (known) speaker so an utterance is a coherent claim, not a fragment.
function mergeAdjacent(items: ParsedUtterance[]): ParsedUtterance[] {
  const out: ParsedUtterance[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev && it.speaker !== null && prev.speaker === it.speaker) {
      prev.content = `${prev.content} ${it.content}`.trim();
      prev.endMs = it.endMs ?? prev.endMs;
    } else {
      out.push({ ...it });
    }
  }
  return out;
}

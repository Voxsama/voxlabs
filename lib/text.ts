// Pure text helpers shared by server and client. No Node imports here.
import { MAX_PARAGRAPH_CHARS } from "./constants";

const BREAK_SRC = String.raw`<break\s+time\s*=\s*["']?\s*(\d+(?:\.\d+)?)\s*(ms|s)\s*["']?\s*\/?>`;
/** Matches one `<break time="1s"/>` tag (also `1000ms`, `1.5s`, with or without the space before `/>`). */
export const breakRe = () => new RegExp(BREAK_SRC, "gi");
const BREAK_RUN_RE = new RegExp(String.raw`(?:\s*${BREAK_SRC})+\s*`, "gi");

export function breakTag(ms: number): string {
  return ms % 1000 === 0 ? `<break time="${ms / 1000}s" />` : `<break time="${ms}ms" />`;
}

/** Durations (ms) of every break tag in the text, in order. */
export function breakDurations(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(breakRe())) {
    const v = parseFloat(m[1]);
    out.push(Math.round(m[2].toLowerCase() === "ms" ? v : v * 1000));
  }
  return out;
}

/** True when a paragraph contains only break tags (a "pause row"). */
export function isPauseOnly(text: string): boolean {
  if (!breakRe().test(text)) return false;
  return text.replace(breakRe(), "").trim() === "";
}

export function pauseDurationMs(text: string): number {
  return breakDurations(text).reduce((a, b) => a + b, 0);
}

/** Text sent to Cartesia: break tags normalised, whitespace collapsed. */
export function toTranscript(text: string): string {
  return text
    .replace(breakRe(), (_m, v: string, unit: string) => `<break time="${v}${unit.toLowerCase()}"/>`)
    .replace(/\s+/g, " ")
    .trim();
}

/** Spoken text only (tags removed). Used for counting and display. */
export function plainText(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Split a block that is too long into sentence-sized chunks under `max` characters. */
export function splitLong(block: string, max = MAX_PARAGRAPH_CHARS): string[] {
  if (block.length <= max) return [block];
  // Sentence ends: Latin . ! ? and Devanagari danda / double danda.
  const sentences = block.match(/[^.!?।॥]+(?:[.!?।॥]+["'”’)]*|$)\s*/g) ?? [block];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > max) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      // A single huge sentence: hard-split on whitespace.
      let rest = s;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(" ", max);
        if (cut <= 0) cut = max;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut);
      }
      cur = rest;
    } else {
      cur += s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/**
 * Pull runs of break tags out of a block so they become their own pause rows.
 * Leading/trailing runs are always separated. Runs of 2+ tags in the middle split the block too.
 * A single break tag inside a sentence stays inline and is sent to Cartesia.
 */
function separatePauses(block: string): string[] {
  const parts: string[] = [];
  let last = 0;
  for (const m of block.matchAll(BREAK_RUN_RE)) {
    const start = m.index!;
    const end = start + m[0].length;
    const atEdge = start === 0 || end === block.length || block.slice(0, start).trim() === "" || block.slice(end).trim() === "";
    const count = (m[0].match(breakRe()) ?? []).length;
    if (!atEdge && count < 2) continue;
    const before = block.slice(last, start).trim();
    if (before) parts.push(before);
    parts.push(m[0].trim());
    last = end;
  }
  const tail = block.slice(last).trim();
  if (tail) parts.push(tail);
  return parts;
}

export type SplitMode = "line" | "blank";

/**
 * Turn pasted/imported text into paragraphs.
 * - "line": every non-empty line is a paragraph (default; matches docx and most scripts).
 * - "blank": paragraphs are separated by blank lines; single newlines are joined with a space.
 */
export function splitIntoParagraphs(raw: string, mode: SplitMode = "line", max = MAX_PARAGRAPH_CHARS): string[] {
  const text = raw.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  const blocks =
    mode === "blank"
      ? text.split(/\n\s*\n/).map((b) => b.replace(/\s*\n\s*/g, " "))
      : text.split("\n");
  const out: string[] = [];
  for (const b of blocks) {
    const block = b.trim();
    if (!block) continue;
    for (const part of separatePauses(block)) {
      if (isPauseOnly(part)) out.push(breakDurations(part).map(breakTag).join(""));
      else out.push(...splitLong(part, max));
    }
  }
  return out;
}

/** Same line ignoring case, whitespace, punctuation and symbols ("आवश्यक जानकारी:" = "आवश्यक जानकारी"; । and ॥ are punctuation). */
export function sameLine(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
  return norm(a) === norm(b);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
/** Natural sort: s1, s2, ... s10 (not s1, s10, s2). */
export const naturalCompare = (a: string, b: string) => collator.compare(a, b);

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? h + ":" : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/**
 * Text that arrived as "?" placeholders: some apps put Hindi on the clipboard only in a legacy
 * 8-bit format, so every non-Latin letter becomes "?". Real questions ("क्या?") are not flagged.
 */
export function looksBroken(s: string): boolean {
  return /\?{2,}|[^\s?.!।"'”“)(\[\]]\?[^\s?.!।"'”“)(\[\],;:]/.test(s);
}

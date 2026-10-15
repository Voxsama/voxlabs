import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AUDIO_DIR, CACHE_DIR, db } from "./db";
import { convertWavSync } from "./ffmpeg";
import { getChapter, getProject, listParagraphs } from "./store";
import { isPauseOnly, pauseDurationMs } from "./text";
import type { Paragraph } from "./types";
import { concatWav, formatFor, parseWav, sameFormat, type Segment, type WavFormat } from "./wav";

export interface TimelineItem {
  paragraphId: string;
  startMs: number;
  durationMs: number;
  pause: boolean;
}

export interface ChapterRender {
  key: string;
  file: string | null;
  durationMs: number;
  timeline: TimelineItem[];
  missing: Paragraph[]; // speakable paragraphs without audio
}

/**
 * Plan the merged chapter audio: generated paragraphs in order, with silence for pause rows.
 * Paragraphs without audio are skipped (listed in `missing`).
 */
function plan(chapterId: string) {
  const pr = getProject(getChapter(chapterId).project_id);
  const paragraphs = listParagraphs(chapterId);
  const items: { p: Paragraph; seg: Segment | null; pause: boolean; pauseMs: number }[] = [];
  const missing: Paragraph[] = [];
  const keyParts: string[] = [];
  for (const p of paragraphs) {
    if (isPauseOnly(p.text)) {
      const ms = pauseDurationMs(p.text);
      items.push({ p, seg: null, pause: true, pauseMs: ms });
      keyParts.push(`pause:${ms}`);
    } else if (p.active_version_id) {
      items.push({ p, seg: null, pause: false, pauseMs: 0 });
      keyParts.push(p.active_version_id);
    } else if (p.text.trim()) {
      missing.push(p);
    }
  }
  // Format, gap and the smoothing recipe change the output too.
  keyParts.push(`fmt:${pr.sample_rate}/${pr.bit_depth}`, `gap:${pr.paragraph_gap_ms}`, "smooth:1");
  const key = crypto.createHash("sha1").update(keyParts.join("|")).digest("hex").slice(0, 16);
  return { items, missing, key, format: formatFor(pr.sample_rate, pr.bit_depth), gapMs: pr.paragraph_gap_ms };
}

/** A version's WAV in the project format. Older clips (e.g. 44.1 kHz 16-bit) are converted once and cached. */
function clipIn(chapterId: string, versionId: string, format: WavFormat): Buffer {
  const v = db.prepare("SELECT file_path FROM audio_versions WHERE id = ?").get(versionId) as { file_path: string };
  const src = path.join(AUDIO_DIR, v.file_path);
  const wav = fs.readFileSync(src);
  if (sameFormat(parseWav(wav).format, format)) return wav;
  // ponytail: kept until the chapter is deleted (or the cache folder is), even after a regenerate.
  const conv = path.join(CACHE_DIR, `${chapterId}-conv-${versionId}-${format.sampleRate}-${format.bitsPerSample}.wav`);
  if (!fs.existsSync(conv)) convertWavSync(src, conv, format);
  return fs.readFileSync(conv);
}

/** Build (or reuse from cache) the merged WAV for a chapter. */
export function renderChapter(chapterId: string): ChapterRender {
  getChapter(chapterId);
  const { items, missing, key, format, gapMs } = plan(chapterId);
  const file = path.join(CACHE_DIR, `${chapterId}-${key}.wav`);
  const timelineFile = file + ".json";
  if (fs.existsSync(file) && fs.existsSync(timelineFile)) {
    const cached = JSON.parse(fs.readFileSync(timelineFile, "utf8"));
    return { key, file, durationMs: cached.durationMs, timeline: cached.timeline, missing };
  }
  const audioItems = items.filter((i) => !i.pause);
  if (!audioItems.length) return { key, file: null, durationMs: 0, timeline: [], missing };

  // Clips are trimmed and faded; two speech paragraphs in a row get `gapMs` of silence between them
  // (next to a pause row the pause is the gap). Gaps are not timeline items.
  const segs: Segment[] = [];
  const segOf: number[] = [];
  items.forEach((i, n) => {
    if (i.pause) {
      segOf.push(segs.length);
      segs.push({ kind: "silence", ms: i.pauseMs });
      return;
    }
    if (n > 0 && !items[n - 1].pause && gapMs > 0) segs.push({ kind: "silence", ms: gapMs });
    segOf.push(segs.length);
    segs.push({ kind: "audio", wav: clipIn(chapterId, i.p.active_version_id!, format), smooth: true });
  });
  const { wav, offsetsMs } = concatWav(segs);
  const timeline = items.map((i, n) => ({ paragraphId: i.p.id, pause: i.pause, ...offsetsMs[segOf[n]] }));
  const end = offsetsMs[offsetsMs.length - 1];
  const durationMs = end ? end.startMs + end.durationMs : 0;

  // Drop older renders of this chapter, then write the new one.
  for (const f of fs.readdirSync(CACHE_DIR)) if (f.startsWith(chapterId + "-") && !f.startsWith(chapterId + "-conv-")) fs.rmSync(path.join(CACHE_DIR, f), { force: true });
  fs.writeFileSync(file, wav);
  fs.writeFileSync(timelineFile, JSON.stringify({ durationMs, timeline }));
  return { key, file, durationMs, timeline, missing };
}

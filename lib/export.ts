import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZipArchive } from "archiver";
import { renderChapter } from "./chapterAudio";
import { AUDIO_DIR, db } from "./db";
import { FORMAT_MIME, transcode, type AudioFormat } from "./ffmpeg";
import { getProject, listChapters, listParagraphs } from "./store";
import { isPauseOnly, pauseDurationMs } from "./text";
import type { Chapter } from "./types";
import { buildWav, concatWav, durationMs, parseWav, smoothPcm, type Segment } from "./wav";

export type ExportStructure = "chapters" | "merged" | "paragraphs";

export interface ExportRequest {
  projectId: string;
  chapterIds?: string[]; // empty/undefined = all chapters
  structure: ExportStructure;
  format: AudioFormat;
  mp3Kbps?: number;
  includeScript?: boolean;
}

export interface ExportResult {
  file: string;
  filename: string;
  mime: string;
  cleanup: () => void;
}

export interface ExportCheck {
  ok: boolean;
  missing: { chapterId: string; chapter: string; paragraphId: string; position: number; text: string }[];
  stale: { chapterId: string; chapter: string; paragraphId: string; position: number }[];
}

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "untitled";

function selectedChapters(req: Pick<ExportRequest, "projectId" | "chapterIds">): Chapter[] {
  const all = listChapters(req.projectId);
  if (!req.chapterIds?.length) return all;
  const want = new Set(req.chapterIds);
  return all.filter((c) => want.has(c.id));
}

/** Which paragraphs block an export (no audio) or are out of date (text changed after generating). */
export function checkExport(req: Pick<ExportRequest, "projectId" | "chapterIds">): ExportCheck {
  const missing: ExportCheck["missing"] = [];
  const stale: ExportCheck["stale"] = [];
  for (const c of selectedChapters(req)) {
    for (const p of listParagraphs(c.id)) {
      if (!p.text.trim() || isPauseOnly(p.text)) continue;
      if (!p.active_version_id) missing.push({ chapterId: c.id, chapter: c.name, paragraphId: p.id, position: p.position + 1, text: p.text.slice(0, 80) });
      else if (p.active_text !== p.text) stale.push({ chapterId: c.id, chapter: c.name, paragraphId: p.id, position: p.position + 1 });
    }
  }
  return { ok: missing.length === 0, missing, stale };
}

function chapterScript(c: Chapter): string {
  return listParagraphs(c.id).map((p) => p.text).join("\n");
}

export async function runExport(req: ExportRequest): Promise<ExportResult> {
  const project = getProject(req.projectId);
  const chapters = selectedChapters(req);
  if (!chapters.length) throw new Error("No chapters selected");
  const check = checkExport(req);
  if (!check.ok) {
    const first = check.missing.slice(0, 5).map((m) => `${m.chapter} #${m.position}`).join(", ");
    throw new Error(`${check.missing.length} paragraph(s) have no audio yet (${first}${check.missing.length > 5 ? ", ..." : ""}). Generate them first.`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cartesia-export-"));
  const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });
  const ext = req.format;
  const kbps = req.mp3Kbps ?? 192;

  // Produce `<tmp>/<name>.<ext>` from a WAV source file. WAV is a byte copy (keeps rate and bit depth).
  const encode = async (wavFile: string, outName: string, float = project.bit_depth === "32f"): Promise<string> => {
    const out = path.join(tmp, outName);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (ext === "wav") fs.copyFileSync(wavFile, out);
    else await transcode(wavFile, out, ext, kbps, float);
    return out;
  };

  try {
    const base = safeName(project.name);
    const manifest = {
      project: project.name,
      exported_at: new Date().toISOString(),
      format: ext,
      structure: req.structure,
      model_id: project.model_id,
      language: project.language,
      chapters: [] as unknown[],
    };

    if (req.structure === "merged") {
      const segs: Segment[] = [];
      for (const c of chapters) {
        const r = renderChapter(c.id);
        if (r.file) segs.push({ kind: "audio", wav: fs.readFileSync(r.file) });
      }
      const merged = path.join(tmp, "merged.wav");
      fs.writeFileSync(merged, concatWav(segs).wav);
      const name = chapters.length === 1 ? safeName(chapters[0].name) : base;
      const out = await encode(merged, `${name}.${ext}`);
      return { file: out, filename: path.basename(out), mime: FORMAT_MIME[ext], cleanup };
    }

    const zipEntries: { file: string; name: string }[] = [];
    const scripts: { name: string; text: string }[] = [];

    if (req.structure === "chapters") {
      for (const c of chapters) {
        const r = renderChapter(c.id);
        if (!r.file) continue;
        const name = `${String(c.position + 1).padStart(2, "0")} - ${safeName(c.name)}.${ext}`;
        zipEntries.push({ file: await encode(r.file, name), name });
        scripts.push({ name: `${safeName(c.name)}.txt`, text: chapterScript(c) });
        manifest.chapters.push({ name: c.name, file: name, duration_ms: r.durationMs, paragraphs: c.paragraph_count });
      }
    } else {
      for (const c of chapters) {
        const folder = `${String(c.position + 1).padStart(2, "0")} - ${safeName(c.name)}`;
        const items: unknown[] = [];
        for (const p of listParagraphs(c.id)) {
          const num = String(p.position + 1).padStart(3, "0");
          if (isPauseOnly(p.text)) {
            items.push({ n: p.position + 1, pause_ms: pauseDurationMs(p.text) });
            continue;
          }
          if (!p.active_version_id) continue;
          const v = db.prepare("SELECT file_path FROM audio_versions WHERE id = ?").get(p.active_version_id) as { file_path: string };
          const name = `${folder}/${num}.${ext}`;
          // Same trim + fade as the merged audio, in the clip's own format.
          const src = parseWav(fs.readFileSync(path.join(AUDIO_DIR, v.file_path)));
          const pcm = smoothPcm(src.format, src.data);
          const clip = path.join(tmp, "clip.wav");
          fs.writeFileSync(clip, buildWav(src.format, pcm));
          zipEntries.push({ file: await encode(clip, name, src.format.audioFormat === 3), name });
          items.push({ n: p.position + 1, file: name, text: p.text, duration_ms: durationMs(src.format, pcm.length) });
        }
        scripts.push({ name: `${folder}/script.txt`, text: chapterScript(c) });
        manifest.chapters.push({ name: c.name, folder, items });
      }
    }

    const zipPath = path.join(tmp, `${base}.zip`);
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(zipPath);
      const zip = new ZipArchive({ zlib: { level: ext === "wav" ? 1 : 0 } });
      out.on("close", () => resolve());
      zip.on("error", reject);
      zip.pipe(out);
      for (const e of zipEntries) zip.file(e.file, { name: e.name });
      if (req.includeScript !== false) {
        for (const s of scripts) zip.append(s.text, { name: req.structure === "chapters" ? `scripts/${s.name}` : s.name });
        zip.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
      }
      zip.finalize();
    });
    return { file: zipPath, filename: `${base}.zip`, mime: "application/zip", cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

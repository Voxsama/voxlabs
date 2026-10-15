import fs from "node:fs";
import path from "node:path";
import { AUDIO_DIR, CACHE_DIR, db, newId, now } from "./db";
import { emit } from "./events";
import { isPauseOnly } from "./text";
import type { AudioVersion, Chapter, Paragraph, ParagraphStatus, Project, ProjectSummary } from "./types";

export class NotFound extends Error {
  status = 404;
}

function must<T>(row: T | undefined, what: string): T {
  if (!row) throw new NotFound(`${what} not found`);
  return row;
}

/** Number in [lo, hi]; `d` when missing or not a number. */
const clamp = <D>(v: unknown, lo: number, hi: number, d: D): number | D => {
  const n = v === null || v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

const rmrf = (p: string) => fs.rmSync(p, { recursive: true, force: true });

/** Remove cached merged-chapter renders for the given chapters. */
function clearChapterCache(chapterIds: string[]) {
  if (!chapterIds.length || !fs.existsSync(CACHE_DIR)) return;
  for (const f of fs.readdirSync(CACHE_DIR)) {
    if (chapterIds.some((id) => f.startsWith(id + "-"))) fs.rmSync(path.join(CACHE_DIR, f), { force: true });
  }
}

// ---------------------------------------------------------------- projects

export function listProjects(): ProjectSummary[] {
  const rows = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM chapters c WHERE c.project_id = p.id) AS chapter_count,
        (SELECT COUNT(*) FROM paragraphs x JOIN chapters c ON c.id = x.chapter_id WHERE c.project_id = p.id AND x.is_pause = 0 AND TRIM(x.text) <> '') AS paragraph_count,
        (SELECT COUNT(*) FROM paragraphs x JOIN chapters c ON c.id = x.chapter_id WHERE c.project_id = p.id AND x.is_pause = 0 AND TRIM(x.text) <> '' AND x.active_version_id IS NOT NULL) AS ready_count,
        (SELECT x.text FROM paragraphs x JOIN chapters c ON c.id = x.chapter_id WHERE c.project_id = p.id AND x.is_pause = 0 ORDER BY c.position, x.position LIMIT 1) AS preview
       FROM projects p ORDER BY p.updated_at DESC`,
    )
    .all() as ProjectSummary[];
  return rows;
}

export function getProject(id: string): Project {
  return must(db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined, "Project");
}

export function createProject(p: Partial<Project> & { name: string }): Project {
  const id = newId();
  const t = now();
  db.prepare(
    `INSERT INTO projects (id, name, description, voice_id, voice_name, model_id, language, speed, sample_rate, bit_depth, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    p.name.trim() || "Untitled project",
    p.description ?? "",
    p.voice_id ?? null,
    p.voice_name ?? null,
    p.model_id || "sonic-3.6",
    p.language || "hi",
    p.speed ?? 1,
    p.sample_rate ?? 48000,
    p.bit_depth ?? "32f",
    t,
    t,
  );
  return getProject(id);
}

const PROJECT_FIELDS = [
  "name", "description", "voice_id", "voice_name", "model_id", "language", "speed",
  "volume", "emotion", "sample_rate", "bit_depth", "paragraph_gap_ms",
] as const;

export function updateProject(id: string, input: Partial<Project>): Project {
  const cur = getProject(id);
  // Trust boundary: keep generation settings in the ranges Cartesia accepts.
  const patch: Partial<Project> = { ...input };
  if ("speed" in patch) patch.speed = clamp(patch.speed, 0.6, 1.5, cur.speed);
  if ("volume" in patch) patch.volume = clamp(patch.volume, 0.5, 2, cur.volume);
  if ("sample_rate" in patch) patch.sample_rate = [44100, 48000].includes(Number(patch.sample_rate)) ? Number(patch.sample_rate) : cur.sample_rate;
  if ("bit_depth" in patch) patch.bit_depth = patch.bit_depth === "16" || patch.bit_depth === "32f" ? patch.bit_depth : cur.bit_depth;
  if ("paragraph_gap_ms" in patch) patch.paragraph_gap_ms = Math.round(clamp(patch.paragraph_gap_ms, 0, 5000, cur.paragraph_gap_ms));
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of PROJECT_FIELDS) {
    if (f in patch) {
      sets.push(`${f} = ?`);
      vals.push(patch[f] ?? null);
    }
  }
  sets.push("updated_at = ?");
  vals.push(now(), id);
  db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return getProject(id);
}

export function touchProject(id: string) {
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now(), id);
}

export function deleteProject(id: string) {
  getProject(id);
  const chapterIds = (db.prepare("SELECT id FROM chapters WHERE project_id = ?").all(id) as { id: string }[]).map((r) => r.id);
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  rmrf(path.join(AUDIO_DIR, id));
  clearChapterCache(chapterIds);
}

// ---------------------------------------------------------------- chapters

const CHAPTER_SELECT = `SELECT c.*,
  (SELECT COUNT(*) FROM paragraphs x WHERE x.chapter_id = c.id AND x.is_pause = 0 AND TRIM(x.text) <> '') AS paragraph_count,
  (SELECT COUNT(*) FROM paragraphs x WHERE x.chapter_id = c.id AND x.is_pause = 0 AND TRIM(x.text) <> '' AND x.active_version_id IS NOT NULL) AS ready_count
  FROM chapters c`;

export function listChapters(projectId: string): Chapter[] {
  return db.prepare(`${CHAPTER_SELECT} WHERE c.project_id = ? ORDER BY c.position`).all(projectId) as Chapter[];
}

export function getChapter(id: string): Chapter {
  return must(db.prepare(`${CHAPTER_SELECT} WHERE c.id = ?`).get(id) as Chapter | undefined, "Chapter");
}

export function createChapter(projectId: string, name: string, texts: string[] = []): Chapter {
  getProject(projectId);
  const id = newId();
  const t = now();
  const tx = db.transaction(() => {
    const { m } = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM chapters WHERE project_id = ?").get(projectId) as { m: number };
    db.prepare(
      "INSERT INTO chapters (id, project_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, projectId, name.trim() || `Chapter ${m + 2}`, m + 1, t, t);
    insertParagraphsTx(id, null, texts);
  });
  tx();
  touchProject(projectId);
  return getChapter(id);
}

export function updateChapter(id: string, patch: { name?: string; voice_id?: string | null; voice_name?: string | null }): Chapter {
  const c = getChapter(id);
  db.prepare("UPDATE chapters SET name = ?, voice_id = ?, voice_name = ?, updated_at = ? WHERE id = ?").run(
    patch.name !== undefined ? patch.name.trim() || c.name : c.name,
    "voice_id" in patch ? patch.voice_id ?? null : c.voice_id,
    "voice_name" in patch ? patch.voice_name ?? null : c.voice_name,
    now(),
    id,
  );
  touchProject(c.project_id);
  return getChapter(id);
}

export function deleteChapter(id: string) {
  const c = getChapter(id);
  db.prepare("DELETE FROM chapters WHERE id = ?").run(id);
  rmrf(path.join(AUDIO_DIR, c.project_id, id));
  clearChapterCache([id]);
  renumber("chapters", "project_id", c.project_id);
  touchProject(c.project_id);
}

export function reorderChapters(projectId: string, ids: string[]) {
  const tx = db.transaction(() => {
    const stmt = db.prepare("UPDATE chapters SET position = ? WHERE id = ? AND project_id = ?");
    ids.forEach((cid, i) => stmt.run(i, cid, projectId));
  });
  tx();
  renumber("chapters", "project_id", projectId);
}

function renumber(table: "chapters" | "paragraphs", parentCol: string, parentId: string) {
  const ids = db.prepare(`SELECT id FROM ${table} WHERE ${parentCol} = ? ORDER BY position, rowid`).all(parentId) as { id: string }[];
  const stmt = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`);
  db.transaction(() => ids.forEach((r, i) => stmt.run(i, r.id)))();
}

// ---------------------------------------------------------------- paragraphs

const PARAGRAPH_SELECT = `SELECT x.*,
  v.text_snapshot AS active_text, v.duration_ms AS active_duration_ms, v.voice_id AS active_voice_id, v.settings_json AS active_settings,
  (SELECT COUNT(*) FROM audio_versions av WHERE av.paragraph_id = x.id) AS version_count
  FROM paragraphs x LEFT JOIN audio_versions v ON v.id = x.active_version_id`;

export function listParagraphs(chapterId: string): Paragraph[] {
  return db.prepare(`${PARAGRAPH_SELECT} WHERE x.chapter_id = ? ORDER BY x.position`).all(chapterId) as Paragraph[];
}

export function getParagraph(id: string): Paragraph {
  return must(db.prepare(`${PARAGRAPH_SELECT} WHERE x.id = ?`).get(id) as Paragraph | undefined, "Paragraph");
}

export function projectIdOfChapter(chapterId: string): string {
  return getChapter(chapterId).project_id;
}

export function projectIdOfParagraph(paragraphId: string): string {
  const r = db
    .prepare("SELECT c.project_id FROM paragraphs x JOIN chapters c ON c.id = x.chapter_id WHERE x.id = ?")
    .get(paragraphId) as { project_id: string } | undefined;
  return must(r, "Paragraph").project_id;
}

/** Insert texts after the paragraph with id `afterId` (null = append at end; "start" = prepend), or before `beforeId`. */
function insertParagraphsTx(chapterId: string, afterId: string | null | "start", texts: string[], beforeId?: string | null): string[] {
  const existing = db.prepare("SELECT id FROM paragraphs WHERE chapter_id = ? ORDER BY position").all(chapterId) as { id: string }[];
  const order = existing.map((r) => r.id);
  let at = order.length;
  if (afterId === "start") at = 0;
  else if (afterId) {
    const i = order.indexOf(afterId);
    if (i >= 0) at = i + 1;
  }
  if (beforeId && order.includes(beforeId)) at = order.indexOf(beforeId);
  const t = now();
  const ins = db.prepare("INSERT INTO paragraphs (id, chapter_id, position, text, is_pause, updated_at) VALUES (?, ?, 0, ?, ?, ?)");
  const newIds = texts.map((text) => {
    const id = newId();
    ins.run(id, chapterId, text, isPauseOnly(text) ? 1 : 0, t);
    return id;
  });
  order.splice(at, 0, ...newIds);
  const pos = db.prepare("UPDATE paragraphs SET position = ? WHERE id = ?");
  order.forEach((id, i) => pos.run(i, id));
  return newIds;
}

export function insertParagraphs(chapterId: string, afterId: string | null | "start", texts: string[], beforeId?: string | null): string[] {
  const c = getChapter(chapterId);
  const ids = db.transaction(() => insertParagraphsTx(chapterId, afterId, texts, beforeId))();
  touchProject(c.project_id);
  return ids;
}

/** Replace all paragraphs of a chapter (import with "replace"). */
export function replaceParagraphs(chapterId: string, texts: string[]) {
  const c = getChapter(chapterId);
  db.transaction(() => {
    db.prepare("DELETE FROM paragraphs WHERE chapter_id = ?").run(chapterId);
    insertParagraphsTx(chapterId, null, texts);
  })();
  rmrf(path.join(AUDIO_DIR, c.project_id, chapterId));
  touchProject(c.project_id);
}

export interface ParagraphPatch {
  text?: string;
  voice_id?: string | null;
  voice_name?: string | null;
  speed?: number | null;
  volume?: number | null;
  emotion?: string | null;
}

export function updateParagraph(id: string, patch: ParagraphPatch): Paragraph {
  const p = getParagraph(id);
  const next = {
    text: patch.text ?? p.text,
    voice_id: "voice_id" in patch ? patch.voice_id ?? null : p.voice_id,
    voice_name: "voice_name" in patch ? patch.voice_name ?? null : p.voice_name,
    speed: "speed" in patch ? clamp(patch.speed, 0.6, 1.5, null) : p.speed,
    volume: "volume" in patch ? clamp(patch.volume, 0.5, 2, null) : p.volume,
    emotion: "emotion" in patch ? patch.emotion || null : p.emotion,
  };
  db.prepare(
    "UPDATE paragraphs SET text = ?, is_pause = ?, voice_id = ?, voice_name = ?, speed = ?, volume = ?, emotion = ?, updated_at = ? WHERE id = ?",
  ).run(next.text, isPauseOnly(next.text) ? 1 : 0, next.voice_id, next.voice_name, next.speed, next.volume, next.emotion, now(), id);
  return getParagraph(id);
}

function deleteVersionFiles(paragraphId: string) {
  const vs = db.prepare("SELECT file_path FROM audio_versions WHERE paragraph_id = ?").all(paragraphId) as { file_path: string }[];
  for (const v of vs) fs.rmSync(path.join(AUDIO_DIR, v.file_path), { force: true });
}

export function deleteParagraph(id: string) {
  const p = getParagraph(id);
  deleteVersionFiles(id);
  db.prepare("DELETE FROM paragraphs WHERE id = ?").run(id);
  renumber("paragraphs", "chapter_id", p.chapter_id);
}

/** Split a paragraph at a character offset. The first part keeps the audio history (now stale). */
export function splitParagraph(id: string, at: number): string {
  const p = getParagraph(id);
  const a = p.text.slice(0, at).trim();
  const b = p.text.slice(at).trim();
  if (!a || !b) throw new Error("Nothing to split at this position");
  let newPid = "";
  db.transaction(() => {
    db.prepare("UPDATE paragraphs SET text = ?, is_pause = ?, updated_at = ? WHERE id = ?").run(a, isPauseOnly(a) ? 1 : 0, now(), id);
    [newPid] = insertParagraphsTx(p.chapter_id, id, [b]);
    copySettings(p, [newPid]);
  })();
  return newPid;
}

function copySettings(from: Paragraph, ids: string[]) {
  const stmt = db.prepare("UPDATE paragraphs SET voice_id = ?, voice_name = ?, speed = ?, volume = ?, emotion = ? WHERE id = ?");
  for (const id of ids) stmt.run(from.voice_id, from.voice_name, from.speed, from.volume, from.emotion, id);
}

/** Paste of several paragraphs into one: texts[0] replaces this paragraph's text, the rest go after it. */
export function expandParagraph(id: string, texts: string[]): string[] {
  const p = getParagraph(id);
  if (!texts.length) throw new Error("Nothing to insert");
  return db.transaction(() => {
    db.prepare("UPDATE paragraphs SET text = ?, is_pause = ?, updated_at = ? WHERE id = ?").run(texts[0], isPauseOnly(texts[0]) ? 1 : 0, now(), id);
    const ids = insertParagraphsTx(p.chapter_id, id, texts.slice(1));
    copySettings(p, ids.filter((_, i) => !isPauseOnly(texts[i + 1])));
    return ids;
  })();
}

/** Merge a paragraph into the one before it. Returns the surviving paragraph id. */
export function mergeWithPrevious(id: string): string {
  const p = getParagraph(id);
  const prev = db
    .prepare("SELECT id, text FROM paragraphs WHERE chapter_id = ? AND position < ? ORDER BY position DESC LIMIT 1")
    .get(p.chapter_id, p.position) as { id: string; text: string } | undefined;
  if (!prev) throw new Error("No previous paragraph to merge with");
  const joined = isPauseOnly(prev.text) && isPauseOnly(p.text) ? prev.text + p.text : `${prev.text} ${p.text}`.trim();
  db.prepare("UPDATE paragraphs SET text = ?, is_pause = ?, updated_at = ? WHERE id = ?").run(joined, isPauseOnly(joined) ? 1 : 0, now(), prev.id);
  deleteParagraph(id);
  return prev.id;
}

export function setStatus(id: string, status: ParagraphStatus, error: string | null = null) {
  db.prepare("UPDATE paragraphs SET status = ?, error = ? WHERE id = ?").run(status, error, id);
  const projectId = projectIdOfParagraph(id);
  emit(projectId, { type: "paragraph", paragraph: getParagraph(id) });
}

// ---------------------------------------------------------------- versions

export function listVersions(paragraphId: string): AudioVersion[] {
  return db
    .prepare("SELECT * FROM audio_versions WHERE paragraph_id = ? ORDER BY version_no DESC")
    .all(paragraphId) as AudioVersion[];
}

export function getVersion(id: string): AudioVersion {
  return must(db.prepare("SELECT * FROM audio_versions WHERE id = ?").get(id) as AudioVersion | undefined, "Audio version");
}

export function addVersion(
  paragraphId: string,
  v: { file_path: string; duration_ms: number; model_id: string; voice_id: string; text_snapshot: string; settings: object },
): AudioVersion {
  const id = newId();
  const { n } = db
    .prepare("SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM audio_versions WHERE paragraph_id = ?")
    .get(paragraphId) as { n: number };
  db.transaction(() => {
    db.prepare(
      `INSERT INTO audio_versions (id, paragraph_id, version_no, file_path, duration_ms, model_id, voice_id, text_snapshot, settings_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, paragraphId, n, v.file_path, v.duration_ms, v.model_id, v.voice_id, v.text_snapshot, JSON.stringify(v.settings), now());
    db.prepare("UPDATE paragraphs SET active_version_id = ?, status = 'done', error = NULL WHERE id = ?").run(id, paragraphId);
  })();
  return getVersion(id);
}

export function nextVersionNo(paragraphId: string): number {
  const { n } = db
    .prepare("SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM audio_versions WHERE paragraph_id = ?")
    .get(paragraphId) as { n: number };
  return n;
}

export function activateVersion(paragraphId: string, versionId: string): Paragraph {
  const v = getVersion(versionId);
  if (v.paragraph_id !== paragraphId) throw new Error("Version belongs to another paragraph");
  db.prepare("UPDATE paragraphs SET active_version_id = ?, status = 'done', error = NULL WHERE id = ?").run(versionId, paragraphId);
  const p = getParagraph(paragraphId);
  emit(projectIdOfParagraph(paragraphId), { type: "paragraph", paragraph: p });
  return p;
}

// ---------------------------------------------------------------- helpers

/** A paragraph needs (re)generation when it has speakable text and no up-to-date audio. */
export function needsGeneration(p: Paragraph): boolean {
  if (!p.text.trim() || isPauseOnly(p.text)) return false;
  if (p.status === "queued" || p.status === "generating") return false;
  return !p.active_version_id || p.active_text !== p.text || p.status === "error";
}

/** Voice resolution: paragraph → chapter → project. */
export function resolveVoice(p: Paragraph, c: Chapter, pr: Project): { id: string | null; name: string | null } {
  if (p.voice_id) return { id: p.voice_id, name: p.voice_name };
  if (c.voice_id) return { id: c.voice_id, name: c.voice_name };
  return { id: pr.voice_id, name: pr.voice_name };
}

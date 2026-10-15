import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { isPauseOnly } from "./text";

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(process.cwd(), "data"));
export const AUDIO_DIR = path.join(DATA_DIR, "audio");
export const CACHE_DIR = path.join(DATA_DIR, "cache");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  voice_id TEXT,
  voice_name TEXT,
  model_id TEXT NOT NULL DEFAULT 'sonic-3.6',
  language TEXT NOT NULL DEFAULT 'hi',
  speed REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  voice_id TEXT,
  voice_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id, position);
CREATE TABLE IF NOT EXISTS paragraphs (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  voice_id TEXT,
  voice_name TEXT,
  speed REAL,
  emotion TEXT,
  is_pause INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idle',
  error TEXT,
  active_version_id TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paragraphs_chapter ON paragraphs(chapter_id, position);
CREATE TABLE IF NOT EXISTS audio_versions (
  id TEXT PRIMARY KEY,
  paragraph_id TEXT NOT NULL REFERENCES paragraphs(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  text_snapshot TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_paragraph ON audio_versions(paragraph_id, version_no);
CREATE TABLE IF NOT EXISTS voice_favorites (
  voice_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  is_cloned INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT PRIMARY KEY,
  characters INTEGER NOT NULL DEFAULT 0
);
`;

/** Small additive migrations for databases created by older versions. */
function migrate(db: Database.Database) {
  const addCol = (table: string, col: string, def: string) => {
    const have = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
    if (!have) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  // Generation settings (existing projects keep 44.1 kHz / 16-bit; new projects get 48 kHz / float, see createProject).
  addCol("projects", "emotion", "TEXT");
  addCol("projects", "volume", "REAL NOT NULL DEFAULT 1");
  addCol("projects", "sample_rate", "INTEGER NOT NULL DEFAULT 44100");
  addCol("projects", "bit_depth", "TEXT NOT NULL DEFAULT '16'");
  addCol("projects", "paragraph_gap_ms", "INTEGER NOT NULL DEFAULT 450");
  addCol("paragraphs", "volume", "REAL");
  const cols = (db.prepare("PRAGMA table_info(paragraphs)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("is_pause")) {
    db.exec("ALTER TABLE paragraphs ADD COLUMN is_pause INTEGER NOT NULL DEFAULT 0");
    const rows = db.prepare("SELECT id, text FROM paragraphs").all() as { id: string; text: string }[];
    const set = db.prepare("UPDATE paragraphs SET is_pause = 1 WHERE id = ?");
    db.transaction(() => rows.forEach((r) => isPauseOnly(r.text) && set.run(r.id)))();
  }
}

function open(): Database.Database {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "studio.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  // Jobs do not survive a restart: anything that was in flight goes back to idle.
  db.prepare(
    "UPDATE paragraphs SET status = 'idle' WHERE status IN ('queued', 'generating')",
  ).run();
  return db;
}

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __studioDb?: Database.Database };
export const db: Database.Database = g.__studioDb ?? (g.__studioDb = open());

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export function getSetting(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string | null) {
  if (value === null || value === "") {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  } else {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(key, value);
  }
}

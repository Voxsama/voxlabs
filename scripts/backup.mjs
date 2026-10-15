// Safe database snapshot while the app is running.
// Usage: node scripts/backup.mjs [backup-folder]   (default: <DATA_DIR>/backups)
// Keeps the 14 newest snapshots. Copy the audio/ folder with your normal backup tool (rsync, robocopy, ...).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const Database = createRequire(import.meta.url)("better-sqlite3");
const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
const dest = path.resolve(process.argv[2] || path.join(dataDir, "backups"));
fs.mkdirSync(dest, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const out = path.join(dest, `studio-${stamp}.db`);
const db = new Database(path.join(dataDir, "studio.db"), { readonly: true });
await db.backup(out);
db.close();
const old = fs.readdirSync(dest).filter((f) => /^studio-.*\.db$/.test(f)).sort().reverse().slice(14);
for (const f of old) fs.rmSync(path.join(dest, f));
console.log(`Backed up database to ${out}`);

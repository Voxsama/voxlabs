// Characters this app sent to Cartesia, per UTC day and per project. The credits badge uses
// the day totals when no admin key is saved; the projects list shows the per-project totals.
import { db } from "./db";

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Count characters of a successful TTS request (Cartesia charges about 1 credit per character). */
export function recordUsage(characters: number, projectId?: string) {
  if (!(characters > 0)) return;
  const d = day(new Date());
  db.prepare(
    "INSERT INTO usage_daily (day, characters) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET characters = characters + excluded.characters",
  ).run(d, characters);
  if (projectId) {
    db.prepare(
      "INSERT INTO usage_project (project_id, day, characters) VALUES (?, ?, ?) ON CONFLICT(project_id, day) DO UPDATE SET characters = characters + excluded.characters",
    ).run(projectId, d, characters);
  }
}

/** Characters sent on the UTC days from `start` (inclusive) to `end` (exclusive). */
export function localUsage(start: Date, end: Date): number {
  const row = db.prepare("SELECT COALESCE(SUM(characters), 0) AS n FROM usage_daily WHERE day >= ? AND day < ?").get(day(start), day(end)) as { n: number };
  return row.n;
}

/** Per-project character totals for a UTC day range; a project with no recorded usage is omitted. */
export function projectUsage(start: Date, end: Date): Map<string, number> {
  const rows = db
    .prepare("SELECT project_id, COALESCE(SUM(characters), 0) AS n FROM usage_project WHERE day >= ? AND day < ? GROUP BY project_id")
    .all(day(start), day(end)) as { project_id: string; n: number }[];
  return new Map(rows.map((r) => [r.project_id, r.n]));
}

/** All-time per-project character total; a project with no recorded usage is omitted. */
export function projectUsageAllTime(): Map<string, number> {
  const rows = db
    .prepare("SELECT project_id, COALESCE(SUM(characters), 0) AS n FROM usage_project GROUP BY project_id")
    .all() as { project_id: string; n: number }[];
  return new Map(rows.map((r) => [r.project_id, r.n]));
}

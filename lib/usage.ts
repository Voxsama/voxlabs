// Characters this app sent to Cartesia, per UTC day. The credits badge uses it when no admin key is saved.
import { db } from "./db";

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Count characters of a successful TTS request (Cartesia charges about 1 credit per character). */
export function recordUsage(characters: number) {
  if (!(characters > 0)) return;
  db.prepare(
    "INSERT INTO usage_daily (day, characters) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET characters = characters + excluded.characters",
  ).run(day(new Date()), characters);
}

/** Characters sent on the UTC days from `start` (inclusive) to `end` (exclusive). */
export function localUsage(start: Date, end: Date): number {
  const row = db.prepare("SELECT COALESCE(SUM(characters), 0) AS n FROM usage_daily WHERE day >= ? AND day < ?").get(day(start), day(end)) as { n: number };
  return row.n;
}

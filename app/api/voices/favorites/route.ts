import { db, now } from "@/lib/db";
import { body, handle, json } from "@/lib/http";
import type { FavoriteVoice } from "@/lib/types";

export const GET = handle(async (_req: Request) =>
  json(db.prepare("SELECT * FROM voice_favorites ORDER BY is_cloned DESC, name COLLATE NOCASE").all() as FavoriteVoice[]),
);

/** Star a voice. body: { voice_id, name, meta?, is_cloned? } */
export const POST = handle(async (req: Request) => {
  const b = await body<{ voice_id: string; name: string; meta?: object; is_cloned?: boolean }>(req);
  if (!b.voice_id) throw new Error("voice_id is required");
  db.prepare(
    `INSERT INTO voice_favorites (voice_id, name, meta_json, is_cloned, added_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(voice_id) DO UPDATE SET name = excluded.name, meta_json = excluded.meta_json`,
  ).run(b.voice_id, b.name || b.voice_id, JSON.stringify(b.meta ?? {}), b.is_cloned ? 1 : 0, now());
  return json({ ok: true });
});

/** Unstar. ?id=voiceId */
export const DELETE = handle(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  db.prepare("DELETE FROM voice_favorites WHERE voice_id = ?").run(id);
  return json({ ok: true });
});

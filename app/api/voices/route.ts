import { listVoices } from "@/lib/cartesia";
import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Proxy to Cartesia's voice list. ?q=&language=&gender=&mine=1&cursor= */
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const r = await listVoices({
    q: sp.get("q") || undefined,
    language: sp.get("language") || undefined,
    gender: sp.get("gender") || undefined,
    isOwner: sp.get("mine") === "1",
    limit: Number(sp.get("limit") || 48),
    startingAfter: sp.get("cursor") || undefined,
  });
  const favs = new Set((db.prepare("SELECT voice_id FROM voice_favorites").all() as { voice_id: string }[]).map((r) => r.voice_id));
  const last = r.voices[r.voices.length - 1];
  return json({
    voices: r.voices.map((v) => ({ ...v, favorite: favs.has(v.id) })),
    hasMore: r.hasMore,
    cursor: r.hasMore ? r.nextPage || last?.id || null : null,
  });
});

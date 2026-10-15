import { deleteVoice, getVoice } from "@/lib/cartesia";
import { db } from "@/lib/db";
import { handle, json, type Ctx } from "@/lib/http";

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(await getVoice(id));
});

/** Delete a voice you own (cloned) from Cartesia. */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteVoice(id);
  db.prepare("DELETE FROM voice_favorites WHERE voice_id = ?").run(id);
  return json({ ok: true });
});

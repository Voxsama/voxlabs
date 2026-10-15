import { addVoiceAccents } from "@/lib/cartesia";
import { body, handle, json, type Ctx } from "@/lib/http";

/** Let a cloned voice speak more accents/languages. body: { accents: string[] } */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { accents } = await body<{ accents: string[] }>(req);
  if (!accents?.length) throw new Error("Pick at least one accent");
  return json(await addVoiceAccents(id, accents));
});

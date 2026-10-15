import { body, handle, json, type Ctx } from "@/lib/http";
import { listChapters, reorderChapters } from "@/lib/store";

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { ids } = await body<{ ids: string[] }>(req);
  reorderChapters(id, ids || []);
  return json(listChapters(id));
});

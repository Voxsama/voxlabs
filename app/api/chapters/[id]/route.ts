import { body, handle, json, type Ctx } from "@/lib/http";
import { deleteChapter, getChapter, listParagraphs, updateChapter } from "@/lib/store";

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json({ chapter: getChapter(id), paragraphs: listParagraphs(id) });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(updateChapter(id, await body(req)));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  deleteChapter(id);
  return json({ ok: true });
});

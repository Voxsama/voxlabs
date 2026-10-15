import { body, handle, json, type Ctx } from "@/lib/http";
import { deleteParagraph, getParagraph, updateParagraph, type ParagraphPatch } from "@/lib/store";

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(getParagraph(id));
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(updateParagraph(id, await body<ParagraphPatch>(req)));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  deleteParagraph(id);
  return json({ ok: true });
});

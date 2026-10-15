import { handle, json, type Ctx } from "@/lib/http";
import { getParagraph, listParagraphs, mergeWithPrevious } from "@/lib/store";

/** Merge this paragraph into the previous one. */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { chapter_id } = getParagraph(id);
  const keptId = mergeWithPrevious(id);
  return json({ id: keptId, paragraphs: listParagraphs(chapter_id) });
});

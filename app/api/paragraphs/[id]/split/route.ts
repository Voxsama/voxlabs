import { body, handle, json, type Ctx } from "@/lib/http";
import { getParagraph, listParagraphs, splitParagraph, updateParagraph } from "@/lib/store";

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { at, text } = await body<{ at: number; text?: string }>(req);
  const p = getParagraph(id);
  // Save any unsaved edit first so the split uses the text the user sees.
  if (typeof text === "string" && text !== p.text) updateParagraph(id, { text });
  const newId = splitParagraph(id, Number(at));
  return json({ id: newId, paragraphs: listParagraphs(p.chapter_id) });
});

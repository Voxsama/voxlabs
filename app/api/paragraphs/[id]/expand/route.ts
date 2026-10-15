import { body, handle, json, type Ctx } from "@/lib/http";
import { expandParagraph, getParagraph, listParagraphs } from "@/lib/store";

/** Multi-line paste: texts[0] replaces this paragraph's text, the rest are inserted after it. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { texts } = await body<{ texts?: unknown }>(req);
  if (!Array.isArray(texts) || !texts.length || texts.some((t) => typeof t !== "string")) throw new Error("texts must be a non-empty list of strings");
  const { chapter_id } = getParagraph(id);
  const ids = expandParagraph(id, texts as string[]);
  return json({ id: ids.at(-1) ?? id, paragraphs: listParagraphs(chapter_id) });
});

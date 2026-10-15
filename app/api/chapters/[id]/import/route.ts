import { body, handle, json, type Ctx } from "@/lib/http";
import { insertParagraphs, listParagraphs, replaceMiddleParagraphs, replaceParagraphs } from "@/lib/store";
import { splitIntoParagraphs, type SplitMode } from "@/lib/text";

/** Paste text into a chapter. mode "append" (default), "replace", or "middle" (keep first and last paragraph). */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body<{ text: string; mode?: "append" | "replace" | "middle"; split?: SplitMode }>(req);
  const texts = splitIntoParagraphs(b.text || "", b.split || "line");
  if (!texts.length) throw new Error("No text found");
  if (b.mode === "replace") replaceParagraphs(id, texts);
  else if (b.mode === "middle") replaceMiddleParagraphs(id, texts);
  else insertParagraphs(id, null, texts);
  return json({ added: texts.length, paragraphs: listParagraphs(id) });
});

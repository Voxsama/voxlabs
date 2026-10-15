import { body, handle, json, type Ctx } from "@/lib/http";
import { createChapter } from "@/lib/store";
import { splitIntoParagraphs, type SplitMode } from "@/lib/text";

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body<{ name?: string; text?: string; split?: SplitMode }>(req);
  const texts = b.text ? splitIntoParagraphs(b.text, b.split || "line") : [];
  return json(createChapter(id, b.name || "", texts), 201);
});

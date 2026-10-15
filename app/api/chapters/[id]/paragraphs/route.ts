import { body, handle, json, type Ctx } from "@/lib/http";
import { insertParagraphs, listParagraphs } from "@/lib/store";
import { breakTag } from "@/lib/text";

/** Insert a paragraph. body: { afterId?: string | "start", beforeId?: string, text?: string, pauseMs?: number } */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body<{ afterId?: string | null; beforeId?: string | null; text?: string; pauseMs?: number }>(req);
  let text = b.text ?? "";
  if (b.pauseMs) {
    // Pause rows are made of 1s tags (like ElevenLabs), plus a remainder tag if needed.
    const whole = Math.floor(b.pauseMs / 1000);
    const rest = b.pauseMs % 1000;
    text = breakTag(1000).repeat(whole) + (rest ? breakTag(rest) : "");
  }
  const [newId] = insertParagraphs(id, b.afterId ?? null, [text], b.beforeId);
  return json({ id: newId, paragraphs: listParagraphs(id) }, 201);
});

import { body, handle, json, type Ctx } from "@/lib/http";
import { cancelChapter, enqueueChapter } from "@/lib/jobs";

/** Generate every paragraph that has no audio or out-of-date audio. body: { all?: true } regenerates everything. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body<{ all?: boolean }>(req);
  return json({ queued: enqueueChapter(id, { all: Boolean(b.all) }) });
});

/** Stop: drop queued paragraphs (ones already generating will finish). */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json({ cancelled: cancelChapter(id) });
});

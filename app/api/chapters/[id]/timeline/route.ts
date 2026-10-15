import { renderChapter } from "@/lib/chapterAudio";
import { handle, json, type Ctx } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const r = renderChapter(id);
  return json({ key: r.key, hasAudio: Boolean(r.file), durationMs: r.durationMs, timeline: r.timeline, missing: r.missing.length });
});

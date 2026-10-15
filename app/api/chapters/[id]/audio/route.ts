import { renderChapter } from "@/lib/chapterAudio";
import { handle, json, serveFile, type Ctx } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Merged WAV of all generated paragraphs of a chapter (pauses as silence). Supports Range for seeking. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const r = renderChapter(id);
  if (!r.file) return json({ error: "Nothing generated in this chapter yet" }, 404);
  return serveFile(req, r.file, "audio/wav");
});

import { handle, json, type Ctx } from "@/lib/http";
import { filesToChapters } from "@/lib/importer";
import { createChapter, getProject, listChapters } from "@/lib/store";
import { splitIntoParagraphs, type SplitMode } from "@/lib/text";

/** Bulk import: each .txt/.docx file (or file inside a .zip) becomes a chapter. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  getProject(id);
  const form = await req.formData();
  const split = String(form.get("split") || "line") as SplitMode;
  const files = await Promise.all(
    form.getAll("files").filter((f): f is File => typeof f !== "string").map(async (f) => ({ name: f.name, data: Buffer.from(await f.arrayBuffer()) })),
  );
  const { chapters, skipped } = await filesToChapters(files);
  for (const c of chapters) createChapter(id, c.name, splitIntoParagraphs(c.text, split));
  return json({ imported: chapters.length, skipped, chapters: listChapters(id) });
});

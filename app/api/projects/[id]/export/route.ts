import { checkExport, runExport, type ExportRequest } from "@/lib/export";
import { body, handle, json, serveFile, type Ctx } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET ?chapters=a,b -> readiness check. POST -> build and download the export. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const ids = new URL(req.url).searchParams.get("chapters");
  return json(checkExport({ projectId: id, chapterIds: ids ? ids.split(",").filter(Boolean) : undefined }));
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body<Omit<ExportRequest, "projectId">>(req);
  const result = await runExport({
    projectId: id,
    chapterIds: b.chapterIds,
    structure: b.structure || "chapters",
    format: b.format || "wav",
    mp3Kbps: b.mp3Kbps,
    includeScript: b.includeScript,
  });
  const res = serveFile(new Request(req.url), result.file, result.mime, result.filename);
  // Remove temp files once the download stream finishes (or shortly after, as a fallback).
  setTimeout(() => {
    try {
      result.cleanup();
    } catch {
      /* file still locked (Windows); the OS temp cleaner will remove it */
    }
  }, 10 * 60 * 1000);
  return res;
});

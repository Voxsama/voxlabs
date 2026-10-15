import { body, handle, json } from "@/lib/http";
import { filesToChapters } from "@/lib/importer";
import { createChapter, createProject, listProjects } from "@/lib/store";
import { splitIntoParagraphs, type SplitMode } from "@/lib/text";
import type { Project } from "@/lib/types";

export const GET = handle(async (_req: Request) => json(listProjects()));

/** JSON body creates an empty project. multipart/form-data may also carry `files` to import as chapters. */
export const POST = handle(async (req: Request) => {
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const form = await req.formData();
    const fields = JSON.parse(String(form.get("project") || "{}")) as Partial<Project> & { name: string };
    const split = (String(form.get("split") || "line") as SplitMode);
    const project = createProject(fields);
    const files = await Promise.all(
      form.getAll("files").filter((f): f is File => typeof f !== "string").map(async (f) => ({ name: f.name, data: Buffer.from(await f.arrayBuffer()) })),
    );
    const { chapters, skipped } = await filesToChapters(files);
    for (const c of chapters) createChapter(project.id, c.name, splitIntoParagraphs(c.text, split));
    return json({ project, imported: chapters.length, skipped }, 201);
  }
  const b = await body<Partial<Project> & { name: string }>(req);
  return json({ project: createProject({ ...b, name: b.name || "Untitled project" }), imported: 0, skipped: [] }, 201);
});

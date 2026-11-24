import { body, handle, json, type Ctx } from "@/lib/http";
import { archiveProject, deleteProject, getProject, listChapters, unarchiveProject, updateProject } from "@/lib/store";
import type { Project } from "@/lib/types";

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json({ project: getProject(id), chapters: listChapters(id) });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body<Partial<Project> & { archive?: boolean }>(req);
  // archived_at is not a client-writable field: it is set only by the app's own timestamp.
  if (b.archive === true) return json(archiveProject(id));
  if (b.archive === false) return json(unarchiveProject(id));
  return json(updateProject(id, b));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  deleteProject(id);
  return json({ ok: true });
});

import { body, handle, json, type Ctx } from "@/lib/http";
import { deleteProject, getProject, listChapters, updateProject } from "@/lib/store";
import type { Project } from "@/lib/types";

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json({ project: getProject(id), chapters: listChapters(id) });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(updateProject(id, await body<Partial<Project>>(req)));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  deleteProject(id);
  return json({ ok: true });
});

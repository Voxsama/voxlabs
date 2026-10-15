import { requireAdmin } from "@/lib/auth";
import { body, handle, json } from "@/lib/http";
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from "@/lib/store";
import type { TemplateInput } from "@/lib/types";

/** Any user: list templates (the new-project dialog needs them). */
export const GET = handle(async (_req: Request) => json(listTemplates()));

/** Admin: add a template. body: TemplateInput */
export const POST = handle(async (req: Request) => {
  requireAdmin(req);
  return json(createTemplate(await body<TemplateInput>(req)), 201);
});

/** Admin: edit a template. body: { id, ...TemplateInput } */
export const PUT = handle(async (req: Request) => {
  requireAdmin(req);
  const { id, ...patch } = await body<Partial<TemplateInput> & { id?: string }>(req);
  return json(updateTemplate(id || "", patch));
});

/** Admin: delete a template. ?id= */
export const DELETE = handle(async (req: Request) => {
  requireAdmin(req);
  deleteTemplate(new URL(req.url).searchParams.get("id") || "");
  return json({ ok: true });
});

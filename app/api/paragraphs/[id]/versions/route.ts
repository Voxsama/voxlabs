import { body, handle, json, type Ctx } from "@/lib/http";
import { activateVersion, listVersions } from "@/lib/store";

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(listVersions(id));
});

/** Make an older version the active one. body: { versionId } */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { versionId } = await body<{ versionId: string }>(req);
  return json(activateVersion(id, versionId));
});

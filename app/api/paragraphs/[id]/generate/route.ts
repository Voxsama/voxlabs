import { handle, json, type Ctx } from "@/lib/http";
import { enqueue } from "@/lib/jobs";
import { getParagraph } from "@/lib/store";

/** (Re)generate one paragraph. Always creates a new version. */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const queued = enqueue([id]);
  return json({ queued, paragraph: getParagraph(id) });
});

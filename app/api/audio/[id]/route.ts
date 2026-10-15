import path from "node:path";
import { AUDIO_DIR } from "@/lib/db";
import { handle, serveFile, type Ctx } from "@/lib/http";
import { getVersion } from "@/lib/store";

/** Audio file of one paragraph version. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const v = getVersion(id);
  return serveFile(req, path.join(AUDIO_DIR, v.file_path), "audio/wav");
});

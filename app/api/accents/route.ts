import { listAccents } from "@/lib/cartesia";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  return json(await listAccents({ language: sp.get("language") || undefined, localizable: sp.get("localizable") === "1" }));
});

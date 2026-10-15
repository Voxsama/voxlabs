import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";
import { body, handle, json } from "@/lib/http";
import { queueStats } from "@/lib/jobs";

function state() {
  const stored = getSetting("cartesia_api_key");
  const env = process.env.CARTESIA_API_KEY;
  const key = stored || env || "";
  return {
    hasKey: Boolean(key),
    keySource: stored ? "settings" : env ? "env" : null,
    keyPreview: key ? `${key.slice(0, 8)}...${key.slice(-4)}` : null,
    concurrency: queueStats().concurrency,
    queue: queueStats(),
  };
}

export const GET = handle(async (_req: Request) => json(state()));

export const PUT = handle(async (req: Request) => {
  requireAdmin(req);
  const b = await body<{ apiKey?: string | null; concurrency?: number }>(req);
  if ("apiKey" in b) setSetting("cartesia_api_key", b.apiKey ? String(b.apiKey).trim() : null);
  if (b.concurrency != null) setSetting("gen_concurrency", String(Math.min(10, Math.max(1, Number(b.concurrency) || 3))));
  return json(state());
});

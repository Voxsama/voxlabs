import { requireAdmin } from "@/lib/auth";
import { getAdminKey } from "@/lib/cartesia";
import { getSetting, setSetting } from "@/lib/db";
import { body, handle, json } from "@/lib/http";
import { queueStats } from "@/lib/jobs";

const preview = (key: string) => `${key.slice(0, 8)}...${key.slice(-4)}`;

function state() {
  const stored = getSetting("cartesia_api_key");
  const env = process.env.CARTESIA_API_KEY;
  const key = stored || env || "";
  const adminKey = getAdminKey();
  return {
    hasKey: Boolean(key),
    keySource: stored ? "settings" : env ? "env" : null,
    keyPreview: key ? preview(key) : null,
    hasAdminKey: Boolean(adminKey),
    adminKeySource: getSetting("cartesia_admin_key") ? "settings" : adminKey ? "env" : null,
    adminKeyPreview: adminKey ? preview(adminKey) : null,
    planCredits: Number(getSetting("plan_credits")) || null,
    renewDay: Number(getSetting("plan_renew_day")) || 1,
    concurrency: queueStats().concurrency,
    queue: queueStats(),
  };
}

export const GET = handle(async (_req: Request) => json(state()));

export const PUT = handle(async (req: Request) => {
  requireAdmin(req);
  const b = await body<{ apiKey?: string | null; adminKey?: string | null; planCredits?: number | null; renewDay?: number; concurrency?: number }>(req);
  if ("apiKey" in b) setSetting("cartesia_api_key", b.apiKey ? String(b.apiKey).trim() : null);
  if ("adminKey" in b) setSetting("cartesia_admin_key", b.adminKey ? String(b.adminKey).trim() : null);
  if ("planCredits" in b) {
    const n = Math.round(Number(b.planCredits));
    setSetting("plan_credits", n > 0 ? String(n) : null);
  }
  if (b.renewDay != null) setSetting("plan_renew_day", String(Math.min(31, Math.max(1, Math.round(Number(b.renewDay)) || 1))));
  if (b.concurrency != null) setSetting("gen_concurrency", String(Math.min(10, Math.max(1, Number(b.concurrency) || 3))));
  return json(state());
});

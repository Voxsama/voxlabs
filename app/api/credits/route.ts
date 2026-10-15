import { creditUsage, getAdminKey } from "@/lib/cartesia";
import { billingCycle, type CreditsInfo } from "@/lib/credits";
import { getSetting } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { localUsage } from "@/lib/usage";

// Every open browser polls this, so Cartesia is asked at most once a minute.
const TTL_MS = 60_000;
const g = globalThis as unknown as { __creditsCache?: { id: string; at: number; used?: number; error?: string } };

async function cartesiaUsed(adminKey: string, start: Date): Promise<number> {
  const id = `${adminKey}|${start.toISOString()}`;
  const c = g.__creditsCache;
  if (c && c.id === id && Date.now() - c.at < TTL_MS) {
    if (c.error) throw new Error(c.error);
    return c.used!;
  }
  try {
    const used = await creditUsage(adminKey, start);
    g.__creditsCache = { id, at: Date.now(), used };
    return used;
  } catch (e) {
    g.__creditsCache = { id, at: Date.now(), error: (e as Error).message };
    throw e;
  }
}

export const GET = handle(async () => {
  const plan = Number(getSetting("plan_credits")) || null;
  const { start, end } = billingCycle(Number(getSetting("plan_renew_day")) || 1);
  const adminKey = getAdminKey();
  const info: CreditsInfo = {
    used: localUsage(start, end),
    plan,
    left: null,
    source: "app",
    cycleStart: start.toISOString(),
    cycleEnd: end.toISOString(),
    warning: null,
  };
  if (adminKey) {
    try {
      info.used = await cartesiaUsed(adminKey, start);
      info.source = "cartesia";
    } catch (e) {
      info.warning = `Could not read usage from Cartesia, showing this app's own count. ${(e as Error).message}`;
    }
  }
  if (plan != null) info.left = plan - info.used;
  return json(info);
});

// Credits badge: billing cycle maths and the /api/credits response. Client-safe.

export interface CreditsInfo {
  used: number;
  /** Monthly plan credits entered in Settings, or null when not set. */
  plan: number | null;
  /** plan - used. Negative when the plan is used up and overages are on. */
  left: number | null;
  /** "cartesia": exact usage from the admin key. "app": characters counted by this app. */
  source: "cartesia" | "app";
  cycleStart: string;
  cycleEnd: string;
  warning: string | null;
}

/**
 * The billing cycle that contains `now`, from the last renewal to the next one (UTC days).
 * A renewal day past the end of a short month falls on that month's last day.
 */
export function billingCycle(renewDay: number, now = new Date()): { start: Date; end: Date } {
  const d = Math.min(31, Math.max(1, Math.round(renewDay) || 1));
  const at = (y: number, m: number) => new Date(Date.UTC(y, m, Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = at(y, m) <= now ? at(y, m) : at(y, m - 1);
  return { start, end: at(start.getUTCFullYear(), start.getUTCMonth() + 1) };
}

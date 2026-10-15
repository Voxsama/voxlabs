"use client";
import { useCallback, useEffect, useState } from "react";
import type { CreditsInfo } from "@/lib/credits";

/** Fire after changing credit settings so the badge refreshes at once. */
export const CREDITS_EVENT = "voxlabs:credits";

const POLL_MS = 30_000;
const fmt = (n: number) => n.toLocaleString();
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function CreditsBadge() {
  const [c, setC] = useState<CreditsInfo | null>(null);
  const load = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    fetch("/api/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setC(d))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    window.addEventListener("focus", load);
    window.addEventListener(CREDITS_EVENT, load);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", load);
      window.removeEventListener(CREDITS_EVENT, load);
    };
  }, [load]);
  if (!c) return null;

  const hasPlan = c.plan != null && c.left != null;
  const ratio = hasPlan ? Math.max(0, c.left!) / c.plan! : 1;
  const tone = !hasPlan ? "text-neutral-100" : ratio <= 0 ? "text-red-400" : ratio < 0.1 ? "text-amber-400" : "text-neutral-100";
  const bar = ratio <= 0 ? "bg-red-500" : ratio < 0.1 ? "bg-amber-500" : "bg-neutral-300";
  const tip = [
    hasPlan ? `Used ${fmt(c.used)} of ${fmt(c.plan!)} credits this cycle` : `Used ${fmt(c.used)} credits since ${date(c.cycleStart)}`,
    hasPlan && c.left! < 0 ? `Over the plan by ${fmt(-c.left!)} (billed as overage if it is turned on)` : null,
    `Renews ${date(c.cycleEnd)}`,
    c.source === "cartesia" ? "Exact usage from Cartesia" : "Counted by this app. A Cartesia admin key in Settings gives exact numbers.",
    hasPlan ? null : "Set your monthly plan credits in Settings to see credits left.",
    c.warning,
  ].filter(Boolean).join("\n");

  return (
    <div className="mb-3 rounded-md border border-neutral-800 px-2 py-1.5" title={tip}>
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>Credits</span>
        {c.warning && <span className="text-amber-400">⚠</span>}
      </div>
      <div className={`tabular-nums font-medium ${tone}`}>
        {hasPlan ? fmt(Math.max(0, c.left!)) : fmt(c.used)} <span className="text-xs font-normal text-neutral-500">{hasPlan ? "left" : "used"}</span>
      </div>
      {hasPlan && (
        <div className="mt-1 h-1 overflow-hidden rounded bg-neutral-800">
          <div className={`h-full ${bar}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

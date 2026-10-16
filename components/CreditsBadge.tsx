"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { CreditsInfo } from "@/lib/credits";

/** Fire after changing credit settings so the badge refreshes at once. */
export const CREDITS_EVENT = "voxlabs:credits";

const POLL_MS = 30_000;
const fmt = (n: number) => n.toLocaleString();
const compact = (n: number) => n.toLocaleString("en", { notation: "compact", maximumFractionDigits: 2 });
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
  const bar = ratio <= 0 ? "bg-red-500" : ratio < 0.1 ? "bg-amber-500" : "bg-accent";
  const tip = [
    hasPlan ? `Used ${fmt(c.used)} of ${fmt(c.plan!)} credits this cycle` : `Used ${fmt(c.used)} credits since ${date(c.cycleStart)}`,
    hasPlan && c.left! < 0 ? `Over the plan by ${fmt(-c.left!)} (billed as overage if it is turned on)` : null,
    `Renews ${date(c.cycleEnd)}`,
    c.source === "cartesia" ? "Exact usage from Cartesia" : "Counted by this app. A Cartesia admin key in Settings gives exact numbers.",
    hasPlan ? null : "Set your monthly plan credits in Settings to see credits left.",
    c.warning,
  ].filter(Boolean).join("\n");

  return (
    <div className="mb-[18px] rounded-(--radius-lg) border border-neutral-800 bg-neutral-900 px-2.5 py-2 paper:border-neutral-700 paper:bg-neutral-800" title={tip}>
      <div className="flex items-center justify-between gap-2">
        <span className="section-label">Credits</span>
        <span className="flex items-center gap-1 text-[11px] text-neutral-500 tabular-nums">
          {c.warning && <AlertTriangle size={12} className="text-amber-400" aria-label="Warning" />}
          {hasPlan && `of ${compact(c.plan!)}`}
        </span>
      </div>
      <div className={`mt-0.5 font-[family-name:var(--font-heading)] text-[15px] font-semibold tabular-nums ${tone}`}>
        {hasPlan ? fmt(Math.max(0, c.left!)) : fmt(c.used)} <span className="font-[family-name:var(--font-body)] text-xs font-normal text-neutral-500">{hasPlan ? "left" : "used"}</span>
      </div>
      {hasPlan && (
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-neutral-700">
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
      )}
      <div className="mt-1.5 text-[11.5px] text-neutral-500">Renews {date(c.cycleEnd)}</div>
    </div>
  );
}

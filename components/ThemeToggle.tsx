"use client";
import { useEffect, useState } from "react";

type Pref = "system" | "studio" | "paper";
const KEY = "voxlabs-theme";
const LIGHT = "(prefers-color-scheme: light)";

function apply(pref: Pref) {
  const theme = pref === "system" ? (matchMedia(LIGHT).matches ? "paper" : "studio") : pref;
  document.documentElement.dataset.theme = theme;
}

/** Theme picker. The bootstrap script in app/layout.tsx applies the stored choice before paint. */
export function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => {
    const v = localStorage.getItem(KEY);
    if (v === "studio" || v === "paper") setPref(v);
  }, []);
  useEffect(() => {
    if (pref !== "system") return;
    const mq = matchMedia(LIGHT);
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);
  const change = (v: Pref) => {
    setPref(v);
    localStorage.setItem(KEY, v);
    apply(v);
  };
  return (
    <select
      className="cursor-pointer rounded-(--radius) border border-transparent bg-transparent py-0.5 text-xs text-neutral-500 hover:border-neutral-700 hover:text-neutral-100"
      aria-label="Theme"
      title="Theme"
      value={pref}
      onChange={(e) => change(e.target.value as Pref)}
    >
      <option value="system">System</option>
      <option value="studio">Studio</option>
      <option value="paper">Paper</option>
    </select>
  );
}

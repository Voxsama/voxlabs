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
    <select className="input py-1 text-xs" aria-label="Theme" value={pref} onChange={(e) => change(e.target.value as Pref)}>
      <option value="system">System</option>
      <option value="studio">Studio (dark)</option>
      <option value="paper">Paper (light)</option>
    </select>
  );
}

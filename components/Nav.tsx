"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CreditsBadge } from "./CreditsBadge";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

interface Me {
  user: { username: string; is_admin: number } | null;
  authDisabled: boolean;
}

export function Nav() {
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/version").then((r) => r.json()).then((v) => setVersion(v.version)).catch(() => {});
  }, []);
  useEffect(() => {
    if (path === "/login") return;
    fetch("/api/auth/me").then((r) => r.json()).then(setMe).catch(() => {});
  }, [path]);
  if (path === "/login") return null;
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };
  const link = (href: string, label: string) => (
    <Link className={`rounded px-2 py-1.5 hover:bg-neutral-800 ${path === href ? "bg-neutral-800" : ""}`} href={href}>{label}</Link>
  );
  return (
    <nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-neutral-800 p-3 text-sm">
      <div className="mb-3 px-2"><Logo className="h-7 w-auto" /></div>
      {me?.user && <CreditsBadge />}
      {link("/", "Projects")}
      {link("/voices", "Voices")}
      {link("/voices/clone", "Clone a voice")}
      {me?.user?.is_admin ? link("/settings", "Settings") : null}
      {!me?.authDisabled && link("/account", me?.user?.is_admin ? "Account & users" : "My account")}
      <div className="mt-auto space-y-1 px-2 text-xs text-neutral-500">
        <ThemeToggle />
        {me?.user && !me.authDisabled && (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate" title={me.user.username}>👤 {me.user.username}</span>
            <button className="hover:text-neutral-100" onClick={logout}>Log out</button>
          </div>
        )}
        {version && <div>Voxlabs v{version}</div>}
      </div>
    </nav>
  );
}

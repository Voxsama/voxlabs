"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Copy, FolderOpen, Mic, Settings, User, type LucideIcon } from "lucide-react";
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
  const link = (href: string, label: string, Icon: LucideIcon) => {
    const on = path === href;
    return (
      <Link
        href={href}
        aria-current={on ? "page" : undefined}
        className={`group flex items-center gap-2.5 rounded-(--radius) px-2 py-[7px] ${on ? "bg-neutral-800 font-medium text-neutral-100 shadow-[inset_2px_0_0_var(--color-accent)] paper:font-semibold paper:text-purple-300" : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"}`}
      >
        <Icon size={16} strokeWidth={1.75} aria-hidden className={on ? "text-accent" : "text-neutral-500 group-hover:text-neutral-400"} />
        {label}
      </Link>
    );
  };
  const user = me?.user && !me.authDisabled ? me.user : null;
  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-neutral-800 px-3 pt-[18px] pb-3.5 paper:border-neutral-700 paper:bg-neutral-900">
      <div className="px-2 pb-4"><Logo className="h-7 w-auto" /></div>
      {me?.user && <CreditsBadge />}
      <div className="flex flex-col gap-px">
        {link("/", "Projects", FolderOpen)}
        {link("/voices", "Voices", Mic)}
        {link("/voices/clone", "Clone a voice", Copy)}
        {me?.user?.is_admin ? link("/settings", "Settings", Settings) : null}
        {!me?.authDisabled && link("/account", me?.user?.is_admin ? "Account & users" : "My account", User)}
      </div>
      <div className="mt-auto border-t border-neutral-800 px-2 pt-3 text-xs text-neutral-500 paper:border-neutral-700">
        {user && (
          <div className="mb-2.5 flex items-center gap-2.5">
            <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-neutral-700 text-xs font-semibold text-neutral-100 uppercase">
              {user.username.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-neutral-100" title={user.username}>{user.username}</div>
              <button className="hover:text-neutral-100 hover:underline" onClick={logout}>Log out</button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="tabular-nums">{version && `Voxlabs v${version}`}</span>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

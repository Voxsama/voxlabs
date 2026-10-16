"use client";
import { useEffect, useState } from "react";
import { ErrorText, Field } from "@/components/ui";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const [setup, setSetup] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        if (j.user) go();
        else setSetup(Boolean(j.needsSetup));
      })
      .catch(() => setSetup(false));
  }, []);

  const go = () => {
    const next = new URLSearchParams(window.location.search).get("next");
    // Only allow local paths as the redirect target.
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (setup && password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    try {
      const res = await fetch(setup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      go();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (setup === null) return null;

  return (
    <div className="flex h-full items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1><Logo className="h-10 w-auto" /></h1>
          <p className="mt-1 text-sm text-neutral-400">
            {setup ? "First start: create the admin account. You can add your team after this." : "Log in to continue."}
          </p>
        </div>
        <Field label="Username">
          <input className="input" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label={setup ? "Password (at least 8 characters)" : "Password"}>
          <input className="input" type="password" autoComplete={setup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {setup && (
          <Field label="Repeat password">
            <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        )}
        <ErrorText error={error} />
        <button className="btn btn-primary w-full justify-center" disabled={busy || !username || !password}>
          {busy ? "..." : setup ? "Create admin account" : "Log in"}
        </button>
      </form>
    </div>
  );
}

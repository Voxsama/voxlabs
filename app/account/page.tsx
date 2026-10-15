"use client";
import { useCallback, useEffect, useState } from "react";
import { ErrorText, Field } from "@/components/ui";
import { api } from "@/lib/api";

interface User {
  id: string;
  username: string;
  is_admin: number;
  created_at: string;
}

export default function AccountPage() {
  const [me, setMe] = useState<User | null>(null);
  useEffect(() => {
    api<{ user: User }>("/api/auth/me").then((r) => setMe(r.user)).catch(() => {});
  }, []);
  if (!me) return null;
  return (
    <div className="h-full overflow-auto p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">{me.is_admin ? "Account & users" : "My account"}</h1>
        <ChangePassword username={me.username} />
        {me.is_admin ? <Users meId={me.id} /> : null}
      </div>
    </div>
  );
}

function ChangePassword({ username }: { username: string }) {
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setMsg(null);
    setError(null);
    try {
      await api("/api/users/me", { method: "PATCH", json: { current, password: pw } });
      setMsg("Password changed");
      setCurrent("");
      setPw("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="card space-y-3 p-5">
      <h2 className="font-medium">Change my password <span className="text-sm font-normal text-neutral-500">({username})</span></h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Current password">
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password (8+ characters)">
          <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
      </div>
      <button className="btn" disabled={!current || pw.length < 8} onClick={save}>Change password</button>
      {msg && <div className="text-sm text-green-400">{msg}</div>}
      <ErrorText error={error} />
    </div>
  );
}

function Users({ meId }: { meId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<User[]>("/api/users").then(setUsers).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const add = () =>
    run(async () => {
      await api("/api/users", { method: "POST", json: { username, password, is_admin: isAdmin } });
      setUsername("");
      setPassword("");
      setIsAdmin(false);
    });

  return (
    <div className="card space-y-4 p-5">
      <h2 className="font-medium">Team members</h2>
      <p className="text-sm text-neutral-400">Everyone shares the same projects and voices. Only admins can change the API key and manage users.</p>
      <div className="divide-y divide-neutral-800 rounded-md border border-neutral-800">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <div className="flex-1">
              {u.username} {u.is_admin ? <span className="ml-1 rounded bg-purple-900 px-1 text-[10px]">admin</span> : null}
              {u.id === meId && <span className="ml-1 text-xs text-neutral-500">(you)</span>}
            </div>
            <button
              className="btn btn-sm"
              onClick={() => {
                const pw = prompt(`New password for ${u.username} (8+ characters)`);
                if (pw) run(() => api("/api/users", { method: "PATCH", json: { id: u.id, password: pw } }));
              }}
            >
              Reset password
            </button>
            {u.id !== meId && (
              <>
                <button className="btn btn-sm" onClick={() => run(() => api("/api/users", { method: "PATCH", json: { id: u.id, is_admin: !u.is_admin } }))}>
                  {u.is_admin ? "Remove admin" : "Make admin"}
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => confirm(`Delete user ${u.username}? Their work stays in the projects.`) && run(() => api(`/api/users?id=${u.id}`, { method: "DELETE" }))}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2">
        <Field label="New username">
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Password (8+ characters)">
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <label className="flex items-center gap-1 pb-2 text-sm">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> Admin
        </label>
        <button className="btn btn-primary" disabled={!username || password.length < 8} onClick={add}>Add user</button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

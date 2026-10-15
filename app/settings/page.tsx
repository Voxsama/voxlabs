"use client";
import { useEffect, useState } from "react";
import { CREDITS_EVENT } from "@/components/CreditsBadge";
import { ErrorText, Field } from "@/components/ui";
import { api } from "@/lib/api";
import type { CreditsInfo } from "@/lib/credits";

interface SettingsState {
  hasKey: boolean;
  keySource: "settings" | "env" | null;
  keyPreview: string | null;
  hasAdminKey: boolean;
  adminKeySource: "settings" | "env" | null;
  adminKeyPreview: string | null;
  planCredits: number | null;
  renewDay: number;
  concurrency: number;
}

export default function SettingsPage() {
  const [s, setS] = useState<SettingsState | null>(null);
  const [key, setKey] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [plan, setPlan] = useState("");
  const [renewDay, setRenewDay] = useState(1);
  const [conc, setConc] = useState(3);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<{ version: string; commit: string | null } | null>(null);

  useEffect(() => {
    api<SettingsState>("/api/settings").then((r) => {
      setS(r);
      setConc(r.concurrency);
      setPlan(r.planCredits ? String(r.planCredits) : "");
      setRenewDay(r.renewDay);
    });
    api<{ version: string; commit: string | null }>("/api/version").then(setVersion).catch(() => {});
  }, []);

  const save = async (patch: object) => {
    setError(null);
    setMsg(null);
    try {
      const r = await api<SettingsState>("/api/settings", { method: "PUT", json: patch });
      setS(r);
      setKey("");
      setAdminKey("");
      setMsg("Saved");
      window.dispatchEvent(new Event(CREDITS_EVENT));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const testAdminKey = async () => {
    setError(null);
    setMsg(null);
    try {
      const c = await api<CreditsInfo>("/api/credits");
      if (c.source === "cartesia") setMsg(`Admin key works. Cartesia reports ${c.used.toLocaleString()} credits used this cycle.`);
      else setError(c.warning || "The admin key was not used.");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const test = async () => {
    setError(null);
    setMsg(null);
    try {
      const r = await api<{ voices: unknown[] }>("/api/voices?limit=1");
      setMsg(`API key works. Cartesia returned ${r.voices.length ? "voices" : "no voices"}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="h-full overflow-auto p-8">
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          {version && (
            <p className="text-sm text-neutral-500">
              Voxlabs v{version.version}
              {version.commit && <> ({version.commit.slice(0, 7)})</>}
            </p>
          )}
        </div>
        <div className="card space-y-3 p-5">
          <h2 className="font-medium">Cartesia API key</h2>
          <p className="text-sm text-neutral-400">
            {s?.hasKey ? (
              <>Current key: <code>{s.keyPreview}</code> ({s.keySource === "env" ? "from .env.local" : "saved in this app"})</>
            ) : (
              <>No key set. Get one at play.cartesia.ai under API keys.</>
            )}
          </p>
          <input className="input" type="password" placeholder="sk_car_..." value={key} onChange={(e) => setKey(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={!key} onClick={() => save({ apiKey: key })}>Save key</button>
            <button className="btn" disabled={!s?.hasKey} onClick={test}>Test key</button>
            {s?.keySource === "settings" && <button className="btn btn-danger" onClick={() => save({ apiKey: null })}>Remove saved key</button>}
          </div>
        </div>
        <div className="card space-y-3 p-5">
          <h2 className="font-medium">Credits</h2>
          <p className="text-sm text-neutral-400">
            Shown at the top of the sidebar. Cartesia has no &quot;credits left&quot; API, so enter your plan here. Your plan and renewal date are on
            play.cartesia.ai under Subscription.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan credits per month">
              <input className="input" type="number" min={0} placeholder="e.g. 1250000" value={plan} onChange={(e) => setPlan(e.target.value)} />
            </Field>
            <Field label="Renews on day of month (1-31)">
              <input className="input" type="number" min={1} max={31} value={renewDay} onChange={(e) => setRenewDay(Number(e.target.value))} />
            </Field>
          </div>
          <button className="btn" onClick={() => save({ planCredits: plan ? Number(plan) : null, renewDay })}>Save</button>
          <h3 className="pt-2 text-sm font-medium">Admin key (optional)</h3>
          <p className="text-sm text-neutral-400">
            Without it, the app counts the characters it sends (about 1 credit each), so usage from the Cartesia playground or other apps is
            missing. With an admin key (<code>sk_car_admin_...</code>, created under API keys on play.cartesia.ai), the numbers come from
            Cartesia. It is only used to read usage.
          </p>
          <p className="text-sm text-neutral-400">
            {s?.hasAdminKey ? (
              <>Current admin key: <code>{s.adminKeyPreview}</code> ({s.adminKeySource === "env" ? "from .env.local" : "saved in this app"})</>
            ) : (
              <>No admin key set.</>
            )}
          </p>
          <input className="input" type="password" placeholder="sk_car_admin_..." value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={!adminKey} onClick={() => save({ adminKey })}>Save admin key</button>
            <button className="btn" disabled={!s?.hasAdminKey} onClick={testAdminKey}>Test admin key</button>
            {s?.adminKeySource === "settings" && <button className="btn btn-danger" onClick={() => save({ adminKey: null })}>Remove admin key</button>}
          </div>
        </div>
        <div className="card space-y-3 p-5">
          <h2 className="font-medium">Generation</h2>
          <Field label="Paragraphs generated at the same time (1-10)">
            <input className="input max-w-24" type="number" min={1} max={10} value={conc} onChange={(e) => setConc(Number(e.target.value))} />
          </Field>
          <button className="btn" onClick={() => save({ concurrency: conc })}>Save</button>
        </div>
        {msg && <div className="text-sm text-green-400">{msg}</div>}
        <ErrorText error={error} />
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { ErrorText, Field } from "@/components/ui";
import { api } from "@/lib/api";

interface SettingsState {
  hasKey: boolean;
  keySource: "settings" | "env" | null;
  keyPreview: string | null;
  concurrency: number;
}

export default function SettingsPage() {
  const [s, setS] = useState<SettingsState | null>(null);
  const [key, setKey] = useState("");
  const [conc, setConc] = useState(3);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<{ version: string; commit: string | null } | null>(null);

  useEffect(() => {
    api<SettingsState>("/api/settings").then((r) => {
      setS(r);
      setConc(r.concurrency);
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
      setMsg("Saved");
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

"use client";
import { useEffect, useState } from "react";
import { CREDITS_EVENT } from "@/components/CreditsBadge";
import { ErrorText, Field, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import type { CreditsInfo } from "@/lib/credits";
import type { Template, TemplateChapter } from "@/lib/types";

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
        <TemplatesCard />
        {msg && <div className="text-sm text-green-400">{msg}</div>}
        <ErrorText error={error} />
      </div>
    </div>
  );
}

type Draft = { id?: string; category: string; name: string; end_text: string; chapters: TemplateChapter[] };

function TemplatesCard() {
  const [list, setList] = useState<Template[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<Template[]>("/api/templates").then(setList).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const remove = async (t: Template) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    setError(null);
    try {
      await api(`/api/templates?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="card space-y-3 p-5">
      <h2 className="font-medium">Project templates</h2>
      <p className="text-sm text-neutral-400">Used in New project → Start from. Chapter names are &lt;project code&gt;-&lt;suffix&gt;.</p>
      {list.map((t) => (
        <div key={t.id} className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">
            {t.category ? `${t.category} / ${t.name}` : t.name} <span className="text-neutral-500">· {t.chapters.length} chapters</span>
          </span>
          <button className="btn btn-sm" onClick={() => setDraft({ id: t.id, category: t.category, name: t.name, end_text: t.end_text, chapters: t.chapters.map((c) => ({ ...c })) })}>Edit</button>
          <button className="btn btn-danger btn-sm" onClick={() => remove(t)}>Delete</button>
        </div>
      ))}
      <button className="btn" onClick={() => setDraft({ category: "", name: "", end_text: "", chapters: [{ suffix: "s1", title: "" }] })}>Add template</button>
      <ErrorText error={error} />
      {draft && (
        <TemplateEditor
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function TemplateEditor({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setRow = (i: number, patch: Partial<TemplateChapter>) => setD({ ...d, chapters: d.chapters.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id, ...input } = d;
      await api("/api/templates", { method: id ? "PUT" : "POST", json: id ? { id, ...input } : input });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={d.id ? "Edit template" : "New template"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <input className="input" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} placeholder="e.g. Exodus" />
          </Field>
          <Field label="Name">
            <input className="input" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
        </div>
        <Field label="End line (closing message for each chapter)">
          <input className="input" value={d.end_text} onChange={(e) => setD({ ...d, end_text: e.target.value })} placeholder="e.g. यह Recording का अंत है।" />
        </Field>
        <div>
          <span className="label">Chapters (suffix and heading)</span>
          <div className="space-y-2">
            {d.chapters.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input className="input w-20 shrink-0" value={c.suffix} onChange={(e) => setRow(i, { suffix: e.target.value })} placeholder="s1" />
                <input className="input flex-1" value={c.title} onChange={(e) => setRow(i, { title: e.target.value })} placeholder="Heading text" />
                <button className="btn btn-ghost btn-sm" title="Remove chapter" onClick={() => setD({ ...d, chapters: d.chapters.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
          </div>
          <button className="btn btn-sm mt-2" onClick={() => setD({ ...d, chapters: [...d.chapters, { suffix: `s${d.chapters.length + 1}`, title: "" }] })}>+ Add chapter</button>
        </div>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

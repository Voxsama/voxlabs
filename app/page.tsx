"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { VoicePicker, type Picked } from "@/components/VoicePicker";
import { ErrorText, Field, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { LANGUAGES, MODELS } from "@/lib/constants";
import { plainText } from "@/lib/text";
import type { Project, ProjectSummary } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<ProjectSummary[]>("/api/projects").then(setProjects).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const shown = (projects ?? []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="h-full overflow-auto p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Audiobook projects</h1>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New project</button>
        </div>
        <input className="input mb-6" placeholder="Search projects..." value={q} onChange={(e) => setQ(e.target.value)} />
        <ErrorText error={error} />
        {projects && !shown.length && (
          <div className="card p-10 text-center text-neutral-400">No projects yet. Create one to get started.</div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card block p-4 hover:border-neutral-600">
              <div className="mb-2 h-20 overflow-hidden text-xs leading-relaxed text-neutral-400">
                {p.preview ? plainText(p.preview) : <i>Empty</i>}
              </div>
              <div className="font-medium">{p.name}</div>
              <div className="mt-1 text-xs text-neutral-500">
                {p.chapter_count} chapters · {p.ready_count}/{p.paragraph_count} paragraphs generated · {p.language}
              </div>
              <div className="mt-2 h-1 rounded bg-neutral-800">
                <div className="h-1 rounded bg-purple-500" style={{ width: `${p.paragraph_count ? (100 * p.ready_count) / p.paragraph_count : 0}%` }} />
              </div>
              <div className="mt-2 text-xs text-neutral-500">Updated {new Date(p.updated_at).toLocaleString()}</div>
            </Link>
          ))}
        </div>
      </div>
      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("hi");
  const [model, setModel] = useState(MODELS[0].id);
  const [voice, setVoice] = useState<Picked | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [split, setSplit] = useState<"line" | "blank">("line");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const project = { name: name || files[0]?.name.replace(/\.[^.]+$/, "") || "Untitled project", language, model_id: model, voice_id: voice?.id ?? null, voice_name: voice?.name ?? null };
      let res: { project: Project; imported: number; skipped: string[] };
      if (files.length) {
        const form = new FormData();
        form.set("project", JSON.stringify(project));
        form.set("split", split);
        files.forEach((f) => form.append("files", f));
        res = await api("/api/projects", { method: "POST", body: form });
        if (res.skipped.length) alert(`Skipped unsupported files: ${res.skipped.join(", ")}`);
      } else {
        res = await api("/api/projects", { method: "POST", json: project });
      }
      router.push(`/projects/${res.project.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="New audiobook project" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Project name">
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Exo-P72" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Language">
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Model">
            <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <span className="label">Default voice</span>
          <VoicePicker value={voice} onChange={setVoice} defaultLanguage={language} />
        </div>
        <Field label="Import chapters (optional): .txt, .docx, or a .zip of them. One file = one chapter.">
          <input
            className="input"
            type="file"
            multiple
            accept=".txt,.md,.docx,.zip"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </Field>
        {files.length > 0 && (
          <Field label="Split text into paragraphs by">
            <select className="input" value={split} onChange={(e) => setSplit(e.target.value as "line" | "blank")}>
              <option value="line">Every line</option>
              <option value="blank">Blank lines (join wrapped lines)</option>
            </select>
          </Field>
        )}
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? "Creating..." : "Create project"}</button>
        </div>
      </div>
    </Modal>
  );
}

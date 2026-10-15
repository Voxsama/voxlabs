"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { VoicePicker, type Picked } from "@/components/VoicePicker";
import { ErrorText, Field, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { LANGUAGES, MODELS } from "@/lib/constants";
import { plainText } from "@/lib/text";
import type { Chapter, Project, ProjectSummary, Template } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<ProjectSummary[]>("/api/projects").then(setProjects).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const rename = async (e: React.MouseEvent, p: ProjectSummary) => {
    e.preventDefault();
    e.stopPropagation();
    const name = prompt("Rename project", p.name)?.trim();
    if (!name || name === p.name) return;
    try {
      await api(`/api/projects/${p.id}`, { method: "PATCH", json: { name } });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

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
            <Link key={p.id} href={`/projects/${p.id}`} className="card group block p-4 hover:border-neutral-600">
              <div className="mb-2 h-20 overflow-hidden text-xs leading-relaxed text-neutral-400">
                {p.preview ? plainText(p.preview) : <i>Empty</i>}
              </div>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate font-medium">{p.name}</div>
                <button className="text-xs text-neutral-500 hover:text-white" title="Rename project" onClick={(e) => rename(e, p)}>✎</button>
              </div>
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
      {creating && <NewProjectDialog projects={projects ?? []} onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewProjectDialog({ projects, onClose }: { projects: ProjectSummary[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("hi");
  const [model, setModel] = useState(MODELS[0].id);
  const [voice, setVoice] = useState<Picked | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [split, setSplit] = useState<"line" | "blank">("line");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [from, setFrom] = useState("");

  useEffect(() => {
    api<Template[]>("/api/templates").then(setTemplates).catch(() => {});
  }, []);

  const tpl = from.startsWith("t:") ? templates.find((t) => t.id === from.slice(2)) : undefined;
  const src = from.startsWith("p:") ? projects.find((p) => p.id === from.slice(2)) : undefined;
  const coded = !!(tpl || src);
  const code = name.trim().toLowerCase();
  const [srcChapters, setSrcChapters] = useState<Chapter[]>([]);
  const [keep, setKeep] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSrcChapters([]);
    setKeep(new Set());
    if (!src?.id) return;
    let stale = false;
    api<{ chapters: Chapter[] }>(`/api/projects/${src.id}`)
      .then(({ chapters }) => {
        if (stale) return;
        const sorted = [...chapters].sort((a, b) => a.position - b.position);
        setSrcChapters(sorted);
        setKeep(new Set([sorted[0]?.id, sorted.at(-1)?.id].filter((id): id is string => !!id)));
      })
      .catch((e) => !stale && setError(e.message));
    return () => {
      stale = true;
    };
  }, [src?.id]);

  const submit = async () => {
    if (coded && !name.trim()) return setError("Enter the project code");
    setBusy(true);
    setError(null);
    try {
      const project = { name: name.trim() || files[0]?.name.replace(/\.[^.]+$/, "") || "Untitled project", language, model_id: model, voice_id: voice?.id ?? null, voice_name: voice?.name ?? null };
      let res: { project: Project; imported: number; skipped: string[] };
      if (files.length) {
        const form = new FormData();
        form.set("project", JSON.stringify(project));
        form.set("split", split);
        files.forEach((f) => form.append("files", f));
        res = await api("/api/projects", { method: "POST", body: form });
        if (res.skipped.length) alert(`Skipped unsupported files: ${res.skipped.join(", ")}`);
      } else {
        res = await api("/api/projects", { method: "POST", json: { ...project, ...(tpl ? { templateId: tpl.id } : src ? { copyFromId: src.id, resetChapters: srcChapters.filter((c) => !keep.has(c.id)).map((c) => c.id) } : {}) } });
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
        <Field label={coded ? "Project code" : "Project name"}>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={coded ? "e.g. Exo-P59" : "e.g. Exo-P72"} />
        </Field>
        {!files.length && (templates.length > 0 || projects.length > 0) && (
          <Field label="Start from">
            <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Blank project</option>
              {templates.length > 0 && (
                <optgroup label="Templates">
                  {templates.map((t) => <option key={t.id} value={`t:${t.id}`}>{t.category ? `${t.category} / ${t.name}` : t.name}</option>)}
                </optgroup>
              )}
              {projects.length > 0 && (
                <optgroup label="Copy of existing project">
                  {projects.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}
                </optgroup>
              )}
            </select>
          </Field>
        )}
        {tpl && (
          <p className="text-xs text-neutral-500">
            Creates {tpl.chapters.length} chapters: {code || "code"}-{tpl.chapters[0]?.suffix.toLowerCase()} … {code || "code"}-{tpl.chapters.at(-1)?.suffix.toLowerCase()}, each with its heading and end line.
          </p>
        )}
        {src && (
          <p className="text-xs text-neutral-500">
            Copies the chapters of {src.name} with their generated audio. Chapter names change to the new code. Edit the parts that differ and regenerate only those.
          </p>
        )}
        {src && srcChapters.length > 0 && (
          <div>
            <span className="label">Keep content</span>
            <p className="mb-1 text-xs text-neutral-500">Unchecked chapters keep only their first and last paragraph (heading and end line), ready for new text.</p>
            <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-neutral-800 p-2 text-sm">
              {srcChapters.map((c) => (
                <label key={c.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={keep.has(c.id)}
                    onChange={(e) => {
                      const n = new Set(keep);
                      if (e.target.checked) n.add(c.id);
                      else n.delete(c.id);
                      setKeep(n);
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-neutral-500">{c.paragraph_count} paragraphs</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {!src && (
          <>
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
          </>
        )}
        {!coded && (
          <Field label="Import chapters (optional): .txt, .docx, or a .zip of them. One file = one chapter.">
            <input
              className="input"
              type="file"
              multiple
              accept=".txt,.md,.docx,.zip"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </Field>
        )}
        {!coded && files.length > 0 && (
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

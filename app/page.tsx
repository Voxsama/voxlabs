"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleAlert, CircleDashed, LoaderCircle, MoreHorizontal, Plus, Search, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { VoicePicker, type Picked } from "@/components/VoicePicker";
import { ErrorText, Field, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { LANGUAGES, MODELS } from "@/lib/constants";
import type { CreditsInfo } from "@/lib/credits";
import { plainText } from "@/lib/text";
import type { Chapter, Project, ProjectSummary, Template } from "@/lib/types";

type Filter = "all" | "progress" | "complete" | "new";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "progress", label: "In progress" },
  { id: "complete", label: "Complete" },
  { id: "new", label: "Not started" },
];
const progressOf = (p: ProjectSummary): Filter =>
  p.ready_count === 0 && !p.generating_count ? "new" : p.ready_count === p.paragraph_count ? "complete" : "progress";
const pct = (p: ProjectSummary) => (p.paragraph_count ? Math.round((100 * p.ready_count) / p.paragraph_count) : 0);
const languageName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code;
const modelName = (id: string) => (MODELS.find((m) => m.id === id)?.label ?? id).replace(/ \(.*\)$/, "");
const plural = (n: number, w: string) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;

function hms(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function ago(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  }
  return "just now";
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"updated" | "name" | "progress">("updated");
  const [creating, setCreating] = useState<null | "new" | "import">(null);
  const [error, setError] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);

  const load = () => api<ProjectSummary[]>("/api/projects").then(setProjects).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    fetch("/api/credits").then((r) => (r.ok ? r.json() : null)).then(setCredits).catch(() => {});
    // "/" focuses search, as the hint in the box says.
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !t.closest("input, textarea, select, [contenteditable]")) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const rename = (p: ProjectSummary) => {
    const name = prompt("Rename project", p.name)?.trim();
    if (name && name !== p.name) act(() => api(`/api/projects/${p.id}`, { method: "PATCH", json: { name } }));
  };
  const remove = (p: ProjectSummary) => {
    if (confirm(`Delete "${p.name}" and all its chapters and audio? This cannot be undone.`)) act(() => api(`/api/projects/${p.id}`, { method: "DELETE" }));
  };

  const all = projects ?? [];
  const needle = q.trim().toLowerCase();
  const matched = all.filter((p) => !needle || [p.name, ...p.chapters.map((c) => c.name)].some((n) => n.toLowerCase().includes(needle)));
  const count = (f: Filter) => (f === "all" ? matched.length : matched.filter((p) => progressOf(p) === f).length);
  const shown = matched
    .filter((p) => filter === "all" || progressOf(p) === filter)
    .sort(sort === "name" ? (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) : sort === "progress" ? (a, b) => pct(b) - pct(a) : () => 0);
  const total = (k: "chapter_count" | "paragraph_count" | "ready_count" | "duration_ms" | "generating_count" | "error_count") => all.reduce((n, p) => n + p[k], 0);
  const langs = [...new Set(all.map((p) => p.language))];
  const models = [...new Set(all.map((p) => p.model_id))];
  const sub = [
    plural(all.length, "project"),
    langs.length === 1 ? languageName(langs[0]) : plural(langs.length, "language"),
    models.length === 1 ? `Cartesia ${modelName(models[0])}` : plural(models.length, "model"),
  ];

  return (
    <div className="h-full overflow-auto px-8 py-7 tabular-nums">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight">Audiobook projects</h1>
            {projects && all.length > 0 && <p className="mt-1 text-sm text-neutral-500">{sub.join(" · ")}</p>}
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setCreating("import")}><Upload size={14} aria-hidden />Import</button>
            <button className="btn btn-primary" onClick={() => setCreating("new")}><Plus size={14} aria-hidden />New project</button>
          </div>
        </div>

        <ErrorText error={error} />

        {projects && all.length === 0 ? (
          <div className="card mt-8 flex flex-col items-center gap-3 p-12 text-center">
            <p className="font-medium">No projects yet</p>
            <p className="text-sm text-neutral-500">Create a project, or import .txt, .docx or .zip files as chapters.</p>
            <div className="mt-2 flex gap-2">
              <button className="btn" onClick={() => setCreating("import")}><Upload size={14} aria-hidden />Import</button>
              <button className="btn btn-primary" onClick={() => setCreating("new")}><Plus size={14} aria-hidden />New project</button>
            </div>
          </div>
        ) : projects && (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <div className="relative w-[340px] max-w-full">
                <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-500" aria-hidden />
                <input ref={search} className="input h-8 pr-8 pl-8 paper:h-10" aria-label="Search projects and chapters" placeholder="Search projects and chapters" value={q} onChange={(e) => setQ(e.target.value)} />
                <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-[3px] border border-neutral-700 px-1.5 text-[11px] leading-4 text-neutral-500">/</kbd>
              </div>
              <div className="inline-flex h-8 overflow-hidden rounded-(--radius) border border-neutral-700 paper:h-auto paper:gap-0.5 paper:bg-neutral-800 paper:p-[3px]" role="group" aria-label="Filter projects">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={`inline-flex items-center gap-1.5 border-r border-neutral-700 px-3 text-[12.5px] last:border-r-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring paper:h-8 paper:rounded-md paper:border-0 ${filter === f.id ? "bg-neutral-800 text-neutral-100 paper:bg-neutral-900 paper:font-semibold paper:shadow-sm" : "text-neutral-300 hover:text-neutral-100 paper:text-neutral-500"}`}
                  >
                    {f.label} <span className="text-neutral-500">{count(f.id)}</span>
                  </button>
                ))}
              </div>
              <label className="ml-auto flex items-center gap-2 text-[12.5px] text-neutral-500">
                Sort
                <select className="input h-8 w-auto py-0 text-[12.5px] text-neutral-100 paper:h-10" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  <option value="updated">Last updated</option>
                  <option value="name">Name</option>
                  <option value="progress">Progress</option>
                </select>
              </label>
            </div>

            <div className="card mt-5 flex flex-wrap">
              <Stat label="Chapters">{total("chapter_count").toLocaleString()}</Stat>
              <Stat label="Paragraphs generated">{total("ready_count").toLocaleString()} <small>/ {total("paragraph_count").toLocaleString()}</small></Stat>
              <Stat label="Audio rendered">{hms(total("duration_ms"))}</Stat>
              {credits && (
                <Stat label="Credits used · this cycle">
                  <span title={`${new Date(credits.cycleStart).toLocaleDateString()} to ${new Date(credits.cycleEnd).toLocaleDateString()}`}>{credits.used.toLocaleString()}</span>
                </Stat>
              )}
              <Stat label="Queue">
                {total("generating_count").toLocaleString()} <small>generating · <span className={total("error_count") ? "text-red-400" : ""}>{plural(total("error_count"), "error")}</span></small>
              </Stat>
            </div>

            <div className="mt-7 mb-3 flex items-center justify-between">
              <h2 className="section-label">{sort === "updated" ? "Recent" : sort === "name" ? "By name" : "By progress"}</h2>
              <span className="text-xs text-neutral-500">Each bar segment is one chapter</span>
            </div>
            {!shown.length && <div className="card p-10 text-center text-sm text-neutral-500">No projects match.</div>}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((p) => <ProjectCard key={p.id} p={p} onRename={() => rename(p)} onDelete={() => remove(p)} />)}
            </div>
          </>
        )}
      </div>
      {creating && <NewProjectDialog projects={all} pickFiles={creating === "import"} onClose={() => setCreating(null)} />}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-40 flex-1 border-r border-neutral-800 px-[18px] py-3.5 last:border-r-0 paper:border-neutral-700">
      <div className="section-label">{label}</div>
      <div className="mt-1 text-xl font-semibold [&_small]:text-sm [&_small]:font-normal [&_small]:text-neutral-500">{children}</div>
    </div>
  );
}

function StatusTag({ p }: { p: ProjectSummary }) {
  const progress = progressOf(p);
  return (
    <>
      {p.generating_count > 0 ? (
        <span className="chip border-sky-400/40 text-sky-400"><LoaderCircle size={12} className="motion-safe:animate-spin" aria-hidden />Generating</span>
      ) : progress === "complete" ? (
        <span className="chip border-green-400/40 text-green-400"><Check size={12} aria-hidden />Complete</span>
      ) : progress === "new" ? (
        <span className="chip"><CircleDashed size={12} aria-hidden />Not started</span>
      ) : (
        <span className="chip">In progress</span>
      )}
      {p.error_count > 0 && p.generating_count === 0 && (
        <span className="chip border-red-400/40 text-red-400"><CircleAlert size={12} aria-hidden />{plural(p.error_count, "error")}</span>
      )}
    </>
  );
}

function ProjectCard({ p, onRename, onDelete }: { p: ProjectSummary; onRename: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = "block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline-none";
  const pick = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  return (
    <div className="card group relative flex flex-col px-[18px] pt-[18px] pb-3.5 transition-colors hover:border-neutral-600 hover:bg-neutral-800/40 has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-offset-2 has-[.card-link:focus-visible]:outline-ring paper:hover:bg-neutral-900 paper:hover:shadow-md">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 truncate text-[17px] font-bold">
          {/* Stretched link: the whole card opens the project, while the menu stays a separate control. */}
          <Link href={`/projects/${p.id}`} className="card-link outline-none after:absolute after:inset-0 after:content-['']">{p.name}</Link>
        </h3>
        <StatusTag p={p} />
        <div
          className="relative z-10 ml-auto"
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setMenu(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && menu) {
              setMenu(false);
              trigger.current?.focus();
            }
          }}
        >
          <button ref={trigger} className="btn btn-ghost btn-sm px-1 text-neutral-500 hover:text-neutral-100" aria-label={`More actions for ${p.name}`} aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <MoreHorizontal size={16} aria-hidden />
          </button>
          {menu && (
            <div className="absolute top-full right-0 mt-1 w-32 overflow-hidden rounded-(--radius) border border-neutral-700 bg-neutral-900 py-1 shadow-lg">
              <button className={item} autoFocus onClick={pick(onRename)}>Rename</button>
              <button className={`${item} text-red-400`} onClick={pick(onDelete)}>Delete</button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-1 text-xs text-neutral-500">{[p.voice_name || "No default voice", p.emotion || "auto", `${p.sample_rate / 1000} kHz`].join(" · ")}</div>
      <p lang={p.language} className="script mt-3.5 line-clamp-2 min-h-[56px] text-[15.5px] text-neutral-300 paper:border-l-2 paper:border-neutral-700 paper:pl-3.5 paper:group-hover:border-accent">
        {p.preview ? plainText(p.preview) : <i className="text-neutral-500">Empty</i>}
      </p>
      <div className="mt-5 flex justify-between gap-2 text-xs text-neutral-500">
        <span>
          {plural(p.chapter_count, "chapter")} · <b className="font-medium text-neutral-100">{p.ready_count}/{p.paragraph_count}</b> generated · {languageName(p.language)}
        </span>
        <span>{pct(p)}%</span>
      </div>
      <div className="mt-2 flex h-1 gap-[3px]" aria-hidden>
        {(p.chapters.length ? p.chapters : [{ paragraph_count: 0, ready_count: 0 }]).map((c, i) => (
          <i key={i} className="flex-1 overflow-hidden rounded-[1px] bg-neutral-800 paper:bg-neutral-700">
            <b className={`block h-full bg-accent ${p.paragraph_count && p.ready_count === p.paragraph_count ? "paper:bg-green-500" : ""}`} style={{ width: `${c.paragraph_count ? (100 * c.ready_count) / c.paragraph_count : 0}%` }} />
          </i>
        ))}
      </div>
      <div className="mt-[18px] flex items-center justify-between border-t border-neutral-800 pt-3 text-xs text-neutral-500 paper:border-neutral-700">
        <span title={new Date(p.updated_at).toLocaleString()}>Updated {ago(p.updated_at)}</span>
        <span className="inline-flex items-center gap-1 text-neutral-300">Open<ArrowRight size={14} aria-hidden /></span>
      </div>
    </div>
  );
}

function NewProjectDialog({ projects, pickFiles, onClose }: { projects: ProjectSummary[]; pickFiles?: boolean; onClose: () => void }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  // Import opens this dialog with the file picker already up.
  useEffect(() => {
    if (pickFiles) fileInput.current?.click();
  }, [pickFiles]);
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
              ref={fileInput}
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

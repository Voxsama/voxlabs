"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorText, Field, Modal } from "@/components/ui";
import { ProjectGenerationFields } from "./GenerationSettings";
import { api, downloadPost } from "@/lib/api";
import { BROKEN_PASTE_MESSAGE, readPaste } from "@/lib/clipboard";
import { LANGUAGES } from "@/lib/constants";
import { splitIntoParagraphs } from "@/lib/text";
import type { Chapter, Paragraph, Project } from "@/lib/types";

export function PasteDialog({ chapter, hasParagraphs, onClose, onDone }: { chapter: Chapter; hasParagraphs: boolean; onClose: () => void; onDone: (ps: Paragraph[]) => void }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [split, setSplit] = useState<"line" | "blank">("line");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = text.trim() ? splitIntoParagraphs(text, split).length : 0;

  const submit = async () => {
    if (mode === "replace" && hasParagraphs && !confirm("Replace all paragraphs (and their audio) in this chapter?")) return;
    setBusy(true);
    try {
      const r = await api<{ paragraphs: Paragraph[] }>(`/api/chapters/${chapter.id}/import`, { method: "POST", json: { text, mode, split } });
      onDone(r.paragraphs);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Paste text into "${chapter.name}"`} onClose={onClose} wide>
      <div className="space-y-3">
        <textarea
          className="input h-80 font-mono text-sm"
          autoFocus
          placeholder={'Paste the chapter script here. Lines with only <break time="1s" /> tags become pause rows.'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const r = readPaste(e.clipboardData);
            if (r.broken) {
              e.preventDefault();
              setError(BROKEN_PASTE_MESSAGE);
            } else if (r.fromHtml) {
              e.preventDefault();
              document.execCommand("insertText", false, r.text);
            }
          }}
        />
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Split into paragraphs by">
            <select className="input" value={split} onChange={(e) => setSplit(e.target.value as "line" | "blank")}>
              <option value="line">Every line</option>
              <option value="blank">Blank lines (join wrapped lines)</option>
            </select>
          </Field>
          <Field label="Where">
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as "append" | "replace")}>
              <option value="append">Add to the end</option>
              <option value="replace">Replace chapter content</option>
            </select>
          </Field>
          <div className="pb-2 text-sm text-neutral-400">{count} paragraphs</div>
          <div className="ml-auto flex gap-2">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!count || busy} onClick={submit}>{busy ? "Adding..." : "Add paragraphs"}</button>
          </div>
        </div>
        <ErrorText error={error} />
      </div>
    </Modal>
  );
}

export function ImportFilesDialog({ projectId, onClose, onDone }: { projectId: string; onClose: () => void; onDone: (chapters: Chapter[]) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [split, setSplit] = useState<"line" | "blank">("line");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("split", split);
      files.forEach((f) => form.append("files", f));
      const r = await api<{ imported: number; skipped: string[]; chapters: Chapter[] }>(`/api/projects/${projectId}/import`, { method: "POST", body: form });
      if (r.skipped.length) alert(`Imported ${r.imported} chapters. Skipped unsupported files: ${r.skipped.join(", ")}`);
      onDone(r.chapters);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Import chapters from files" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">Each .txt or .docx file becomes one chapter, named after the file. A .zip of such files works too. Chapters are added in natural order (s1, s2, ... s10).</p>
        <input className="input" type="file" multiple accept=".txt,.md,.docx,.zip" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        <Field label="Split text into paragraphs by">
          <select className="input" value={split} onChange={(e) => setSplit(e.target.value as "line" | "blank")}>
            <option value="line">Every line</option>
            <option value="blank">Blank lines (join wrapped lines)</option>
          </select>
        </Field>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!files.length || busy} onClick={submit}>{busy ? "Importing..." : `Import ${files.length} file(s)`}</button>
        </div>
      </div>
    </Modal>
  );
}

interface ExportCheck {
  ok: boolean;
  missing: { chapter: string; position: number; text: string }[];
  stale: { chapter: string; position: number }[];
}

export function ExportDialog({ project, chapters, currentChapterId, onClose }: { project: Project; chapters: Chapter[]; currentChapterId: string | null; onClose: () => void }) {
  const [scope, setScope] = useState<"all" | "current" | "pick">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set(currentChapterId ? [currentChapterId] : []));
  const [structure, setStructure] = useState<"chapters" | "merged" | "paragraphs">("chapters");
  const [format, setFormat] = useState<"wav" | "mp3" | "flac" | "ogg">("wav");
  const [kbps, setKbps] = useState(192);
  const [includeScript, setIncludeScript] = useState(true);
  const [check, setCheck] = useState<ExportCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chapterIds = scope === "all" ? [] : scope === "current" ? (currentChapterId ? [currentChapterId] : []) : Array.from(picked);

  useEffect(() => {
    setCheck(null);
    api<ExportCheck>(`/api/projects/${project.id}/export?chapters=${chapterIds.join(",")}`).then(setCheck).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, scope, picked]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadPost(`/api/projects/${project.id}/export`, { chapterIds, structure, format, mp3Kbps: kbps, includeScript });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Export" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <Field label="Export">
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="all">Full project</option>
            <option value="current" disabled={!currentChapterId}>Current chapter</option>
            <option value="pick">Choose chapters</option>
          </select>
        </Field>
        {scope === "pick" && (
          <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-neutral-800 p-2">
            {chapters.map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={picked.has(c.id)}
                  onChange={(e) => {
                    const n = new Set(picked);
                    if (e.target.checked) n.add(c.id);
                    else n.delete(c.id);
                    setPicked(n);
                  }}
                />
                {c.name}
              </label>
            ))}
          </div>
        )}
        <Field label="File structure">
          <select className="input" value={structure} onChange={(e) => setStructure(e.target.value as typeof structure)}>
            <option value="chapters">Chapters ZIP: one audio file per chapter</option>
            <option value="merged">Single file: all selected chapters joined</option>
            <option value="paragraphs">Paragraphs ZIP: one folder per chapter, one file per paragraph</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Audio format">
            <select className="input" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
              <option value="wav">WAV</option>
              <option value="mp3">MP3</option>
              <option value="flac">FLAC</option>
              <option value="ogg">OGG Vorbis</option>
            </select>
          </Field>
          {format === "mp3" && (
            <Field label="MP3 bitrate">
              <select className="input" value={kbps} onChange={(e) => setKbps(Number(e.target.value))}>
                {[128, 192, 256, 320].map((k) => <option key={k} value={k}>{k} kbps</option>)}
              </select>
            </Field>
          )}
        </div>
        <p className="text-xs text-neutral-500">
          Source audio: {project.sample_rate / 1000} kHz · {project.bit_depth === "32f" ? "32-bit float" : "16-bit"}. WAV export keeps it{project.bit_depth === "32f" ? "; FLAC is 24-bit" : ""}.
        </p>
        {structure !== "merged" && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeScript} onChange={(e) => setIncludeScript(e.target.checked)} />
            Also include script text and manifest.json (untick for audio files only)
          </label>
        )}
        {check && !check.ok && (
          <div className="rounded-md border border-red-900 bg-red-950/50 p-3 text-red-200">
            {check.missing.length} paragraph(s) are not generated yet:
            <ul className="mt-1 list-disc pl-5 text-xs">
              {check.missing.slice(0, 8).map((m, i) => <li key={i}>{m.chapter} #{m.position}: {m.text}</li>)}
            </ul>
          </div>
        )}
        {check?.ok && check.stale.length > 0 && (
          <div className="rounded-md border border-amber-900 bg-amber-950/40 p-3 text-amber-200">
            {check.stale.length} paragraph(s) were edited after generating. Their old audio will be exported.
          </div>
        )}
        {check?.ok && !check.stale.length && <div className="text-green-400">All paragraphs are generated. Ready to export.</div>}
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!check?.ok || busy || (scope === "pick" && !picked.size)} onClick={run}>{busy ? "Exporting..." : "Export"}</button>
        </div>
      </div>
    </Modal>
  );
}

export function ProjectSettingsDialog({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: (p: Project) => void }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [gen, setGen] = useState(() => {
    const { voice_id, voice_name, model_id, language, speed, volume, emotion, sample_rate, bit_depth, paragraph_gap_ms } = project;
    return { voice_id, voice_name, model_id, language, speed, volume, emotion, sample_rate, bit_depth, paragraph_gap_ms };
  });
  const [error, setError] = useState<string | null>(null);
  const patchGen = (patch: Partial<Project>) => setGen((g) => ({ ...g, ...patch }));

  const save = async () => {
    try {
      onSaved(await api<Project>(`/api/projects/${project.id}`, { method: "PATCH", json: { name, ...gen } }));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const del = async () => {
    if (!confirm(`Delete project "${project.name}" and all its audio? This cannot be undone.`)) return;
    await api(`/api/projects/${project.id}`, { method: "DELETE" });
    router.push("/");
  };

  return (
    <Modal title="Project settings" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Language">
          <select className="input" value={gen.language} onChange={(e) => patchGen({ language: e.target.value })}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </Field>
        <ProjectGenerationFields value={gen} onChange={patchGen} />
        <p className="text-xs text-neutral-500">Changing voice, speed, volume, emotion, sample rate or bit depth marks paragraphs as changed; Generate will redo them.</p>
        <ErrorText error={error} />
        <div className="flex justify-between gap-2">
          <button className="btn btn-danger" onClick={del}>Delete project</button>
          <div className="flex gap-2">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

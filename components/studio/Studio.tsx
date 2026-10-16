"use client";
import { AlertTriangle, AudioLines, Check, CheckCircle2, ChevronDown, ChevronRight, Clipboard, Download, Loader2, Pencil, Plus, RefreshCw, SlidersHorizontal, Square, Timer, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VoicePicker } from "@/components/VoicePicker";
import { ErrorText } from "@/components/ui";
import { api } from "@/lib/api";
import { LANGUAGES, MODELS, SAMPLE_RATES } from "@/lib/constants";
import { effectiveSettings, isStale, needsGeneration } from "@/lib/settings";
import { isPauseOnly } from "@/lib/text";
import type { Chapter, Paragraph, Project, StudioEvent } from "@/lib/types";
import { ExportDialog, ImportFilesDialog, PasteDialog, ProjectSettingsDialog } from "./dialogs";
import { ParagraphRow, type FocusRequest, type RowActions } from "./ParagraphRow";
import { Player, type PlayerHandle, type TimelineItem } from "./Player";

interface Timeline {
  key: string;
  hasAudio: boolean;
  durationMs: number;
  timeline: TimelineItem[];
}

export function Studio({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [pos, setPos] = useState({ ms: 0, playing: false });
  const onPosition = useCallback((ms: number, playing: boolean) => setPos({ ms, playing }), []);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [dialog, setDialog] = useState<null | "paste" | "import" | "export" | "settings">(null);
  const [error, setError] = useState<string | null>(null);
  const player = useRef<PlayerHandle>(null);
  const chapterIdRef = useRef<string | null>(null);
  chapterIdRef.current = chapterId;
  const paragraphsRef = useRef(paragraphs);
  paragraphsRef.current = paragraphs;

  const chapter = chapters.find((c) => c.id === chapterId) ?? null;

  // ---- loading
  const loadProject = useCallback(async () => {
    const r = await api<{ project: Project; chapters: Chapter[] }>(`/api/projects/${projectId}`);
    setProject(r.project);
    setChapters(r.chapters);
    return r;
  }, [projectId]);

  useEffect(() => {
    loadProject()
      .then((r) => {
        const fromHash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
        setChapterId(r.chapters.find((c) => c.id === fromHash)?.id ?? r.chapters[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, [loadProject]);

  useEffect(() => {
    if (!chapterId) {
      setParagraphs([]);
      return;
    }
    window.history.replaceState(null, "", `#${chapterId}`);
    setCurrent(null);
    api<{ paragraphs: Paragraph[] }>(`/api/chapters/${chapterId}`)
      .then((r) => setParagraphs(r.paragraphs))
      .catch((e) => setError(e.message));
  }, [chapterId]);

  // Rebuild the player timeline whenever the set of active audio versions (or pauses) changes.
  const audioSignature = useMemo(
    () => paragraphs.map((p) => (isPauseOnly(p.text) ? `P${p.text}` : p.active_version_id ?? "-")).join("|"),
    [paragraphs],
  );
  useEffect(() => {
    if (!chapterId) return;
    const t = setTimeout(() => {
      api<Timeline>(`/api/chapters/${chapterId}/timeline`).then(setTimeline).catch(() => setTimeline(null));
    }, 400);
    return () => clearTimeout(t);
  }, [chapterId, audioSignature]);

  // ---- live updates (Server-Sent Events)
  const refreshChaptersSoon = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const es = new EventSource(`/api/projects/${projectId}/events`);
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data) as StudioEvent;
      if (ev.type === "paragraph") {
        const p = ev.paragraph;
        if (p.chapter_id === chapterIdRef.current) {
          setParagraphs((ps) => ps.map((x) => (x.id === p.id ? p : x)));
        }
        if (refreshChaptersSoon.current) clearTimeout(refreshChaptersSoon.current);
        refreshChaptersSoon.current = setTimeout(() => loadProject().catch(() => {}), 800);
      }
    };
    return () => es.close();
  }, [projectId, loadProject]);

  // ---- derived
  // Stable object so rows (memo) only re-render when the chapter voice really changes.
  const chapterVoiceId = chapter?.voice_id ?? null;
  const chapterVoiceName = chapter?.voice_name ?? null;
  const chapterVoice = useMemo(
    () => (chapterId ? { voice_id: chapterVoiceId, voice_name: chapterVoiceName } : null),
    [chapterId, chapterVoiceId, chapterVoiceName],
  );
  const stats = useMemo(() => {
    let pending = 0, busy = 0, done = 0, speakable = 0, errors = 0, changed = 0;
    for (const p of paragraphs) {
      if (!project || !p.text.trim() || isPauseOnly(p.text)) continue;
      const s = effectiveSettings(p, chapterVoice, project);
      speakable++;
      if (p.status === "queued" || p.status === "generating") busy++;
      else if (needsGeneration(p, s)) pending++;
      if (p.active_version_id && !isStale(p, s)) done++;
      else if (p.active_version_id) changed++;
      if (p.status === "error") errors++;
    }
    return { pending, busy, done, speakable, errors, changed };
  }, [paragraphs, chapterVoice, project]);

  // ---- actions
  const actions: RowActions = useMemo(
    () => ({
      updated: (p) => setParagraphs((ps) => ps.map((x) => (x.id === p.id ? p : x))),
      replaceAll: (ps, focusId, caret = "start") => {
        setParagraphs(ps);
        if (focusId) setFocusRequest({ id: focusId, caret });
      },
      remove: (id) => setParagraphs((ps) => ps.filter((x) => x.id !== id)),
      insert: async (id, { above, ...opts }) => {
        try {
          const r = await api<{ id: string; paragraphs: Paragraph[] }>(`/api/chapters/${chapterIdRef.current}/paragraphs`, {
            method: "POST",
            json: { [above ? "beforeId" : "afterId"]: id, ...opts },
          });
          setParagraphs(r.paragraphs);
          if (!opts.pauseMs) setFocusRequest({ id: r.id, caret: "start" });
        } catch (e) {
          setError((e as Error).message);
        }
      },
      neighbor: (id, dir) => {
        const ps = paragraphsRef.current;
        const i = ps.findIndex((x) => x.id === id);
        return i < 0 ? undefined : ps[i + dir];
      },
      focusSpeech: (id, dir, caret) => {
        const ps = paragraphsRef.current;
        for (let i = ps.findIndex((x) => x.id === id) + dir; i >= 0 && i < ps.length; i += dir) {
          if (!isPauseOnly(ps[i].text)) {
            setFocusRequest({ id: ps[i].id, caret });
            return true;
          }
        }
        return false;
      },
      playFrom: (id) => player.current?.playFrom(id),
      setError,
    }),
    [],
  );

  const addAtEnd = () => {
    const last = paragraphs.at(-1);
    if (last && !last.text.trim()) setFocusRequest({ id: last.id, caret: "end" });
    else actions.insert(last?.id ?? "start", { text: "" });
  };

  const generate = async (all = false) => {
    if (!chapterId) return;
    if (!project?.voice_id && !chapter?.voice_id && paragraphs.some((p) => !p.voice_id && !isPauseOnly(p.text))) {
      setError("Choose a voice first (project settings, or the chapter voice button).");
      return;
    }
    if (all && !confirm("Regenerate every paragraph in this chapter? This uses credits for the whole chapter.")) return;
    // Make sure any text being typed is saved first.
    (document.activeElement as HTMLElement | null)?.blur?.();
    await new Promise((r) => setTimeout(r, 50));
    try {
      const r = await api<{ queued: number }>(`/api/chapters/${chapterId}/generate`, { method: "POST", json: { all } });
      if (!r.queued) setError("Nothing to generate: all paragraphs are up to date.");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const stop = () => chapterId && api(`/api/chapters/${chapterId}/generate`, { method: "DELETE" }).catch((e) => setError(e.message));

  const addChapter = async () => {
    const name = prompt("Chapter name", `${project?.name ?? "chapter"}-s${chapters.length + 1}`);
    if (name === null) return;
    const c = await api<Chapter>(`/api/projects/${projectId}/chapters`, { method: "POST", json: { name } });
    await loadProject();
    setChapterId(c.id);
  };

  const renameChapter = async (c: Chapter) => {
    const name = prompt("Rename chapter", c.name);
    if (!name || name === c.name) return;
    await api(`/api/chapters/${c.id}`, { method: "PATCH", json: { name } });
    loadProject();
  };

  const deleteChapter = async (c: Chapter) => {
    if (!confirm(`Delete chapter "${c.name}" and its audio?`)) return;
    await api(`/api/chapters/${c.id}`, { method: "DELETE" });
    const r = await loadProject();
    if (c.id === chapterId) setChapterId(r.chapters[0]?.id ?? null);
  };

  const setChapterVoice = async (v: { id: string; name: string } | null) => {
    if (!chapter) return;
    await api(`/api/chapters/${chapter.id}`, { method: "PATCH", json: { voice_id: v?.id ?? null, voice_name: v?.name ?? null } });
    loadProject();
  };

  // Drag & drop chapter reordering.
  const dragId = useRef<string | null>(null);
  const dropOn = async (targetId: string) => {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    const ids = chapters.map((c) => c.id).filter((id) => id !== from);
    ids.splice(ids.indexOf(targetId), 0, from);
    setChapters(ids.map((id) => chapters.find((c) => c.id === id)!));
    setChapters(await api<Chapter[]>(`/api/projects/${projectId}/reorder`, { method: "POST", json: { ids } }));
  };

  if (!project) {
    return <div className="p-8"><ErrorText error={error} />{!error && "Loading..."}</div>;
  }

  const curItem = timeline?.timeline.find((i) => i.paragraphId === current);
  const readyTotal = chapters.reduce((n, c) => n + c.ready_count, 0);
  const paragraphTotal = chapters.reduce((n, c) => n + c.paragraph_count, 0);
  const totalMs = chapters.reduce((n, c) => n + c.duration_ms, 0);
  const minutes = totalMs ? Math.max(1, Math.round(totalMs / 60000)) : 0;
  const meta = [
    LANGUAGES.find((l) => l.code === project.language)?.name ?? project.language,
    (MODELS.find((m) => m.id === project.model_id)?.label ?? project.model_id).replace(/ \(.*\)$/, ""),
    project.voice_name || "No default voice",
    SAMPLE_RATES.find((r) => r.value === project.sample_rate)?.label ?? `${project.sample_rate / 1000} kHz`,
  ].join(" · ");
  const sep = <span className="h-3 w-px bg-neutral-700" aria-hidden />;
  const ghost = "btn btn-sm btn-ghost text-neutral-300";

  return (
    <div className="flex h-full">
      {/* Chapters column */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 paper:border-neutral-700 paper:bg-neutral-950">
        <div className="border-b border-neutral-800 px-4 pt-[18px] pb-3.5 paper:border-transparent">
          <Link href="/" className="section-label mb-1.5 inline-flex items-center gap-1 hover:text-neutral-300">
            Projects <ChevronRight size={14} aria-hidden />
          </Link>
          <h2 className="text-xl leading-tight font-bold break-words">{project.name}</h2>
          <div className="mt-1 text-xs text-neutral-500">{meta}</div>
          <button className="btn btn-sm mt-3 w-full justify-center" onClick={() => setDialog("settings")}>
            <SlidersHorizontal size={14} aria-hidden /> Project settings
          </button>
        </div>
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <span className="section-label whitespace-nowrap">Chapters · {chapters.length}</span>
          <span className="flex gap-0.5">
            <button className={ghost} onClick={() => setDialog("import")} title="Import .txt/.docx/.zip as chapters"><Upload size={14} aria-hidden /> Import</button>
            <button className={ghost} onClick={addChapter}><Plus size={14} aria-hidden /> Add</button>
          </span>
        </div>
        <div className="min-h-0 flex-1 space-y-px overflow-auto px-2 pb-2 tabular-nums">
          {chapters.map((c) => {
            const complete = c.paragraph_count > 0 && c.ready_count >= c.paragraph_count;
            const on = c.id === chapterId;
            return (
              <div
                key={c.id}
                draggable
                onDragStart={() => (dragId.current = c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(c.id)}
                onClick={() => setChapterId(c.id)}
                onDoubleClick={() => renameChapter(c)}
                title="Drag to reorder, double-click to rename"
                className={`group cursor-pointer rounded-(--radius) border-l-2 px-2.5 pt-[9px] pb-2.5 ${on ? "border-purple-500 bg-neutral-800 paper:bg-neutral-900 paper:shadow-sm" : "border-transparent hover:bg-neutral-800/60"}`}
              >
                <div className="flex items-center gap-1.5">
                  <button className={`min-w-0 flex-1 truncate text-left text-[13px] ${on ? "font-medium text-neutral-100 paper:text-purple-300" : "text-neutral-300"}`} aria-current={on || undefined}>
                    {c.name}
                  </button>
                  <span className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                    <button className="rounded p-0.5 text-neutral-500 hover:text-neutral-100" aria-label={`Rename ${c.name}`} title="Rename" onClick={(e) => { e.stopPropagation(); renameChapter(c); }}><Pencil size={13} aria-hidden /></button>
                    <button className="rounded p-0.5 text-neutral-500 hover:text-red-400" aria-label={`Delete ${c.name}`} title="Delete" onClick={(e) => { e.stopPropagation(); deleteChapter(c); }}><Trash2 size={13} aria-hidden /></button>
                  </span>
                  <span className={`flex items-center gap-1 text-xs ${complete ? "font-medium text-green-400" : "text-neutral-500"}`}>
                    {complete && <Check size={14} aria-hidden />}
                    {c.ready_count}/{c.paragraph_count}
                  </span>
                </div>
                <div className="mt-[7px] h-0.5 overflow-hidden rounded-full bg-neutral-700/60 paper:h-1 paper:bg-neutral-700">
                  <div
                    className={`h-full rounded-full ${complete ? "bg-green-500/70 paper:bg-green-500" : "bg-neutral-500 paper:bg-purple-500"}`}
                    style={{ width: `${c.paragraph_count ? (100 * c.ready_count) / c.paragraph_count : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
          {!chapters.length && <div className="p-3 text-sm text-neutral-500">No chapters. Add one or import files.</div>}
        </div>
        <div className="flex justify-between border-t border-neutral-800 px-4 py-3 text-xs text-neutral-500 tabular-nums paper:border-neutral-700">
          <span>{readyTotal} / {paragraphTotal} paragraphs</span>
          <span>~{minutes} min</span>
        </div>
      </aside>

      {/* Editor */}
      <section className="flex min-w-0 flex-1 flex-col">
        {chapter ? (
          <>
            <div className="border-b border-neutral-800 px-6 pt-3 pb-2.5 paper:border-neutral-700 paper:bg-neutral-900">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-lg font-bold">{chapter.name}</h1>
                <div className="flex items-center gap-3 text-xs text-neutral-500 tabular-nums">
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-400" aria-hidden /><b className="font-medium text-neutral-300">{stats.done}/{stats.speakable}</b> generated</span>
                  {sep}
                  <span className="inline-flex items-center gap-1.5"><Loader2 size={14} className={`text-sky-400 ${stats.busy ? "animate-spin" : ""}`} aria-hidden /><b className="font-medium text-neutral-300">{stats.busy}</b> generating</span>
                  {sep}
                  <span className="inline-flex items-center gap-1.5"><Pencil size={14} className="text-amber-400" aria-hidden /><b className="font-medium text-neutral-300">{stats.changed}</b> changed</span>
                  {stats.errors > 0 && (
                    <>
                      {sep}
                      <span className="inline-flex items-center gap-1.5 text-red-400"><AlertTriangle size={14} aria-hidden /><b className="font-medium">{stats.errors}</b> failed</span>
                    </>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  {stats.busy > 0 && <button className={ghost} onClick={stop}><Square size={14} aria-hidden /> Stop</button>}
                  <button className={ghost} onClick={() => generate(true)} title="Regenerate every paragraph"><RefreshCw size={14} aria-hidden /> Regenerate all</button>
                  <button className="btn btn-sm" onClick={() => setDialog("export")}><Download size={14} aria-hidden /> Export</button>
                  <button className="btn btn-sm btn-primary" disabled={!stats.pending} onClick={() => generate(false)}>
                    <AudioLines size={14} aria-hidden /> Generate
                    {stats.pending > 0 && <span className="rounded-[3px] bg-neutral-950 px-1.5 text-[11px] leading-4 text-neutral-100 tabular-nums paper:rounded-full paper:bg-neutral-100/15 paper:text-neutral-100">{stats.pending}</span>}
                  </button>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {/* Select-style box around the picker button (not a <label>: the picker's modal renders inside it). */}
                <div className="inline-flex h-7 items-center gap-1 rounded-(--radius) border border-neutral-700 bg-neutral-900 pl-2.5 pr-2 text-[12.5px] hover:border-neutral-600">
                  <span className="text-neutral-500">Voice</span>
                  <VoicePicker
                    className="btn-ghost btn-sm border-0 px-1 hover:bg-transparent"
                    value={chapter.voice_id ? { id: chapter.voice_id, name: chapter.voice_name || chapter.voice_id } : null}
                    onChange={setChapterVoice}
                    defaultLanguage={project.language}
                    allowInherit
                    inheritLabel={`Project voice (${project.voice_name || "none"})`}
                  />
                  <ChevronDown size={14} className="text-neutral-500" aria-hidden />
                </div>
                <span className="mx-1.5 h-[18px] w-px bg-neutral-800 paper:bg-neutral-700" aria-hidden />
                <button className={ghost} onClick={() => setDialog("paste")}><Clipboard size={14} aria-hidden /> Paste text</button>
                <button className={ghost} onClick={() => actions.insert(paragraphs.at(-1)?.id ?? "start", { text: "" })}><Plus size={14} aria-hidden /> Paragraph</button>
                <button className={ghost} onClick={() => actions.insert(paragraphs.at(-1)?.id ?? "start", { pauseMs: 1000 })}><Timer size={14} aria-hidden /> Pause</button>
                <span
                  className="ml-auto flex items-center gap-1.5 text-xs text-neutral-500"
                  title="Enter: new paragraph (splits in the middle, adds above at the start) · Shift+Enter: new line · Backspace at the start: merge with the one above / delete an empty paragraph · Delete at the end: merge the next one · ↑/↓ move between paragraphs · paste several lines to add several paragraphs"
                >
                  Play / pause <kbd className="rounded-[3px] border border-neutral-700 px-1 font-sans text-[11px] leading-4">Space</kbd>
                  Regenerate line <kbd className="rounded-[3px] border border-neutral-700 px-1 font-sans text-[11px] leading-4">Ctrl/⌘ ↵</kbd>
                </span>
              </div>
            </div>
            {error && (
              <div className="px-6 pt-2" onClick={() => setError(null)}>
                <ErrorText error={error + "  (click to dismiss)"} />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto px-6 pt-1.5 pb-6 paper:pt-4" lang={project.language}>
              <div className="editor-col">
                {paragraphs.map((p, i) => (
                  <ParagraphRow
                    key={p.id}
                    p={p}
                    index={i}
                    chapter={chapterVoice}
                    project={project}
                    current={current === p.id}
                    playback={current === p.id && curItem ? { elapsedMs: pos.ms - curItem.startMs, durationMs: curItem.durationMs, playing: pos.playing } : null}
                    focusRequest={focusRequest?.id === p.id ? focusRequest : null}
                    actions={actions}
                  />
                ))}
                {paragraphs.length > 0 ? (
                  <button
                    className="mt-2.5 ml-[45px] flex h-8 w-[calc(100%-45px)] items-center gap-2 rounded-(--radius-lg) border border-dashed border-neutral-700 px-3 text-left text-[12.5px] text-neutral-500 hover:border-neutral-600 hover:text-neutral-300"
                    onClick={addAtEnd}
                  >
                    <Plus size={14} aria-hidden /><b className="font-medium text-neutral-300">Add paragraph</b> · or paste text to split into paragraphs
                  </button>
                ) : (
                  <div className="card mt-6 p-10 text-center text-neutral-400">
                    This chapter is empty.
                    <div className="mt-3 flex justify-center gap-2">
                      <button className="btn btn-primary" onClick={() => setDialog("paste")}><Clipboard size={16} aria-hidden /> Paste text</button>
                      <button className="btn" onClick={() => actions.insert("start", { text: "" })}><Plus size={16} aria-hidden /> Type a paragraph</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <Player
              ref={player}
              chapterId={chapter.id}
              audioKey={timeline?.key ?? null}
              hasAudio={Boolean(timeline?.hasAudio)}
              durationMs={timeline?.durationMs ?? 0}
              timeline={timeline?.timeline ?? []}
              paragraphs={paragraphs}
              onCurrent={setCurrent}
              onPosition={onPosition}
            />
          </>
        ) : (
          <div className="m-auto text-center text-neutral-400">
            <ErrorText error={error} />
            <p className="mb-3">Add a chapter to start.</p>
            <div className="flex justify-center gap-2">
              <button className="btn btn-primary" onClick={addChapter}><Plus size={16} aria-hidden /> Add chapter</button>
              <button className="btn" onClick={() => setDialog("import")}><Upload size={16} aria-hidden /> Import files</button>
            </div>
          </div>
        )}
      </section>
      {dialog === "paste" && chapter && (
        <PasteDialog chapter={chapter} hasParagraphs={paragraphs.length > 0} onClose={() => setDialog(null)} onDone={(ps) => { setParagraphs(ps); setDialog(null); loadProject(); }} />
      )}
      {dialog === "import" && (
        <ImportFilesDialog
          projectId={projectId}
          onClose={() => setDialog(null)}
          onDone={(cs) => {
            setChapters(cs);
            setDialog(null);
            if (!chapterId && cs[0]) setChapterId(cs[0].id);
          }}
        />
      )}
      {dialog === "export" && <ExportDialog project={project} chapters={chapters} currentChapterId={chapterId} onClose={() => setDialog(null)} />}
      {dialog === "settings" && <ProjectSettingsDialog project={project} onClose={() => setDialog(null)} onSaved={setProject} />}
    </div>
  );
}

"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VoicePicker } from "@/components/VoicePicker";
import { ErrorText } from "@/components/ui";
import { api } from "@/lib/api";
import { LANGUAGES, MODELS } from "@/lib/constants";
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
    let pending = 0, busy = 0, done = 0, speakable = 0, errors = 0;
    for (const p of paragraphs) {
      if (!project || !p.text.trim() || isPauseOnly(p.text)) continue;
      const s = effectiveSettings(p, chapterVoice, project);
      speakable++;
      if (p.status === "queued" || p.status === "generating") busy++;
      else if (needsGeneration(p, s)) pending++;
      if (p.active_version_id && !isStale(p, s)) done++;
      if (p.status === "error") errors++;
    }
    return { pending, busy, done, speakable, errors };
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

  return (
    <div className="flex h-full">
      {/* Chapters sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-800">
        <div className="border-b border-neutral-800 p-3">
          <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">← Projects</Link>
          <div className="mt-1 truncate font-semibold" title={project.name}>{project.name}</div>
          <div className="text-xs text-neutral-500">
            {LANGUAGES.find((l) => l.code === project.language)?.name ?? project.language} · {MODELS.find((m) => m.id === project.model_id)?.label ?? project.model_id}
          </div>
          <div className="truncate text-xs text-neutral-500">🎙 {project.voice_name || "No default voice"}</div>
          <button className="btn btn-sm mt-2" onClick={() => setDialog("settings")}>Project settings</button>
        </div>
        <div className="flex items-center justify-between px-3 pt-3 text-sm font-medium">
          Chapters
          <span className="flex gap-1">
            <button className="btn btn-sm" onClick={() => setDialog("import")} title="Import .txt/.docx/.zip as chapters">Import</button>
            <button className="btn btn-sm" onClick={addChapter}>+ Add</button>
          </span>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
          {chapters.map((c) => {
            const complete = c.paragraph_count > 0 && c.ready_count >= c.paragraph_count;
            return (
              <div
                key={c.id}
                draggable
                onDragStart={() => (dragId.current = c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(c.id)}
                onClick={() => setChapterId(c.id)}
                onDoubleClick={() => renameChapter(c)}
                className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${c.id === chapterId ? "bg-neutral-800" : "hover:bg-neutral-900"}`}
              >
                <span className="cursor-grab text-neutral-600" title="Drag to reorder">⋮⋮</span>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-[10px] text-neutral-500">{c.ready_count}/{c.paragraph_count}</span>
                {complete && <span className="text-green-400">✓</span>}
                <button className="hidden text-xs text-neutral-500 hover:text-white group-hover:inline" onClick={(e) => { e.stopPropagation(); renameChapter(c); }}>✎</button>
                <button className="hidden text-xs text-neutral-500 hover:text-red-400 group-hover:inline" onClick={(e) => { e.stopPropagation(); deleteChapter(c); }}>🗑</button>
              </div>
            );
          })}
          {!chapters.length && <div className="p-3 text-sm text-neutral-500">No chapters. Add one or import files.</div>}
        </div>
      </aside>

      {/* Editor */}
      <section className="flex min-w-0 flex-1 flex-col">
        {chapter ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-4 py-2">
              <div className="mr-2 font-medium">{chapter.name}</div>
              <VoicePicker
                className="btn-sm"
                value={chapter.voice_id ? { id: chapter.voice_id, name: chapter.voice_name || chapter.voice_id } : null}
                onChange={setChapterVoice}
                defaultLanguage={project.language}
                allowInherit
                inheritLabel={`Project voice (${project.voice_name || "none"})`}
              />
              <button className="btn btn-sm" onClick={() => setDialog("paste")}>Paste text</button>
              <button className="btn btn-sm" onClick={() => actions.insert(paragraphs.at(-1)?.id ?? "start", { text: "" })}>+ Paragraph</button>
              <button className="btn btn-sm" onClick={() => actions.insert(paragraphs.at(-1)?.id ?? "start", { pauseMs: 1000 })}>+ Pause</button>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-neutral-400">
                  {stats.done}/{stats.speakable} generated
                  {stats.busy > 0 && ` · ${stats.busy} in progress`}
                  {stats.errors > 0 && <span className="text-red-400"> · {stats.errors} failed</span>}
                </span>
                {stats.busy > 0 && <button className="btn btn-sm" onClick={stop}>Stop</button>}
                <button className="btn btn-sm btn-primary" disabled={!stats.pending} onClick={() => generate(false)}>
                  Generate{stats.pending ? ` (${stats.pending})` : ""}
                </button>
                <button className="btn btn-sm" onClick={() => generate(true)} title="Regenerate every paragraph">Regenerate all</button>
                <button className="btn btn-sm" onClick={() => setDialog("export")}>Export</button>
              </div>
            </div>
            {error && (
              <div className="px-4 pt-2" onClick={() => setError(null)}>
                <ErrorText error={error + "  (click to dismiss)"} />
              </div>
            )}
            <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-3" lang={project.language}>
              <div className="mx-auto w-full max-w-4xl space-y-0.5">
                {paragraphs.map((p, i) => (
                  <ParagraphRow
                    key={p.id}
                    p={p}
                    index={i}
                    chapter={chapterVoice}
                    project={project}
                    current={current === p.id}
                    focusRequest={focusRequest?.id === p.id ? focusRequest : null}
                    actions={actions}
                  />
                ))}
                {!paragraphs.length && (
                  <div className="card mt-6 p-10 text-center text-neutral-400">
                    This chapter is empty.
                    <div className="mt-3 flex justify-center gap-2">
                      <button className="btn btn-primary" onClick={() => setDialog("paste")}>Paste text</button>
                      <button className="btn" onClick={() => actions.insert("start", { text: "" })}>Type a paragraph</button>
                    </div>
                  </div>
                )}
              </div>
              {paragraphs.length > 0 && (
                // Click the free space below the text to add a paragraph at the end.
                <div className="mx-auto min-h-32 w-full max-w-4xl flex-1 cursor-text" onClick={addAtEnd}>
                  <p className="pt-6 text-center text-xs text-neutral-600">
                    Enter: new paragraph (splits in the middle, adds above at the start) · Shift+Enter: new line · Backspace at the start: merge with the one above / delete an empty paragraph · Delete at the end: merge the next one · ↑/↓ move between paragraphs · paste several lines to add several paragraphs · Ctrl/Cmd+Enter regenerates · Click here to add a paragraph
                  </p>
                </div>
              )}
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
            />
          </>
        ) : (
          <div className="m-auto text-center text-neutral-400">
            <ErrorText error={error} />
            <p className="mb-3">Add a chapter to start.</p>
            <div className="flex justify-center gap-2">
              <button className="btn btn-primary" onClick={addChapter}>+ Add chapter</button>
              <button className="btn" onClick={() => setDialog("import")}>Import files</button>
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

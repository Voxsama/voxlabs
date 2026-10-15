"use client";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { BROKEN_PASTE_MESSAGE, readPaste } from "@/lib/clipboard";
import { effectiveSettings, isStale } from "@/lib/settings";
import { breakDurations, breakTag, formatMs, isPauseOnly, pauseDurationMs, splitIntoParagraphs } from "@/lib/text";
import type { AudioVersion, Paragraph, Project } from "@/lib/types";
import { ParagraphSettingsChip } from "./GenerationSettings";

export type Caret = "start" | "end" | number;
export type FocusRequest = { id: string; caret: Caret };

export interface RowActions {
  updated: (p: Paragraph) => void;
  replaceAll: (ps: Paragraph[], focusId?: string, caret?: Caret) => void;
  remove: (id: string) => void;
  /** Insert an empty paragraph (or a pause) after `id`, or before it when `above`. */
  insert: (id: string, opts: { text?: string; pauseMs?: number; above?: boolean }) => void;
  /** The paragraph right before (-1) or after (1) `id`. */
  neighbor: (id: string, dir: -1 | 1) => Paragraph | undefined;
  /** Focus the nearest speech (non-pause) row before/after `id`. Returns false when there is none. */
  focusSpeech: (id: string, dir: -1 | 1, caret: Caret) => boolean;
  playFrom: (id: string) => void;
  setError: (msg: string) => void;
}

interface Props {
  p: Paragraph;
  index: number;
  chapter: { voice_id: string | null; voice_name: string | null } | null;
  project: Project;
  current: boolean;
  focusRequest: FocusRequest | null;
  actions: RowActions;
}

const STATUS_COLOR: Record<string, string> = {
  idle: "border-neutral-700",
  queued: "border-amber-500",
  generating: "border-sky-400 animate-pulse",
  done: "border-purple-500",
  error: "border-red-500",
};

/**
 * Multi-line paste into a row at selection [start, end): the text before the caret + the first pasted
 * paragraph stay in this row, the other pasted paragraphs follow it, and the text after the caret is
 * appended to the last one. Pause lines stay their own rows. `caret` = where the paste ends in the last text.
 */
export function pasteSplit(value: string, start: number, end: number, pasted: string): { texts: string[]; caret: number } {
  const texts = splitIntoParagraphs(pasted);
  if (!texts.length) return { texts, caret: start };
  const before = value.slice(0, start);
  const after = value.slice(end);
  if (before.trim()) {
    if (isPauseOnly(texts[0])) texts.unshift(before.trimEnd());
    else texts[0] = before + texts[0];
  }
  let caret = texts[texts.length - 1].length;
  if (after.trim()) {
    if (isPauseOnly(texts[texts.length - 1])) {
      texts.push(after.trimStart());
      caret = 0;
    } else texts[texts.length - 1] += after;
  }
  return { texts, caret };
}

/** Pixel top of the caret at `pos` (mirror-div measurement), to detect the first/last visual line. */
function caretTop(el: HTMLTextAreaElement, pos: number): number {
  const cs = getComputedStyle(el);
  const d = document.createElement("div");
  d.style.cssText = `position:absolute;visibility:hidden;top:0;left:0;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;width:${el.offsetWidth}px;font:${cs.font};letter-spacing:${cs.letterSpacing};padding:${cs.padding};border:${cs.border}`;
  d.textContent = el.value.slice(0, pos);
  const mark = document.createElement("span");
  mark.textContent = "​";
  d.append(mark);
  document.body.append(d);
  const top = mark.offsetTop;
  d.remove();
  return top;
}

function ParagraphRowInner({ p, index, chapter, project, current, focusRequest, actions }: Props) {
  const [dirty, setDirty] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  // The textarea is uncontrolled: React never writes its value while it has focus (typing, IME
  // composition). Server text is copied in only when the row is not focused, or explicitly after
  // our own split/merge/paste. `base` = the last text the server has for this row.
  const base = useRef(p.text);
  const resize = () => {
    const el = ta.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  };
  const setText = (t: string) => {
    base.current = t;
    if (ta.current && ta.current.value !== t) ta.current.value = t;
    resize();
    setDirty(false);
  };
  useLayoutEffect(() => {
    if (ta.current && document.activeElement === ta.current) return;
    setText(p.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.text]);

  useEffect(() => {
    const el = ta.current;
    if (focusRequest?.id !== p.id || !el) return;
    el.focus();
    const c = focusRequest.caret;
    const pos = c === "start" ? 0 : c === "end" ? el.value.length : Math.min(c, el.value.length);
    el.setSelectionRange(pos, pos);
  }, [focusRequest, p.id]);

  useEffect(() => {
    if (current) rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);

  const patch = async (body: object) => {
    try {
      actions.updated(await api<Paragraph>(`/api/paragraphs/${p.id}`, { method: "PATCH", json: body }));
    } catch (e) {
      actions.setError((e as Error).message);
    }
  };

  const flush = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const text = ta.current?.value;
    if (text === undefined || text === base.current) return setDirty(false);
    base.current = text;
    await patch({ text });
    setDirty(ta.current?.value !== base.current);
  };

  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = composing.current ? null : setTimeout(flush, 700);
  };

  const onInput = () => {
    resize();
    setDirty(true);
    scheduleSave();
  };

  const regenerate = async () => {
    await flush();
    try {
      const r = await api<{ paragraph: Paragraph }>(`/api/paragraphs/${p.id}/generate`, { method: "POST" });
      actions.updated(r.paragraph);
    } catch (e) {
      actions.setError((e as Error).message);
    }
  };

  /** POST a split/merge/expand route, then show the new list and move the caret. */
  const restructure = async (url: string, json: object | undefined, focusId: (r: { id: string }) => string, caret: Caret) => {
    try {
      const r = await api<{ id: string; paragraphs: Paragraph[] }>(url, { method: "POST", json });
      const mine = r.paragraphs.find((x) => x.id === p.id);
      if (mine) setText(mine.text);
      actions.replaceAll(r.paragraphs, focusId(r), caret);
    } catch (e) {
      actions.setError((e as Error).message);
    }
  };

  const split = (at: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    restructure(`/api/paragraphs/${p.id}/split`, { at, text: ta.current?.value }, (r) => r.id, "start");
  };

  const mergeIntoPrevious = async (prev: Paragraph) => {
    await flush();
    restructure(`/api/paragraphs/${p.id}/merge`, undefined, (r) => r.id, prev.text ? prev.text.length + 1 : 0);
  };

  const mergeNext = async (next: Paragraph) => {
    const len = ta.current?.value.length ?? 0;
    await flush();
    restructure(`/api/paragraphs/${next.id}/merge`, undefined, () => p.id, len ? len + 1 : 0);
  };

  const insert = async (above: boolean) => {
    await flush();
    actions.insert(p.id, { text: "", above });
  };

  const del = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (ta.current) base.current = ta.current.value; // nothing left to save on blur
    await api(`/api/paragraphs/${p.id}`, { method: "DELETE" }).catch((e) => actions.setError(e.message));
    actions.remove(p.id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (composing.current || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    const { selectionStart: at, selectionEnd, value } = el;
    const caretOnly = at === selectionEnd;
    const plain = !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      regenerate();
    } else if (e.key === "Enter" && plain) {
      e.preventDefault();
      if (caretOnly && at === value.length) insert(false);
      else if (caretOnly && at === 0) insert(true);
      else split(at);
    } else if (e.key === "Backspace" && plain && caretOnly && at === 0) {
      const prev = actions.neighbor(p.id, -1);
      if (!prev) return;
      e.preventDefault();
      if (!value.trim()) {
        actions.focusSpeech(p.id, -1, "end");
        del();
      } else if (isPauseOnly(prev.text)) actions.focusSpeech(p.id, -1, "end");
      else mergeIntoPrevious(prev);
    } else if (e.key === "Delete" && plain && caretOnly && at === value.length) {
      const next = actions.neighbor(p.id, 1);
      if (!next || isPauseOnly(next.text)) return;
      e.preventDefault();
      mergeNext(next);
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && plain && caretOnly) {
      const up = e.key === "ArrowUp";
      const edge = caretTop(el, up ? 0 : value.length);
      if (caretTop(el, at) === edge && actions.focusSpeech(p.id, up ? -1 : 1, up ? "end" : "start")) e.preventDefault();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const { text: pasted, broken, fromHtml } = readPaste(e.clipboardData);
    if (broken) {
      e.preventDefault();
      actions.setError(BROKEN_PASTE_MESSAGE);
      return;
    }
    if (!/[\r\n]/.test(pasted)) {
      // Single line: normal paste, unless we had to recover the text from the HTML copy.
      if (fromHtml) {
        e.preventDefault();
        document.execCommand("insertText", false, pasted);
      }
      return;
    }
    const el = e.currentTarget;
    const { texts, caret } = pasteSplit(el.value, el.selectionStart, el.selectionEnd, pasted);
    if (texts.length < 2) return;
    e.preventDefault();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    restructure(`/api/paragraphs/${p.id}/expand`, { texts }, (r) => r.id, caret);
  };

  const pause = isPauseOnly(p.text);
  const stale = isStale(p, effectiveSettings(p, chapter, project));
  const color = p.status === "done" && stale ? "border-amber-400" : STATUS_COLOR[p.status] ?? STATUS_COLOR.idle;

  const setPauseMs = (ms: number) => {
    const whole = Math.floor(ms / 1000);
    const rest = ms % 1000;
    const text = breakTag(1000).repeat(whole) + (rest ? breakTag(rest) : "");
    if (text) patch({ text });
  };

  return (
    <div
      ref={rowRef}
      className={`group flex gap-3 rounded-md px-2 py-1.5 ${current ? "bg-purple-950/40" : "hover:bg-neutral-900"}`}
    >
      <div className="w-8 shrink-0 pt-1.5 text-right text-xs tabular-nums text-neutral-500">{index + 1}</div>
      <div className={`min-w-0 flex-1 border-l-2 pl-3 ${color}`}>
        {pause ? (
          <div className="flex flex-wrap items-center gap-1.5 py-1">
            {breakDurations(p.text).map((ms, i) => (
              <span key={i} className="rounded-full bg-purple-900/70 px-2 py-0.5 text-xs text-purple-100">⏸ {ms % 1000 ? `${ms}ms` : `${ms / 1000}s`}</span>
            ))}
            <span className="ml-2 text-xs text-neutral-400">Pause {formatMs(pauseDurationMs(p.text))}</span>
            <button className="btn btn-sm btn-ghost" title="Shorter" onClick={() => setPauseMs(Math.max(1000, pauseDurationMs(p.text) - 1000))}>−1s</button>
            <button className="btn btn-sm btn-ghost" title="Longer" onClick={() => setPauseMs(pauseDurationMs(p.text) + 1000)}>+1s</button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                const v = prompt("Pause length in seconds (e.g. 5 or 2.5)", String(pauseDurationMs(p.text) / 1000));
                const ms = Math.round(Number(v) * 1000);
                if (v && ms > 0) setPauseMs(ms);
              }}
            >
              Set length
            </button>
          </div>
        ) : (
          <textarea
            ref={ta}
            rows={1}
            lang={project.language}
            defaultValue={p.text}
            onInput={onInput}
            onCompositionStart={() => {
              composing.current = true;
              if (saveTimer.current) clearTimeout(saveTimer.current);
            }}
            onCompositionEnd={() => {
              composing.current = false;
              scheduleSave();
            }}
            onBlur={() => {
              composing.current = false;
              flush();
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder="Type or paste text..."
            className="block w-full resize-none overflow-hidden bg-transparent text-[15px] leading-relaxed outline-none"
          />
        )}
        <div className="mt-0.5 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          {!pause && (
            <span>
              {p.status === "queued" && "Queued"}
              {p.status === "generating" && "Generating..."}
              {p.status === "error" && <span className="text-red-400">Error: {p.error}</span>}
              {p.status === "done" && !stale && p.active_duration_ms != null && `✓ ${formatMs(p.active_duration_ms)}`}
              {p.status === "done" && stale && <span className="text-amber-400">Changed since generated — regenerate</span>}
              {p.status === "idle" && !p.active_version_id && "Not generated"}
              {dirty && " · saving..."}
            </span>
          )}
          {!pause && (
            // The chip's dialog renders inline: keep its clicks/keys away from the row.
            <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <ParagraphSettingsChip p={p} chapter={chapter} project={project} onPatch={patch} />
            </span>
          )}
          <span className="ml-auto flex flex-wrap gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
            {!pause && p.active_version_id && <button className="btn btn-sm btn-ghost" onClick={() => actions.playFrom(p.id)}>▶ Play</button>}
            {!pause && (
              <button className="btn btn-sm btn-ghost" disabled={p.status === "queued" || p.status === "generating"} onClick={regenerate} title="Ctrl+Enter">
                ⟳ {p.active_version_id ? "Regenerate" : "Generate"}
              </button>
            )}
            {p.version_count > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setShowHistory(true)}>History ({p.version_count})</button>}
            <button className="btn btn-sm btn-ghost" onClick={() => actions.insert(p.id, { text: "", above: true })}>+ Text above</button>
            <button className="btn btn-sm btn-ghost" onClick={() => actions.insert(p.id, { pauseMs: 1000, above: true })}>+ Pause above</button>
            <button className="btn btn-sm btn-ghost" onClick={() => actions.insert(p.id, { text: "" })}>+ Text</button>
            <button className="btn btn-sm btn-ghost" onClick={() => actions.insert(p.id, { pauseMs: 1000 })}>+ Pause</button>
            <button className="btn btn-sm btn-ghost text-red-300" onClick={del}>Delete</button>
          </span>
        </div>
      </div>
      {showHistory && <HistoryDialog p={p} onClose={() => setShowHistory(false)} onActivated={actions.updated} />}
    </div>
  );
}

export const ParagraphRow = memo(ParagraphRowInner);

function HistoryDialog({ p, onClose, onActivated }: { p: Paragraph; onClose: () => void; onActivated: (p: Paragraph) => void }) {
  const [versions, setVersions] = useState<AudioVersion[]>([]);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    api<AudioVersion[]>(`/api/paragraphs/${p.id}/versions`).then(setVersions);
  }, [p.id, p.version_count]);
  const play = (id: string) => {
    if (!audio.current) return;
    audio.current.src = `/api/audio/${id}`;
    audio.current.play().catch(() => {});
  };
  const activate = async (id: string) => {
    onActivated(await api<Paragraph>(`/api/paragraphs/${p.id}/versions`, { method: "POST", json: { versionId: id } }));
  };
  return (
    <Modal title="Generation history" onClose={onClose} wide>
      <audio ref={audio} />
      <div className="max-h-[60vh] divide-y divide-neutral-800 overflow-auto rounded-md border border-neutral-800">
        {versions.map((v) => {
          const s = JSON.parse(v.settings_json || "{}");
          const active = v.id === p.active_version_id;
          return (
            <div key={v.id} className={`flex items-start gap-3 p-3 text-sm ${active ? "bg-purple-950/40" : ""}`}>
              <button className="btn btn-sm" onClick={() => play(v.id)}>▶</button>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-neutral-400">
                  v{v.version_no} · {new Date(v.created_at).toLocaleString()} · {formatMs(v.duration_ms)} · {s.voice_name || v.voice_id} · {v.model_id}
                  {s.speed && s.speed !== 1 ? ` · speed ${s.speed}` : ""}
                </div>
                <div className="mt-1 whitespace-pre-wrap">{v.text_snapshot}</div>
              </div>
              {active ? <span className="text-xs text-purple-300">In use</span> : <button className="btn btn-sm" onClick={() => activate(v.id)}>Use this</button>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

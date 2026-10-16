"use client";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { formatMs, isPauseOnly, plainText } from "@/lib/text";
import type { Paragraph } from "@/lib/types";

export interface TimelineItem {
  paragraphId: string;
  startMs: number;
  durationMs: number;
  pause: boolean;
}

export interface PlayerHandle {
  playFrom: (paragraphId: string) => void;
}

interface Props {
  chapterId: string;
  audioKey: string | null;
  hasAudio: boolean;
  durationMs: number;
  timeline: TimelineItem[];
  paragraphs: Paragraph[];
  onCurrent: (paragraphId: string | null) => void;
  /** Playback position (ms in the chapter), for the current row's "0:04 / 0:11" and progress line. */
  onPosition: (ms: number, playing: boolean) => void;
}

const RATES = [0.75, 1, 1.25, 1.5, 2];

/** Sticky bottom player: plays the merged chapter WAV, highlights the current paragraph. */
export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { chapterId, audioKey, hasAudio, durationMs, timeline, paragraphs, onCurrent, onPosition },
  ref,
) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [rate, setRate] = useState(1);
  const pendingSeek = useRef<{ ms: number; play: boolean } | null>(null);
  const lastCurrent = useRef<string | null>(null);
  const lastPos = useRef({ ms: 0, playing: false });

  const src = hasAudio && audioKey ? `/api/chapters/${chapterId}/audio?k=${audioKey}` : undefined;

  // Keep position when the audio is rebuilt (e.g. after a regenerate).
  // (Setting a new src resets currentTime, so use the last position we saw.)
  useLayoutEffect(() => {
    if (!src) return;
    if (!pendingSeek.current && lastPos.current.ms > 0) pendingSeek.current = { ms: lastPos.current.ms, play: lastPos.current.playing };
  }, [src]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate, src]);

  const currentItem = (ms: number) => timeline.find((i) => ms >= i.startMs && ms < i.startMs + i.durationMs) ?? null;

  const seekMs = (ms: number, play?: boolean) => {
    const a = audio.current;
    if (!a) return;
    if (a.readyState < 1) {
      pendingSeek.current = { ms, play: Boolean(play) };
      return;
    }
    a.currentTime = ms / 1000;
    setT(ms);
    if (play) a.play().catch(() => {});
  };

  useImperativeHandle(ref, () => ({
    playFrom(paragraphId: string) {
      const item = timeline.find((i) => i.paragraphId === paragraphId);
      if (item) seekMs(item.startMs + 1, true);
    },
  }));

  const step = (dir: 1 | -1) => {
    const speakable = timeline.filter((i) => !i.pause);
    const idx = speakable.findIndex((i) => t >= i.startMs && t < i.startMs + i.durationMs);
    let target: TimelineItem | undefined;
    if (dir === 1) target = speakable.find((i) => i.startMs > t + 10);
    else {
      const cur = speakable[idx];
      // If more than 2s into the current paragraph, go to its start; else the previous one.
      target = cur && t - cur.startMs > 2000 ? cur : speakable.filter((i) => i.startMs < (cur?.startMs ?? t) - 10).pop();
    }
    if (target) seekMs(target.startMs + 1, playing);
  };

  const onTime = () => {
    const a = audio.current!;
    const ms = a.currentTime * 1000;
    setT(ms);
    lastPos.current = { ms, playing: !a.paused };
    onPosition(ms, !a.paused);
    const id = currentItem(ms)?.paragraphId ?? null;
    if (id !== lastCurrent.current) {
      lastCurrent.current = id;
      onCurrent(id);
    }
  };

  const toggle = () => (playing ? audio.current?.pause() : audio.current?.play().catch(() => {}));
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  // Space plays/pauses, but only when focus is not in a field or on a control (those use Space themselves).
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if ((e.target as Element | null)?.closest?.("input, textarea, select, button, a, [contenteditable], [role=dialog]")) return;
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src]);

  const textOf = (id: string) => plainText(paragraphs.find((p) => p.id === id)?.text ?? "");
  const cur = currentItem(t) ?? timeline[0];
  const curIndex = cur ? paragraphs.findIndex((p) => p.id === cur.paragraphId) : -1;
  const curWords = cur && !cur.pause ? textOf(cur.paragraphId).split(" ") : [];
  const pauses = paragraphs.filter((p) => isPauseOnly(p.text)).length;
  const speech = paragraphs.filter((p) => p.text.trim()).length - pauses;
  const ib = "btn btn-ghost size-[30px] justify-center p-0 text-neutral-300";

  return (
    <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-6 border-t border-neutral-700 bg-neutral-900 px-6 py-3 paper:border-neutral-700">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => {
          setPlaying(true);
          onPosition(lastPos.current.ms, true);
        }}
        onPause={() => {
          setPlaying(false);
          lastPos.current.playing = false;
          onPosition(lastPos.current.ms, false);
        }}
        onEnded={() => {
          setPlaying(false);
          lastPos.current = { ms: 0, playing: false };
          onPosition(0, false);
        }}
        onTimeUpdate={onTime}
        onLoadedMetadata={() => {
          const a = audio.current!;
          a.playbackRate = rate;
          const p = pendingSeek.current;
          pendingSeek.current = null;
          if (p) {
            a.currentTime = Math.min(p.ms / 1000, a.duration || p.ms / 1000);
            if (p.play) a.play().catch(() => {});
          }
        }}
      />
      <div className="flex items-center gap-1.5 tabular-nums">
        <button className={ib} disabled={!src} onClick={() => step(-1)} title="Previous paragraph" aria-label="Previous paragraph"><SkipBack size={16} aria-hidden /></button>
        <button
          className="btn btn-primary size-9 justify-center rounded-full p-0 paper:size-10 paper:border-purple-500 paper:bg-purple-500 paper:text-on-accent paper:hover:bg-purple-500/90"
          disabled={!src}
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
        >
          {playing ? <Pause size={16} fill="currentColor" aria-hidden /> : <Play size={16} fill="currentColor" aria-hidden />}
        </button>
        <button className={ib} disabled={!src} onClick={() => step(1)} title="Next paragraph" aria-label="Next paragraph"><SkipForward size={16} aria-hidden /></button>
        <span className="ml-2.5 min-w-[92px] text-[13px] text-neutral-100">
          {formatMs(t)} <span className="text-neutral-500">/ {formatMs(durationMs)}</span>
        </span>
        <button
          className="btn btn-sm min-w-10 justify-center"
          onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])}
          aria-label={`Playback speed ${rate}x`}
          title="Playback speed"
        >
          {rate}x
        </button>
      </div>
      <div className="min-w-0">
        <div className="mb-1.5 flex justify-between gap-4 text-[11px] text-neutral-500 tabular-nums">
          <span className="min-w-0">
            {!src ? "Generate paragraphs to listen to this chapter." : cur?.pause ? <b className="font-medium text-neutral-300">Pause</b> : curIndex >= 0 && (
              <>
                <b className="font-medium text-neutral-300">¶ {curIndex + 1}</b> · {curWords.slice(0, 8).join(" ")}{curWords.length > 8 ? "…" : ""}
              </>
            )}
          </span>
          <span className="shrink-0">{speech} paragraphs · {pauses} pauses</span>
        </div>
        {/* One block per audio item, width proportional to its length. A transparent range input on top does the seeking (click, drag, arrow keys). */}
        <div className="relative h-[22px] rounded-sm has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring">
          <div className="flex h-full gap-0.5" aria-hidden>
            {src && durationMs > 0 && timeline.map((i) => {
              const end = i.startMs + i.durationMs;
              const cls = i.pause
                ? "h-2 self-center border-y border-dashed border-neutral-600"
                : t >= i.startMs && t < end ? "rounded-sm bg-purple-500"
                : end <= t ? "rounded-sm bg-neutral-500/60"
                : "rounded-sm bg-neutral-700";
              return <span key={i.paragraphId} className={`min-w-0.5 ${cls}`} style={{ flex: `${i.durationMs} 1 0` }} />;
            })}
            {!src && <span className="flex-1 rounded-sm border border-dashed border-neutral-700" />}
          </div>
          {src && durationMs > 0 && (
            <span className="pointer-events-none absolute -top-1 -bottom-1 w-0.5 rounded-full bg-neutral-100" style={{ left: `${(100 * Math.min(t, durationMs)) / durationMs}%` }}>
              <span className="absolute -top-1 -left-[3px] size-2 rounded-full bg-neutral-100" />
            </span>
          )}
          <input
            type="range"
            aria-label="Seek"
            aria-valuetext={`${formatMs(t)} of ${formatMs(durationMs)}`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
            min={0}
            max={Math.max(1, durationMs)}
            value={Math.min(t, durationMs)}
            disabled={!src}
            onChange={(e) => seekMs(Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
});

"use client";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { formatMs, plainText } from "@/lib/text";
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
}

/** Sticky bottom player: plays the merged chapter WAV, highlights the current paragraph. */
export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { chapterId, audioKey, hasAudio, durationMs, timeline, paragraphs, onCurrent },
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
    const id = currentItem(ms)?.paragraphId ?? null;
    if (id !== lastCurrent.current) {
      lastCurrent.current = id;
      onCurrent(id);
    }
  };

  const textOf = (id: string) => plainText(paragraphs.find((p) => p.id === id)?.text ?? "");

  return (
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-950 px-4 py-2">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          lastPos.current.playing = false;
        }}
        onEnded={() => {
          setPlaying(false);
          lastPos.current = { ms: 0, playing: false };
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
      <div className="flex items-center gap-3">
        <button className="btn btn-sm" disabled={!src} onClick={() => step(-1)} title="Previous paragraph" aria-label="Previous paragraph">⏮</button>
        <button
          className="btn btn-primary w-20 justify-center"
          disabled={!src}
          onClick={() => (playing ? audio.current?.pause() : audio.current?.play().catch(() => {}))}
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button className="btn btn-sm" disabled={!src} onClick={() => step(1)} title="Next paragraph" aria-label="Next paragraph">⏭</button>
        <span className="w-28 text-xs tabular-nums text-neutral-400">
          {formatMs(t)} / {formatMs(durationMs)}
        </span>
        <input
          type="range"
          className="flex-1 accent-purple-500"
          min={0}
          max={Math.max(1, durationMs)}
          value={Math.min(t, durationMs)}
          disabled={!src}
          onChange={(e) => seekMs(Number(e.target.value))}
        />
        <select className="input w-20" value={rate} onChange={(e) => setRate(Number(e.target.value))} title="Playback speed">
          {[0.75, 1, 1.25, 1.5, 2].map((r) => (
            <option key={r} value={r}>{r}x</option>
          ))}
        </select>
      </div>
      {/* Timeline strip: one block per paragraph, width proportional to its length. */}
      {src && durationMs > 0 && (
        <div className="mt-2 flex h-7 w-full overflow-hidden rounded">
          {timeline.map((i) => {
            const active = t >= i.startMs && t < i.startMs + i.durationMs;
            return (
              <button
                key={i.paragraphId}
                title={i.pause ? `Pause ${formatMs(i.durationMs)}` : textOf(i.paragraphId)}
                aria-label={i.pause ? `Pause ${formatMs(i.durationMs)}` : undefined}
                onClick={() => seekMs(i.startMs + 1, playing)}
                style={{ width: `${(100 * i.durationMs) / durationMs}%` }}
                className={`h-full min-w-px truncate border-r border-neutral-950 px-1 text-left text-[10px] leading-7 ${
                  i.pause ? "bg-neutral-800 text-neutral-500" : active ? "bg-purple-500 text-on-accent" : "bg-purple-900/70 text-purple-100"
                }`}
              >
                {i.pause ? "⏸" : textOf(i.paragraphId)}
              </button>
            );
          })}
        </div>
      )}
      {!src && <div className="mt-1 text-xs text-neutral-500">Generate paragraphs to listen to this chapter.</div>}
    </div>
  );
});

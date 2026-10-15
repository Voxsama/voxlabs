import fs from "node:fs";
import path from "node:path";
import { CartesiaError, encodingFor, tts, type TtsOptions } from "./cartesia";
import { generateRun } from "./cartesiaWs";
import { AUDIO_DIR, getSetting } from "./db";
import { emit } from "./events";
import { effectiveSettings, needsGeneration, settingsSnapshot, type GenSettings } from "./settings";
import { addVersion, getChapter, getParagraph, getProject, listParagraphs, nextVersionNo, projectIdOfParagraph, setStatus } from "./store";
import { isPauseOnly, toTranscript } from "./text";
import type { Paragraph } from "./types";
import { buildWav, durationMs, formatFor, parseWav } from "./wav";

// ponytail: long runs keep prosody but one failure costs the rest of the run (it falls back to bytes); 20 is a guess.
const MAX_RUN = 20;

/** One queue slot: a single paragraph (bytes API) or a run of consecutive paragraphs (WebSocket continuations). */
interface Job {
  ids: string[];
  chapterId: string;
  pending: Set<string>; // not finished yet
  abort: AbortController;
}

interface QueueState {
  queue: Job[];
  running: Set<Job>;
}

const g = globalThis as unknown as { __studioJobs?: QueueState };
const state: QueueState = g.__studioJobs ?? (g.__studioJobs = { queue: [], running: new Set() });

/** Call TTS, retrying rate limits (429) and server errors with backoff. */
async function ttsWithRetry(opts: TtsOptions, tries = 4): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await tts(opts);
    } catch (e) {
      const status = e instanceof CartesiaError ? e.status : 0;
      const retryable = status === 429 || status >= 500 || status === 0;
      if (!retryable || attempt >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1) + Math.random() * 500));
    }
  }
}

function concurrency(): number {
  const v = Number(getSetting("gen_concurrency") || process.env.GEN_CONCURRENCY || 3);
  return Math.min(10, Math.max(1, Number.isFinite(v) ? v : 3));
}

const jobs = () => [...state.queue, ...state.running];
const busy = (id: string) => jobs().some((j) => j.pending.has(id));
const speakable = (p: Paragraph) => Boolean(p.text.trim()) && !isPauseOnly(p.text);

function push(ids: string[], chapterId: string) {
  state.queue.push({ ids, chapterId, pending: new Set(ids), abort: new AbortController() });
  for (const id of ids) setStatus(id, "queued");
}

/** Queue single paragraphs (one bytes request each). Pause-only and empty paragraphs are skipped. */
export function enqueue(ids: string[]): number {
  let n = 0;
  for (const id of ids) {
    if (busy(id)) continue;
    const p = getParagraph(id);
    if (!speakable(p)) continue;
    push([id], p.chapter_id);
    n++;
  }
  pump();
  return n;
}

/**
 * Queue every paragraph of a chapter that is missing or has out-of-date audio. Consecutive pending
 * paragraphs with the same voice/speed/volume/emotion become one continuation run (pause rows do not
 * break a run; an up-to-date paragraph does).
 */
export function enqueueChapter(chapterId: string, opts: { all?: boolean } = {}): number {
  const c = getChapter(chapterId);
  const pr = getProject(c.project_id);
  let run: string[] = [];
  let runKey = "";
  let n = 0;
  const close = () => {
    if (run.length) push(run, chapterId);
    n += run.length;
    run = [];
  };
  for (const p of listParagraphs(chapterId)) {
    if (!speakable(p)) continue;
    const s = effectiveSettings(p, c, pr);
    if (busy(p.id) || !(opts.all || needsGeneration(p, s))) {
      close();
      continue;
    }
    const key = JSON.stringify([s.voiceId, s.speed, s.volume, s.emotion]);
    if (key !== runKey || run.length >= MAX_RUN) close();
    runKey = key;
    run.push(p.id);
  }
  close();
  pump();
  return n;
}

function restore(id: string) {
  try {
    setStatus(id, getParagraph(id).active_version_id ? "done" : "idle");
  } catch {
    /* deleted */
  }
}

/** Remove queued paragraphs of a chapter and stop its running continuation runs. */
export function cancelChapter(chapterId: string): number {
  const removed = state.queue.filter((j) => j.chapterId === chapterId);
  state.queue = state.queue.filter((j) => j.chapterId !== chapterId);
  let n = 0;
  for (const j of removed) for (const id of j.pending) (restore(id), n++);
  for (const j of state.running) {
    if (j.chapterId !== chapterId || j.ids.length < 2) continue; // a single paragraph just finishes
    n += j.pending.size;
    j.abort.abort();
  }
  return n;
}

function pump() {
  while (state.running.size < concurrency() && state.queue.length) {
    const job = state.queue.shift()!;
    state.running.add(job);
    runJob(job)
      .catch(() => {})
      .finally(() => {
        state.running.delete(job);
        if (job.abort.signal.aborted) for (const id of job.pending) restore(id);
        pump();
      });
  }
}

/** Store a finished clip as a new version (WAV header rewritten so its sizes are exact). */
function saveVersion(p: Paragraph, text: string, s: GenSettings, wavFile: Buffer, continuation: boolean) {
  const wav = parseWav(wavFile);
  const c = getChapter(p.chapter_id);
  const versionNo = nextVersionNo(p.id);
  // Stored with forward slashes so the data folder works on Windows, macOS and Linux alike.
  const rel = path.posix.join(c.project_id, c.id, `${p.id}-v${versionNo}.wav`);
  const abs = path.join(AUDIO_DIR, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buildWav(wav.format, wav.data));
  addVersion(p.id, {
    file_path: rel,
    duration_ms: durationMs(wav.format, wav.data.length),
    model_id: s.modelId,
    voice_id: s.voiceId!,
    text_snapshot: text,
    settings: { ...settingsSnapshot(s), continuation },
  });
  emit(c.project_id, { type: "paragraph", paragraph: getParagraph(p.id) });
}

function fail(id: string, e: unknown) {
  try {
    projectIdOfParagraph(id);
    setStatus(id, "error", e instanceof Error ? e.message : String(e));
  } catch {
    /* paragraph deleted mid-flight */
  }
}

async function runJob(job: Job) {
  const ps: Paragraph[] = [];
  for (const id of job.ids) {
    try {
      ps.push(getParagraph(id));
    } catch {
      job.pending.delete(id); // deleted while queued
    }
  }
  if (!ps.length) return;
  const texts = ps.map((p) => p.text); // snapshot: edits during generation make it stale, not wrong
  let s: GenSettings;
  try {
    const c = getChapter(ps[0].chapter_id);
    s = effectiveSettings(ps[0], c, getProject(c.project_id)); // a run shares one set of settings
    if (!s.voiceId) throw new Error("No voice selected. Pick a voice for the project, chapter or paragraph.");
  } catch (e) {
    for (const p of ps) (fail(p.id, e), job.pending.delete(p.id));
    return;
  }
  const fmt = formatFor(s.sampleRate, s.bitDepth);

  if (ps.length > 1) {
    try {
      setStatus(ps[0].id, "generating");
      await generateRun(texts.map(toTranscript), s, {
        signal: job.abort.signal,
        onAudio: (i, pcm) => {
          try {
            saveVersion(ps[i], texts[i], s, buildWav(fmt, pcm), true);
          } catch (e) {
            fail(ps[i].id, e);
          }
          job.pending.delete(ps[i].id);
          if (ps[i + 1]) {
            try {
              setStatus(ps[i + 1].id, "generating");
            } catch {
              /* deleted */
            }
          }
        },
      });
    } catch (e) {
      if (job.abort.signal.aborted) return;
      console.warn(`Continuation run failed, falling back to one request per paragraph: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Single paragraphs, and whatever a failed run did not finish.
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (!job.pending.has(p.id)) continue;
    if (job.abort.signal.aborted) return;
    try {
      setStatus(p.id, "generating");
      const audio = await ttsWithRetry({
        transcript: toTranscript(texts[i]),
        voiceId: s.voiceId!,
        modelId: s.modelId,
        language: s.language,
        speed: s.speed,
        volume: s.volume,
        emotion: s.emotion,
        sampleRate: s.sampleRate,
        encoding: encodingFor(s.bitDepth),
      });
      saveVersion(p, texts[i], s, audio, false);
    } catch (e) {
      fail(p.id, e);
    }
    job.pending.delete(p.id);
  }
}

export function queueStats() {
  return {
    queued: state.queue.reduce((a, j) => a + j.pending.size, 0),
    running: state.running.size,
    concurrency: concurrency(),
  };
}

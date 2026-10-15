// Continuations over the Cartesia WebSocket: consecutive paragraphs share one context so prosody
// carries across them (separate /tts/bytes calls "create seams in the audio").
import crypto from "node:crypto";
import WebSocket from "ws";
import { BASE_URL, CARTESIA_VERSION, CartesiaError, encodingFor, generationConfig, getApiKey } from "./cartesia";
import type { GenSettings } from "./settings";

/** Continuation chunks must each end a sentence and join into one valid transcript. */
export function forContinuation(transcript: string, language: string, last: boolean): string {
  const t = transcript.trim();
  const ended = /[.?!।॥]["'”’)\]]*$/.test(t) ? t : t + (language === "hi" ? "।" : ".");
  return last ? ended : ended + " ";
}

export interface RunOptions {
  signal?: AbortSignal;
  /** Called as soon as transcript `i` is complete (its flush is done). */
  onAudio?: (i: number, pcm: Buffer) => void;
  idleTimeoutMs?: number;
}

/**
 * Generate several transcripts in one continuation context. Returns raw PCM per transcript
 * (encoding/sample rate from the settings, mono).
 * Verified against the live API (2026-10): chunks carry `flush_id` 0, 1, 2… — one per flush, and the
 * final `continue:false` transcript gets the next id; `flush_done` closes each id; `done` ends the context.
 */
export function generateRun(transcripts: string[], s: GenSettings, opts: RunOptions = {}): Promise<Buffer[]> {
  if (!s.voiceId) return Promise.reject(new Error("No voice selected. Pick a voice for the project, chapter or paragraph."));
  if (opts.signal?.aborted) return Promise.reject(new Error("Cancelled"));
  const url = `${BASE_URL.replace(/^http/, "ws")}/tts/websocket?cartesia_version=${encodeURIComponent(CARTESIA_VERSION)}`;
  const contextId = crypto.randomUUID();
  const base: Record<string, unknown> = {
    model_id: s.modelId,
    voice: { id: s.voiceId },
    language: s.language,
    output_format: { container: "raw", encoding: encodingFor(s.bitDepth), sample_rate: s.sampleRate },
    context_id: contextId,
  };
  const gc = generationConfig(s);
  if (Object.keys(gc).length) base.generation_config = gc;

  return new Promise<Buffer[]>((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { "X-API-Key": getApiKey() } });
    const parts: Buffer[][] = transcripts.map(() => []);
    const out: (Buffer | undefined)[] = transcripts.map(() => undefined);
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      ws.removeAllListeners("message");
      ws.on("error", () => {}); // a late error after we are done must not crash the process
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.terminate();
      if (err) reject(err);
      else resolve(out as Buffer[]);
    };
    const idle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(new CartesiaError("Cartesia WebSocket timed out", 504)), opts.idleTimeoutMs ?? 60000);
    };
    const complete = (i: number) => {
      if (i < 0 || i >= out.length || out[i]) return;
      out[i] = Buffer.concat(parts[i]);
      parts[i] = [];
      opts.onAudio?.(i, out[i]!);
    };
    const onAbort = () => finish(new Error("Cancelled"));
    opts.signal?.addEventListener("abort", onAbort);
    idle();

    ws.on("unexpected-response", (_req, res) => {
      let body = "";
      res.on("data", (d: Buffer) => (body += d));
      res.on("end", () => finish(new CartesiaError(`Cartesia WebSocket ${res.statusCode}: ${body.slice(0, 300)}`, res.statusCode ?? 0)));
    });
    ws.on("error", (e) => finish(new CartesiaError(`Cartesia WebSocket: ${e.message}`, 0)));
    ws.on("close", () => finish(new CartesiaError("Cartesia WebSocket closed before the audio was complete", 0)));
    ws.on("open", () => {
      transcripts.forEach((t, i) => {
        const last = i === transcripts.length - 1;
        ws.send(JSON.stringify({ ...base, transcript: forContinuation(t, s.language, last), continue: !last }));
        if (!last) ws.send(JSON.stringify({ ...base, transcript: "", continue: true, flush: true }));
      });
    });
    ws.on("message", (raw) => {
      idle();
      let m: { type?: string; data?: string; flush_id?: number; error?: string; message?: string; title?: string; status_code?: number };
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      try {
        if (m.type === "chunk" && m.data) {
          const i = m.flush_id ?? 0;
          if (parts[i]) parts[i].push(Buffer.from(m.data, "base64"));
        } else if (m.type === "flush_done") {
          complete(m.flush_id ?? -1);
        } else if (m.type === "done") {
          complete(transcripts.length - 1);
          const missing = out.findIndex((b) => !b);
          finish(missing < 0 ? undefined : new CartesiaError(`Cartesia WebSocket: no audio for paragraph ${missing + 1} of the run`, 0));
        } else if (m.type === "error") {
          finish(new CartesiaError(`Cartesia API ${m.status_code ?? ""}: ${m.error || m.message || m.title || "WebSocket error"}`.trim(), m.status_code ?? 500));
        }
      } catch (e) {
        finish(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}

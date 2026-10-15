// Minimal PCM WAV helpers: parse, build, silence, trim, fade, concatenate. 16-bit int and 32-bit float.
import type { BitDepth } from "./types";

export interface WavFormat {
  audioFormat: number; // 1 = PCM, 3 = float
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
}

export interface ParsedWav {
  format: WavFormat;
  data: Buffer;
}

export function parseWav(buf: Buffer): ParsedWav {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a WAV file");
  }
  let off = 12;
  let format: WavFormat | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      format = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
      // WAVE_FORMAT_EXTENSIBLE (ffmpeg writes it for float): the real format is in the sub-format GUID.
      if (format.audioFormat === 0xfffe && size >= 26) format.audioFormat = buf.readUInt16LE(body + 24);
    } else if (id === "data") {
      if (!format) throw new Error("WAV data chunk before fmt chunk");
      // Streaming encoders write 0 or 0xFFFFFFFF as the size: take the rest of the file.
      if (size === 0 || size === 0xffffffff || body + size > buf.length) size = buf.length - body;
      const frame = (format.bitsPerSample / 8) * format.channels;
      size -= size % frame;
      return { format, data: buf.subarray(body, body + size) };
    }
    off = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

export function wavHeader(f: WavFormat, dataBytes: number): Buffer {
  const h = Buffer.alloc(44);
  const blockAlign = (f.channels * f.bitsPerSample) / 8;
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(f.audioFormat, 20);
  h.writeUInt16LE(f.channels, 22);
  h.writeUInt32LE(f.sampleRate, 24);
  h.writeUInt32LE(f.sampleRate * blockAlign, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(f.bitsPerSample, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

export function buildWav(f: WavFormat, data: Buffer): Buffer {
  return Buffer.concat([wavHeader(f, data.length), data]);
}

export function bytesPerMs(f: WavFormat): number {
  return (f.sampleRate * f.channels * f.bitsPerSample) / 8 / 1000;
}

export function durationMs(f: WavFormat, dataBytes: number): number {
  return Math.round(dataBytes / bytesPerMs(f));
}

export function silence(f: WavFormat, ms: number): Buffer {
  const frame = (f.channels * f.bitsPerSample) / 8;
  const frames = Math.round((f.sampleRate * ms) / 1000);
  return Buffer.alloc(frames * frame); // zeros = silence for signed PCM and float
}

/** The project's output format: "16" = pcm_s16le, "32f" = pcm_f32le. Always mono. */
export function formatFor(sampleRate: number, bitDepth: BitDepth): WavFormat {
  return bitDepth === "32f"
    ? { audioFormat: 3, channels: 1, sampleRate, bitsPerSample: 32 }
    : { audioFormat: 1, channels: 1, sampleRate, bitsPerSample: 16 };
}

/** Read/write one sample as a float in [-1, 1]. Null for formats we do not process (left untouched). */
function sampleIO(f: WavFormat) {
  if (f.audioFormat === 3 && f.bitsPerSample === 32) {
    return { size: 4, get: (b: Buffer, o: number) => b.readFloatLE(o), set: (b: Buffer, o: number, v: number) => b.writeFloatLE(v, o) };
  }
  if (f.audioFormat === 1 && f.bitsPerSample === 16) {
    return {
      size: 2,
      get: (b: Buffer, o: number) => b.readInt16LE(o) / 32768,
      set: (b: Buffer, o: number, v: number) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32768))), o),
    };
  }
  return null;
}

/** Cut leading/trailing audio quieter than `thresholdDb`, keeping `keepMs` of it on each side. */
export function trimSilence(f: WavFormat, data: Buffer, thresholdDb = -48, keepMs = 60): Buffer {
  const io = sampleIO(f);
  if (!io) return data;
  const frame = io.size * f.channels;
  const frames = Math.floor(data.length / frame);
  const limit = 10 ** (thresholdDb / 20);
  const loud = (i: number) => {
    for (let c = 0; c < f.channels; c++) if (Math.abs(io.get(data, i * frame + c * io.size)) > limit) return true;
    return false;
  };
  let first = 0;
  while (first < frames && !loud(first)) first++;
  if (first === frames) return data; // all quiet: leave it alone
  let last = frames - 1;
  while (last > first && !loud(last)) last--;
  const keep = Math.round((f.sampleRate * keepMs) / 1000);
  return data.subarray(Math.max(0, first - keep) * frame, Math.min(frames, last + 1 + keep) * frame);
}

/** Linear fade-in and fade-out of `ms` at the edges. Returns a copy. */
export function fade(f: WavFormat, data: Buffer, ms = 8): Buffer {
  const out = Buffer.from(data);
  const io = sampleIO(f);
  if (!io) return out;
  const frame = io.size * f.channels;
  const frames = Math.floor(out.length / frame);
  const n = Math.min(Math.round((f.sampleRate * ms) / 1000), Math.floor(frames / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    for (let c = 0; c < f.channels; c++) {
      for (const o of [i * frame + c * io.size, (frames - 1 - i) * frame + c * io.size]) io.set(out, o, io.get(out, o) * g);
    }
  }
  return out;
}

/** Trim + fade: what every clip gets before it is joined to the next one. */
export function smoothPcm(f: WavFormat, data: Buffer): Buffer {
  return fade(f, trimSilence(f, data));
}

export const DEFAULT_FORMAT: WavFormat = { audioFormat: 1, channels: 1, sampleRate: 44100, bitsPerSample: 16 };

export function sameFormat(a: WavFormat, b: WavFormat) {
  return (
    a.audioFormat === b.audioFormat &&
    a.channels === b.channels &&
    a.sampleRate === b.sampleRate &&
    a.bitsPerSample === b.bitsPerSample
  );
}

export type Segment = { kind: "audio"; wav: Buffer; smooth?: boolean } | { kind: "silence"; ms: number };

/** Concatenate WAV clips and silences into one WAV. All clips must share one format. `smooth` clips get trim + fade. */
export function concatWav(segments: Segment[]): { wav: Buffer; offsetsMs: { startMs: number; durationMs: number }[] } {
  const parsed = segments.map((s) => (s.kind === "audio" ? parseWav(s.wav) : null));
  const format = parsed.find(Boolean)?.format ?? DEFAULT_FORMAT;
  const parts: Buffer[] = [];
  const offsetsMs: { startMs: number; durationMs: number }[] = [];
  let bytes = 0;
  segments.forEach((s, i) => {
    let chunk: Buffer;
    if (s.kind === "audio") {
      const p = parsed[i]!;
      if (!sameFormat(p.format, format)) {
        throw new Error(
          `Audio format mismatch (${p.format.sampleRate} Hz / ${p.format.channels} ch vs ${format.sampleRate} Hz / ${format.channels} ch)`,
        );
      }
      chunk = s.smooth ? smoothPcm(p.format, p.data) : p.data;
    } else {
      chunk = silence(format, s.ms);
    }
    offsetsMs.push({ startMs: durationMs(format, bytes), durationMs: durationMs(format, chunk.length) });
    parts.push(chunk);
    bytes += chunk.length;
  });
  return { wav: Buffer.concat([wavHeader(format, bytes), ...parts]), offsetsMs };
}

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { WavFormat } from "./wav";

let chmodDone = false;

export function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const p = ffmpegInstaller.path;
  if (!chmodDone && process.platform !== "win32") {
    chmodDone = true;
    // ponytail: .npmrc skips the package's `chmod u+x` postinstall. The npm tarballs already ship it executable;
    // this only repairs odd installs and is ignored when the file isn't ours to chmod (it may still be executable).
    try {
      fs.chmodSync(p, 0o755);
    } catch {}
  }
  return p;
}

export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { windowsHide: true });
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${err.trim()}`))));
  });
}

export type AudioFormat = "wav" | "mp3" | "flac" | "ogg";

export const FORMAT_MIME: Record<AudioFormat, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  ogg: "audio/ogg",
};

/** Transcode a WAV file into another format. `float` input becomes 24-bit FLAC (FLAC has no float). */
export async function transcode(input: string, output: string, format: AudioFormat, mp3Kbps = 192, float = false) {
  const codec: Record<AudioFormat, string[]> = {
    wav: ["-c:a", "pcm_s16le"],
    mp3: ["-c:a", "libmp3lame", "-b:a", `${mp3Kbps}k`],
    flac: float ? ["-c:a", "flac", "-sample_fmt", "s32", "-bits_per_raw_sample", "24"] : ["-c:a", "flac"],
    ogg: ["-c:a", "libvorbis", "-q:a", "6"],
  };
  await runFfmpeg(["-i", input, ...codec[format], output]);
}

/** Convert any audio clip to mono 44.1 kHz WAV, optionally trimmed (seconds). */
export async function toWavClip(input: string, output: string, startSec?: number, endSec?: number) {
  const trim: string[] = [];
  if (startSec != null && startSec > 0) trim.push("-ss", String(startSec));
  if (endSec != null && endSec > 0) trim.push("-to", String(endSec));
  await runFfmpeg(["-i", input, ...trim, "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", output]);
}

/**
 * Convert a WAV to another mono PCM format (rate + 16-bit int / 32-bit float).
 * ponytail: synchronous because renderChapter is sync; only runs once per old clip (result is cached).
 */
export function convertWavSync(input: string, output: string, f: WavFormat) {
  const tmp = `${output}.${process.pid}.tmp.wav`;
  const codec = f.audioFormat === 3 ? "pcm_f32le" : "pcm_s16le";
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-ac", "1", "-ar", String(f.sampleRate), "-c:a", codec, tmp];
  const r = spawnSync(ffmpegPath(), args, { windowsHide: true });
  if (r.status !== 0) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`ffmpeg failed (${r.status}): ${r.error?.message ?? r.stderr?.toString().trim()}`);
  }
  fs.renameSync(tmp, output);
}

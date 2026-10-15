import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cloneVoice } from "@/lib/cartesia";
import { db, now } from "@/lib/db";
import { toWavClip } from "@/lib/ffmpeg";
import { handle, json } from "@/lib/http";
import { durationMs, parseWav } from "@/lib/wav";

const MIN_SEC = 10;
const MAX_SEC = 60;

/**
 * Clone a voice from an uploaded or recorded clip.
 * form: clip (file), name, language, tagline?, description?, accent?, start?, end? (seconds), consent=true
 */
export const POST = handle(async (req: Request) => {
  const form = await req.formData();
  if (form.get("consent") !== "true") throw new Error("Please confirm you have the speaker's permission to clone this voice.");
  const clip = form.get("clip");
  if (!clip || typeof clip === "string") throw new Error("Add an audio clip");
  const name = String(form.get("name") || "").trim();
  const language = String(form.get("language") || "").trim();
  if (!name) throw new Error("Give the voice a name");
  if (!language) throw new Error("Pick the language spoken in the clip");
  const start = Number(form.get("start") || 0) || 0;
  const end = Number(form.get("end") || 0) || 0;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cartesia-clone-"));
  try {
    const input = path.join(tmp, "input" + (path.extname(clip.name) || ".webm"));
    fs.writeFileSync(input, Buffer.from(await clip.arrayBuffer()));
    // Normalise to mono 44.1 kHz WAV and apply the trim. Works for webm recordings and any upload.
    const wavPath = path.join(tmp, "clip.wav");
    await toWavClip(input, wavPath, start, end);
    const wav = fs.readFileSync(wavPath);
    const parsed = parseWav(wav);
    const sec = durationMs(parsed.format, parsed.data.length) / 1000;
    if (sec < MIN_SEC) throw new Error(`Clip is ${sec.toFixed(1)}s. It must be at least ${MIN_SEC} seconds.`);
    if (sec > MAX_SEC + 0.5) throw new Error(`Clip is ${sec.toFixed(1)}s. Trim it to ${MAX_SEC} seconds or less.`);
    if (wav.length > 16 * 1024 * 1024) throw new Error("Clip is larger than 16 MB after conversion");

    const voice = await cloneVoice({
      clip: new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
      filename: "clip.wav",
      name,
      language,
      tagline: String(form.get("tagline") || "") || undefined,
      description: String(form.get("description") || "") || undefined,
      accent: String(form.get("accent") || "") || undefined,
    });
    db.prepare(
      `INSERT INTO voice_favorites (voice_id, name, meta_json, is_cloned, added_at) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(voice_id) DO UPDATE SET name = excluded.name, is_cloned = 1`,
    ).run(voice.id, voice.name, JSON.stringify(voice), now());
    return json({ voice, seconds: sec }, 201);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

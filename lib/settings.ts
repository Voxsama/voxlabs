// Effective generation settings (paragraph → chapter → project) and stale detection. Client-safe.
import { isPauseOnly } from "./text";
import type { BitDepth, Paragraph, Project } from "./types";

export interface GenSettings {
  voiceId: string | null;
  voiceName: string | null;
  modelId: string;
  language: string;
  speed: number;
  volume: number;
  emotion: string | null;
  sampleRate: number;
  bitDepth: BitDepth;
}

export function effectiveSettings(
  p: Pick<Paragraph, "voice_id" | "voice_name" | "speed" | "volume" | "emotion">,
  chapter: { voice_id: string | null; voice_name: string | null } | null,
  pr: Project,
): GenSettings {
  const voice = p.voice_id ? [p.voice_id, p.voice_name] : chapter?.voice_id ? [chapter.voice_id, chapter.voice_name] : [pr.voice_id, pr.voice_name];
  return {
    voiceId: voice[0] ?? null,
    voiceName: voice[1] ?? null,
    modelId: pr.model_id,
    language: pr.language,
    speed: p.speed ?? pr.speed ?? 1,
    volume: p.volume ?? pr.volume ?? 1,
    emotion: p.emotion ?? pr.emotion ?? null,
    sampleRate: pr.sample_rate ?? 44100,
    bitDepth: pr.bit_depth ?? "16",
  };
}

/** What is stored in audio_versions.settings_json for a generation. */
export function settingsSnapshot(s: GenSettings) {
  return {
    speed: s.speed, volume: s.volume, emotion: s.emotion, language: s.language, voice_name: s.voiceName,
    sample_rate: s.sampleRate, bit_depth: s.bitDepth,
  };
}

/** Audio exists but no longer matches the text or the effective settings. */
export function isStale(p: Paragraph, s: GenSettings): boolean {
  if (!p.active_version_id || isPauseOnly(p.text)) return false;
  if (p.active_text !== p.text) return true;
  if (s.voiceId && p.active_voice_id && p.active_voice_id !== s.voiceId) return true;
  let a: Record<string, unknown> = {};
  try {
    a = JSON.parse(p.active_settings || "{}");
  } catch {}
  // Older versions did not record every field: treat missing ones as the old defaults.
  return (
    Number(a.speed ?? 1) !== s.speed ||
    Number(a.volume ?? 1) !== s.volume ||
    ((a.emotion as string | null) ?? null) !== s.emotion ||
    Number(a.sample_rate ?? 44100) !== s.sampleRate ||
    String(a.bit_depth ?? "16") !== s.bitDepth
  );
}

/** Needs (re)generation: speakable text and no up-to-date audio. */
export function needsGeneration(p: Paragraph, s: GenSettings): boolean {
  if (!p.text.trim() || isPauseOnly(p.text)) return false;
  if (p.status === "queued" || p.status === "generating") return false;
  return !p.active_version_id || p.status === "error" || isStale(p, s);
}

import { getSetting } from "./db";
import { recordUsage } from "./usage";
export { MODELS, LANGUAGES } from "./constants";

export const BASE_URL = process.env.CARTESIA_BASE_URL || "https://api.cartesia.ai";
export const CARTESIA_VERSION = process.env.CARTESIA_VERSION || "2026-08-14";

export type PcmEncoding = "pcm_s16le" | "pcm_f32le";
export const encodingFor = (bitDepth: string): PcmEncoding => (bitDepth === "32f" ? "pcm_f32le" : "pcm_s16le");

export class CartesiaError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function getApiKey(): string {
  const key = getSetting("cartesia_api_key") || process.env.CARTESIA_API_KEY || "";
  if (!key) {
    throw new CartesiaError(
      "No Cartesia API key configured. Add it in Settings or set CARTESIA_API_KEY in .env.local.",
      401,
    );
  }
  return key;
}

function headers(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Cartesia-Version": CARTESIA_VERSION,
    ...extra,
  };
}

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  let detail = "";
  try {
    detail = await res.text();
    const j = JSON.parse(detail);
    detail = j.message || j.error || j.detail || detail;
    if (typeof detail !== "string") detail = JSON.stringify(detail);
  } catch {
    /* keep raw text */
  }
  throw new CartesiaError(`Cartesia API ${res.status}: ${detail || res.statusText}`, res.status);
}

export interface TtsOptions {
  transcript: string;
  voiceId: string;
  modelId: string;
  language?: string;
  speed?: number | null;
  volume?: number | null;
  emotion?: string | null;
  container?: "wav" | "mp3";
  sampleRate?: number; // default 44100
  encoding?: PcmEncoding; // default pcm_s16le
}

/** generation_config as the playground sends it: speed/volume only when not 1, emotion for any language. */
export function generationConfig(o: Pick<TtsOptions, "speed" | "volume" | "emotion">) {
  const gc: Record<string, unknown> = {};
  if (o.speed != null && o.speed !== 1) gc.speed = o.speed;
  if (o.volume != null && o.volume !== 1) gc.volume = o.volume;
  if (o.emotion) gc.emotion = o.emotion;
  return gc;
}

/** Generate speech and return the full audio file (WAV mono, pcm_s16le 44.1 kHz unless asked otherwise). */
export async function tts(opts: TtsOptions): Promise<Buffer> {
  const generation_config = generationConfig(opts);
  const sample_rate = opts.sampleRate ?? 44100;
  const body: Record<string, unknown> = {
    model_id: opts.modelId,
    transcript: opts.transcript,
    voice: { id: opts.voiceId },
    output_format:
      opts.container === "mp3"
        ? { container: "mp3", sample_rate, bit_rate: 192000 }
        : { container: "wav", encoding: opts.encoding ?? "pcm_s16le", sample_rate },
  };
  if (opts.language) body.language = opts.language;
  if (Object.keys(generation_config).length) body.generation_config = generation_config;

  const res = await check(
    await fetch(`${BASE_URL}/tts/bytes`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }),
  );
  const audio = Buffer.from(await res.arrayBuffer());
  recordUsage(opts.transcript.length);
  return audio;
}

export function getAdminKey(): string | null {
  return getSetting("cartesia_admin_key") || process.env.CARTESIA_ADMIN_KEY || null;
}

/** Credits used from `start` until now (Cartesia counts whole UTC days). Needs an admin key (sk_car_admin_...). */
export async function creditUsage(adminKey: string, start: Date): Promise<number> {
  const qs = new URLSearchParams({ start_ts: start.toISOString(), end_ts: new Date().toISOString() });
  const res = await check(
    await fetch(`${BASE_URL}/usage/credits?${qs}`, { headers: { Authorization: `Bearer ${adminKey}`, "Cartesia-Version": CARTESIA_VERSION } }),
  );
  const j = (await res.json()) as { data?: { credits?: number }[] };
  return (j.data ?? []).reduce((n, b) => n + (Number(b.credits) || 0), 0);
}

export interface CartesiaVoice {
  id: string;
  name: string;
  description?: string;
  tagline?: string;
  gender?: string | null;
  is_owner?: boolean;
  is_pro?: boolean;
  language?: string;
  accents?: { accent: string; locale: string; is_native: boolean }[];
  preview_file_url?: string | null;
  created_at?: string;
}

export interface VoiceListParams {
  q?: string;
  language?: string;
  gender?: string;
  isOwner?: boolean;
  limit?: number;
  startingAfter?: string;
}

export async function listVoices(p: VoiceListParams) {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.language) qs.set("language", p.language);
  if (p.gender) qs.set("gender", p.gender);
  if (p.isOwner) qs.set("is_owner", "true");
  qs.set("limit", String(p.limit ?? 50));
  if (p.startingAfter) qs.set("starting_after", p.startingAfter);
  qs.append("expand[]", "preview_file_url");
  const res = await check(await fetch(`${BASE_URL}/voices?${qs}`, { headers: headers() }));
  const json = await res.json();
  // Response is paginated: { data: Voice[], has_more, next_page }. Tolerate a bare array too.
  const data: CartesiaVoice[] = Array.isArray(json) ? json : json.data ?? [];
  return {
    voices: data,
    hasMore: Array.isArray(json) ? false : Boolean(json.has_more),
    nextPage: Array.isArray(json) ? null : (json.next_page as string | null) ?? null,
  };
}

export async function getVoice(id: string): Promise<CartesiaVoice> {
  const res = await check(
    await fetch(`${BASE_URL}/voices/${encodeURIComponent(id)}`, { headers: headers() }),
  );
  return res.json();
}

export async function deleteVoice(id: string) {
  await check(
    await fetch(`${BASE_URL}/voices/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: headers(),
    }),
  );
}

export interface CloneParams {
  clip: Blob;
  filename: string;
  name: string;
  language: string;
  tagline?: string;
  description?: string;
  accent?: string;
}

export async function cloneVoice(p: CloneParams): Promise<CartesiaVoice> {
  const form = new FormData();
  form.set("clip", p.clip, p.filename);
  form.set("name", p.name);
  form.set("language", p.language);
  if (p.tagline) form.set("tagline", p.tagline.slice(0, 32));
  if (p.description) form.set("description", p.description);
  if (p.accent) form.set("accent", p.accent);
  form.set("access", "private");
  const res = await check(
    await fetch(`${BASE_URL}/voices/clone`, { method: "POST", headers: headers(), body: form }),
  );
  return res.json();
}

export interface Accent {
  id: string;
  name: string;
  language: string;
  locale: string;
  is_locale_default: boolean;
  is_localizable: boolean;
}

export async function listAccents(p: { language?: string; localizable?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (p.language) qs.set("language", p.language);
  if (p.localizable) qs.set("is_localizable", "true");
  const res = await check(await fetch(`${BASE_URL}/accents?${qs}`, { headers: headers() }));
  const json = await res.json();
  return (json.accents ?? []) as Accent[];
}

export async function addVoiceAccents(id: string, accents: string[]): Promise<CartesiaVoice> {
  const res = await check(
    await fetch(`${BASE_URL}/voices/${encodeURIComponent(id)}/accents`, {
      method: "PATCH",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ accents }),
    }),
  );
  return res.json();
}

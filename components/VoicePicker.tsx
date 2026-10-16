"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Play, Star } from "lucide-react";
import { api } from "@/lib/api";
import { LANGUAGES } from "@/lib/constants";
import type { FavoriteVoice } from "@/lib/types";
import { ErrorText, Modal } from "./ui";

export interface Voice {
  id: string;
  name: string;
  description?: string;
  tagline?: string;
  gender?: string | null;
  is_owner?: boolean;
  language?: string;
  accents?: { accent: string; locale: string; is_native: boolean }[];
  preview_file_url?: string | null;
  favorite?: boolean;
}

export interface Picked {
  id: string;
  name: string;
}

/** Shared audio element so only one preview plays at a time. */
let previewAudio: HTMLAudioElement | null = null;
export function playPreview(url: string) {
  if (!previewAudio) previewAudio = new Audio();
  if (previewAudio.src === url && !previewAudio.paused) {
    previewAudio.pause();
    return;
  }
  previewAudio.src = url;
  previewAudio.play().catch(() => {});
}

const SAMPLE_TEXT: Record<string, string> = {
  hi: "नमस्ते, मैं इस कहानी को पढ़कर सुनाऊँगा। आइए शुरू करें।",
  en: "Hello, I will be reading this story to you. Let's begin.",
};
const sampleCache = new Map<string, string>();

/** Play Cartesia's preview clip, or (when it has none) generate a short sample once and cache it. */
export async function previewVoice(v: Voice, onBusy?: (busy: boolean) => void) {
  if (v.preview_file_url) return playPreview(v.preview_file_url);
  let url = sampleCache.get(v.id);
  if (!url) {
    const lang = v.accents?.[0]?.locale?.slice(0, 2) || v.language || "en";
    onBusy?.(true);
    try {
      const res = await fetch("/api/voices/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: v.id, text: SAMPLE_TEXT[lang] ?? SAMPLE_TEXT.en, language: SAMPLE_TEXT[lang] ? lang : "en" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || res.statusText);
      url = URL.createObjectURL(await res.blob());
      sampleCache.set(v.id, url);
    } finally {
      onBusy?.(false);
    }
  }
  playPreview(url);
}

export function voiceLangs(v: Voice): string {
  const locs = v.accents?.map((a) => a.locale) ?? [];
  return locs.length ? Array.from(new Set(locs)).join(", ") : v.language || "";
}

type Tab = "starred" | "all" | "mine";

export function VoiceBrowser({
  onPick,
  defaultLanguage,
  pickLabel = "Use",
}: {
  onPick?: (v: Picked) => void;
  defaultLanguage?: string;
  pickLabel?: string;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState(defaultLanguage || "");
  const [gender, setGender] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [favs, setFavs] = useState<FavoriteVoice[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const reqId = useRef(0);

  const loadFavs = useCallback(() => api<FavoriteVoice[]>("/api/voices/favorites").then(setFavs).catch(() => {}), []);
  useEffect(() => {
    loadFavs();
  }, [loadFavs]);

  const load = useCallback(
    async (append: boolean, from?: string | null) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (q) qs.set("q", q);
        if (language) qs.set("language", language);
        if (gender) qs.set("gender", gender);
        if (tab === "mine") qs.set("mine", "1");
        if (append && from) qs.set("cursor", from);
        const r = await api<{ voices: Voice[]; cursor: string | null }>(`/api/voices?${qs}`);
        if (id !== reqId.current) return;
        setVoices((prev) => (append ? [...prev, ...r.voices] : r.voices));
        setCursor(r.cursor);
      } catch (e) {
        if (id === reqId.current) setError((e as Error).message);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [q, language, gender, tab],
  );

  useEffect(() => {
    if (tab === "starred") return;
    const t = setTimeout(() => load(false), 250);
    return () => clearTimeout(t);
  }, [load, tab]);

  const toggleFav = async (v: Voice) => {
    const isFav = favs.some((f) => f.voice_id === v.id);
    if (isFav) await api(`/api/voices/favorites?id=${encodeURIComponent(v.id)}`, { method: "DELETE" });
    else await api("/api/voices/favorites", { method: "POST", json: { voice_id: v.id, name: v.name, meta: v, is_cloned: v.is_owner } });
    loadFavs();
  };

  const remove = async (v: Voice) => {
    if (!confirm(`Delete the voice "${v.name}" from your Cartesia account? This cannot be undone.`)) return;
    try {
      await api(`/api/voices/${encodeURIComponent(v.id)}`, { method: "DELETE" });
      setVoices((vs) => vs.filter((x) => x.id !== v.id));
      loadFavs();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const list: Voice[] =
    tab === "starred"
      ? favs
          .map((f) => ({ ...(JSON.parse(f.meta_json || "{}") as Voice), id: f.voice_id, name: f.name }))
          .filter((v) => !q || v.name.toLowerCase().includes(q.toLowerCase()))
      : voices;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["starred", "all", "mine"] as Tab[]).map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? "btn-primary" : ""}`} onClick={() => setTab(t)}>
            {t === "starred" ? `Starred (${favs.length})` : t === "all" ? "All voices" : "My voices / clones"}
          </button>
        ))}
        <input className="input max-w-56" placeholder="Search voices..." value={q} onChange={(e) => setQ(e.target.value)} />
        {tab !== "starred" && (
          <>
            <select className="input max-w-40" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="">All languages</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
            <select className="input max-w-36" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Any gender</option>
              <option value="feminine">Feminine</option>
              <option value="masculine">Masculine</option>
              <option value="gender_neutral">Neutral</option>
            </select>
          </>
        )}
      </div>
      <ErrorText error={error} />
      <div className="min-h-0 flex-1 divide-y divide-neutral-800 overflow-auto rounded-md border border-neutral-800">
        {list.map((v) => {
          const fav = favs.some((f) => f.voice_id === v.id);
          return (
            <div key={v.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <button
                className="btn btn-sm btn-ghost w-8 justify-center"
                title={v.preview_file_url ? "Play preview" : "Play a short generated sample (uses a few credits the first time)"}
                aria-label={`Play preview of ${v.name}`}
                disabled={previewing === v.id}
                onClick={() => previewVoice(v, (b) => setPreviewing(b ? v.id : null)).catch((e) => setError(e.message))}
              >
                {previewing === v.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {v.name} {v.is_owner && <span className="ml-1 rounded bg-purple-900 px-1 text-[10px]">mine</span>}
                </div>
                <div className="truncate text-xs text-neutral-400">
                  {[voiceLangs(v), v.gender, v.tagline || v.description].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button className="btn btn-sm btn-ghost" title={fav ? "Unstar" : "Star"} aria-label={`${fav ? "Unstar" : "Star"} ${v.name}`} aria-pressed={fav} onClick={() => toggleFav(v)}>
                <Star size={14} aria-hidden className={fav ? "fill-current text-purple-300" : ""} />
              </button>
              {tab === "mine" && (
                <button className="btn btn-sm btn-danger" onClick={() => remove(v)}>Delete</button>
              )}
              {onPick && (
                <button className="btn btn-sm btn-primary" onClick={() => onPick({ id: v.id, name: v.name })}>{pickLabel}</button>
              )}
            </div>
          );
        })}
        {!list.length && !loading && <div className="p-6 text-center text-sm text-neutral-500">No voices found.</div>}
        {loading && <div className="p-4 text-center text-sm text-neutral-500">Loading...</div>}
      </div>
      {tab !== "starred" && cursor && !loading && (
        <button className="btn self-center" onClick={() => load(true, cursor)}>Load more</button>
      )}
    </div>
  );
}

/** Button that shows the current voice and opens the browser in a modal. */
export function VoicePicker({
  value,
  onChange,
  defaultLanguage,
  allowInherit,
  inheritLabel = "Use default",
  className = "",
}: {
  value: Picked | null;
  onChange: (v: Picked | null) => void;
  defaultLanguage?: string;
  allowInherit?: boolean;
  inheritLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn ${className}`} onClick={() => setOpen(true)} title="Choose voice">
        <Mic size={14} aria-hidden />{value?.name || (allowInherit ? inheritLabel : "Choose a voice")}
      </button>
      {open && (
        <Modal title="Choose a voice" onClose={() => setOpen(false)} wide>
          <div className="flex h-[65vh] flex-col gap-3">
            {allowInherit && (
              <button className="btn self-start" onClick={() => { onChange(null); setOpen(false); }}>
                {inheritLabel}
              </button>
            )}
            <VoiceBrowser
              defaultLanguage={defaultLanguage}
              onPick={(v) => {
                onChange(v);
                setOpen(false);
              }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}

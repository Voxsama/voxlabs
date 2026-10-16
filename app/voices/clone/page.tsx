"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Play } from "lucide-react";
import type { Voice } from "@/components/VoicePicker";
import { ErrorText, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { LANGUAGES } from "@/lib/constants";

const MIN_SEC = 10;
const MAX_SEC = 60;

interface Accent {
  id: string;
  name: string;
  language: string;
  locale: string;
  is_localizable: boolean;
}

export default function ClonePage() {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("clip.webm");
  const [url, setUrl] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("hi");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [accents, setAccents] = useState<Accent[]>([]);
  const [accent, setAccent] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Voice | null>(null);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    api<Accent[]>(`/api/accents?language=${language}`).then(setAccents).catch(() => setAccents([]));
    setAccent("");
  }, [language]);

  // Decode the clip to get a reliable duration (MediaRecorder webm often reports Infinity) and a waveform.
  const loadClip = async (b: Blob, fname: string) => {
    setError(null);
    setCreated(null);
    if (b.size > 50 * 1024 * 1024) return setError("File is too large. Use a clip under 50 MB (it is trimmed and converted before upload).");
    setBlob(b);
    setFileName(fname);
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(b));
    try {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await b.arrayBuffer());
      ctx.close();
      const data = buf.getChannelData(0);
      const n = 400;
      const step = Math.max(1, Math.floor(data.length / n));
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++) m = Math.max(m, Math.abs(data[j]));
        out.push(m);
      }
      setPeaks(out);
      setDuration(buf.duration);
      setStart(0);
      setEnd(Math.min(buf.duration, MAX_SEC));
    } catch {
      setPeaks([]);
      setDuration(0);
      setError("Could not read this audio in the browser. You can still try to clone it; the server will convert it.");
    }
  };

  const playSelection = () => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = start;
    a.play().catch(() => {});
    const stopAt = () => {
      if (a.currentTime >= end) {
        a.pause();
        a.removeEventListener("timeupdate", stopAt);
      }
    };
    a.addEventListener("timeupdate", stopAt);
  };

  const sel = end - start;
  const selOk = duration === 0 || (sel >= MIN_SEC && sel <= MAX_SEC);

  const submit = async () => {
    if (!blob) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("clip", blob, fileName);
      form.set("name", name);
      form.set("language", language);
      if (tagline) form.set("tagline", tagline);
      if (description) form.set("description", description);
      if (accent) form.set("accent", accent);
      if (duration) {
        form.set("start", start.toFixed(2));
        form.set("end", end.toFixed(2));
      }
      form.set("consent", String(consent));
      const r = await api<{ voice: Voice }>("/api/voices/clone", { method: "POST", body: form });
      setCreated(r.voice);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Clone a voice</h1>
          <Link className="btn" href="/voices">Voice library</Link>
        </div>

        <div className="card space-y-2 p-4 text-sm text-neutral-300">
          <div className="font-medium">For a good clone</div>
          <ul className="list-disc space-y-1 pl-5 text-neutral-400">
            <li>Use {MIN_SEC}–{MAX_SEC} seconds of one speaker. Longer (up to {MAX_SEC}s) keeps the accent better.</li>
            <li>No background noise, music, or echo from bare walls.</li>
            <li>Speak naturally, in the mood and pace you want the voice to have.</li>
            <li>Record in the language the speaker actually speaks. One clone = one language. You can add accents later.</li>
          </ul>
        </div>

        <div className="card space-y-3 p-4">
          <div className="font-medium">1. Get a voice sample</div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn cursor-pointer">
              Upload audio file
              <input
                type="file"
                className="hidden"
                accept="audio/*,.wav,.mp3,.flac,.ogg,.webm,.m4a"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadClip(f, f.name);
                }}
              />
            </label>
            <span className="text-neutral-500">or</span>
            <Recorder onDone={(b) => loadClip(b, "recording.webm")} />
          </div>
          {url && (
            <div className="space-y-2">
              <audio ref={audio} src={url} controls className="w-full" />
              {duration > 0 && (
                <>
                  <Waveform peaks={peaks} duration={duration} start={start} end={end} />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Field label={`Start: ${start.toFixed(1)}s`}>
                      <input type="range" className="w-full accent-purple-500" min={0} max={duration} step={0.1} value={start} onChange={(e) => setStart(Math.min(Number(e.target.value), end - 1))} />
                    </Field>
                    <Field label={`End: ${end.toFixed(1)}s`}>
                      <input type="range" className="w-full accent-purple-500" min={0} max={duration} step={0.1} value={end} onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 1))} />
                    </Field>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <button className="btn btn-sm" onClick={playSelection}><Play size={14} aria-hidden />Play selection</button>
                    <span className={selOk ? "text-green-400" : "text-red-400"}>
                      Selection {sel.toFixed(1)}s {selOk ? <Check size={14} className="inline align-[-2px]" aria-label="OK" /> : `(must be ${MIN_SEC}–${MAX_SEC}s)`}
                    </span>
                    <span className="text-neutral-500">Total {duration.toFixed(1)}s</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="card space-y-3 p-4">
          <div className="font-medium">2. Describe the voice</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Narrator Hindi Male" />
            </Field>
            <Field label="Language spoken in the clip *">
              <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </Field>
            <Field label={`Tagline (${tagline.length}/32)`}>
              <input className="input" maxLength={32} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Warm storyteller" />
            </Field>
            <Field label="Accent (optional)">
              <select className="input" value={accent} onChange={(e) => setAccent(e.target.value)}>
                <option value="">Auto</option>
                {accents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.locale})</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description (optional)">
            <textarea className="input h-16" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I confirm this is my voice, or I have the speaker’s permission to clone it.
          </label>
          <ErrorText error={error} />
          <button className="btn btn-primary" disabled={!blob || !name.trim() || !consent || !selOk || busy} onClick={submit}>
            {busy ? "Cloning..." : "Create voice clone"}
          </button>
        </div>

        {created && <CreatedVoice voice={created} language={language} />}
        <AddAccents />
      </div>
    </div>
  );
}

function Waveform({ peaks, duration, start, end }: { peaks: number[]; duration: number; start: number; end: number }) {
  return (
    <div className="relative flex h-16 items-center gap-px overflow-hidden rounded bg-neutral-950">
      {peaks.map((p, i) => {
        const t = (i / peaks.length) * duration;
        const inSel = t >= start && t <= end;
        return <div key={i} className={inSel ? "bg-purple-400" : "bg-neutral-600"} style={{ width: `${100 / peaks.length}%`, height: `${Math.max(2, p * 100)}%` }} />;
      })}
    </div>
  );
}

function Recorder({ onDone }: { onDone: (b: Blob) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cleanup = useRef<() => void>(() => {});

  const startRec = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        cleanup.current();
        onDone(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
      };
      // Live level meter.
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let raf = 0;
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let m = 0;
        for (const v of buf) m = Math.max(m, Math.abs(v - 128));
        setLevel(m / 128);
        raf = requestAnimationFrame(tick);
      };
      tick();
      const t0 = Date.now();
      const timer = setInterval(() => {
        const s = (Date.now() - t0) / 1000;
        setSecs(s);
        if (s >= 90 && r.state === "recording") r.stop();
      }, 200);
      cleanup.current = () => {
        clearInterval(timer);
        cancelAnimationFrame(raf);
        ctx.close();
        stream.getTracks().forEach((t) => t.stop());
        setRec(null);
        setLevel(0);
      };
      r.start(250);
      setSecs(0);
      setRec(r);
    } catch (e) {
      setError(`Microphone not available: ${(e as Error).message}`);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {rec ? (
        <button className="btn btn-danger" onClick={() => rec.stop()}>■ Stop ({secs.toFixed(0)}s)</button>
      ) : (
        <button className="btn" onClick={startRec}>● Record with microphone</button>
      )}
      {rec && (
        <div className="h-2 w-32 rounded bg-neutral-800">
          <div className={`h-2 rounded ${level > 0.9 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${Math.min(100, level * 100)}%` }} />
        </div>
      )}
      {rec && <span className={`text-xs ${secs < MIN_SEC ? "text-amber-400" : "text-green-400"}`}>{secs < MIN_SEC ? `Keep going (min ${MIN_SEC}s)` : "Good length"}</span>}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

function CreatedVoice({ voice, language }: { voice: Voice; language: string }) {
  const [text, setText] = useState(language === "hi" ? "नमस्ते, यह मेरी नई आवाज़ है।" : "Hello, this is my new cloned voice.");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const speak = async () => {
    setBusy(true);
    setError(null);
    try {
      const b = await api<Blob>("/api/voices/test", { method: "POST", json: { voiceId: voice.id, text, language } });
      if (audio.current) {
        audio.current.src = URL.createObjectURL(b);
        audio.current.play().catch(() => {});
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card space-y-3 border-green-900 p-4">
      <div className="font-medium text-green-400">Voice “{voice.name}” created</div>
      <div className="text-xs text-neutral-500">ID: {voice.id}. It is starred and appears under “My voices / clones”.</div>
      <div className="flex gap-2">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" disabled={busy} onClick={speak}><Play size={14} aria-hidden />{busy ? "..." : "Try it"}</button>
      </div>
      <audio ref={audio} controls className="w-full" />
      <ErrorText error={error} />
    </div>
  );
}

/** Teach one of your cloned voices extra accents/languages (Cartesia Add Voice Accents). */
function AddAccents() {
  const [mine, setMine] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [all, setAll] = useState<Accent[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ voices: Voice[] }>("/api/voices?mine=1&limit=100").then((r) => setMine(r.voices)).catch(() => {});
    api<Accent[]>("/api/accents?localizable=1").then(setAll).catch(() => {});
  }, []);
  const v = mine.find((x) => x.id === voiceId);
  const submit = async () => {
    setError(null);
    setMsg(null);
    try {
      const r = await api<Voice>(`/api/voices/${voiceId}/accents`, { method: "PATCH", json: { accents: chosen } });
      setMsg(`Done. ${r.name} now has: ${(r.accents ?? []).map((a) => a.locale).join(", ")}`);
      setChosen([]);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="card space-y-3 p-4">
      <div className="font-medium">Teach a cloned voice more languages / accents</div>
      <p className="text-xs text-neutral-500">The voice must already have an accent. Up to 10 accents per voice.</p>
      <select className="input" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
        <option value="">Choose one of your voices...</option>
        {mine.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      {v && <div className="text-xs text-neutral-400">Current: {(v.accents ?? []).map((a) => `${a.accent} (${a.locale})`).join(", ") || "none"}</div>}
      {voiceId && (
        <div className="grid max-h-48 grid-cols-2 gap-1 overflow-auto rounded-md border border-neutral-800 p-2 text-sm sm:grid-cols-3">
          {all.map((a) => (
            <label key={a.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chosen.includes(a.id)}
                onChange={(e) => setChosen(e.target.checked ? [...chosen, a.id].slice(0, 9) : chosen.filter((x) => x !== a.id))}
              />
              {a.name} <span className="text-xs text-neutral-500">{a.locale}</span>
            </label>
          ))}
        </div>
      )}
      <button className="btn" disabled={!voiceId || !chosen.length} onClick={submit}>Add {chosen.length || ""} accent(s)</button>
      {msg && <div className="text-sm text-green-400">{msg}</div>}
      <ErrorText error={error} />
    </div>
  );
}

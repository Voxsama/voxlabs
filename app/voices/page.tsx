"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { VoiceBrowser, type Picked } from "@/components/VoicePicker";
import { ErrorText } from "@/components/ui";
import { LANGUAGES, MODELS } from "@/lib/constants";

export default function VoicesPage() {
  const [voice, setVoice] = useState<Picked | null>(null);
  const [text, setText] = useState("नमस्ते, यह एक परीक्षण वाक्य है। <break time=\"1s\" /> Hello, this is a test.");
  const [language, setLanguage] = useState("hi");
  const [model, setModel] = useState(MODELS[0].id);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);

  const speak = async () => {
    if (!voice) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/voices/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voice.id, text, language, modelId: model, speed }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || res.statusText);
      const url = URL.createObjectURL(await res.blob());
      if (audio.current) {
        audio.current.src = url;
        audio.current.play().catch(() => {});
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Voice library</h1>
        <Link className="btn btn-primary" href="/voices/clone">+ Clone a voice</Link>
      </div>
      <div className="card space-y-2 p-4">
        <div className="text-sm font-medium">Test a voice {voice ? <span className="text-purple-300">— {voice.name}</span> : <span className="text-neutral-500">(pick one below with “Test”)</span>}</div>
        <textarea className="input h-20" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-40" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <select className="input w-56" value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            Speed {speed.toFixed(2)}
            <input type="range" min={0.6} max={1.5} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="accent-purple-500" />
          </label>
          <button className="btn btn-primary" disabled={!voice || busy || !text.trim()} onClick={speak}><Play size={14} aria-hidden />{busy ? "Generating..." : "Speak"}</button>
          <audio ref={audio} controls className="h-8" />
        </div>
        <ErrorText error={error} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <VoiceBrowser onPick={setVoice} pickLabel="Test" defaultLanguage="hi" />
      </div>
    </div>
  );
}

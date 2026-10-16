"use client";
// Cartesia generation settings: project defaults panel and the per-paragraph chip/overrides.
import { useState } from "react";
import { Field, Modal } from "@/components/ui";
import { VoicePicker, type Picked } from "@/components/VoicePicker";
import { BIT_DEPTHS, EMOTIONS, MODELS, SAMPLE_RATES, SPEED_RANGE, VOLUME_RANGE } from "@/lib/constants";
import { effectiveSettings } from "@/lib/settings";
import type { ParagraphPatch } from "@/lib/store";
import type { BitDepth, Paragraph, Project } from "@/lib/types";

const x = (n: number) => `${n.toFixed(2).replace(/0$/, "")}x`;

const EMOTION_NOTE = "Cartesia documents emotion for English; for other languages it works as a hint.";

function Slider({ label, value, range, step = 0.05, low, high, onChange }: {
  label: string; value: number; range: { min: number; max: number }; step?: number; low: string; high: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between">
        <span className="label">{label}</span>
        <span className="text-xs text-neutral-300">{x(value)}</span>
      </div>
      <input className="w-full accent-purple-500" type="range" min={range.min} max={range.max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="flex justify-between text-[10px] text-neutral-500"><span>{low}</span><span>{high}</span></div>
    </div>
  );
}

/** Always-visible chip on a speech row: shows effective voice · emotion · speed, opens the per-paragraph panel. */
export function ParagraphSettingsChip({
  p,
  chapter,
  project,
  onPatch,
}: {
  p: Paragraph;
  chapter: { voice_id: string | null; voice_name: string | null } | null;
  project: Project;
  onPatch: (patch: ParagraphPatch) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const s = effectiveSettings(p, chapter, project);
  const mark = (overridden: boolean, text: string) => (
    <span className={overridden ? "text-purple-300" : ""} title={overridden ? "Set on this paragraph" : "Default"}>{text}</span>
  );
  return (
    <>
      <button type="button" className="chip cursor-pointer hover:border-neutral-500" title="Paragraph voice settings" onClick={() => setOpen(true)}>
        {mark(!!p.voice_id, s.voiceName || "no voice")} · {mark(p.emotion != null, s.emotion || "auto")} · {mark(p.speed != null, x(s.speed))}
        {s.volume !== 1 && <> · vol {mark(p.volume != null, x(s.volume))}</>}
      </button>
      {open && <ParagraphSettingsModal p={p} chapter={chapter} project={project} onPatch={onPatch} onClose={() => setOpen(false)} />}
    </>
  );
}

function ParagraphSettingsModal({ p, chapter, project, onPatch, onClose }: {
  p: Paragraph;
  chapter: { voice_id: string | null; voice_name: string | null } | null;
  project: Project;
  onPatch: (patch: ParagraphPatch) => void | Promise<void>;
  onClose: () => void;
}) {
  const d = effectiveSettings({ voice_id: null, voice_name: null, speed: null, volume: null, emotion: null }, chapter, project);
  const [voice, setVoice] = useState<Picked | null>(p.voice_id ? { id: p.voice_id, name: p.voice_name || p.voice_id } : null);
  const [speed, setSpeed] = useState(p.speed);
  const [volume, setVolume] = useState(p.volume);
  const [emotion, setEmotion] = useState(p.emotion);
  const [busy, setBusy] = useState(false);

  const reset = (show: boolean, label: string, clear: () => void) =>
    show && <button className="btn btn-ghost btn-sm" onClick={clear}>Use default ({label})</button>;

  const save = async () => {
    setBusy(true);
    try {
      await onPatch({ voice_id: voice?.id ?? null, voice_name: voice?.name ?? null, speed, volume, emotion });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Paragraph #${p.position + 1} settings`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-xs text-neutral-500">Overrides for this paragraph only. Anything left on default follows the chapter/project.</p>
        <div>
          <span className="label">Voice</span>
          <VoicePicker value={voice} onChange={setVoice} defaultLanguage={project.language} allowInherit inheritLabel={`Use default (${d.voiceName || "no voice"})`} />
        </div>
        <div>
          <Slider label="Speed" value={speed ?? d.speed} range={SPEED_RANGE} low="Slow" high="Fast" onChange={setSpeed} />
          {reset(speed != null, x(d.speed), () => setSpeed(null))}
        </div>
        <div>
          <Slider label="Volume" value={volume ?? d.volume} range={VOLUME_RANGE} low="Quiet" high="Loud" onChange={setVolume} />
          {reset(volume != null, x(d.volume), () => setVolume(null))}
        </div>
        <div>
          <Field label="Emotion">
            <select className="input" value={emotion ?? ""} onChange={(e) => setEmotion(e.target.value || null)}>
              <option value="">Use default ({d.emotion || "auto"})</option>
              {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </Field>
          <p className="mt-1 text-xs text-neutral-500">{EMOTION_NOTE}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Project-level generation defaults, rendered inside ProjectSettingsDialog. Controlled. */
export function ProjectGenerationFields({
  value,
  onChange,
}: {
  value: Pick<Project, "voice_id" | "voice_name" | "model_id" | "language" | "speed" | "volume" | "emotion" | "sample_rate" | "bit_depth" | "paragraph_gap_ms">;
  onChange: (patch: Partial<Project>) => void;
}) {
  const v = value;
  return (
    <div className="space-y-3">
      <div>
        <span className="label">Voice</span>
        <VoicePicker
          value={v.voice_id ? { id: v.voice_id, name: v.voice_name || v.voice_id } : null}
          onChange={(p) => onChange({ voice_id: p?.id ?? null, voice_name: p?.name ?? null })}
          defaultLanguage={v.language}
        />
      </div>
      <Slider label="Speed" value={v.speed} range={SPEED_RANGE} low="Slow" high="Fast" onChange={(speed) => onChange({ speed })} />
      <Slider label="Volume" value={v.volume} range={VOLUME_RANGE} low="Quiet" high="Loud" onChange={(volume) => onChange({ volume })} />
      <div>
        <Field label="Emotion">
          <select className="input" value={v.emotion ?? ""} onChange={(e) => onChange({ emotion: e.target.value || null })}>
            <option value="">Auto (none)</option>
            {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </Field>
        <p className="mt-1 text-xs text-neutral-500">{EMOTION_NOTE}</p>
      </div>
      <Field label="Model">
        <select className="input" value={v.model_id} onChange={(e) => onChange({ model_id: e.target.value })}>
          {!MODELS.some((m) => m.id === v.model_id) && <option value={v.model_id}>{v.model_id}</option>}
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sample rate">
          <select className="input" value={v.sample_rate} onChange={(e) => onChange({ sample_rate: Number(e.target.value) })}>
            {SAMPLE_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Bit depth">
          <select className="input" value={v.bit_depth} onChange={(e) => onChange({ bit_depth: e.target.value as BitDepth })}>
            {BIT_DEPTHS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Gap between paragraphs (ms)">
        <input className="input" type="number" min={0} max={2000} step={50} value={v.paragraph_gap_ms} onChange={(e) => onChange({ paragraph_gap_ms: Math.min(2000, Math.max(0, Number(e.target.value) || 0)) })} />
      </Field>
      <p className="text-xs text-neutral-500">Stability, similarity, style exaggeration and speaker boost are ElevenLabs settings; Cartesia has no equivalent.</p>
    </div>
  );
}

import { describe, expect, it } from "vitest";
import { buildWav, concatWav, DEFAULT_FORMAT, fade, formatFor, parseWav, silence, trimSilence, wavHeader } from "@/lib/wav";

const tone = (ms: number) => {
  const s = silence(DEFAULT_FORMAT, ms);
  for (let i = 0; i < s.length; i += 2) s.writeInt16LE(1000, i);
  return buildWav(DEFAULT_FORMAT, s);
};

describe("wav", () => {
  it("round-trips", () => {
    const w = tone(100);
    const p = parseWav(w);
    expect(p.format).toEqual(DEFAULT_FORMAT);
    expect(p.data.length).toBe(4410 * 2);
  });
  it("handles streaming headers with unknown data size", () => {
    const w = tone(100);
    w.writeUInt32LE(0xffffffff, 40);
    expect(parseWav(w).data.length).toBe(4410 * 2);
  });
  it("concatenates with silence and reports offsets", () => {
    const { wav, offsetsMs } = concatWav([
      { kind: "audio", wav: tone(1000) },
      { kind: "silence", ms: 2000 },
      { kind: "audio", wav: tone(500) },
    ]);
    expect(offsetsMs).toEqual([
      { startMs: 0, durationMs: 1000 },
      { startMs: 1000, durationMs: 2000 },
      { startMs: 3000, durationMs: 500 },
    ]);
    expect(parseWav(wav).data.length).toBe(44100 * 2 * 3.5);
  });
  it("rejects mismatched formats", () => {
    const other = Buffer.concat([wavHeader({ ...DEFAULT_FORMAT, sampleRate: 22050 }, 4), Buffer.alloc(4)]);
    expect(() => concatWav([{ kind: "audio", wav: tone(10) }, { kind: "audio", wav: other }])).toThrow(/mismatch/);
  });
});

describe("wav float + smoothing", () => {
  const F32 = formatFor(48000, "32f");
  const floatTone = (silentMs: number, toneMs: number) => {
    const lead = silence(F32, silentMs);
    const body = silence(F32, toneMs);
    for (let i = 0; i < body.length; i += 4) body.writeFloatLE(0.5, i);
    return Buffer.concat([lead, body, lead]);
  };

  it("builds and parses 32-bit float WAV", () => {
    const data = floatTone(0, 100);
    const p = parseWav(buildWav(F32, data));
    expect(p.format).toEqual({ audioFormat: 3, channels: 1, sampleRate: 48000, bitsPerSample: 32 });
    expect(p.data.length).toBe(4800 * 4);
    expect(p.data.readFloatLE(0)).toBe(0.5);
  });

  it("reads WAVE_FORMAT_EXTENSIBLE float as format 3", () => {
    const w = buildWav(F32, floatTone(0, 10));
    // Turn the 16-byte fmt into an extensible one: tag 0xFFFE, sub-format float at fmt body + 24.
    const ext = Buffer.alloc(40);
    w.copy(ext, 0, 20, 36);
    ext.writeUInt16LE(0xfffe, 0);
    ext.writeUInt16LE(22, 16);
    ext.writeUInt16LE(3, 24);
    const wav = Buffer.concat([w.subarray(0, 12), Buffer.from("fmt "), Buffer.from([40, 0, 0, 0]), ext, w.subarray(36)]);
    expect(parseWav(wav).format.audioFormat).toBe(3);
  });

  it("trims quiet edges (keeping 60 ms) for float and 16-bit", () => {
    const t = trimSilence(F32, floatTone(500, 1000));
    expect(t.length / 4).toBe(48000 + 2 * 2880);
    const s16 = Buffer.concat([silence(DEFAULT_FORMAT, 300), parseWav(tone(200)).data, silence(DEFAULT_FORMAT, 300)]);
    expect(trimSilence(DEFAULT_FORMAT, s16).length / 2).toBe(8820 + 2 * 2646);
    // -60 dBFS noise counts as silence
    const noise = Buffer.alloc(4800 * 4);
    for (let i = 0; i < noise.length; i += 4) noise.writeFloatLE(0.001, i);
    expect(trimSilence(F32, Buffer.concat([noise, floatTone(0, 100)])).length / 4).toBe(4800 + 2880);
  });

  it("fades in and out", () => {
    const f = fade(F32, floatTone(0, 100));
    const n = f.length / 4;
    expect(f.readFloatLE(0)).toBe(0);
    expect(f.readFloatLE((n - 1) * 4)).toBe(0);
    expect(f.readFloatLE(192 * 4)).toBeCloseTo(0.25, 2); // halfway through the 8 ms (384 frame) fade
    expect(f.readFloatLE((n / 2) * 4)).toBe(0.5);
    const s = fade(DEFAULT_FORMAT, parseWav(tone(100)).data);
    expect(s.readInt16LE(0)).toBe(0);
    expect(s.readInt16LE(2000)).toBe(1000);
  });

  it("concatenates float clips with smoothing and exact offsets", () => {
    const clip = buildWav(F32, floatTone(500, 1000));
    const { wav, offsetsMs } = concatWav([
      { kind: "audio", wav: clip, smooth: true },
      { kind: "silence", ms: 450 },
      { kind: "audio", wav: clip, smooth: true },
    ]);
    expect(offsetsMs).toEqual([
      { startMs: 0, durationMs: 1120 },
      { startMs: 1120, durationMs: 450 },
      { startMs: 1570, durationMs: 1120 },
    ]);
    const p = parseWav(wav);
    expect(p.format.audioFormat).toBe(3);
    expect(p.data.length).toBe((53760 * 2 + 21600) * 4);
  });
});

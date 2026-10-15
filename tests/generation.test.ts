// Continuations, job runs, fallback, gaps and format conversion against scripts/mock-cartesia.mjs.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORT = 4300 + Math.floor(Math.random() * 600);
let mock: ChildProcess;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-gen-test-"));

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  process.env.CARTESIA_BASE_URL = `http://127.0.0.1:${PORT}`;
  process.env.CARTESIA_API_KEY = "sk_car_mock";
  mock = spawn(process.execPath, [path.join(__dirname, "../scripts/mock-cartesia.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise<void>((resolve) => mock.stdout!.on("data", (d) => String(d).includes("mock cartesia") && resolve()));
});
afterAll(async () => {
  mock?.kill();
  // Windows cannot delete the folder while SQLite holds studio.db open.
  (await import("@/lib/db")).db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const settings = {
  voiceId: "v-hindi-1", voiceName: "x", modelId: "sonic-3.6", language: "hi",
  speed: 1, volume: 1, emotion: "calm", sampleRate: 48000, bitDepth: "32f" as const,
};

describe("continuations", () => {
  it("ends every chunk with terminal punctuation and joins them with a space", async () => {
    const { forContinuation } = await import("@/lib/cartesiaWs");
    expect(forContinuation("नमस्ते", "hi", false)).toBe("नमस्ते। ");
    expect(forContinuation("Hello", "en", true)).toBe("Hello.");
    expect(forContinuation('He said "go!"', "en", true)).toBe('He said "go!"');
    expect(forContinuation("क्या?", "hi", false)).toBe("क्या? ");
  });

  it("splits a run into one PCM buffer per transcript by flush_id", async () => {
    const { generateRun } = await import("@/lib/cartesiaWs");
    const order: number[] = [];
    const out = await generateRun(["एक", "दो दो दो दो दो दो दो दो", "तीन तीन"], settings, { onAudio: (i) => order.push(i) });
    expect(order).toEqual([0, 1, 2]);
    // mock: 300 ms + 40 ms per character of the sent transcript, float 48 kHz
    const sent = ["एक। ", "दो दो दो दो दो दो दो दो। ", "तीन तीन।"];
    expect(out.map((b) => b.length)).toEqual(sent.map((t) => Math.round(48 * (300 + t.length * 40)) * 4));
  });

  it("rejects when the API reports an error", async () => {
    const { generateRun } = await import("@/lib/cartesiaWs");
    await expect(generateRun(["ok", "FAIL"], settings)).rejects.toThrow(/Mock failure/);
  });
});

describe("chapter generation and merge", () => {
  it("generates a run, falls back on failure, and merges with gaps", { timeout: 30000 }, async () => {
    const store = await import("@/lib/store");
    const { enqueueChapter } = await import("@/lib/jobs");
    const { renderChapter } = await import("@/lib/chapterAudio");
    const { parseWav } = await import("@/lib/wav");
    const B = '<break time="1s" />';
    const pr = store.createProject({ name: "t", voice_id: "v-hindi-1", voice_name: "Mock", language: "hi" });
    const ch = store.createChapter(pr.id, "c", ["एक।", B + B, "दो।", "This will FAIL.", "चार।"]);
    expect(enqueueChapter(ch.id)).toBe(4);
    for (let t = 0; store.listParagraphs(ch.id).some((p) => p.status === "queued" || p.status === "generating"); t++) {
      if (t > 250) throw new Error("timeout");
      await new Promise((r) => setTimeout(r, 100));
    }
    const ps = store.listParagraphs(ch.id);
    const cont = (i: number) => JSON.parse(ps[i].active_settings!).continuation;
    expect([cont(0), cont(2)]).toEqual([true, true]); // before the failure: via the WebSocket run
    expect(ps[3].status).toBe("error");
    expect(cont(4)).toBe(false); // after the failure: bytes fallback
    expect(JSON.parse(ps[0].active_settings!)).toMatchObject({ sample_rate: 48000, bit_depth: "32f", emotion: null });

    const r = renderChapter(ch.id);
    const tl = r.timeline;
    expect(tl.map((i) => i.pause)).toEqual([false, true, false, false]);
    const gaps = tl.slice(1).map((i, n) => i.startMs - (tl[n].startMs + tl[n].durationMs));
    gaps.forEach((g, n) => expect(Math.abs(g - [0, 0, 450][n])).toBeLessThanOrEqual(1));
    expect(tl[1].durationMs).toBe(2000);
    const wav = parseWav(fs.readFileSync(r.file!));
    expect(wav.format).toMatchObject({ audioFormat: 3, sampleRate: 48000, bitsPerSample: 32 });
    expect(Math.abs(wav.data.length / 192 - r.durationMs)).toBeLessThanOrEqual(1);

    // Project switched to 44.1k/16: the 48k float clips are converted (and cached), not rejected.
    store.updateProject(pr.id, { sample_rate: 44100, bit_depth: "16", paragraph_gap_ms: 0 });
    const r2 = renderChapter(ch.id);
    expect(r2.key).not.toBe(r.key);
    expect(parseWav(fs.readFileSync(r2.file!)).format).toMatchObject({ audioFormat: 1, sampleRate: 44100, bitsPerSample: 16 });
    expect(Math.abs(r2.durationMs - (r.durationMs - 450))).toBeLessThanOrEqual(3);
    expect(fs.readdirSync(path.join(dataDir, "cache")).filter((f) => f.includes("-conv-")).length).toBe(3);
  });
});

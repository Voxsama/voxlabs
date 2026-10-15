import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pasteSplit } from "@/components/studio/ParagraphRow";

const B = '<break time="1s" />';

describe("pasteSplit", () => {
  it("keeps text before the caret in this row and appends text after the caret to the last part", () => {
    expect(pasteSplit("Hello world", 6, 6, "one\ntwo\nthree")).toEqual({ texts: ["Hello one", "two", "threeworld"], caret: 5 });
  });
  it("replaces the selection", () => {
    expect(pasteSplit("ab XX cd", 3, 5, "पहला\nदूसरा")).toEqual({ texts: ["ab पहला", "दूसरा cd"], caret: 5 });
  });
  it("keeps pause lines as their own rows", () => {
    expect(pasteSplit("start end", 6, 6, `${B}\nmid\n${B}`)).toEqual({ texts: ["start", B, "mid", B, "end"], caret: 0 });
  });
  it("empty row: pasted lines become the paragraphs", () => {
    expect(pasteSplit("", 0, 0, "a\r\n\r\nb\n")).toEqual({ texts: ["a", "b"], caret: 1 });
  });
});

describe("store editing helpers", async () => {
  // Never touch ./data: point the DB at a temp dir before lib/db is loaded.
  const dir = (process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "editor-test-")));
  afterAll(async () => {
    // Windows cannot delete the folder while SQLite holds studio.db open.
    (await import("@/lib/db")).db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const store = await import("@/lib/store");
  const pr = store.createProject({ name: "t", language: "hi" });
  const texts = (cid: string) => store.listParagraphs(cid).map((p) => p.text);

  it("inserts before a paragraph", () => {
    const c = store.createChapter(pr.id, "c1", ["a", "b"]);
    const [b] = store.listParagraphs(c.id).slice(1);
    store.insertParagraphs(c.id, null, ["x"], b.id);
    expect(texts(c.id)).toEqual(["a", "x", "b"]);
  });

  it("expands a paragraph and copies its settings to new speech rows", () => {
    const c = store.createChapter(pr.id, "c2", ["a", "z"]);
    const a = store.listParagraphs(c.id)[0];
    store.updateParagraph(a.id, { speed: 1.2, volume: 1.5 });
    store.expandParagraph(a.id, ["a1", B, "a2"]);
    const ps = store.listParagraphs(c.id);
    expect(ps.map((p) => p.text)).toEqual(["a1", B, "a2", "z"]);
    expect([ps[1].is_pause, ps[2].speed, ps[2].volume]).toEqual([1, 1.2, 1.5]);
  });

  it("split copies volume; speed/volume are clamped", () => {
    const c = store.createChapter(pr.id, "c3", ["one two"]);
    const p = store.updateParagraph(store.listParagraphs(c.id)[0].id, { speed: 9, volume: 0.1 });
    expect([p.speed, p.volume]).toEqual([1.5, 0.5]);
    expect(store.updateParagraph(p.id, { speed: null }).speed).toBeNull();
    const newId = store.splitParagraph(p.id, 3);
    expect(store.getParagraph(newId).volume).toBe(0.5);
    const up = store.updateProject(pr.id, { speed: 0.1, volume: 5, sample_rate: 12345, bit_depth: "8" as never, paragraph_gap_ms: 99999 });
    expect([up.speed, up.volume, up.sample_rate, up.bit_depth, up.paragraph_gap_ms]).toEqual([0.6, 2, pr.sample_rate, pr.bit_depth, 5000]);
  });
});

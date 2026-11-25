import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

describe("bulk paragraph edits", async () => {
  // Never touch ./data: point the DB at a temp dir before lib/db is loaded.
  const dir = (process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bulk-test-")));
  afterAll(async () => {
    // Windows cannot delete the folder while SQLite holds studio.db open.
    (await import("@/lib/db")).db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const store = await import("@/lib/store");
  const { subscribe } = await import("@/lib/events");
  const { db } = await import("@/lib/db");

  /** A chapter with three paragraphs, each carrying its own speed/volume/emotion. */
  const makeParagraphs = () => {
    const pr = store.createProject({ name: "p", language: "hi" });
    const ch = store.createChapter(pr.id, "c", ["एक।", "दो।", "तीन।"]);
    const ids = store.listParagraphs(ch.id).map((p) => p.id);
    ids.forEach((id, i) => store.updateParagraph(id, { speed: 1 + i / 10, volume: 0.8, emotion: "happy" }));
    return { pr, ch, ids };
  };

  it("sets the voice and its name on every selected paragraph", () => {
    const { ch, ids } = makeParagraphs();
    const n = store.setParagraphVoice(ids, { voice_id: "v-hindi-1", voice_name: "Aria" });
    expect(n).toBe(3);
    const rows = store.listParagraphs(ch.id);
    expect(rows.map((r) => [r.voice_id, r.voice_name])).toEqual([
      ["v-hindi-1", "Aria"],
      ["v-hindi-1", "Aria"],
      ["v-hindi-1", "Aria"],
    ]);
  });

  it("keeps speed, volume and emotion when the patch leaves them out", () => {
    const { ch, ids } = makeParagraphs();
    store.setParagraphVoice(ids, { voice_id: "v-hindi-1", voice_name: "Aria" });
    const rows = store.listParagraphs(ch.id);
    expect(rows.map((r) => r.speed)).toEqual([1, 1.1, 1.2]);
    expect(rows.map((r) => r.volume)).toEqual([0.8, 0.8, 0.8]);
    expect(rows.map((r) => r.emotion)).toEqual(["happy", "happy", "happy"]);
  });

  it("resets the speed to null (inherit) when the patch sends speed: null", () => {
    const { ch, ids } = makeParagraphs();
    store.setParagraphVoice(ids, { speed: null });
    expect(store.listParagraphs(ch.id).map((r) => r.speed)).toEqual([null, null, null]);
    // The other fields are untouched.
    expect(store.listParagraphs(ch.id).map((r) => r.volume)).toEqual([0.8, 0.8, 0.8]);
  });

  it("clamps the speed exactly like updateParagraph does", () => {
    const { ch, ids } = makeParagraphs();
    for (const speed of [1.4, 5, 0.1, null]) {
      store.setParagraphVoice(ids, { speed });
      const bulk = store.listParagraphs(ch.id).map((r) => r.speed);
      const single = store.updateParagraph(ids[0], { speed }).speed;
      expect(bulk).toEqual([single, single, single]);
    }
    store.setParagraphVoice(ids, { speed: 1.4 });
    expect(store.listParagraphs(ch.id).map((r) => r.speed)).toEqual([1.4, 1.4, 1.4]);
    store.setParagraphVoice(ids, { speed: 5 });
    expect(store.listParagraphs(ch.id).map((r) => r.speed)).toEqual([1.5, 1.5, 1.5]);
    store.setParagraphVoice(ids, { speed: 0.1 });
    expect(store.listParagraphs(ch.id).map((r) => r.speed)).toEqual([0.6, 0.6, 0.6]);
  });

  it("clears the voice name together with the voice", () => {
    const { ch, ids } = makeParagraphs();
    store.setParagraphVoice(ids, { voice_id: "v-hindi-1", voice_name: "Aria" });
    store.setParagraphVoice(ids, { voice_id: null });
    const rows = store.listParagraphs(ch.id);
    expect(rows.map((r) => r.voice_id)).toEqual([null, null, null]);
    expect(rows.map((r) => r.voice_name)).toEqual([null, null, null]);
  });

  it("leaves rows it does not select alone", () => {
    const { ch, ids } = makeParagraphs();
    store.setParagraphVoice([ids[0]], { voice_id: "v-hindi-1", voice_name: "Aria" });
    const rows = store.listParagraphs(ch.id);
    expect([rows[0].voice_id, rows[0].voice_name]).toEqual(["v-hindi-1", "Aria"]);
    expect([rows[1].voice_id, rows[1].voice_name]).toEqual([null, null]);
  });

  it("emits a chapter event per chapter and touches the project on delete", () => {
    const pr = store.createProject({ name: "p2", language: "hi" });
    const c1 = store.createChapter(pr.id, "c1", ["a", "b"]);
    const c2 = store.createChapter(pr.id, "c2", ["c"]);
    const ids = [...store.listParagraphs(c1.id), ...store.listParagraphs(c2.id)].map((p) => p.id);
    // Mark the project as stale so the touch is visible.
    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", pr.id);

    const seen: { type: string; chapterId?: string }[] = [];
    const off = subscribe(pr.id, (ev) => seen.push(ev as { type: string; chapterId?: string }));
    const r = store.deleteParagraphs([ids[0], ids[2]]);
    off();

    expect(r.deleted).toBe(2);
    expect([...r.chapters].sort()).toEqual([c1.id, c2.id].sort());
    expect(seen).toEqual([
      { type: "chapter", chapterId: c1.id },
      { type: "chapter", chapterId: c2.id },
    ]);
    // touchProject bumped the project to "now", well after the seeded 2000-01-01 (ISO strings compare lexically).
    expect(store.getProject(pr.id).updated_at > "2000-01-01T00:00:00.000Z").toBe(true);
    expect(store.listParagraphs(c1.id).map((p) => p.text)).toEqual(["b"]);
  });
});

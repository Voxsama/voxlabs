import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

describe("listProjects aggregates", async () => {
  // Never touch ./data: point the DB at a temp dir before lib/db is loaded.
  const dir = (process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "projects-test-")));
  afterAll(async () => {
    (await import("@/lib/db")).db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const store = await import("@/lib/store");
  const version = (pid: string, ms: number) =>
    store.addVersion(pid, { file_path: "x.wav", duration_ms: ms, model_id: "sonic-3.6", voice_id: "v1", text_snapshot: "", settings: {} });

  const pr = store.createProject({ name: "p", language: "hi" });
  const empty = store.createProject({ name: "empty", language: "hi" });
  const c1 = store.createChapter(pr.id, "c1", ["a", "b", '<break time="1s" />']);
  const c2 = store.createChapter(pr.id, "c2", ["c", "d"]);
  store.createChapter(pr.id, "c3");
  const [a, b] = store.listParagraphs(c1.id);
  const [c, d] = store.listParagraphs(c2.id);
  version(a.id, 1000);
  version(a.id, 1500); // the newer take is active; the old one must not count
  version(b.id, 250);
  store.setStatus(c.id, "queued");
  store.setStatus(d.id, "error", "boom");

  it("sums per project and per chapter", () => {
    const p = store.listProjects().find((x) => x.id === pr.id)!;
    expect(p).toMatchObject({ chapter_count: 3, paragraph_count: 4, ready_count: 2, duration_ms: 1750, generating_count: 1, error_count: 1, preview: "a" });
    expect(p.chapters).toEqual([
      { name: "c1", paragraph_count: 2, ready_count: 2 },
      { name: "c2", paragraph_count: 2, ready_count: 0 },
      { name: "c3", paragraph_count: 0, ready_count: 0 },
    ]);
  });

  it("returns zeros for a project without chapters", () => {
    expect(store.listProjects().find((x) => x.id === empty.id)).toMatchObject({ chapter_count: 0, paragraph_count: 0, duration_ms: 0, chapters: [], preview: null });
  });

  it("adds duration_ms to chapters", () => {
    expect(store.getChapter(c1.id).duration_ms).toBe(1750);
    expect(store.listChapters(pr.id).map((x) => x.duration_ms)).toEqual([1750, 0, 0]);
  });
});

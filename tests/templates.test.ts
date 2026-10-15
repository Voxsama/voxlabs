import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { effectiveSettings, needsGeneration, settingsSnapshot } from "@/lib/settings";
import { FIA_TEMPLATE } from "@/lib/templates";
import { buildWav, DEFAULT_FORMAT } from "@/lib/wav";

describe("templates, duplicate and rename", async () => {
  // Never touch ./data: point the DB at a temp dir before lib/db is loaded.
  const dir = (process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "templates-test-")));
  const dbm = await import("@/lib/db");
  afterAll(() => {
    // Windows cannot delete the folder while SQLite holds studio.db open.
    dbm.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const store = await import("@/lib/store");
  const END = FIA_TEMPLATE.end_text!;
  const titles = FIA_TEMPLATE.chapters.map((c) => c.title);

  it("seeds FIA once; a deleted FIA stays deleted", () => {
    const ts = store.listTemplates();
    expect(ts).toHaveLength(1);
    const [fia] = ts;
    expect([fia.category, fia.name, fia.end_text]).toEqual(["FIA", "FIA", "यह Recording का अंत है।"]);
    expect(fia.chapters.map((c) => c.suffix)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
    expect(fia.chapters.map((c) => c.title)).toEqual([
      "सुने और मन में रखें", "पाठ का परिचय", "घटनाओं को समझाना", "पाठ को नाटकीय रूप देना", "आवश्यक जानकारी", "वचन बोलना",
    ]);
    expect(dbm.getSetting("templates_seeded")).toBe("1");

    // Build a project from it before deleting (the template is only read at creation time).
    const pr = store.createProjectFromTemplate({ name: " Exo-P59 ", language: "hi" }, fia);
    expect(pr.name).toBe("Exo-P59");
    const cs = store.listChapters(pr.id);
    expect(cs.map((c) => c.name)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"].map((s) => `exo-p59-${s}`));
    cs.forEach((c, i) => expect(store.listParagraphs(c.id).map((p) => p.text)).toEqual([titles[i], END]));

    store.deleteTemplate(fia.id);
    dbm.seedTemplates(dbm.db);
    expect(store.listTemplates()).toHaveLength(0);
    expect(store.getProject(pr.id).name).toBe("Exo-P59");
  });

  it("validates template input", () => {
    expect(() => store.createTemplate({ name: "  ", chapters: [{ suffix: "s1", title: "a" }] })).toThrow(/name is required/);
    expect(() => store.createTemplate({ name: "X", chapters: [{ suffix: "s1", title: "a" }, { suffix: "S1", title: "b" }] })).toThrow(/Duplicate/);
    expect(() => store.createTemplate({ name: "X", chapters: [{ suffix: "", title: "a" }] })).toThrow(/suffix/);
    expect(() => store.createTemplate({ name: "X", chapters: [{ suffix: " ", title: " " }] })).toThrow(/at least one/);
    const t = store.createTemplate({ category: " Cat ", name: " X ", end_text: " END ", chapters: [{ suffix: " a ", title: " A " }, { suffix: "", title: "  " }] });
    expect([t.category, t.name, t.end_text, t.chapters]).toEqual(["Cat", "X", "END", [{ suffix: "a", title: "A" }]]);
    expect(store.updateTemplate(t.id, { name: "Y" }).chapters).toEqual([{ suffix: "a", title: "A" }]);
    expect(() => store.createProjectFromTemplate({ name: "  " }, t)).toThrow(/project code/);
    // Empty title: the chapter gets only the end line.
    const pr = store.createProjectFromTemplate({ name: "Q1" }, { ...t, chapters: [{ suffix: "a", title: "" }] });
    expect(store.listParagraphs(store.listChapters(pr.id)[0].id).map((p) => p.text)).toEqual(["END"]);
    store.deleteTemplate(t.id);
    expect(() => store.getTemplate(t.id)).toThrow(/not found/);
  });

  // Source: "Exo-P59" with chapter exo-p59-s1 (one generated paragraph, one not) and a chapter "Intro".
  const src = store.createProject({ name: "Exo-P59", language: "hi", voice_id: "v1", voice_name: "Voice" });
  store.updateProject(src.id, { volume: 1.5, emotion: "calm", paragraph_gap_ms: 700, description: "d" });
  const c1 = store.createChapter(src.id, "exo-p59-s1", ["गाया हुआ", "नया"]);
  const intro = store.createChapter(src.id, "Intro", ["x"]);
  const [done, idle] = store.listParagraphs(c1.id);
  store.updateParagraph(done.id, { speed: 1.2 });
  const rel = path.posix.join(src.id, c1.id, `${done.id}-v1.wav`);
  fs.mkdirSync(path.dirname(path.join(dbm.AUDIO_DIR, rel)), { recursive: true });
  fs.writeFileSync(path.join(dbm.AUDIO_DIR, rel), buildWav(DEFAULT_FORMAT, Buffer.alloc(882)));
  const s = effectiveSettings(store.getParagraph(done.id), c1, store.getProject(src.id));
  const srcVersion = store.addVersion(done.id, {
    file_path: rel, duration_ms: 10, model_id: "sonic-3.6", voice_id: "v1", text_snapshot: "गाया हुआ", settings: settingsSnapshot(s),
  });

  it("duplicates a project with its audio and renames chapters to the new code", () => {
    const pr = store.duplicateProject(src.id, " Exo-P60 ");
    const srcNow = store.getProject(src.id);
    expect(pr.name).toBe("Exo-P60");
    expect([pr.volume, pr.emotion, pr.paragraph_gap_ms, pr.description, pr.voice_id, pr.sample_rate, pr.bit_depth]).toEqual([
      1.5, "calm", 700, "d", "v1", srcNow.sample_rate, srcNow.bit_depth,
    ]);
    const cs = store.listChapters(pr.id);
    expect(cs.map((c) => c.name)).toEqual(["exo-p60-s1", "Intro"]);
    const [a, b] = store.listParagraphs(cs[0].id);
    expect([a.text, a.status, a.speed, a.version_count]).toEqual(["गाया हुआ", "done", 1.2, 1]);
    expect(a.active_version_id).not.toBe(srcVersion.id);
    const v = store.getVersion(a.active_version_id!);
    expect(v.file_path).toBe(`${pr.id}/${cs[0].id}/${a.id}-v1.wav`);
    expect(fs.existsSync(path.join(dbm.AUDIO_DIR, v.file_path))).toBe(true);
    expect(needsGeneration(a, effectiveSettings(a, cs[0], pr))).toBe(false);
    expect([b.text, b.status, b.active_version_id]).toEqual(["नया", "idle", null]);
    // Source untouched.
    expect(store.listChapters(src.id).map((c) => c.name)).toEqual(["exo-p59-s1", "Intro"]);
    expect(store.getParagraph(done.id).active_version_id).toBe(srcVersion.id);
    expect(fs.existsSync(path.join(dbm.AUDIO_DIR, rel))).toBe(true);
    expect(() => store.duplicateProject(src.id, "  ")).toThrow(/project code/);
  });

  it("copies an idle paragraph when its audio file is missing", () => {
    fs.renameSync(path.join(dbm.AUDIO_DIR, rel), path.join(dbm.AUDIO_DIR, rel + ".bak"));
    try {
      const pr = store.duplicateProject(src.id, "Exo-P70");
      const [a] = store.listParagraphs(store.listChapters(pr.id)[0].id);
      expect([a.status, a.active_version_id]).toEqual(["idle", null]);
    } finally {
      fs.renameSync(path.join(dbm.AUDIO_DIR, rel + ".bak"), path.join(dbm.AUDIO_DIR, rel));
    }
  });

  it("renaming a project renames chapters that start with its code", () => {
    const pr = store.duplicateProject(src.id, "Exo-P60");
    store.updateProject(pr.id, { name: " Exo-P61 " });
    expect(store.getProject(pr.id).name).toBe("Exo-P61");
    expect(store.listChapters(pr.id).map((c) => c.name)).toEqual(["exo-p61-s1", "Intro"]);
    expect(store.updateProject(pr.id, { name: "  " }).name).toBe("Exo-P61");
    expect(store.getChapter(intro.id).name).toBe("Intro");
    expect(store.renameCode("EXO-P61-s2", "exo-p61", "B")).toBe("b-s2");
    expect(store.renameCode("exo-p610-s2", "exo-p61", "B")).toBe("exo-p610-s2");
  });

  /** Give a paragraph a real one-take WAV, laid out like jobs.saveVersion. */
  const take = (projectId: string, chapterId: string, pid: string) => {
    const r = path.posix.join(projectId, chapterId, `${pid}-v1.wav`);
    fs.mkdirSync(path.dirname(path.join(dbm.AUDIO_DIR, r)), { recursive: true });
    fs.writeFileSync(path.join(dbm.AUDIO_DIR, r), buildWav(DEFAULT_FORMAT, Buffer.alloc(882)));
    return store.addVersion(pid, { file_path: r, duration_ms: 10, model_id: "sonic-3.6", voice_id: "v1", text_snapshot: store.getParagraph(pid).text, settings: {} });
  };
  const fileOf = (versionId: string) => path.join(dbm.AUDIO_DIR, store.getVersion(versionId).file_path);

  it("duplicate with resetChapters keeps only first and last paragraph of those chapters", () => {
    const sp = store.createProject({ name: "Exo-P80" });
    const s2 = store.createChapter(sp.id, "exo-p80-s2", ["h", "a", "b", "end"]);
    const s3 = store.createChapter(sp.id, "exo-p80-s3", ["h3", "end3"]);
    const s4 = store.createChapter(sp.id, "exo-p80-s4", ["h4", "m4", "end4"]);
    const ps2 = store.listParagraphs(s2.id);
    for (const p of [ps2[0], ps2[1], ps2[3]]) take(sp.id, s2.id, p.id);

    const pr = store.duplicateProject(sp.id, "Exo-P81", [s2.id, s3.id, "unknown"]);
    const [n2, n3, n4] = store.listChapters(pr.id);
    const kept = store.listParagraphs(n2.id);
    expect(kept.map((p) => [p.text, p.position, p.status])).toEqual([["h", 0, "done"], ["end", 1, "done"]]);
    for (const [p, srcP] of [[kept[0], ps2[0]], [kept[1], ps2[3]]] as const) {
      expect(p.active_version_id).toBeTruthy();
      expect(p.active_version_id).not.toBe(store.getParagraph(srcP.id).active_version_id);
      expect(fs.existsSync(fileOf(p.active_version_id!))).toBe(true);
    }
    expect(store.listParagraphs(n3.id).map((p) => p.text)).toEqual(["h3", "end3"]);
    expect(store.listParagraphs(n4.id).map((p) => p.text)).toEqual(["h4", "m4", "end4"]);
    // Source untouched.
    expect(store.listParagraphs(s2.id).map((p) => p.text)).toEqual(["h", "a", "b", "end"]);
  });

  it("replaceMiddleParagraphs swaps the body and keeps heading and end line", () => {
    const pr = store.createProject({ name: "Exo-P90" });
    const ch = store.createChapter(pr.id, "exo-p90-s2", ["h", "a", "b", "end"]);
    const [h, a, , end] = store.listParagraphs(ch.id);
    const [vh, va, ve] = [h, a, end].map((p) => take(pr.id, ch.id, p.id));
    const aFile = fileOf(va.id);

    store.replaceMiddleParagraphs(ch.id, ["x", "y"]);
    const ps = store.listParagraphs(ch.id);
    expect(ps.map((p) => [p.text, p.position])).toEqual([["h", 0], ["x", 1], ["y", 2], ["end", 3]]);
    expect(fs.existsSync(aFile)).toBe(false);
    expect(() => store.getVersion(va.id)).toThrow(/not found/);
    expect([ps[0].id, ps[0].active_version_id, ps[3].id, ps[3].active_version_id]).toEqual([h.id, vh.id, end.id, ve.id]);
    expect(fs.existsSync(fileOf(vh.id)) && fs.existsSync(fileOf(ve.id))).toBe(true);

    const empty = store.createChapter(pr.id, "empty");
    store.replaceMiddleParagraphs(empty.id, ["x", "y"]);
    expect(store.listParagraphs(empty.id).map((p) => [p.text, p.position])).toEqual([["x", 0], ["y", 1]]);

    const one = store.createChapter(pr.id, "one", ["p"]);
    store.replaceMiddleParagraphs(one.id, ["x", "y"]);
    expect(store.listParagraphs(one.id).map((p) => [p.text, p.position])).toEqual([["p", 0], ["x", 1], ["y", 2]]);
  });

  it("replaceMiddleParagraphs drops pasted copies of the heading and end line", () => {
    const pr = store.createProject({ name: "Exo-P91" });
    const [H, E] = ["आवश्यक जानकारी:", "यह रिकॉर्डिंग का अंत है।"];
    const ch = store.createChapter(pr.id, "exo-p91-s5", [H, E]);
    const [h, end] = store.listParagraphs(ch.id);
    const [vh, ve] = [h, end].map((p) => take(pr.id, ch.id, p.id));

    store.replaceMiddleParagraphs(ch.id, ["आवश्यक जानकारी", "x", "y", "यह रिकॉर्डिंग का अंत है"]);
    const ps = store.listParagraphs(ch.id);
    expect(ps.map((p) => p.text)).toEqual([H, "x", "y", E]);
    expect([ps[0].active_version_id, ps[3].active_version_id]).toEqual([vh.id, ve.id]);

    store.replaceMiddleParagraphs(ch.id, [H, E]);
    expect(store.listParagraphs(ch.id).map((p) => p.text)).toEqual([H, E]);
  });
});

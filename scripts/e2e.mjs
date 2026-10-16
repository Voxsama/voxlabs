// End-to-end API test. Run against an instance wired to scripts/mock-cartesia.mjs:
//   node scripts/mock-cartesia.mjs 4010 &
//   CARTESIA_BASE_URL=http://localhost:4010 CARTESIA_API_KEY=sk_car_mock DATA_DIR=/tmp/studio-test npx next start -p 3001 &
//   node scripts/e2e.mjs http://localhost:3001
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
const AdmZip = require("adm-zip");

const BASE = process.argv[2] || "http://localhost:3001";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-"));
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

let cookie = "";
async function call(method, url, body, raw = false, asCookie = cookie) {
  const init = { method, headers: asCookie ? { cookie: asCookie } : {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, init);
  const set = res.headers.get("set-cookie");
  if (set && url.startsWith("/api/auth/") && asCookie === cookie) cookie = set.split(";")[0];
  if (raw) return res;
  const j = await res.json();
  if (!res.ok) throw Object.assign(new Error(j.error || res.status), { status: res.status, body: j });
  return j;
}

async function waitIdle(chapterId, timeout = 30000) {
  const t0 = Date.now();
  for (;;) {
    const { paragraphs } = await call("GET", `/api/chapters/${chapterId}`);
    if (!paragraphs.some((p) => p.status === "queued" || p.status === "generating")) return paragraphs;
    if (Date.now() - t0 > timeout) throw new Error("timeout waiting for generation");
    await new Promise((r) => setTimeout(r, 300));
  }
}

function probeDuration(file) {
  // ffmpeg prints Duration: 00:00:12.34 on stderr
  let out = "";
  try {
    execFileSync(ffmpeg, ["-hide_banner", "-i", file], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = e.stderr.toString();
  }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 : NaN;
}

/** fmt of a WAV buffer: { audioFormat, sampleRate, bits } (follows WAVE_FORMAT_EXTENSIBLE). */
function wavFmt(b) {
  for (let off = 12; off + 8 <= b.length; ) {
    const id = b.toString("ascii", off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === "fmt ") {
      const tag = b.readUInt16LE(off + 8);
      return { audioFormat: tag === 0xfffe ? b.readUInt16LE(off + 32) : tag, sampleRate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    }
    off += 8 + size + (size % 2);
  }
  return null;
}
const isFloat48 = (f) => f && f.audioFormat === 3 && f.sampleRate === 48000 && f.bits === 32;

/** Speech items + pause rows + one paragraph gap between consecutive speech items. */
function expectedLength(timeline, gapMs) {
  return timeline.reduce((a, it, n) => a + it.durationMs + (n && !it.pause && !timeline[n - 1].pause ? gapMs : 0), 0);
}

async function download(url, body, name) {
  const res = await call("POST", url, body, true);
  if (!res.ok) throw new Error((await res.json()).error);
  const f = path.join(tmp, name);
  fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  return { file: f, type: res.headers.get("content-type"), disposition: res.headers.get("content-disposition") };
}

const B = '<break time="1s" />';
const SCRIPT = [
  "सुनें और मन में रखें: निर्गमन अध्याय 29, वचन 10 से 18।",
  `इस ऑडियो को यहां रोकें। ${B}${B} ${B}  ${B}${B} `,
  "फिर मूसा बैल के बाकी सभी हिस्सों को डेरे के बाहर जला दे।",
  `Inline pause ${B} inside a sentence.`,
  "This paragraph will FAIL on the mock API.",
].join("\n");

// ------------------------------------------------------------------ auth
const anon = await fetch(BASE + "/api/projects");
ok(anon.status === 401, "API refuses requests without login");
const page = await fetch(BASE + "/voices", { redirect: "manual" });
ok(page.status === 307 && /\/login/.test(page.headers.get("location") || ""), "pages redirect to /login without login");
const me0 = await (await fetch(BASE + "/api/auth/me")).json();
const ADMIN = { username: process.env.E2E_USER || "e2e-admin", password: process.env.E2E_PASS || "e2e-password-1" };
if (me0.needsSetup) {
  await call("POST", "/api/auth/setup", ADMIN);
  ok(Boolean(cookie), "first-run setup creates admin and logs in");
  const again = await call("POST", "/api/auth/setup", { username: "intruder", password: "whatever123" }, true, "");
  ok(again.status === 409, "setup cannot be run twice");
} else {
  await call("POST", "/api/auth/login", ADMIN);
}
const settings = await call("GET", "/api/settings");
if (!settings.hasKey) {
  const noKey = await call("GET", "/api/voices", undefined, true);
  ok(noKey.status === 400 && /API key/.test((await noKey.json()).error), "missing Cartesia key is a clear 400, not a logout");
  const saved = await call("PUT", "/api/settings", { apiKey: "sk_car_mock" });
  ok(saved.hasKey && saved.keySource === "settings", "admin saves the Cartesia API key in Settings");
}
const badLogin = await call("POST", "/api/auth/login", { username: ADMIN.username, password: "wrong-password" }, true, "");
ok(badLogin.status === 401, "wrong password refused");
const forged = await fetch(BASE + "/api/projects", { headers: { cookie: "studio_session=eyJ1aWQiOiJ4IiwiZXhwIjo5OTk5OTk5OTk5OTk5fQ.forged" } });
ok(forged.status === 401, "forged session cookie refused");
// a normal (non-admin) team member
const member = await call("POST", "/api/users", { username: "member-" + Date.now(), password: "member-pass-1" });
const loginRes = await call("POST", "/api/auth/login", { username: member.username, password: "member-pass-1" }, true, "none");
const memberCookie = loginRes.headers.get("set-cookie").split(";")[0];
ok((await call("GET", "/api/projects", undefined, true, memberCookie)).ok, "member can use projects");
ok((await call("PUT", "/api/settings", { concurrency: 5 }, true, memberCookie)).status === 403, "member cannot change settings / API key");
ok((await call("GET", "/api/users", undefined, true, memberCookie)).status === 403, "member cannot manage users");
await call("DELETE", `/api/users?id=${member.id}`);
ok((await call("GET", "/api/projects", undefined, true, memberCookie)).status === 401, "deleted user's session stops working");

// ------------------------------------------------------------------ voices
const voices = await call("GET", "/api/voices?language=hi");
ok(voices.voices.some((v) => v.id === "v-hindi-1") && voices.voices.every((v) => v.language === "hi"), "voice list filtered by language");
await call("POST", "/api/voices/favorites", { voice_id: "v-hindi-1", name: "Mock Hindi Narrator", meta: voices.voices[0] });
ok((await call("GET", "/api/voices/favorites")).some((f) => f.voice_id === "v-hindi-1"), "star a voice");
const testAudio = await call("POST", "/api/voices/test", { voiceId: "v-hindi-1", text: "नमस्ते", language: "hi" }, true);
ok(testAudio.ok && testAudio.headers.get("content-type") === "audio/wav", "test voice returns wav");

// ------------------------------------------------------------------ project + chapter
const { project } = await call("POST", "/api/projects", { name: "E2E Exo-P72", language: "hi", voice_id: "v-hindi-1", voice_name: "Mock Hindi Narrator" });
ok(project.sample_rate === 48000 && project.bit_depth === "32f", `new project defaults to 48 kHz float (${project.sample_rate}/${project.bit_depth})`);
const GAP = project.paragraph_gap_ms;
ok(GAP > 0, `project has a paragraph gap (${GAP} ms)`);
const ch = await call("POST", `/api/projects/${project.id}/chapters`, { name: "exo-p72-s1-v1", text: SCRIPT });
let { paragraphs } = await call("GET", `/api/chapters/${ch.id}`);
ok(paragraphs.length === 6, `script split into 6 paragraphs (got ${paragraphs.length})`);
ok(paragraphs[2].text === B.repeat(5), "trailing break run became a 5s pause row");

// SSE: listen while generating
const events = [];
const ac = new AbortController();
const sse = fetch(`${BASE}/api/projects/${project.id}/events`, { signal: ac.signal, headers: { cookie } }).then(async (res) => {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split("\n")) if (line.startsWith("data: ")) events.push(JSON.parse(line.slice(6)));
    }
  } catch {}
});
await new Promise((r) => setTimeout(r, 300));

// ------------------------------------------------------------------ generate
const gen = await call("POST", `/api/chapters/${ch.id}/generate`, {});
ok(gen.queued === 5, `chapter generate queued 5 speakable paragraphs (got ${gen.queued})`);
paragraphs = await waitIdle(ch.id);
const failed = paragraphs.filter((p) => p.status === "error");
ok(failed.length === 1 && /Mock failure/.test(failed[0].error), "API error is shown on the failing paragraph");
ok(paragraphs.filter((p) => p.status === "done").length === 4, "other 4 paragraphs generated");
const firstSettings = JSON.parse(paragraphs[0].active_settings || "{}");
ok(firstSettings.continuation === true, "chapter generate used WebSocket continuations (settings_json.continuation)");
ok(firstSettings.sample_rate === 48000 && firstSettings.bit_depth === "32f", "version settings record 48 kHz / 32f");
const firstAudio = Buffer.from(await (await call("GET", `/api/audio/${paragraphs[0].active_version_id}`, undefined, true)).arrayBuffer());
ok(isFloat48(wavFmt(firstAudio)), `generated version is a 48 kHz float WAV (${JSON.stringify(wavFmt(firstAudio))})`);
ac.abort();
await sse;
ok(events.filter((e) => e.type === "paragraph").length >= 10, `live SSE status events received (${events.length})`);

// export must be blocked while a paragraph has no audio
const chk = await call("GET", `/api/projects/${project.id}/export`);
ok(!chk.ok && chk.missing.length === 1, "export check lists the missing paragraph");
const blocked = await call("POST", `/api/projects/${project.id}/export`, { structure: "chapters", format: "wav" }, true);
ok(blocked.status === 400, "export refused while audio is missing");

// fix the text and generate only what is pending
const bad = failed[0];
await call("PATCH", `/api/paragraphs/${bad.id}`, { text: "This paragraph is fixed now." });
const gen2 = await call("POST", `/api/chapters/${ch.id}/generate`, {});
ok(gen2.queued === 1, "after editing, only the changed paragraph is regenerated");
paragraphs = await waitIdle(ch.id);
ok(paragraphs.every((p) => p.status === "done" || p.text === B.repeat(5)), "all paragraphs done");

// ------------------------------------------------------------------ regenerate + history
const p0 = paragraphs[0];
await call("POST", `/api/paragraphs/${p0.id}/generate`);
await waitIdle(ch.id);
let versions = await call("GET", `/api/paragraphs/${p0.id}/versions`);
ok(versions.length === 2 && versions[0].version_no === 2, "regenerate creates version 2");
ok(JSON.parse(versions[0].settings_json).continuation === false, "single regenerate uses the bytes API");
const v2 = Buffer.from(await (await call("GET", `/api/audio/${versions[0].id}`, undefined, true)).arrayBuffer());
ok(isFloat48(wavFmt(v2)), "regenerated version is a 48 kHz float WAV");
const restored = await call("POST", `/api/paragraphs/${p0.id}/versions`, { versionId: versions[1].id });
ok(restored.active_version_id === versions[1].id, "switch back to version 1");
const v1 = await call("GET", `/api/audio/${versions[1].id}`, undefined, true);
ok(v1.ok && v1.headers.get("content-type") === "audio/wav", "version audio served");

// ------------------------------------------------------------------ per-paragraph voice + stale detection
await call("PATCH", `/api/paragraphs/${paragraphs[3].id}`, { voice_id: "v-en-1", voice_name: "Mock English" });
const gen3 = await call("POST", `/api/chapters/${ch.id}/generate`, {});
ok(gen3.queued === 1, "changing a paragraph's voice marks it for regeneration");
await waitIdle(ch.id);
ok((await call("GET", `/api/paragraphs/${paragraphs[3].id}`)).active_voice_id === "v-en-1", "paragraph generated with its own voice");

// chapter voice change marks all inheriting paragraphs
await call("PATCH", `/api/chapters/${ch.id}`, { voice_id: "v-en-1", voice_name: "Mock English" });
const gen4 = await call("POST", `/api/chapters/${ch.id}/generate`, {});
ok(gen4.queued === 4, `chapter voice change -> 4 inheriting paragraphs pending (got ${gen4.queued})`);
await waitIdle(ch.id);
await call("PATCH", `/api/chapters/${ch.id}`, { voice_id: null, voice_name: null });
await call("POST", `/api/chapters/${ch.id}/generate`, {});
paragraphs = await waitIdle(ch.id);

// ------------------------------------------------------------------ split / merge / insert pause
const target = paragraphs[0];
const sp = await call("POST", `/api/paragraphs/${target.id}/split`, { at: target.text.indexOf(":") + 1 });
ok(sp.paragraphs.length === 7, "split creates a new paragraph");
const mg = await call("POST", `/api/paragraphs/${sp.id}/merge`);
ok(mg.paragraphs.length === 6 && mg.paragraphs[0].text === target.text, "merge restores the original text");
const ins = await call("POST", `/api/chapters/${ch.id}/paragraphs`, { afterId: mg.paragraphs[0].id, pauseMs: 2500 });
ok(ins.paragraphs[1].text === `${B}${B}<break time="500ms" />`, "insert 2.5s pause row");
await call("DELETE", `/api/paragraphs/${ins.id}`);
// split marked paragraph 0 as changed -> regenerate it
await call("POST", `/api/chapters/${ch.id}/generate`, {});
paragraphs = await waitIdle(ch.id);

// ------------------------------------------------------------------ timeline + player audio
const tl = await call("GET", `/api/chapters/${ch.id}/timeline`);
const pauseItem = tl.timeline.find((i) => i.pause);
ok(tl.hasAudio && pauseItem && pauseItem.durationMs === 5000, "timeline includes a 5s pause");
ok(Math.abs(expectedLength(tl.timeline, GAP) - tl.durationMs) < 5, "timeline segments + paragraph gaps add up to chapter length");
const gaps = tl.timeline.slice(1).map((it, n) => [it, tl.timeline[n]]).filter(([a, b]) => !a.pause && !b.pause).map(([a, b]) => a.startMs - b.startMs - b.durationMs);
ok(gaps.length > 0 && gaps.every((g) => Math.abs(g - GAP) <= 1), `gap between consecutive speech paragraphs = ${GAP} ms (${gaps.join(", ")})`);
const nextToPause = tl.timeline.slice(1).map((it, n) => [it, tl.timeline[n]]).filter(([a, b]) => a.pause || b.pause).map(([a, b]) => a.startMs - b.startMs - b.durationMs);
ok(nextToPause.every((g) => Math.abs(g) <= 1), "no extra gap next to a pause row");
const ranged = await fetch(`${BASE}/api/chapters/${ch.id}/audio`, { headers: { Range: "bytes=100-199", cookie } });
ok(ranged.status === 206 && (await ranged.arrayBuffer()).byteLength === 100, "chapter audio supports Range (seeking)");

// ------------------------------------------------------------------ export
const ch2 = await call("POST", `/api/projects/${project.id}/chapters`, { name: "exo-p72-s2-v1", text: "दूसरा अध्याय।\n" + B.repeat(2) + "\nअंत।" });
await call("POST", `/api/chapters/${ch2.id}/generate`, {});
await waitIdle(ch2.id);
const tl2 = await call("GET", `/api/chapters/${ch2.id}/timeline`);

const zipWav = await download(`/api/projects/${project.id}/export`, { structure: "chapters", format: "wav" }, "chapters.zip");
const zip = new AdmZip(zipWav.file);
const names = zip.getEntries().map((e) => e.entryName).sort();
ok(names.includes("01 - exo-p72-s1-v1.wav") && names.includes("02 - exo-p72-s2-v1.wav") && names.includes("manifest.json"), `chapters ZIP contents: ${names.join(", ")}`);
const c1 = zip.getEntry("01 - exo-p72-s1-v1.wav").getData();
fs.writeFileSync(path.join(tmp, "c1.wav"), c1);
ok(isFloat48(wavFmt(c1)), "exported chapter WAV keeps 48 kHz float");
ok(Math.abs(probeDuration(path.join(tmp, "c1.wav")) - expectedLength(tl.timeline, GAP)) < 60, "chapter WAV length = clips + gaps + pauses");
ok(Math.abs(expectedLength(tl2.timeline, GAP) - tl2.durationMs) < 5 && tl2.timeline.some((i) => i.pause), "chapter 2 length = clips + pause (no gap next to the pause)");

const mp3 = await download(`/api/projects/${project.id}/export`, { structure: "merged", format: "mp3", mp3Kbps: 128 }, "merged.mp3");
ok(mp3.type === "audio/mpeg", "merged MP3 content type");
ok(Math.abs(probeDuration(mp3.file) - (expectedLength(tl.timeline, GAP) + expectedLength(tl2.timeline, GAP))) < 150, "merged MP3 length = both chapters (clips + gaps + pauses)");

for (const fmt of ["flac", "ogg"]) {
  const one = await download(`/api/projects/${project.id}/export`, { structure: "merged", format: fmt, chapterIds: [ch2.id] }, `one.${fmt}`);
  ok(one.type === `audio/${fmt}` && Math.abs(probeDuration(one.file) - tl2.durationMs) < 100, `single chapter as ${fmt.toUpperCase()}`);
}
// Chapters ZIP is always a ZIP, even for one chapter with scripts off: audio files only.
const onlyAudio = await download(`/api/projects/${project.id}/export`, { structure: "chapters", format: "wav", chapterIds: [ch2.id], includeScript: false }, "one-chapter.zip");
const oa = new AdmZip(onlyAudio.file).getEntries().map((e) => e.entryName);
ok(onlyAudio.type === "application/zip" && oa.length === 1 && oa[0] === "02 - exo-p72-s2-v1.wav", `one-chapter ZIP with audio only: ${oa.join(", ")}`);
const perPara = await download(`/api/projects/${project.id}/export`, { structure: "paragraphs", format: "mp3", chapterIds: [ch.id] }, "paras.zip");
const pnames = new AdmZip(perPara.file).getEntries().map((e) => e.entryName);
ok(pnames.filter((n) => n.endsWith(".mp3")).length === 5 && pnames.some((n) => n.endsWith("script.txt")), `per-paragraph ZIP has 5 mp3 + script`);

// ------------------------------------------------------------------ bulk import (zip with txt + docx)
const docx = new AdmZip();
docx.addFile("[Content_Types].xml", Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
docx.addFile("_rels/.rels", Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
docx.addFile("word/document.xml", Buffer.from('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Docx line one.</w:t></w:r></w:p><w:p><w:r><w:t>&lt;break time="1s" /&gt;&lt;break time="1s" /&gt;</w:t></w:r></w:p><w:p><w:r><w:t>Docx line two.</w:t></w:r></w:p></w:body></w:document>'));
const bundle = new AdmZip();
bundle.addFile("act-p12-s10-v1.txt", Buffer.from("ten"));
bundle.addFile("act-p12-s2-v1.txt", Buffer.from("two\nlines"));
bundle.addFile("act-p12-s1-v1.docx", docx.toBuffer());
bundle.addFile("__MACOSX/._junk.txt", Buffer.from("x"));
bundle.addFile("image.png", Buffer.from("x"));
const fd = new FormData();
fd.append("project", JSON.stringify({ name: "Bulk", language: "hi" }));
fd.append("files", new Blob([bundle.toBuffer()]), "act-p12.zip");
const bulk = await call("POST", "/api/projects", fd);
ok(bulk.imported === 3 && bulk.skipped.includes("image.png"), "bulk ZIP import: 3 chapters, png skipped");
const bp = await call("GET", `/api/projects/${bulk.project.id}`);
ok(bp.chapters.map((c) => c.name).join(",") === "act-p12-s1-v1,act-p12-s2-v1,act-p12-s10-v1", "chapters in natural order");
const docxCh = await call("GET", `/api/chapters/${bp.chapters[0].id}`);
ok(docxCh.paragraphs.length === 3 && docxCh.paragraphs[1].text === B + B, "docx paragraphs + pause row parsed");
await call("DELETE", `/api/projects/${bulk.project.id}`);

// ------------------------------------------------------------------ chapter reorder / rename / paste replace
const re = await call("POST", `/api/projects/${project.id}/reorder`, { ids: [ch2.id, ch.id] });
ok(re[0].id === ch2.id && re[0].position === 0, "chapter reorder");
const pasted = await call("POST", `/api/chapters/${ch2.id}/import`, { text: "a\n\nb", mode: "replace" });
ok(pasted.paragraphs.length === 2 && pasted.paragraphs.every((p) => !p.active_version_id), "paste replace");

// ------------------------------------------------------------------ voice cloning
const mk = (sec, name) => {
  const f = path.join(tmp, name);
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=200:duration=${sec}`, "-c:a", "libopus", f]);
  return new Blob([fs.readFileSync(f)], { type: "audio/webm" });
};
const cloneForm = (blob, extra = {}) => {
  const f = new FormData();
  f.append("clip", blob, "recording.webm");
  f.append("name", "My Clone");
  f.append("language", "hi");
  for (const [k, v] of Object.entries({ consent: "true", ...extra })) f.append(k, v);
  return f;
};
const long = mk(20, "long.webm");
await call("POST", "/api/voices/clone", cloneForm(long, { consent: "false" })).then(() => ok(false, "clone without consent refused"), (e) => ok(/permission/.test(e.message), "clone without consent refused"));
await call("POST", "/api/voices/clone", cloneForm(mk(5, "short.webm"))).then(() => ok(false, "too-short clip refused"), (e) => ok(/at least 10/.test(e.message), "too-short clip refused"));
await call("POST", "/api/voices/clone", cloneForm(long, { start: "2", end: "8" })).then(() => ok(false, "trim to 6s refused"), (e) => ok(/at least 10/.test(e.message), "trim below 10s refused"));
const cloned = await call("POST", "/api/voices/clone", cloneForm(long, { start: "1", end: "16" }));
ok(Math.abs(cloned.seconds - 15) < 0.2 && cloned.voice.is_owner, `clone created from trimmed 15s webm recording (${cloned.seconds}s)`);
const mine = await call("GET", "/api/voices?mine=1");
ok(mine.voices.some((v) => v.id === cloned.voice.id && v.favorite), "clone listed under my voices and starred");
const acc = await call("PATCH", `/api/voices/${cloned.voice.id}/accents`, { accents: ["british"] });
ok(acc.accents.some((a) => a.locale === "en-GB"), "add accent to cloned voice");
await call("DELETE", `/api/voices/${cloned.voice.id}`);
ok(!(await call("GET", "/api/voices?mine=1")).voices.some((v) => v.id === cloned.voice.id), "delete cloned voice");

// ------------------------------------------------------------------ credits
const counted = await call("GET", "/api/credits");
ok(counted.source === "app" && counted.used > 0 && counted.left === null, `credits badge counts characters sent by this app (${counted.used})`);
await call("PUT", "/api/settings", { planCredits: 1000000, renewDay: 31 });
const planned = await call("GET", "/api/credits");
ok(planned.plan === 1000000 && planned.left === 1000000 - planned.used, "credits left = plan - used");
await call("PUT", "/api/settings", { adminKey: "sk_car_not_admin" });
const badAdmin = await call("GET", "/api/credits");
ok(badAdmin.source === "app" && /admin/i.test(badAdmin.warning || ""), "a normal key in the admin field falls back to the app's count with a warning");
await call("PUT", "/api/settings", { adminKey: "sk_car_admin_mock" });
const exact = await call("GET", "/api/credits");
ok(exact.source === "cartesia" && exact.used === 4321 && exact.left === 1000000 - 4321, "admin key reads exact usage from Cartesia");
await call("PUT", "/api/settings", { adminKey: null, planCredits: null, renewDay: 1 });

// ------------------------------------------------------------------ cleanup
await call("DELETE", `/api/projects/${project.id}`);
ok(!(await call("GET", "/api/projects")).some((p) => p.id === project.id), "project deleted");
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);

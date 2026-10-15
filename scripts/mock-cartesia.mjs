// Tiny fake Cartesia API for local testing without credits. Usage: node scripts/mock-cartesia.mjs [port]
import http from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.argv[2] || 4010);
const voices = [
  { id: "v-hindi-1", name: "Mock Hindi Narrator", description: "test", tagline: "", gender: "masculine", is_owner: false, language: "hi", accents: [{ accent: "hindi", locale: "hi-IN", is_native: true }], preview_file_url: null },
  { id: "v-en-1", name: "Mock English", description: "test", tagline: "", gender: "feminine", is_owner: false, language: "en", accents: [{ accent: "american", locale: "en-US", is_native: true }], preview_file_url: null },
];
const log = [];

/** Sine tone as raw PCM in the requested encoding (pcm_s16le or pcm_f32le). */
function pcm(ms, freq, sr = 44100, enc = "pcm_s16le") {
  const n = Math.round((sr * ms) / 1000), bps = enc === "pcm_f32le" ? 4 : 2;
  const b = Buffer.alloc(n * bps);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / sr) * 0.1;
    if (bps === 4) b.writeFloatLE(v, i * 4);
    else b.writeInt16LE(Math.round(v * 30000), i * 2);
  }
  return b;
}

function wav(ms, freq = 220, sr = 44100, enc = "pcm_s16le") {
  const data = pcm(ms, freq, sr, enc), bps = enc === "pcm_f32le" ? 4 : 2;
  const b = Buffer.alloc(44);
  b.write("RIFF", 0); b.writeUInt32LE(0xffffffff, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(bps === 4 ? 3 : 1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * bps, 28); b.writeUInt16LE(bps, 32); b.writeUInt16LE(bps * 8, 34);
  b.write("data", 36); b.writeUInt32LE(0xffffffff, 40); // streaming-style header, like the live API sends
  return Buffer.concat([b, data]);
}

const clipMs = (transcript) => Math.min(8000, 300 + transcript.length * 40);
const freqOf = (voice) => (voice?.id === "v-en-1" ? 330 : 220);

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const url = new URL(req.url, "http://x");
  const auth = req.headers.authorization || "";
  log.push(`${req.method} ${url.pathname}`);
  const send = (code, obj, type = "application/json") => {
    res.writeHead(code, { "Content-Type": type });
    res.end(type === "application/json" ? JSON.stringify(obj) : obj);
  };
  if (!auth.startsWith("Bearer sk_")) return send(401, { message: "Invalid API key" });
  if (!req.headers["cartesia-version"]) return send(400, { message: "Missing Cartesia-Version" });
  if (url.pathname === "/tts/bytes" && req.method === "POST") {
    const j = JSON.parse(body.toString());
    if (j.transcript.includes("FAIL")) return send(500, { message: "Mock failure requested" });
    console.log("TTS", JSON.stringify({ model: j.model_id, voice: j.voice, lang: j.language, gc: j.generation_config, fmt: j.output_format, transcript: j.transcript.slice(0, 60) }));
    await new Promise((r) => setTimeout(r, 300));
    const f = j.output_format || {};
    return send(200, wav(clipMs(j.transcript), freqOf(j.voice), f.sample_rate, f.encoding), "audio/wav");
  }
  if (url.pathname === "/usage/credits" && req.method === "GET") {
    if (!auth.startsWith("Bearer sk_car_admin_")) return send(403, { message: "This endpoint requires an admin API key" });
    return send(200, { data: [{ start_ts: url.searchParams.get("start_ts"), end_ts: url.searchParams.get("end_ts"), credits: 4321 }] });
  }
  if (url.pathname === "/voices" && req.method === "GET") {
    let v = voices;
    if (url.searchParams.get("is_owner") === "true") v = v.filter((x) => x.is_owner);
    const lang = url.searchParams.get("language");
    if (lang) v = v.filter((x) => x.language === lang);
    const q = url.searchParams.get("q");
    if (q) v = v.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()));
    return send(200, { data: v, has_more: false, next_page: null });
  }
  if (url.pathname === "/voices/clone" && req.method === "POST") {
    const ct = req.headers["content-type"] || "";
    const fd = await new Response(body, { headers: { "content-type": ct } }).formData();
    const clip = fd.get("clip");
    const v = { id: "v-clone-" + Date.now(), name: fd.get("name"), description: fd.get("description") || "", tagline: fd.get("tagline") || "", is_owner: true, language: fd.get("language"), accents: [{ accent: "hindi", locale: "hi-IN", is_native: true }], access: "private", created_at: new Date().toISOString() };
    console.log("CLONE", v.name, v.language, clip?.type, clip?.size, "bytes");
    voices.push(v);
    return send(200, v);
  }
  const m = /^\/voices\/([^/]+)(\/accents)?$/.exec(url.pathname);
  if (m && req.method === "DELETE") {
    const i = voices.findIndex((v) => v.id === m[1]);
    if (i < 0) return send(404, { message: "not found" });
    voices.splice(i, 1);
    res.writeHead(204).end();
    return;
  }
  if (m && m[2] && req.method === "PATCH") {
    const v = voices.find((x) => x.id === m[1]);
    const { accents } = JSON.parse(body.toString());
    v.accents.push(...accents.map((a) => ({ accent: a, locale: a === "british" ? "en-GB" : "xx-XX", is_native: false })));
    return send(200, v);
  }
  if (url.pathname === "/accents") {
    return send(200, { accents: [
      { id: "hindi", name: "Hindi", language: "hi", locale: "hi-IN", is_locale_default: true, is_localizable: true },
      { id: "british", name: "British", language: "en", locale: "en-GB", is_locale_default: true, is_localizable: true },
    ].filter((a) => !url.searchParams.get("language") || a.language === url.searchParams.get("language")) });
  }
  send(404, { message: "mock: unknown route " + url.pathname });
});

// WebSocket TTS with continuations, like the live API: every audio chunk carries the flush_id of the
// flush it belongs to (0, 1, 2…), `flush_done` closes a flush, `done` ends the context (continue:false).
const wss = new WebSocketServer({ server, path: "/tts/websocket" });
wss.on("connection", (ws, req) => {
  const q = new URL(req.url, "http://x").searchParams;
  if (!String(req.headers["x-api-key"] || "").startsWith("sk_") || !q.get("cartesia_version")) {
    ws.send(JSON.stringify({ type: "error", status_code: 401, done: true, error: "Invalid API key or missing cartesia_version" }));
    return ws.close();
  }
  const flushIds = new Map(); // context_id -> current flush_id
  let chain = Promise.resolve();
  ws.on("message", (raw) => (chain = chain.then(async () => {
    const j = JSON.parse(raw.toString());
    const ctx = j.context_id, fid = flushIds.get(ctx) ?? 0;
    const send = (o) => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ context_id: ctx, ...o }));
    if (j.transcript?.includes("FAIL")) return send({ type: "error", status_code: 500, done: true, error: "Mock failure requested" });
    if (j.transcript) {
      log.push(`WS ${ctx} ${fid}`);
      console.log("WS", JSON.stringify({ ctx, flush_id: fid, gc: j.generation_config, fmt: j.output_format, cont: j.continue, transcript: j.transcript.slice(0, 60) }));
      await new Promise((r) => setTimeout(r, 200));
      const audio = pcm(clipMs(j.transcript), freqOf(j.voice), j.output_format?.sample_rate, j.output_format?.encoding);
      const half = Math.floor(audio.length / 8) * 4; // two chunks, frame aligned for both encodings
      for (const part of [audio.subarray(0, half), audio.subarray(half)]) {
        send({ type: "chunk", data: part.toString("base64"), flush_id: fid, done: false, status_code: 206 });
      }
    }
    if (j.flush) {
      send({ type: "flush_done", flush_id: fid, flush_done: true, done: false, status_code: 206 });
      flushIds.set(ctx, fid + 1);
    }
    if (j.continue === false) send({ type: "done", done: true, status_code: 200 });
  })));
});

server.listen(port, () => console.log(`mock cartesia on :${port}`));

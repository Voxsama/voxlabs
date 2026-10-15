// Real Cartesia smoke test: generates one Hindi sentence (with a pause) to data/smoke.wav.
// Usage: npm run smoke            (uses the key from Settings or CARTESIA_API_KEY)
//        npm run smoke -- <voice-id>
import fs from "node:fs";
import path from "node:path";
import { listVoices, tts } from "../lib/cartesia";
import { DATA_DIR } from "../lib/db";
import { durationMs, parseWav } from "../lib/wav";

async function main() {
  let voiceId = process.argv[2];
  if (!voiceId) {
    const { voices } = await listVoices({ language: "hi", limit: 5 });
    if (!voices.length) throw new Error("No Hindi voices returned by Cartesia");
    voiceId = voices[0].id;
    console.log(`Using voice "${voices[0].name}" (${voiceId})`);
  }
  const audio = await tts({
    transcript: 'नमस्ते! यह कार्टेसिया का परीक्षण है। <break time="1s"/> Hello from the audiobook studio.',
    voiceId,
    modelId: "sonic-3.6",
    language: "hi",
  });
  const wav = parseWav(audio);
  const out = path.join(DATA_DIR, "smoke.wav");
  fs.writeFileSync(out, audio);
  console.log(`OK: ${out} (${(durationMs(wav.format, wav.data.length) / 1000).toFixed(1)}s, ${wav.format.sampleRate} Hz, ${wav.format.channels} ch)`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});

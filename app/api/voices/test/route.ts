import { tts } from "@/lib/cartesia";
import { body, handle } from "@/lib/http";
import { toTranscript } from "@/lib/text";

/** One-off preview: speak `text` with a voice. Not saved anywhere. */
export const POST = handle(async (req: Request) => {
  const b = await body<{ voiceId: string; text: string; language?: string; modelId?: string; speed?: number; emotion?: string }>(req);
  if (!b.voiceId) throw new Error("Pick a voice");
  if (!b.text?.trim()) throw new Error("Type some text");
  const audio = await tts({
    transcript: toTranscript(b.text).slice(0, 1000),
    voiceId: b.voiceId,
    modelId: b.modelId || "sonic-3.6",
    language: b.language || undefined,
    speed: b.speed,
    emotion: b.emotion,
  });
  return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
});

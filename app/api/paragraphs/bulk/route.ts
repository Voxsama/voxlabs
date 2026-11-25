import { body, handle, json } from "@/lib/http";
import { deleteParagraphs, setParagraphVoice } from "@/lib/store";

export interface BulkPatch {
  action: "delete" | "voice";
  ids: string[];
  /**
   * The voice patch, passed through to the store untouched: a missing key leaves the
   * paragraph's value alone, an explicit null resets it to inherit. (JSON.stringify drops
   * undefined, so the client must send null to reset and omit the key to leave alone.)
   */
  voice?: {
    voice_id?: string | null;
    voice_name?: string | null;
    speed?: number | null;
    volume?: number | null;
    emotion?: string | null;
  };
}

export const POST = handle(async (req: Request) => {
  const b = await body<BulkPatch>(req);
  if (!b.action || !Array.isArray(b.ids)) throw Object.assign(new Error("Bad request"), { status: 400 });
  switch (b.action) {
    case "delete": {
      const r = deleteParagraphs(b.ids);
      return json({ ok: true, deleted: r.deleted, chapters: r.chapters }, 200);
    }
    case "voice": {
      const n = setParagraphVoice(b.ids, b.voice ?? {});
      return json({ ok: true, updated: n }, 200);
    }
  }
});

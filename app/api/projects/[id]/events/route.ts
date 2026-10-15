import { currentUser } from "@/lib/auth";
import { subscribe } from "@/lib/events";
import type { Ctx } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Server-Sent Events: live paragraph status updates for one project. */
export async function GET(req: Request, ctx: Ctx) {
  if (!currentUser(req)) return Response.json({ error: "Please log in" }, { status: 401 });
  const { id } = await ctx.params;
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const unsub = subscribe(id, send);
      const ping = setInterval(() => send({ type: "ping" }), 20000);
      cleanup = () => {
        clearInterval(ping);
        unsub();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      send({ type: "ping" });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}

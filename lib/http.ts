import fs from "node:fs";
import { NextResponse } from "next/server";
import { requireUser } from "./auth";
import { CartesiaError } from "./cartesia";

export type Ctx<T extends Record<string, string> = { id: string }> = { params: Promise<T> };

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Wrap a route handler: requires a logged-in user (unless `public`), and turns thrown errors
 * into JSON `{ error }` responses.
 */
export function handle<A extends [Request, ...unknown[]]>(fn: (...args: A) => Promise<Response> | Response, opts: { public?: boolean } = {}) {
  return async (...args: A): Promise<Response> => {
    try {
      if (!opts.public) requireUser(args[0]);
      return await fn(...args);
    } catch (e) {
      let status = (e as { status?: number }).status;
      // Cartesia key problems must not look like "you are logged out" (401) to the browser.
      if (e instanceof CartesiaError) status = status === 401 || status === 403 ? 400 : status === 429 ? 429 : status && status >= 500 ? 502 : status;
      const msg = e instanceof Error ? e.message : String(e);
      if (!status || status >= 500) console.error(e);
      return json({ error: msg }, status && status >= 400 && status < 600 ? status : 400);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

/** Serve a file with HTTP Range support so <audio> can seek. */
export function serveFile(req: Request, file: string, contentType: string, downloadName?: string): Response {
  const stat = fs.statSync(file);
  const size = stat.size;
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
  };
  if (downloadName) headers["Content-Disposition"] = contentDisposition(downloadName);
  const range = req.headers.get("range");
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
    let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    headers["Content-Length"] = String(end - start + 1);
    return new Response(nodeStream(fs.createReadStream(file, { start, end })), { status: 206, headers });
  }
  headers["Content-Length"] = String(size);
  return new Response(nodeStream(fs.createReadStream(file)), { status: 200, headers });
}

export function contentDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Convert a Node readable stream into a web ReadableStream. */
export function nodeStream(s: NodeJS.ReadableStream, onClose?: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      s.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      s.on("end", () => {
        controller.close();
        onClose?.();
      });
      s.on("error", (err) => {
        controller.error(err);
        onClose?.();
      });
    },
    cancel() {
      (s as unknown as { destroy?: () => void }).destroy?.();
      onClose?.();
    },
  });
}

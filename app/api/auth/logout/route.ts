import { handle, json } from "@/lib/http";
import { sessionCookieHeader } from "@/lib/session";

export const POST = handle(
  async (req: Request) => {
    const res = json({ ok: true });
    res.headers.append("Set-Cookie", sessionCookieHeader(req, null));
    return res;
  },
  { public: true },
);

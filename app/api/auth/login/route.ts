import { login } from "@/lib/auth";
import { body, handle, json } from "@/lib/http";
import { createToken, sessionCookieHeader } from "@/lib/session";

export const POST = handle(
  async (req: Request) => {
    const b = await body<{ username?: string; password?: string }>(req);
    const user = login(b.username, b.password);
    const res = json({ user });
    res.headers.append("Set-Cookie", sessionCookieHeader(req, createToken(user.id)));
    return res;
  },
  { public: true },
);

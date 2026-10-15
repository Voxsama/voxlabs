import { AuthError, createUser, userCount } from "@/lib/auth";
import { db } from "@/lib/db";
import { body, handle, json } from "@/lib/http";
import { createToken, sessionCookieHeader } from "@/lib/session";

/** First run only: create the first admin account and log in. */
export const POST = handle(
  async (req: Request) => {
    const b = await body<{ username?: string; password?: string }>(req);
    const user = db.transaction(() => {
      if (userCount() > 0) throw new AuthError("Setup is already done. Log in instead.", 409);
      return createUser(b.username, b.password, true);
    })();
    const res = json({ user }, 201);
    res.headers.append("Set-Cookie", sessionCookieHeader(req, createToken(user.id)));
    return res;
  },
  { public: true },
);

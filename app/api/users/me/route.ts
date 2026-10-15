import { AuthError, checkPassword, requireUser, setPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { body, handle, json } from "@/lib/http";

/** Change my own password. body: { current, password } */
export const PATCH = handle(async (req: Request) => {
  const me = requireUser(req);
  const b = await body<{ current?: string; password?: string }>(req);
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(me.id) as { password_hash: string } | undefined;
  if (!row || !checkPassword(String(b.current ?? ""), row.password_hash)) throw new AuthError("Current password is wrong", 400);
  setPassword(me.id, b.password);
  return json({ ok: true });
});

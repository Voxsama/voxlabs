import { createUser, deleteUser, getUser, listUsers, requireAdmin, setAdmin, setPassword } from "@/lib/auth";
import { body, handle, json } from "@/lib/http";

/** Admin: list users. */
export const GET = handle(async (req: Request) => {
  requireAdmin(req);
  return json(listUsers());
});

/** Admin: add a user. body: { username, password, is_admin? } */
export const POST = handle(async (req: Request) => {
  requireAdmin(req);
  const b = await body<{ username?: string; password?: string; is_admin?: boolean }>(req);
  return json(createUser(b.username, b.password, Boolean(b.is_admin)), 201);
});

/** Admin: reset a password and/or change admin rights. body: { id, password?, is_admin? } */
export const PATCH = handle(async (req: Request) => {
  const me = requireAdmin(req);
  const b = await body<{ id: string; password?: string; is_admin?: boolean }>(req);
  if (!getUser(b.id)) throw Object.assign(new Error("User not found"), { status: 404 });
  if (b.password) setPassword(b.id, b.password);
  if (typeof b.is_admin === "boolean") setAdmin(b.id, b.is_admin, me.id);
  return json(getUser(b.id));
});

/** Admin: delete a user. ?id= */
export const DELETE = handle(async (req: Request) => {
  const me = requireAdmin(req);
  deleteUser(new URL(req.url).searchParams.get("id") || "", me.id);
  return json({ ok: true });
});

import crypto from "node:crypto";
import { db, newId, now } from "./db";
import { authDisabled, readCookie, verifyToken } from "./session";

export interface User {
  id: string;
  username: string;
  is_admin: number;
  created_at: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const LOCAL_USER: User = { id: "local", username: "local", is_admin: 1, created_at: "" };

// ---------------------------------------------------------------- passwords (scrypt)

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function checkPassword(pw: string, stored: string): boolean {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function validatePassword(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < 8) throw new AuthError("Password must be at least 8 characters", 400);
  return pw;
}

function validateUsername(u: unknown): string {
  const name = typeof u === "string" ? u.trim() : "";
  if (!/^[\w.@-]{2,40}$/.test(name)) throw new AuthError("Username: 2-40 letters, numbers, . _ - or @", 400);
  return name;
}

// ---------------------------------------------------------------- users

export function userCount(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

export function listUsers(): User[] {
  return db.prepare("SELECT id, username, is_admin, created_at FROM users ORDER BY username COLLATE NOCASE").all() as User[];
}

export function getUser(id: string): User | undefined {
  return db.prepare("SELECT id, username, is_admin, created_at FROM users WHERE id = ?").get(id) as User | undefined;
}

export function createUser(username: unknown, password: unknown, isAdmin: boolean): User {
  const name = validateUsername(username);
  const pw = validatePassword(password);
  if (db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE").get(name)) throw new AuthError("That username is taken", 409);
  const id = newId();
  db.prepare("INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)").run(id, name, hashPassword(pw), isAdmin ? 1 : 0, now());
  return getUser(id)!;
}

export function login(username: unknown, password: unknown): User {
  const row = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(String(username ?? "").trim()) as
    | (User & { password_hash: string })
    | undefined;
  // Same work whether or not the user exists, to avoid revealing valid usernames by timing.
  const ok = checkPassword(String(password ?? ""), row?.password_hash ?? "scrypt$00$" + "00".repeat(64));
  if (!row || !ok) throw new AuthError("Wrong username or password", 401);
  return getUser(row.id)!;
}

export function setPassword(id: string, password: unknown) {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(validatePassword(password)), id);
}

export function deleteUser(id: string, actingUserId: string) {
  if (id === actingUserId) throw new AuthError("You cannot delete your own account", 400);
  const u = getUser(id);
  if (!u) throw new AuthError("User not found", 404);
  if (u.is_admin && (db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1").get() as { n: number }).n <= 1) {
    throw new AuthError("Cannot delete the last admin", 400);
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function setAdmin(id: string, isAdmin: boolean, actingUserId: string) {
  if (id === actingUserId && !isAdmin) throw new AuthError("You cannot remove your own admin rights", 400);
  db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(isAdmin ? 1 : 0, id);
}

// ---------------------------------------------------------------- request checks

/** The logged-in user, or null. Checks the signed cookie AND that the user still exists. */
export function currentUser(req: Request): User | null {
  if (authDisabled()) return LOCAL_USER;
  const s = verifyToken(readCookie(req));
  if (!s) return null;
  return getUser(s.uid) ?? null;
}

export function requireUser(req: Request): User {
  const u = currentUser(req);
  if (!u) throw new AuthError("Please log in", 401);
  return u;
}

export function requireAdmin(req: Request): User {
  const u = requireUser(req);
  if (!u.is_admin) throw new AuthError("Only admins can do this", 403);
  return u;
}

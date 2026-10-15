// Signed session cookies. Used by proxy.ts (request gate) and by route handlers.
// Only Node built-ins here: no database access, so it is safe to load in the proxy.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SESSION_COOKIE = "studio_session";
export const SESSION_DAYS = 30;

export const authDisabled = () => process.env.AUTH_DISABLED === "1" || process.env.AUTH_DISABLED === "true";

let cachedSecret: Buffer | null = null;

/** HMAC secret: SESSION_SECRET env, or a random secret stored once in the data folder. */
function secret(): Buffer {
  if (cachedSecret) return cachedSecret;
  if (process.env.SESSION_SECRET) return (cachedSecret = Buffer.from(process.env.SESSION_SECRET));
  const dataDir = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(process.cwd(), "data"));
  const file = path.join(dataDir, "session-secret");
  try {
    cachedSecret = Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
  } catch {
    fs.mkdirSync(dataDir, { recursive: true });
    const s = crypto.randomBytes(32).toString("hex");
    try {
      fs.writeFileSync(file, s, { flag: "wx", mode: 0o600 });
    } catch {
      /* another process created it first */
    }
    cachedSecret = Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
  }
  return cachedSecret;
}

const sign = (payload: string) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

export interface SessionData {
  uid: string;
  exp: number; // ms since epoch
}

export function createToken(uid: string): string {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + SESSION_DAYS * 864e5 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined | null): SessionData | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionData;
    if (!data.uid || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name = SESSION_COOKIE): string | null {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Cookie is marked Secure only when the request came over HTTPS (directly or via a proxy). */
export function sessionCookieHeader(req: Request, token: string | null): string {
  const https = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const attrs = [`${SESSION_COOKIE}=${token ?? ""}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${token ? SESSION_DAYS * 86400 : 0}`];
  if (https) attrs.push("Secure");
  return attrs.join("; ");
}

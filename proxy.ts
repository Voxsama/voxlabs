import { NextResponse, type NextRequest } from "next/server";
import { authDisabled, SESSION_COOKIE, verifyToken } from "@/lib/session";

// First gate: every page and API needs a valid signed session cookie.
// API routes check again (including that the user still exists) in lib/http.ts.
const PUBLIC = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/auth/setup", "/api/version"];

export function proxy(req: NextRequest) {
  if (authDisabled()) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  if (verifyToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please log in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};

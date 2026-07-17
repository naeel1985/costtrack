import { NextResponse, type NextRequest } from "next/server";

// Coarse, fast auth gate at the edge: if there's no session cookie, bounce
// protected routes to /login before any server component runs. Full validation
// (session lookup, expiry, DEK) happens in the (app) layout via requireUser().
// `/` (marketing home) and `/packages` (pricing) are the public commercial
// front door; the rest of the public list is the auth flow.
const PUBLIC = [
  "/",
  "/packages",
  "/login",
  "/register",
  "/forgot-password",
  "/verify",
  "/verify-email",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSession = req.cookies.has("cf_session");

  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, the API (self-guarded), and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

import "server-only";
import { NextResponse } from "next/server";
import { getAuth, type AuthContext } from "@/server/auth";

/**
 * The API equivalent of `requireUser()`. Same `getAuth` resolution (cookie OR
 * bearer), but on failure it hands back a JSON `NextResponse` instead of
 * `redirect("/login")` — route handlers must answer, never redirect.
 *
 * Usage in a route:
 *   const gate = await requireApiUser();
 *   if (!gate.ok) return gate.response;
 *   const { auth } = gate;   // { user, dek, sessionId }
 */
export type ApiUserResult =
  | { ok: true; auth: AuthContext }
  | { ok: false; response: NextResponse };

export async function requireApiUser(): Promise<ApiUserResult> {
  const auth = await getAuth();
  if (!auth) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!auth.user.emailVerified && auth.user.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Verify your email first." }, { status: 403 }),
    };
  }
  return { ok: true, auth };
}

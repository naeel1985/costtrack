import "server-only";
import { NextResponse } from "next/server";
import { getAuth, type AuthContext } from "@/server/auth";
import { serialize } from "@/server/api-serialize";

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

/** Throw from a read handler to return a specific status (e.g. 400) as JSON. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The read-endpoint shape: authenticate, run `produce` (usually one existing
 * query), and return the serialized result as JSON. `ApiError` maps to its
 * status; anything else is a 500. Keeps every GET route down to a one-liner.
 */
export async function apiJson<T>(produce: () => Promise<T>): Promise<NextResponse> {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;
  try {
    return NextResponse.json(serialize(await produce()));
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[api/v1] handler error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

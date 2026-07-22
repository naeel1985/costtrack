import { NextResponse, type NextRequest } from "next/server";
import { authenticateCredentials } from "@/server/login-core";
import { createSessionToken } from "@/server/auth";

// Credentials in, bearer token out. Never cached.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const outcome = await authenticateCredentials(body);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 401 });
  }

  // Same session row the web login creates — just returned as a token instead of
  // planted in a cookie. The DEK is sealed with SERVER_KEY inside the row.
  const { token, expiresAt } = await createSessionToken(outcome.userId, outcome.dek);
  return NextResponse.json({
    token,
    expiresAt: expiresAt.toISOString(),
    user: outcome.user,
  });
}

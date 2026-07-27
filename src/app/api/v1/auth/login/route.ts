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
  // Mobile sessions auto-expire after 15 min of inactivity (each request slides
  // the window); the 7-day absolute expiry still caps the maximum lifetime.
  const { token, expiresAt } = await createSessionToken(outcome.userId, outcome.dek, {
    idleTimeoutSec: 15 * 60,
  });
  return NextResponse.json({
    token,
    expiresAt: expiresAt.toISOString(),
    user: outcome.user,
  });
}

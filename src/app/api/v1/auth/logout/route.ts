import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/api-auth";
import { revokeSession } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  await revokeSession(gate.auth.sessionId);
  return NextResponse.json({ ok: true });
}

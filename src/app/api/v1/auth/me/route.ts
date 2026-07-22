import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/api-auth";

export const dynamic = "force-dynamic";

// Lets the app validate a stored bearer token on launch and refresh the user.
export async function GET() {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  return NextResponse.json({ user: gate.auth.user });
}

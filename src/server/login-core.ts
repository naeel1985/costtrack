import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { unwrapDek, verifyPassword } from "@/lib/crypto";
import { loginSchema } from "@/lib/auth-schemas";
import { isLockedOut, recordLoginAttempt, type SessionUser } from "@/server/auth";

/**
 * The shared credential-check used by BOTH the web server action (`loginUser`,
 * which then sets a cookie) and the mobile API (`POST /api/v1/auth/login`, which
 * returns a bearer token). It does everything except mint the session, so the
 * two transports diverge only in how they hand the session back to the client.
 *
 * On success it returns the unwrapped DEK — so this must never live in a
 * `"use server"` file, or it would be reachable as a client-callable action.
 */
export type LoginOutcome =
  | { ok: true; userId: string; dek: Buffer; user: SessionUser }
  | { ok: false; error: string };

export async function authenticateCredentials(input: unknown): Promise<LoginOutcome> {
  let data: z.infer<typeof loginSchema>;
  try {
    data = loginSchema.parse(input);
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    return { ok: false, error: "Something went wrong" };
  }

  const identifier = data.identifier.toLowerCase().trim();

  if (await isLockedOut(identifier)) {
    await recordLoginAttempt({ identifier, success: false, reason: "locked" });
    return { ok: false, error: "Too many attempts. Try again later." };
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
  });

  // Uniform failure to avoid leaking which part was wrong.
  const invalid: LoginOutcome = { ok: false, error: "Invalid username or password" };

  if (!user) {
    await recordLoginAttempt({ identifier, success: false, reason: "no_such_user" });
    return invalid;
  }
  if (!verifyPassword(data.password, user.passwordHash)) {
    await recordLoginAttempt({ identifier, userId: user.id, success: false, reason: "bad_password" });
    return invalid;
  }
  if (!user.isActive) {
    await recordLoginAttempt({ identifier, userId: user.id, success: false, reason: "disabled" });
    return { ok: false, error: "This account is disabled." };
  }
  if (!user.emailVerified && user.role !== "admin") {
    await recordLoginAttempt({ identifier, userId: user.id, success: false, reason: "unverified" });
    return { ok: false, error: "Please verify your email before signing in." };
  }

  let dek: Buffer;
  try {
    dek = unwrapDek(data.password, { dekWrapped: user.dekWrapped, dekSalt: user.dekSalt });
  } catch {
    await recordLoginAttempt({ identifier, userId: user.id, success: false, reason: "dek_error" });
    return invalid;
  }

  await recordLoginAttempt({ identifier, userId: user.id, success: true, reason: "ok" });
  return {
    ok: true,
    userId: user.id,
    dek,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
    },
  };
}

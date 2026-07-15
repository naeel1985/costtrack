import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  generateToken,
  hashToken,
  openDekFromSession,
  sealDekForSession,
} from "@/lib/crypto";

const COOKIE = "cf_session";
const SESSION_DAYS = 7;

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
}

export interface AuthContext {
  user: SessionUser;
  dek: Buffer;
  sessionId: string;
}

async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  const userAgent = h.get("user-agent") ?? null;
  return { ip, userAgent };
}

/** Create a session, seal the DEK with the server key, and set the cookie. */
export async function createSession(userId: string, dek: Buffer) {
  const token = generateToken();
  const { ip, userAgent } = await requestMeta();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      encDek: sealDekForSession(dek),
      ip,
      userAgent,
      expiresAt,
    },
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    jar.delete(COOKIE);
  }
}

/** Resolve the current authenticated user + their DEK, or null.
 *  Wrapped in React `cache` so repeated calls within one request hit the DB once. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;

  let dek: Buffer;
  try {
    dek = openDekFromSession(session.encDek);
  } catch {
    return null; // server key rotated or tampered
  }

  return {
    sessionId: session.id,
    dek,
    user: {
      id: session.user.id,
      username: session.user.username,
      email: session.user.email,
      fullName: session.user.fullName,
      phone: session.user.phone,
      role: session.user.role,
      emailVerified: session.user.emailVerified,
    },
  };
});

/** Require a verified, signed-in user; otherwise redirect. Returns { user, dek }. */
export async function requireUser(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.user.emailVerified && auth.user.role !== "admin") redirect("/verify-email");
  return auth;
}

export async function requireAdmin(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  // Hide the admin area from non-admins entirely (don't confirm it exists).
  if (auth.user.role !== "admin") notFound();
  return auth;
}

// ── Login-attempt logging & lockout ──────────────────────────────────────────

const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
const LOCKOUT_MINUTES = Number(process.env.LOGIN_LOCKOUT_MINUTES ?? 15);

export async function recordLoginAttempt(input: {
  identifier: string;
  userId?: string | null;
  success: boolean;
  reason: string;
}) {
  const { ip, userAgent } = await requestMeta();
  await prisma.loginAttempt.create({
    data: {
      identifier: input.identifier.slice(0, 200),
      userId: input.userId ?? null,
      success: input.success,
      reason: input.reason,
      ip,
      userAgent,
    },
  });
}

/** True if this identifier has too many recent failures (temporary lockout). */
export async function isLockedOut(identifier: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000);
  const fails = await prisma.loginAttempt.count({
    where: { identifier, success: false, createdAt: { gte: since } },
  });
  return fails >= MAX_ATTEMPTS;
}

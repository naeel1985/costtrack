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
// Don't write `lastUsedAt` on every single request — only once it's this stale.
// Keeps the sliding window accurate to the minute without a write per read.
const SLIDE_THROTTLE_MS = 60_000;

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

/**
 * Create a session row, seal the DEK with the server key, and return the raw
 * token + expiry. Transport-agnostic: the web wraps this to set a cookie, the
 * mobile API returns the token in the response body.
 */
export async function createSessionToken(
  userId: string,
  dek: Buffer,
  opts?: { idleTimeoutSec?: number },
): Promise<{ token: string; expiresAt: Date }> {
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
      idleTimeoutSec: opts?.idleTimeoutSec ?? null,
    },
  });
  return { token, expiresAt };
}

/** Create a session and set the browser cookie (web login). */
export async function createSession(userId: string, dek: Buffer) {
  const { token, expiresAt } = await createSessionToken(userId, dek);
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

/** Delete a session by id — used by the API logout (bearer has no cookie to clear). */
export async function revokeSession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/**
 * Resolve the session token from either transport: the `cf_session` cookie
 * (web) or an `Authorization: Bearer <token>` header (mobile). Cookie wins when
 * both are present. The token itself is identical — a `Session` row is
 * transport-agnostic — so downstream lookup is the same for both clients.
 */
async function resolveSessionToken(): Promise<string | null> {
  const jar = await cookies();
  const cookieToken = jar.get(COOKIE)?.value;
  if (cookieToken) return cookieToken;
  const authz = (await headers()).get("authorization");
  if (authz?.startsWith("Bearer ")) return authz.slice("Bearer ".length).trim() || null;
  return null;
}

/** Resolve the current authenticated user + their DEK, or null.
 *  Wrapped in React `cache` so repeated calls within one request hit the DB once. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const token = await resolveSessionToken();
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  const now = new Date();
  if (!session || session.expiresAt < now || !session.user.isActive) return null;

  // Sliding inactivity timeout (mobile/bearer sessions). If the last request was
  // longer ago than the window, the session is dead — delete it and reject. Any
  // request inside the window "slides" it forward by bumping `lastUsedAt`.
  if (session.idleTimeoutSec != null) {
    const idleMs = now.getTime() - session.lastUsedAt.getTime();
    if (idleMs > session.idleTimeoutSec * 1000) {
      await prisma.session.deleteMany({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    if (idleMs > SLIDE_THROTTLE_MS) {
      await prisma.session
        .update({ where: { id: session.id }, data: { lastUsedAt: now } })
        .catch(() => {});
    }
  }

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

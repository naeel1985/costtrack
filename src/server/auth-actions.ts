"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createWrappedDek,
  generateToken,
  hashPassword,
  hashToken,
  unwrapDek,
  verifyPassword,
} from "@/lib/crypto";
import { loginSchema, registerSchema, resendSchema } from "@/lib/auth-schemas";
import {
  createSession,
  destroySession,
  isLockedOut,
  recordLoginAttempt,
} from "@/server/auth";
import { sendVerificationEmail } from "@/server/mailer";
import { encStr } from "@/server/crypto-map";

export type AuthResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(error: unknown): AuthResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
  }
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong" };
}

const DEFAULT_CATEGORIES: { name: string; kind: "income" | "expense"; icon: string; color: string }[] = [
  { name: "Salary", kind: "income", icon: "Wallet", color: "#16a34a" },
  { name: "Freelance", kind: "income", icon: "Laptop", color: "#0d9488" },
  { name: "Gifts", kind: "income", icon: "Gift", color: "#7c3aed" },
  { name: "Rent", kind: "expense", icon: "Home", color: "#dc2626" },
  { name: "Groceries", kind: "expense", icon: "ShoppingCart", color: "#ea580c" },
  { name: "Dining", kind: "expense", icon: "Utensils", color: "#d97706" },
  { name: "Transport", kind: "expense", icon: "Car", color: "#ca8a04" },
  { name: "Utilities", kind: "expense", icon: "Zap", color: "#65a30d" },
  { name: "Subscriptions", kind: "expense", icon: "Repeat", color: "#0ea5e9" },
  { name: "Shopping", kind: "expense", icon: "ShoppingBag", color: "#8b5cf6" },
  { name: "Health", kind: "expense", icon: "HeartPulse", color: "#e11d48" },
];

async function issueVerification(userId: string, email: string, fullName: string) {
  const token = generateToken();
  await prisma.emailToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      type: "verify_email",
      expiresAt: new Date(Date.now() + 24 * 3_600_000),
    },
  });
  const base = process.env.APP_URL ?? "http://localhost:3000";
  await sendVerificationEmail(email, fullName, `${base}/verify?token=${token}`);
}

export async function registerUser(input: unknown): Promise<AuthResult> {
  try {
    const data = registerSchema.parse(input);
    const email = data.email.toLowerCase().trim();
    const username = data.username.toLowerCase().trim();

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });
    if (existing) {
      return {
        ok: false,
        error: existing.email === email ? "That email is already registered" : "That username is taken",
      };
    }

    const passwordHash = hashPassword(data.password);
    const { dek, dekWrapped, dekSalt } = createWrappedDek(data.password);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        fullName: data.fullName.trim(),
        phone: data.phone ? data.phone.trim() : null,
        role: "user",
        passwordHash,
        dekWrapped,
        dekSalt,
        settings: { create: {} },
        categories: {
          create: DEFAULT_CATEGORIES.map((c, i) => ({
            nameEnc: encStr(c.name, dek),
            kind: c.kind,
            icon: c.icon,
            color: c.color,
            sortOrder: i,
          })),
        },
      },
    });

    await issueVerification(user.id, email, user.fullName);
    return { ok: true, message: "Account created. Check your email to verify and activate it." };
  } catch (e) {
    return fail(e);
  }
}

export async function loginUser(input: unknown): Promise<AuthResult> {
  try {
    const data = loginSchema.parse(input);
    const identifier = data.identifier.toLowerCase().trim();

    if (await isLockedOut(identifier)) {
      await recordLoginAttempt({ identifier, success: false, reason: "locked" });
      return { ok: false, error: "Too many attempts. Try again later." };
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });

    // Uniform failure to avoid leaking which part was wrong.
    const invalid: AuthResult = { ok: false, error: "Invalid username or password" };

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

    await createSession(user.id, dek);
    await recordLoginAttempt({ identifier, userId: user.id, success: true, reason: "ok" });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function verifyEmailToken(token: string): Promise<AuthResult> {
  try {
    const record = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.type !== "verify_email") return { ok: false, error: "Invalid verification link." };
    if (record.consumedAt) return { ok: true, message: "Email already verified. You can sign in." };
    if (record.expiresAt < new Date()) return { ok: false, error: "This link has expired. Request a new one." };

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
      prisma.emailToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    ]);
    return { ok: true, message: "Email verified. You can now sign in." };
  } catch (e) {
    return fail(e);
  }
}

export async function resendVerification(input: unknown): Promise<AuthResult> {
  try {
    const { email } = resendSchema.parse(input);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    // Always report success to avoid revealing whether the email exists.
    if (user && !user.emailVerified) {
      await issueVerification(user.id, user.email, user.fullName);
    }
    return { ok: true, message: "If that email needs verification, a new link is on its way." };
  } catch (e) {
    return fail(e);
  }
}

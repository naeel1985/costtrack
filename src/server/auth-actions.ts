"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createWrappedDek,
  generateNumericCode,
  generateRecoveryCode,
  generateToken,
  hashPassword,
  hashToken,
  rewrapDek,
  unwrapDekWithRecovery,
  wrapDekWithRecovery,
} from "@/lib/crypto";
import {
  forgotPasswordSchema,
  registerSchema,
  resendSchema,
  resetPasswordSchema,
} from "@/lib/auth-schemas";
import { createSession, destroySession, getAuth } from "@/server/auth";
import { authenticateCredentials } from "@/server/login-core";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/server/mailer";
import { encStr } from "@/server/crypto-map";

export type AuthResult =
  | { ok: true; message?: string; recoveryCode?: string }
  | { ok: false; error: string };

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

    // Second wrapping of the same DEK under a one-time recovery code — the only
    // way a password reset can return the user's data (we never hold the key).
    const recoveryCode = generateRecoveryCode();
    const recovery = wrapDekWithRecovery(dek, recoveryCode);

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
        dekRecoveryWrapped: recovery.dekWrapped,
        dekRecoverySalt: recovery.dekSalt,
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
    return {
      ok: true,
      message: "Account created. Check your email to verify and activate it.",
      recoveryCode,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function loginUser(input: unknown): Promise<AuthResult> {
  try {
    // Credential check (lockout, password, DEK unwrap) is shared with the mobile
    // API via authenticateCredentials; the web path differs only in that it hands
    // the session back as a cookie rather than a bearer token.
    const outcome = await authenticateCredentials(input);
    if (!outcome.ok) return { ok: false, error: outcome.error };
    await createSession(outcome.userId, outcome.dek);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// ── Password reset ───────────────────────────────────────────────────────────

const RESET_TTL_MINUTES = 15;

/**
 * Step 1: email a one-time code. Always reports success — telling a stranger
 * whether an address is registered would leak our user list.
 */
export async function requestPasswordReset(input: unknown): Promise<AuthResult> {
  const generic = {
    ok: true as const,
    message: "If that email is registered, a reset code is on its way.",
  };
  try {
    const { email } = forgotPasswordSchema.parse(input);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.isActive) return generic;

    const code = generateNumericCode(6);
    // Invalidate any earlier codes so only the newest works.
    await prisma.emailToken.deleteMany({ where: { userId: user.id, type: "reset_password" } });
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(code),
        type: "reset_password",
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      },
    });
    await sendPasswordResetEmail(user.email, user.fullName, code);
    return generic;
  } catch (e) {
    // A malformed email still gets the generic answer; real faults surface.
    if (e instanceof z.ZodError) return fail(e);
    return generic;
  }
}

/**
 * Step 2: verify the emailed code, recover the DEK with the recovery code, and
 * re-wrap it under the new password. Without the recovery code the DEK is
 * unrecoverable by design — nobody, including us, can decrypt the user's data.
 */
export async function resetPassword(input: unknown): Promise<AuthResult> {
  try {
    const data = resetPasswordSchema.parse(input);
    const email = data.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    // Keep failures indistinguishable so this can't be used to probe accounts.
    const badCode = { ok: false as const, error: "That code is invalid or has expired." };
    if (!user) return badCode;

    const record = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(data.code) } });
    if (!record || record.userId !== user.id || record.type !== "reset_password") return badCode;
    if (record.consumedAt) return badCode;
    if (record.expiresAt < new Date()) return badCode;

    if (!user.dekRecoveryWrapped || !user.dekRecoverySalt) {
      return {
        ok: false,
        error:
          "This account has no recovery code, so its encrypted data can't be unlocked without the old password. Sign in and generate one from your profile.",
      };
    }

    let dek: Buffer;
    try {
      dek = unwrapDekWithRecovery(data.recoveryCode, {
        dekWrapped: user.dekRecoveryWrapped,
        dekSalt: user.dekRecoverySalt,
      });
    } catch {
      return { ok: false, error: "That recovery code doesn't match this account." };
    }

    // Re-wrap the SAME DEK under the new password, so all existing data stays
    // readable, and mint a fresh recovery wrapping bound to the new secret.
    const next = rewrapDek(dek, data.password);
    const newRecoveryCode = generateRecoveryCode();
    const nextRecovery = wrapDekWithRecovery(dek, newRecoveryCode);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(data.password),
          dekWrapped: next.dekWrapped,
          dekSalt: next.dekSalt,
          dekRecoveryWrapped: nextRecovery.dekWrapped,
          dekRecoverySalt: nextRecovery.dekSalt,
        },
      }),
      prisma.emailToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
      // A password change invalidates every existing session.
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    return {
      ok: true,
      message: "Password updated. Your data is intact — sign in with your new password.",
      recoveryCode: newRecoveryCode,
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Mint a recovery code for a signed-in user (needed by accounts created before
 * recovery existed). Uses the DEK from the live session, so no password prompt.
 */
export async function createRecoveryCode(): Promise<AuthResult> {
  try {
    const auth = await getAuth();
    if (!auth) return { ok: false, error: "You're signed out. Please sign in again." };
    const recoveryCode = generateRecoveryCode();
    const bundle = wrapDekWithRecovery(auth.dek, recoveryCode);
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { dekRecoveryWrapped: bundle.dekWrapped, dekRecoverySalt: bundle.dekSalt },
    });
    return { ok: true, message: "Recovery code created", recoveryCode };
  } catch (e) {
    return fail(e);
  }
}

const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Name can't be empty")
    .max(80, "Name is too long (80 characters max)")
    // At least one letter, so a name can't be only digits/punctuation — the
    // letter avatar needs something real to work with.
    .refine((v) => /\p{L}/u.test(v), "Name must contain at least one letter"),
});

/**
 * Update the signed-in user's display name. `fullName` is deliberately
 * plaintext (identity is admin-visible by design), so there's no DEK work here.
 */
export async function updateProfile(input: unknown): Promise<AuthResult> {
  try {
    const auth = await getAuth();
    if (!auth) return { ok: false, error: "You're signed out. Please sign in again." };
    const { fullName } = profileSchema.parse(input);
    // Collapse runs of whitespace so "Naeel   Zuriek" stores cleanly.
    const clean = fullName.replace(/\s+/g, " ");
    await prisma.user.update({ where: { id: auth.user.id }, data: { fullName: clean } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Name updated" };
  } catch (e) {
    return fail(e);
  }
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

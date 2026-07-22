/* eslint-disable no-console */
// Send a real verification email (via the app's mailer) to a registered user.
// Usage: tsx scripts/send-verification.ts <email>
import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";
import { generateToken, hashToken } from "../src/lib/crypto";

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] ?? "").toLowerCase().trim();

  // 1) Prove the SMTP credentials work before anything else.
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.verify();
  console.log("✅ SMTP connection + auth OK (" + process.env.SMTP_USER + ")");

  // 2) Issue a fresh token and send the real email.
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`No user with email ${email}. Skipping send.`);
    return;
  }
  const token = generateToken();
  await prisma.emailToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), type: "verify_email", expiresAt: new Date(Date.now() + 24 * 3_600_000) },
  });
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const url = `${base}/verify?token=${token}`;
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: user.email,
    subject: "Verify your Cashflow email",
    text: `Hi ${user.fullName},\n\nConfirm your email to activate your Cashflow account:\n${url}\n\nThis link expires in 24 hours.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto"><h2>Welcome to Cashflow</h2><p>Hi ${user.fullName}, confirm your email to activate your account.</p><p><a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Verify email</a></p><p style="color:#64748b;font-size:13px">Or paste this link:<br>${url}</p></div>`,
  });
  console.log(`✅ Verification email sent to ${user.email} (messageId ${info.messageId})`);
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

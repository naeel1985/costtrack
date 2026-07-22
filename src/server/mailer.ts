import "server-only";
import { promises as fs } from "fs";
import path from "path";
import nodemailer from "nodemailer";

function transport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER || process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

async function deliver(to: string, subject: string, html: string, text: string) {
  const from = process.env.MAIL_FROM ?? "Cashflow <no-reply@cashflow.local>";
  const t = transport();
  if (t) {
    await t.sendMail({ from, to, subject, html, text });
    return;
  }
  // No SMTP configured — write to a local dev outbox and log so the flow is
  // fully testable without a mail server.
  const dir = path.join(process.cwd(), "dev-outbox");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${to.replace(/[^a-z0-9]/gi, "_")}.txt`);
  await fs.writeFile(file, `To: ${to}\nSubject: ${subject}\n\n${text}\n`, "utf8");
  // eslint-disable-next-line no-console
  console.log(`\n📧 [dev-outbox] ${subject} → ${to}\n${text}\n`);
}

export async function sendVerificationEmail(to: string, fullName: string, verifyUrl: string) {
  const subject = "Verify your Cashflow email";
  const text = `Hi ${fullName},\n\nConfirm your email to activate your Cashflow account:\n${verifyUrl}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
      <h2>Welcome to Cashflow</h2>
      <p>Hi ${escapeHtml(fullName)}, confirm your email to activate your account.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Verify email</a></p>
      <p style="color:#64748b;font-size:13px">Or paste this link: <br>${verifyUrl}</p>
      <p style="color:#64748b;font-size:13px">This link expires in 24 hours.</p>
    </div>`;
  await deliver(to, subject, html, text);
}

export async function sendPasswordResetEmail(to: string, fullName: string, code: string) {
  const subject = `${code} is your Cashflow reset code`;
  const text = `Hi ${fullName},

Your Cashflow password reset code is: ${code}

Enter it in the app to continue. It expires in 15 minutes and can only be used once.

You'll also need your recovery code — the one you saved when you set up your account. Without it your encrypted data can't be unlocked, because we don't hold the key.

If you didn't request this, ignore this email; your password is unchanged.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
      <h2>Reset your password</h2>
      <p>Hi ${escapeHtml(fullName)}, use this code to continue:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:6px;background:#f1f5f9;padding:14px 18px;border-radius:8px;text-align:center">${escapeHtml(code)}</p>
      <p style="color:#64748b;font-size:13px">Expires in 15 minutes and can only be used once.</p>
      <p style="color:#64748b;font-size:13px">You'll also need your <strong>recovery code</strong> — the one you saved when setting up your account. Without it your encrypted data can't be unlocked, because we don't hold the key.</p>
      <p style="color:#64748b;font-size:13px">Didn't request this? Ignore this email — your password is unchanged.</p>
    </div>`;
  await deliver(to, subject, html, text);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

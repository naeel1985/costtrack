"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { RecoveryCodePanel } from "@/components/auth/recovery-code-panel";
import { requestPasswordReset, resetPassword } from "@/server/auth-actions";

type Step = "email" | "verify" | "done";

export function ResetPasswordForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [step, setStep] = React.useState<Step>("email");

  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [recoveryCode, setRecoveryCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [newRecoveryCode, setNewRecoveryCode] = React.useState("");

  function sendCode(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await requestPasswordReset({ email });
      if (res.ok) {
        toast.success(res.message ?? "Check your email");
        setStep("verify");
      } else {
        toast.error(res.error);
      }
    });
  }

  function submitReset(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await resetPassword({ email, code, recoveryCode, password, confirmPassword });
      if (res.ok) {
        // A fresh recovery code is issued, so the old one can't be reused.
        setNewRecoveryCode(res.recoveryCode ?? "");
        setStep("done");
      } else {
        toast.error(res.error);
      }
    });
  }

  if (step === "done") {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold">Password updated</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your data is intact. Here&apos;s your new recovery code — the old one no longer works.
          </p>
        </div>
        {newRecoveryCode && (
          <RecoveryCodePanel
            code={newRecoveryCode}
            acknowledgeLabel="Continue to sign in"
            onAcknowledge={() => router.push("/login")}
          />
        )}
        <Button variant="ghost" className="w-full" onClick={() => router.push("/login")}>
          Skip to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === "email"
            ? "Enter your registered email and we'll send you a code."
            : "Enter the code we emailed, plus your recovery code."}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-4">
          <Field label="Registered email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending || !email}>
            {pending ? "Sending…" : "Send reset code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitReset} className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              If <span className="font-medium text-foreground">{email}</span> is registered, a
              6-digit code is on its way. It expires in 15 minutes.
            </span>
          </div>

          <Field label="Code from email" htmlFor="code">
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              className="tabular text-lg tracking-[0.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
            />
          </Field>

          <Field
            label="Recovery code"
            htmlFor="recoveryCode"
            hint="from sign-up"
          >
            <Input
              id="recoveryCode"
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              className="font-mono tracking-wider"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              required
            />
          </Field>
          <p className="-mt-2 text-xs text-muted-foreground">
            Your data is encrypted with a key we don&apos;t hold, so the recovery code is the only
            way to unlock it with a new password.
          </p>

          <Field label="New password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirmPassword">
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </Field>

          <Button
            type="submit"
            className="w-full"
            disabled={pending || code.length !== 6 || !recoveryCode || !password}
          >
            {pending ? "Resetting…" : "Set new password"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => setStep("email")}
            disabled={pending}
          >
            Use a different email
          </Button>
        </form>
      )}

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
      </Link>
    </div>
  );
}

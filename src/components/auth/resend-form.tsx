"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/forms/field";
import { resendVerification } from "@/server/auth-actions";

export function ResendForm() {
  const [pending, startTransition] = React.useTransition();
  const [sent, setSent] = React.useState(false);
  const { register, handleSubmit } = useForm<{ email: string }>();

  function submit(values: { email: string }) {
    startTransition(async () => {
      const res = await resendVerification(values);
      if (res.ok) {
        setSent(true);
        toast.success(res.message ?? "Sent");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="h-5 w-5" /> Verify your email
        </CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send a fresh verification link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>If that email needs verifying, a new link is on its way. Check your inbox.</p>
            <Button asChild className="w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(submit)} className="space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="email" autoFocus {...register("email", { required: true })} />
            </Field>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Send link"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

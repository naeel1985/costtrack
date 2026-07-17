"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/forms/field";
import { loginUser } from "@/server/auth-actions";

export function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [needsVerify, setNeedsVerify] = React.useState(false);
  const { register, handleSubmit } = useForm<{ identifier: string; password: string }>();

  function submit(values: { identifier: string; password: string }) {
    startTransition(async () => {
      const res = await loginUser(values);
      if (res.ok) {
        toast.success("Welcome back");
        router.push("/dashboard");
        router.refresh();
      } else {
        setNeedsVerify(/verify your email/i.test(res.error));
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back — enter your details to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <Field label="Username or email">
            <Input autoFocus autoComplete="username" {...register("identifier", { required: true })} />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" {...register("password", { required: true })} />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          {needsVerify && (
            <p className="text-center text-xs text-muted-foreground">
              Need a new link?{" "}
              <Link href="/verify-email" className="font-medium text-primary hover:underline">
                Resend verification
              </Link>
            </p>
          )}
          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

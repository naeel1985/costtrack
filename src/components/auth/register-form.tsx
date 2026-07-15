"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/forms/field";
import { registerUser } from "@/server/auth-actions";
import type { RegisterInput } from "@/lib/auth-schemas";

export function RegisterForm() {
  const [pending, startTransition] = React.useTransition();
  const [done, setDone] = React.useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<RegisterInput>();

  function submit(values: RegisterInput) {
    startTransition(async () => {
      const res = await registerUser(values);
      if (res.ok) {
        setDone(res.message ?? "Account created. Check your email to verify it.");
        toast.success("Account created");
      } else {
        toast.error(res.error);
      }
    });
  }

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-positive" />
          <h2 className="text-lg font-semibold">Almost there</h2>
          <p className="text-sm text-muted-foreground">{done}</p>
          <Button asChild className="mt-2 w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>It only takes a minute. Your data is encrypted to you.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(submit)} className="space-y-3.5">
          <Field label="Full name" error={formState.errors.fullName?.message}>
            <Input autoComplete="name" {...register("fullName", { required: "Required" })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username" error={formState.errors.username?.message}>
              <Input autoComplete="username" {...register("username", { required: "Required" })} />
            </Field>
            <Field label="Phone" hint="optional" error={formState.errors.phone?.message}>
              <Input autoComplete="tel" placeholder="+971…" {...register("phone")} />
            </Field>
          </div>
          <Field label="Email" error={formState.errors.email?.message}>
            <Input type="email" autoComplete="email" {...register("email", { required: "Required" })} />
          </Field>
          <Field label="Password" hint="10+ chars, mixed" error={formState.errors.password?.message}>
            <Input type="password" autoComplete="new-password" {...register("password", { required: "Required" })} />
          </Field>
          <Field label="Confirm password" error={formState.errors.confirmPassword?.message}>
            <Input type="password" autoComplete="new-password" {...register("confirmPassword", { required: "Required" })} />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create account"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

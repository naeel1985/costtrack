import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const auth = await getAuth();
  if (auth) redirect("/dashboard");
  return <ResetPasswordForm />;
}

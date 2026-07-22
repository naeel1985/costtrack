import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const auth = await getAuth();
  if (auth) redirect("/dashboard");
  return <LoginForm />;
}

import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verifyEmailToken } from "@/server/auth-actions";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await verifyEmailToken(token) : { ok: false as const, error: "Missing verification token." };
  const ok = result.ok;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        {ok ? (
          <CheckCircle2 className="h-10 w-10 text-positive" />
        ) : (
          <XCircle className="h-10 w-10 text-negative" />
        )}
        <h2 className="text-lg font-semibold">{ok ? "Email verified" : "Verification failed"}</h2>
        <p className="text-sm text-muted-foreground">
          {ok ? (result.message ?? "Your email is verified.") : result.error}
        </p>
        <div className="mt-2 flex w-full flex-col gap-2">
          <Button asChild className="w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
          {!ok && (
            <Button asChild variant="outline" className="w-full">
              <Link href="/verify-email">Request a new link</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

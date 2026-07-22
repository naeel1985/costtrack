import { Wallet } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ModeToggle />
      </div>
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Wallet className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-lg font-semibold">Cashflow</div>
          <div className="text-xs text-muted-foreground">Forward finance, kept private</div>
        </div>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">
        Your financial data is encrypted with a key derived from your password. Nobody — not even an
        administrator — can read it without you.
      </p>
    </div>
  );
}

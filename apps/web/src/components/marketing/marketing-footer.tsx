import Link from "next/link";
import { Wallet } from "lucide-react";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wallet className="h-4 w-4" />
              </span>
              <span className="font-semibold">Cashflow</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Forward-looking personal finance. See what your balance will be — before it happens.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
            <div className="space-y-2">
              <div className="font-medium">Product</div>
              <Link href="/#features" className="block text-muted-foreground hover:text-foreground">
                Features
              </Link>
              <Link href="/packages" className="block text-muted-foreground hover:text-foreground">
                Pricing
              </Link>
              <Link href="/#security" className="block text-muted-foreground hover:text-foreground">
                Security
              </Link>
            </div>
            <div className="space-y-2">
              <div className="font-medium">Account</div>
              <Link href="/login" className="block text-muted-foreground hover:text-foreground">
                Log in
              </Link>
              <Link href="/register" className="block text-muted-foreground hover:text-foreground">
                Create account
              </Link>
            </div>
            <div className="space-y-2">
              <div className="font-medium">Company</div>
              <span className="block text-muted-foreground">Made in the UAE</span>
              <span className="block text-muted-foreground">Prices in AED</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} Cashflow. All rights reserved.</span>
          <span>End-to-end encrypted · Your data stays yours.</span>
        </div>
      </div>
    </footer>
  );
}

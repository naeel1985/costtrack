import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppInteractive } from "@/components/app-interactive";
import { AppShell } from "@/components/app-shell";
import { getAccountsWithBalances, getCategories } from "@/server/queries";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cashflow — Forward Finance",
  description:
    "A forward-looking personal cash-flow tracker: income, costs, post-dated cheques and balance projections.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [accounts, categories] = await Promise.all([
    getAccountsWithBalances(),
    getCategories(),
  ]);
  const accountsLite = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    color: a.color,
  }));
  const categoriesLite = categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
    color: c.color,
  }));

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-dvh">
        <Providers>
          <AppInteractive accounts={accountsLite} categories={categoriesLite}>
            <AppShell>{children}</AppShell>
          </AppInteractive>
        </Providers>
      </body>
    </html>
  );
}

import { requireUser } from "@/server/auth";
import { getAccountsWithBalances, getCategories } from "@/server/queries";
import { AppInteractive } from "@/components/app-interactive";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const [accounts, categories] = await Promise.all([getAccountsWithBalances(), getCategories()]);

  const accountsLite = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    color: a.color,
    isSystem: a.isSystem,
  }));
  const categoriesLite = categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
    color: c.color,
  }));

  return (
    <AppInteractive accounts={accountsLite} categories={categoriesLite}>
      <AppShell
        user={{ fullName: user.fullName, username: user.username, email: user.email, role: user.role }}
      >
        {children}
      </AppShell>
    </AppInteractive>
  );
}

import { getAuth } from "@/server/auth";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

// The public front door reads the session cookie to tailor the header, so it
// renders per-request rather than at build time.
export const dynamic = "force-dynamic";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingHeader authed={!!auth} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

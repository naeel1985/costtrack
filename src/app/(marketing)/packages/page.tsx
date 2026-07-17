import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Pricing } from "@/components/marketing/pricing";

export const metadata: Metadata = {
  title: "Pricing — Cashflow",
  description:
    "Simple pricing in AED. Start free, then unlock the full projection engine, post-dated cheque tracking and multi-currency with Pro or Premium.",
};

const FAQ = [
  {
    q: "Is the Free plan really free?",
    a: "Yes. Starter is free forever and needs no card. It's enough to put your money on one timeline — upgrade only when you want the full projection engine and cheque tracking.",
  },
  {
    q: "How does annual billing work?",
    a: "Choose Annual and you pay for ten months instead of twelve — two months free. You're billed once a year and can switch back to monthly at any renewal.",
  },
  {
    q: "Can I change or cancel my plan?",
    a: "Anytime. Upgrades take effect immediately; if you cancel, you keep your paid features until the end of the period you've already paid for.",
  },
  {
    q: "Why are prices in AED?",
    a: "Cashflow is built for the UAE — dirhams, post-dated cheques and local pay cycles come first. You can still track balances in other currencies inside the app.",
  },
  {
    q: "Who can see my financial data?",
    a: "Only you. Every amount and note is encrypted with a key derived from your password. Even an administrator can see just your sign-in activity and verified contact details — never your money.",
  },
];

export default function PackagesPage() {
  return (
    <>
      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 pb-4 pt-16 text-center sm:px-6 lg:pt-24">
          <span className="text-sm font-semibold text-primary">Pricing</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Plans that grow with your money
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Start free and stay as long as you like. Move up when you want the full forward-looking
            engine. Everything priced in AED.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <Pricing />
        </div>
      </section>

      {/* Reassurance strip */}
      <section className="border-y bg-card/30">
        <div className="mx-auto flex max-w-4xl items-center justify-center gap-3 px-4 py-6 text-center text-sm text-muted-foreground sm:px-6">
          <ShieldCheck className="h-5 w-5 shrink-0 text-positive" />
          <span>
            Every paid plan includes the same end-to-end encryption. Your data is unreadable to
            anyone but you — regardless of what you pay.
          </span>
        </div>
      </section>

      {/* FAQ */}
      <section>
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Questions, answered
          </h2>
          <dl className="mt-10 divide-y">
            {FAQ.map((item) => (
              <div key={item.q} className="py-5">
                <dt className="font-medium">{item.q}</dt>
                <dd className="mt-2 text-sm text-muted-foreground">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}

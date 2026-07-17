"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Period = "monthly" | "annual";

interface Plan {
  name: string;
  tagline: string;
  /** AED per month, billed monthly. Annual bills 10× (two months free). */
  monthly: number;
  cta: string;
  href: string;
  highlight?: boolean;
  features: string[];
  footnote?: string;
}

// Prices set with the owner: Free · Pro AED 29/mo · Premium AED 99/mo.
const PLANS: Plan[] = [
  {
    name: "Starter",
    tagline: "For getting your money on one timeline.",
    monthly: 0,
    cta: "Start free",
    href: "/register",
    features: [
      "1 account",
      "Up to 100 transactions / month",
      "30-day balance projection",
      "AED only",
      "Basic reports",
      "Email support",
    ],
    footnote: "Free forever. No card required.",
  },
  {
    name: "Pro",
    tagline: "The full forward-looking engine for individuals.",
    monthly: 29,
    cta: "Start Pro",
    href: "/register",
    highlight: true,
    features: [
      "Unlimited accounts & transactions",
      "90-day projection engine",
      "Post-dated cheque (PDC) tracking",
      "Recurring rules & scheduling",
      "Provisions & safety buffers",
      "Multi-currency with your own rates",
      "Full reports & CSV export",
      "Priority email support",
    ],
  },
  {
    name: "Premium",
    tagline: "For families and power users who want it all.",
    monthly: 99,
    cta: "Start Premium",
    href: "/register",
    features: [
      "Everything in Pro",
      "12-month projection horizon",
      "Smart insights & shortfall alerts",
      "Family / multi-profile (up to 5)",
      "Unlimited history & data export",
      "API access",
      "Priority support",
    ],
  },
];

function priceParts(plan: Plan, period: Period) {
  if (plan.monthly === 0) {
    return { big: "AED 0", unit: "/mo", sub: "forever", badge: null as string | null };
  }
  if (period === "annual") {
    const yearly = plan.monthly * 10; // two months free
    const perMonth = Math.round(yearly / 12);
    return {
      big: `AED ${perMonth}`,
      unit: "/mo",
      sub: `AED ${yearly} billed yearly`,
      badge: `Save AED ${plan.monthly * 2}`,
    };
  }
  return { big: `AED ${plan.monthly}`, unit: "/mo", sub: "billed monthly", badge: null };
}

export function Pricing() {
  const [period, setPeriod] = React.useState<Period>("monthly");

  return (
    <div>
      {/* Billing toggle */}
      <div className="flex items-center justify-center">
        <div
          role="tablist"
          aria-label="Billing period"
          className="inline-flex items-center rounded-full border bg-card p-1"
        >
          {(["monthly", "annual"] as const).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={cn(
                "relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                period === p
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p === "monthly" ? "Monthly" : "Annual"}
              {p === "annual" && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    period === "annual"
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-positive/15 text-positive",
                  )}
                >
                  2 months free
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="mt-10 grid items-start gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const price = priceParts(plan, period);
          return (
            <div
              key={plan.name}
              className={cn(
                "relative flex h-full flex-col rounded-3xl border bg-card p-8",
                plan.highlight && "border-primary shadow-lg lg:-my-2 lg:scale-[1.02]",
              )}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
                  <Sparkles className="h-3.5 w-3.5" /> Most popular
                </span>
              )}

              <div>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.tagline}</p>
              </div>

              <div className="mt-6 flex items-end gap-2">
                <span className="text-4xl font-bold tracking-tight tabular">{price.big}</span>
                <span className="pb-1 text-sm text-muted-foreground">{price.unit}</span>
                {price.badge && (
                  <span className="mb-1.5 rounded-full bg-positive/15 px-2 py-0.5 text-xs font-semibold text-positive">
                    {price.badge}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{price.sub}</div>

              <Button
                asChild
                size="lg"
                variant={plan.highlight ? "default" : "outline"}
                className="mt-6 w-full"
              >
                <Link href={plan.href}>{plan.cta}</Link>
              </Button>

              <ul className="mt-8 space-y-3 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {plan.footnote && (
                <p className="mt-6 text-xs text-muted-foreground">{plan.footnote}</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        All prices in AED and exclude any applicable VAT. Cancel anytime — you keep access until the
        end of your billing period.
      </p>
    </div>
  );
}

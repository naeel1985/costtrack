import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  TrendingUp,
  ScrollText,
  Repeat,
  Coins,
  BarChart3,
  PiggyBank,
  ShieldCheck,
  LockKeyhole,
  EyeOff,
  Sparkles,
  LineChart,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroArt, InsightArt } from "@/components/marketing/art";

export const metadata: Metadata = {
  title: "Cashflow — See your money before it moves",
  description:
    "A forward-looking personal finance tracker for the UAE: project your balance, track post-dated cheques, plan recurring income and costs — all end-to-end encrypted. Free to start, in AED.",
};

const FEATURES = [
  {
    icon: LineChart,
    title: "Balance projection",
    body: "A 90-day forward view of every dirham. Recurring income, scheduled costs and cheques folded into one honest line — so you see shortfalls weeks before they arrive.",
  },
  {
    icon: ScrollText,
    title: "Post-dated cheques",
    body: "Track issued and received PDCs with due dates, clearing and bounce warnings. The UAE runs on cheques — Cashflow was built for them.",
  },
  {
    icon: Repeat,
    title: "Recurring rules",
    body: "Salary, rent, subscriptions, tuition. Set the cadence once and let every future occurrence flow into your projection automatically.",
  },
  {
    icon: Coins,
    title: "Multi-currency",
    body: "Hold AED, USD, KWD and more, each with correct decimals and your own exchange rates. Everything rolls up to one base currency.",
  },
  {
    icon: PiggyBank,
    title: "Provisions & buffers",
    body: "Earmark money for what's coming — deposits, annual fees, that flight home — and keep a safety buffer per account so you never dip into it by accident.",
  },
  {
    icon: BarChart3,
    title: "Reports that mean something",
    body: "Savings rate, cash runway, income vs. cost trends. Clear numbers you can act on, not a wall of charts.",
  },
];

const WHY = [
  {
    stat: "9 in 10",
    label: "money problems are timing problems",
    body: "It's rarely that there isn't enough — it's that the cheque clears before the salary lands. Seeing the timeline turns a crisis into a calendar entry.",
  },
  {
    stat: "90 days",
    label: "of foresight, always on",
    body: "People who look ahead spend with intent. A forward view is the difference between reacting to your balance and directing it.",
  },
  {
    stat: "5 min",
    label: "a week to stay in control",
    body: "Log what's real, let rules handle the rest. Small, steady attention beats a heroic year-end reckoning every time.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-32 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--primary)_0%,transparent_70%)] opacity-[0.10]"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Forward finance, kept private
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              See your money{" "}
              <span className="bg-gradient-to-r from-primary to-positive bg-clip-text text-transparent">
                before it moves
              </span>
              .
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Cashflow projects your balance 90 days out — income, costs, recurring bills and
              post-dated cheques on a single timeline. Know the shortfall before it happens, not
              after.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  Start free <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/packages">See pricing</Link>
              </Button>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-positive" /> Free plan, no card
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-positive" /> End-to-end encrypted
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-positive" /> Built for AED & cheques
              </li>
            </ul>
          </div>

          <div className="relative">
            <HeroArt className="w-full drop-shadow-xl" />
          </div>
        </div>
      </section>

      {/* ── Why tracking matters ─────────────────────────────────────── */}
      <section className="border-y bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex items-end justify-between gap-6">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Tracking isn&apos;t about restriction. It&apos;s about timing.
              </h2>
              <p className="mt-3 text-muted-foreground">
                Most money stress comes from not knowing what&apos;s already committed. When income
                and costs live on the same forward timeline, decisions get calmer — and cheaper.
              </p>
            </div>
            <InsightArt className="hidden h-24 w-auto shrink-0 sm:block" />
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {WHY.map((w) => (
              <div key={w.label} className="rounded-2xl border bg-card p-6">
                <div className="text-3xl font-bold tracking-tight text-primary">{w.stat}</div>
                <div className="mt-1 text-sm font-medium">{w.label}</div>
                <p className="mt-3 text-sm text-muted-foreground">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-sm font-semibold text-primary">Everything you need</span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              One place for income, costs and what&apos;s coming
            </h2>
            <p className="mt-3 text-muted-foreground">
              Purpose-built for how money actually moves — recurring, post-dated, multi-currency —
              not a spreadsheet with a nicer coat of paint.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border bg-card p-6 transition-colors hover:border-primary/40"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Security ─────────────────────────────────────────────────── */}
      <section id="security" className="scroll-mt-20 border-y bg-card/30">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-positive" />
              Private by design
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
              Your numbers are yours. Encrypted with a key only you hold.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every amount, note and name is encrypted with a key derived from your password. Not
              another user, not an administrator, not someone with a copy of the database can read
              your finances without you.
            </p>
            <ul className="mt-6 space-y-4">
              <li className="flex gap-3">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm">
                  <span className="font-medium">Per-user encryption.</span>{" "}
                  <span className="text-muted-foreground">
                    AES-256-GCM on every financial field, unlocked only by your password.
                  </span>
                </span>
              </li>
              <li className="flex gap-3">
                <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm">
                  <span className="font-medium">Admins can&apos;t see your data.</span>{" "}
                  <span className="text-muted-foreground">
                    They see sign-in activity and verified contact details — never your money.
                  </span>
                </span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm">
                  <span className="font-medium">Verified email &amp; sign-in protection.</span>{" "}
                  <span className="text-muted-foreground">
                    Email verification and login lockout guard the door.
                  </span>
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border bg-card p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <LockKeyhole className="h-7 w-7" />
            </div>
            <p className="mt-6 text-center font-mono text-xs leading-relaxed text-muted-foreground">
              amount → <span className="text-foreground">v1:9fA2…c7Q=</span>
              <br />
              note → <span className="text-foreground">v1:Kd0p…3Lx=</span>
              <br />
              payee → <span className="text-foreground">v1:ト71…9mZ=</span>
            </p>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              This is what your data looks like at rest. Meaningless without your key.
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA band ─────────────────────────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-positive/10 px-6 py-14 text-center sm:px-12">
            <div className="mx-auto max-w-2xl">
              <TrendingUp className="mx-auto h-10 w-10 text-primary" />
              <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
                Start seeing further today
              </h2>
              <p className="mt-3 text-muted-foreground">
                Free forever to get going. Upgrade when you want the full projection engine, cheque
                tracking and multi-currency — all priced in AED.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/register">
                    Create your free account <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/packages">Compare plans</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

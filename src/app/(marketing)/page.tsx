import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
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
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroProjection } from "@/components/marketing/hero-projection";

export const metadata: Metadata = {
  title: "Cashflow — See your money before it moves",
  description:
    "A forward-looking personal finance tracker for the UAE: project your balance, track post-dated cheques, plan recurring income and costs — all end-to-end encrypted. Free to start, in AED.",
};

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
        {/* Aurora wash + hairline grid: depth without a background image. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="animate-aurora absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--primary),transparent)] opacity-[0.13] blur-2xl" />
          <div className="animate-aurora absolute -top-24 right-[8%] h-[380px] w-[520px] rounded-full bg-[radial-gradient(closest-side,var(--positive),transparent)] opacity-[0.10] blur-2xl [animation-delay:-9s]" />
          <div className="absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] opacity-[0.35] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
        </div>

        <div className="mx-auto max-w-6xl px-4 pt-16 pb-10 text-center sm:px-6 lg:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Forward finance, kept private
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            See your money{" "}
            <span className="bg-gradient-to-r from-primary via-primary to-positive bg-clip-text text-transparent">
              before it moves
            </span>
            .
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
            Your balance today tells you nothing about the 14th. Cashflow puts income, costs,
            recurring bills and post-dated cheques on one forward timeline — so the shortfall is
            something you plan around, not something you discover.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/packages">See pricing</Link>
            </Button>
          </div>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-positive" /> Free plan, no card
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-positive" /> End-to-end encrypted
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-positive" /> Built for AED &amp; cheques
            </li>
          </ul>
        </div>

        {/* The product's whole argument, drawn. */}
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:pb-24">
          <div className="relative rounded-3xl border bg-card/70 p-4 shadow-xl backdrop-blur sm:p-8">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="h-4 w-4 text-primary" />
                Projected balance · next 90 days
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-negative/30 bg-negative/10 px-2.5 py-1 text-xs font-medium text-negative">
                <AlertTriangle className="h-3.5 w-3.5" />
                Shortfall on day 14 — 9 days before payday
              </span>
            </div>
            <HeroProjection />
          </div>
        </div>
      </section>

      {/* ── Why timing ───────────────────────────────────────────────── */}
      <section className="border-y bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Tracking isn&apos;t about restriction. It&apos;s about timing.
            </h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              Most money stress comes from not knowing what&apos;s already committed. When income and
              costs live on the same forward timeline, decisions get calmer — and cheaper.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {WHY.map((w) => (
              <div key={w.label} className="spotlight rounded-2xl border bg-card p-6">
                <div className="bg-gradient-to-br from-primary to-positive bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                  {w.stat}
                </div>
                <div className="mt-1 text-sm font-medium">{w.label}</div>
                <p className="mt-3 text-sm text-muted-foreground">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features, as a bento ─────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-sm font-semibold text-primary">Everything you need</span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              One place for income, costs and what&apos;s coming
            </h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              Purpose-built for how money actually moves — recurring, post-dated, multi-currency —
              not a spreadsheet with a nicer coat of paint.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Lead cell: wide, with its own miniature of the idea. */}
            <article className="spotlight group relative overflow-hidden rounded-2xl border bg-card p-6 sm:col-span-2 sm:row-span-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LineChart className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Balance projection</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                A 90-day forward view of every dirham. Recurring income, scheduled costs and cheques
                folded into one honest line — so you see shortfalls weeks before they arrive.
              </p>
              <div className="mt-6 rounded-xl border bg-background/60 p-4">
                <MiniRunway />
              </div>
            </article>

            <BentoCard
              icon={<ScrollText className="h-5 w-5" />}
              title="Post-dated cheques"
              body="Track issued and received PDCs with due dates, clearing and bounce warnings. The UAE runs on cheques — Cashflow was built for them."
            />
            <BentoCard
              icon={<Repeat className="h-5 w-5" />}
              title="Recurring rules"
              body="Salary, rent, subscriptions, tuition. Set the cadence once and every future occurrence flows into your projection."
            />
            <BentoCard
              icon={<Coins className="h-5 w-5" />}
              title="Multi-currency"
              body="Hold AED, USD, KWD and more, each with correct decimals and your own rates — all rolling up to one base currency."
            />
            <BentoCard
              icon={<PiggyBank className="h-5 w-5" />}
              title="Provisions & buffers"
              body="Earmark money for what's coming, and keep a safety buffer per account so you never dip into it by accident."
            />
            <BentoCard
              icon={<BarChart3 className="h-5 w-5" />}
              title="Reports that mean something"
              body="Savings rate, cash runway, income vs. cost trends. Clear numbers you can act on, not a wall of charts."
            />
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
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Your numbers are yours. Encrypted with a key only you hold.
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              Every amount, note and name is encrypted with a key derived from your password. Not
              another user, not an administrator, not someone with a copy of the database can read
              your finances without you.
            </p>
            <ul className="mt-6 space-y-4">
              {[
                {
                  icon: <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" />,
                  title: "Per-user encryption.",
                  body: "AES-256-GCM on every financial field, unlocked only by your password.",
                },
                {
                  icon: <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-primary" />,
                  title: "Admins can't see your data.",
                  body: "They see sign-in activity and verified contact details — never your money.",
                },
                {
                  icon: <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />,
                  title: "Verified email & sign-in protection.",
                  body: "Email verification and login lockout guard the door.",
                },
              ].map((r) => (
                <li key={r.title} className="flex gap-3">
                  {r.icon}
                  <span className="text-sm">
                    <span className="font-medium">{r.title}</span>{" "}
                    <span className="text-muted-foreground">{r.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative overflow-hidden rounded-2xl border bg-card p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:28px_28px] opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_50%,black,transparent)]"
            />
            <div className="relative">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <LockKeyhole className="h-7 w-7" />
              </div>
              <dl className="mt-6 space-y-2 font-mono text-xs">
                {[
                  ["amount", "v1:9fA2…c7Q="],
                  ["note", "v1:Kd0p…3Lx="],
                  ["payee", "v1:ト71…9mZ="],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-background/60 px-3 py-2"
                  >
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="truncate text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                This is what your data looks like at rest. Meaningless without your key.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA band ─────────────────────────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-positive/10 px-6 py-14 text-center sm:px-12">
            <div
              aria-hidden
              className="animate-aurora pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--primary),transparent)] opacity-[0.12] blur-2xl"
            />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                Start seeing further today
              </h2>
              <p className="mt-3 text-pretty text-muted-foreground">
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

function BentoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <article className="spotlight rounded-2xl border bg-card p-6 transition-colors hover:border-primary/40">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </article>
  );
}

/**
 * A miniature of the runway inside the lead bento cell: four dated obligations
 * on one track. Static by design — it illustrates the shape of the idea.
 */
function MiniRunway() {
  const marks = [
    { at: 8, label: "Rent", tone: "cost" },
    { at: 34, label: "Cheque", tone: "cost" },
    { at: 62, label: "Salary", tone: "income" },
    { at: 88, label: "Card", tone: "cost" },
  ] as const;
  return (
    <div>
      <div className="relative h-1.5 rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 w-[62%] rounded-full bg-gradient-to-r from-primary/70 to-primary" />
        {marks.map((m) => (
          <span
            key={m.label}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
            style={{
              left: `${m.at}%`,
              backgroundColor: m.tone === "income" ? "var(--chart-income)" : "var(--chart-cost)",
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[11px] text-muted-foreground">
        {marks.map((m) => (
          <span key={m.label}>{m.label}</span>
        ))}
      </div>
    </div>
  );
}

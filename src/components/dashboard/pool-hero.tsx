import { format, differenceInCalendarDays } from "date-fns";
import { AlertTriangle, History, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { Money } from "@/components/money";
import { AnimatedMoney } from "@/components/animated-money";
import { PoolHistoryDialog } from "@/components/dashboard/pool-history-dialog";
import { cn } from "@/lib/utils";
import type { FreeSavingsPoint } from "@/lib/cashflow-timeline";
import type { NextSalary, PoolLedger } from "@/server/queries";

/**
 * The dashboard's headline answer to "am I going to be okay?".
 *
 * A hero number is the right form here — one figure IS the message, so it gets
 * type size rather than a chart (see the dataviz form heuristic). The sparkline
 * beside it is supporting context: one series, so it carries no legend; the
 * heading names it, and the only annotated point is the one that matters — the
 * day the pool is projected to cross zero.
 *
 * Presentation only: every value is computed server-side in `loadForwardView`.
 */

const SPARK_W = 520;
const SPARK_H = 132;
const SPARK_PAD = 10;
/** Cap the drawn vertices — 2 years of daily points is far more than the pixels. */
const MAX_VERTICES = 200;

function buildSpark(daily: FreeSavingsPoint[]) {
  if (daily.length < 2) return null;

  const step = Math.max(1, Math.ceil(daily.length / MAX_VERTICES));
  const pts = daily.filter((_, i) => i % step === 0 || i === daily.length - 1);

  const values = pts.map((p) => p.freeSavingsMinor);
  const hi = Math.max(...values, 0);
  const lo = Math.min(...values, 0);
  const span = hi - lo || 1;

  const x = (i: number) => SPARK_PAD + (i / (pts.length - 1)) * (SPARK_W - SPARK_PAD * 2);
  const y = (v: number) => SPARK_PAD + ((hi - v) / span) * (SPARK_H - SPARK_PAD * 2);

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.freeSavingsMinor).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  // Where the series first goes negative, in drawn coordinates.
  const dryIdx = pts.findIndex((p) => p.freeSavingsMinor < 0);
  const dry = dryIdx >= 0 ? { cx: x(dryIdx), cy: y(pts[dryIdx].freeSavingsMinor) } : null;

  return { line, area, zeroY, dry };
}

export function PoolHero({
  poolMinor,
  poolDryDate,
  poolDryAmountMinor,
  nextSalary,
  provisionalPoolAtNextSalaryMinor,
  daily,
  ledger,
  currency,
}: {
  poolMinor: number;
  poolDryDate: Date | null;
  poolDryAmountMinor: number | null;
  nextSalary: NextSalary | null;
  provisionalPoolAtNextSalaryMinor: number | null;
  daily: FreeSavingsPoint[];
  ledger: PoolLedger;
  currency: string;
}) {
  const spark = buildSpark(daily);
  const daysToDry = poolDryDate ? differenceInCalendarDays(poolDryDate, new Date()) : null;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card",
        poolDryDate ? "border-negative/30" : "border-border",
      )}
    >
      {/* A wash that agrees with the verdict — reinforcement, never the message. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-24 -right-16 h-64 w-96 rounded-full opacity-[0.10] blur-2xl",
          poolDryDate
            ? "bg-[radial-gradient(closest-side,var(--negative),transparent)]"
            : "bg-[radial-gradient(closest-side,var(--positive),transparent)]",
        )}
      />

      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
        {/* ── The number ────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Wallet className="h-4 w-4" /> Free-savings pool
          </div>

          {/* The one figure worth animating on this page. Click through for
              every movement that produced it. */}
          <PoolHistoryDialog ledger={ledger} currency={currency}>
            <AnimatedMoney
              minor={poolMinor}
              currency={currency}
              colored
              className="mt-2 text-4xl leading-tight font-bold tracking-tight sm:text-5xl"
            />
            <span className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              As of {format(new Date(), "d MMM yyyy")} · full history
              <History className="h-3 w-3 opacity-70" />
            </span>
          </PoolHistoryDialog>

          {/* Verdict: icon + words, so it never rests on colour alone. */}
          {poolDryDate ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-negative/30 bg-negative/10 px-3.5 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
              <div className="text-xs">
                <div className="font-semibold text-negative">
                  Projected to run dry
                  {daysToDry != null && daysToDry >= 0 ? ` in ${daysToDry} days` : ""}
                </div>
                <p className="mt-0.5 text-muted-foreground">
                  Around{" "}
                  <span className="font-medium text-foreground">
                    {format(poolDryDate, "d MMM yyyy")}
                  </span>
                  {poolDryAmountMinor != null && (
                    <>
                      {" "}
                      (<Money minor={poolDryAmountMinor} currency={currency} showCurrency={false} />)
                    </>
                  )}{" "}
                  if everything known lands as expected.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-positive/25 bg-positive/10 px-3.5 py-3 text-xs">
              <ShieldCheck className="h-4 w-4 shrink-0 text-positive" />
              <span className="font-medium text-positive">
                Projected to stay positive for the next 2 years.
              </span>
            </div>
          )}

          {nextSalary && provisionalPoolAtNextSalaryMinor != null && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-secondary px-3.5 py-2.5">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-positive" />
                Pool at next salary · {format(nextSalary.date, "d MMM")}
              </span>
              <Money
                minor={provisionalPoolAtNextSalaryMinor}
                currency={currency}
                colored
                className="shrink-0 text-base font-semibold"
              />
            </div>
          )}
        </div>

        {/* ── Two-year shape ───────────────────────────────────────── */}
        {spark && (
          <figure className="min-w-0">
            <figcaption className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Projected pool · next 2 years</span>
              <span>{format(new Date(daily[daily.length - 1].t), "MMM yyyy")}</span>
            </figcaption>
            <svg
              viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
              className="h-32 w-full"
              preserveAspectRatio="none"
              role="img"
              aria-label={
                poolDryDate
                  ? `Projected free-savings pool over two years, crossing zero around ${format(poolDryDate, "d MMMM yyyy")}.`
                  : "Projected free-savings pool over two years, staying above zero throughout."
              }
            >
              <defs>
                <linearGradient id="pool-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              <path d={spark.area} fill="url(#pool-fill)" />

              <line
                x1="0"
                y1={spark.zeroY}
                x2={SPARK_W}
                y2={spark.zeroY}
                stroke="var(--muted-foreground)"
                strokeWidth="1"
                strokeDasharray="4 5"
                opacity="0.55"
                vectorEffect="non-scaling-stroke"
              />

              <path
                d={spark.line}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />

              {/* The one annotated point: where it crosses zero. */}
              {spark.dry && (
                <g>
                  <circle
                    cx={spark.dry.cx}
                    cy={spark.dry.cy}
                    r="4"
                    fill="var(--negative)"
                    className="animate-pulse-ring"
                    style={{ transformOrigin: `${spark.dry.cx}px ${spark.dry.cy}px` }}
                  />
                  <circle
                    cx={spark.dry.cx}
                    cy={spark.dry.cy}
                    r="3.5"
                    fill="var(--negative)"
                    stroke="var(--card)"
                    strokeWidth="1.5"
                  />
                </g>
              )}
            </svg>
          </figure>
        )}
      </div>
    </section>
  );
}

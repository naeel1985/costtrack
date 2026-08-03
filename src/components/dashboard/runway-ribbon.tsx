import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { ArrowDownRight, ArrowUpRight, CalendarClock } from "lucide-react";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import type { UpcomingObligation } from "@/server/queries";

/**
 * Everything committed over the next 90 days, bucketed by week.
 *
 * The obligations list already answers "what is due?". The open question is
 * *timing* — where the costs bunch up, and whether a heavy week lands before or
 * after payday. That is magnitude-over-time, so it wants bars rather than a pin
 * per obligation: 13 weekly buckets stay legible where ~40 individual pins
 * collapse into noise.
 *
 * Diverging about a neutral zero axis — money in grows up, money out grows
 * down — so direction is carried by position as well as hue, and the header
 * doubles as the legend. Bars are anchored to the baseline with 4px rounded
 * data-ends and a 2px gap between columns.
 *
 * Hover detail is CSS-only (no client JS); each column is focusable so the
 * detail is reachable from a keyboard too. Presentation only — obligations
 * arrive already computed and dated.
 */

const WINDOW_DAYS = 91; // 13 whole weeks
const BUCKET_DAYS = 7;
const BUCKETS = WINDOW_DAYS / BUCKET_DAYS;

interface Bucket {
  start: Date;
  inMinor: number;
  outMinor: number;
  items: UpcomingObligation[];
}

export function RunwayRibbon({
  obligations,
  currency,
}: {
  obligations: UpcomingObligation[];
  currency: string;
}) {
  const today = startOfDay(new Date());

  const buckets: Bucket[] = Array.from({ length: BUCKETS }, (_, i) => ({
    start: addDays(today, i * BUCKET_DAYS),
    inMinor: 0,
    outMinor: 0,
    items: [],
  }));

  for (const o of obligations) {
    const offset = differenceInCalendarDays(startOfDay(o.date), today);
    if (offset < 0 || offset >= WINDOW_DAYS) continue;
    const b = buckets[Math.floor(offset / BUCKET_DAYS)];
    if (o.amountMinor >= 0) b.inMinor += o.amountMinor;
    else b.outMinor += -o.amountMinor;
    b.items.push(o);
  }

  const peak = Math.max(1, ...buckets.map((b) => Math.max(b.inMinor, b.outMinor)));
  const totalIn = buckets.reduce((s, b) => s + b.inMinor, 0);
  const totalOut = buckets.reduce((s, b) => s + b.outMinor, 0);
  const busiest = buckets.reduce((hi, b) => (b.outMinor > hi.outMinor ? b : hi), buckets[0]);
  const hasAny = totalIn > 0 || totalOut > 0;

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <header className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" /> Runway · next 90 days
        </h2>
        {/* Doubles as the legend: swatch + word, never colour alone. */}
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowUpRight className="h-3.5 w-3.5 text-[var(--chart-income)]" /> In
            <Money minor={totalIn} currency={currency} showCurrency={false} className="font-medium text-foreground" />
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowDownRight className="h-3.5 w-3.5 text-[var(--chart-cost)]" /> Out
            <Money minor={totalOut} currency={currency} showCurrency={false} className="font-medium text-foreground" />
          </span>
        </div>
      </header>

      {!hasAny ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nothing committed in the next 90 days.
        </p>
      ) : (
        <>
          <p className="mb-4 text-xs text-muted-foreground">
            Heaviest week begins{" "}
            <span className="font-medium text-foreground">{format(busiest.start, "d MMM")}</span> ·{" "}
            <Money minor={busiest.outMinor} currency={currency} showCurrency={false} className="font-medium text-foreground" />{" "}
            going out
          </p>

          <div className="relative flex h-44 items-stretch gap-[2px]">
            {buckets.map((b, i) => {
              const inPct = (b.inMinor / peak) * 100;
              const outPct = (b.outMinor / peak) * 100;
              const empty = b.inMinor === 0 && b.outMinor === 0;
              return (
                <div
                  key={i}
                  tabIndex={empty ? -1 : 0}
                  role={empty ? undefined : "button"}
                  aria-label={
                    empty
                      ? undefined
                      : `Week of ${format(b.start, "d MMMM")}: ${b.items.length} item${b.items.length === 1 ? "" : "s"}`
                  }
                  className="group relative flex flex-1 flex-col outline-none"
                >
                  {/* Money in — grows up from the axis. */}
                  <div className="flex flex-1 items-end">
                    <div
                      className="w-full rounded-t-[4px] bg-[var(--chart-income)] transition-opacity group-hover:opacity-80"
                      style={{ height: `${inPct}%` }}
                    />
                  </div>

                  <div className="h-px w-full bg-border" />

                  {/* Money out — grows down from the axis. */}
                  <div className="flex flex-1 items-start">
                    <div
                      className="w-full rounded-b-[4px] bg-[var(--chart-cost)] transition-opacity group-hover:opacity-80"
                      style={{ height: `${outPct}%` }}
                    />
                  </div>

                  {/* Column hover target tint. */}
                  {!empty && (
                    <div className="pointer-events-none absolute inset-0 -mx-[1px] rounded bg-foreground/[0.04] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                  )}

                  {!empty && (
                    <div className="pointer-events-none absolute bottom-[calc(50%+0.75rem)] left-1/2 z-20 w-48 -translate-x-1/2 rounded-lg border bg-popover p-2.5 text-left opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <div className="text-xs font-medium">
                        Week of {format(b.start, "d MMM")}
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-[11px]">
                        {b.inMinor > 0 && (
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">In</span>
                            <Money minor={b.inMinor} currency={currency} showCurrency={false} className="font-medium text-positive" />
                          </div>
                        )}
                        {b.outMinor > 0 && (
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Out</span>
                            <Money minor={b.outMinor} currency={currency} showCurrency={false} className="font-medium text-negative" />
                          </div>
                        )}
                      </div>
                      <ul className="mt-1.5 space-y-0.5 border-t pt-1.5 text-[11px] text-muted-foreground">
                        {b.items.slice(0, 3).map((it) => (
                          <li key={it.id} className="truncate">
                            {format(it.date, "d MMM")} · {it.label}
                          </li>
                        ))}
                        {b.items.length > 3 && <li>+{b.items.length - 3} more</li>}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex text-[11px] text-muted-foreground">
            {buckets.map((b, i) => (
              <span key={i} className={cn("flex-1 text-center", i % 3 !== 0 && "invisible")}>
                {i === 0 ? "Today" : format(b.start, "d MMM")}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

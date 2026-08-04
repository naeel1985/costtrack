"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarSearch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { formatMoney } from "@/lib/money";
import { freeSavingsAt, type FreeSavingsPoint } from "@/lib/cashflow-timeline";
import { cn } from "@/lib/utils";

/**
 * Scrub to any day — back to the account's opening or forward two years — and
 * read the free-savings pool on it. The series is continuous across today:
 * before it, the pool as it actually ran from posted transactions; after it,
 * the pool projected against every known cost. Both the slider and the graph
 * drive the selection.
 *
 * A single series, so no legend (the title names it); only today and the
 * selected day are direct-labelled rather than labelling every point.
 */
export function FreeSavingsExplorer({
  series,
  todayIndex,
  currency,
}: {
  series: FreeSavingsPoint[];
  /** Index of today — the boundary between recorded and projected. */
  todayIndex: number;
  currency: string;
}) {
  const maxOffset = Math.max(0, series.length - 1);
  const safeToday = Math.min(Math.max(0, todayIndex), maxOffset);
  const [offset, setOffset] = React.useState(safeToday);

  // Clamp if the series shifts under us (e.g. after a revalidate, or at midnight).
  const safeOffset = Math.min(offset, maxOffset);
  const point = freeSavingsAt(series, safeOffset);

  if (!point) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarSearch className="h-4 w-4" /> Free savings on any date
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Add accounts and recurring items to track your free-savings pool across time.
          </p>
        </CardContent>
      </Card>
    );
  }

  const date = new Date(point.t);
  const today = new Date(series[safeToday].t);
  const current = series[safeToday].freeSavingsMinor;
  const isToday = safeOffset === safeToday;
  const isPast = safeOffset < safeToday;
  const negative = point.freeSavingsMinor < 0;

  // Only the projection carries a warning — a dip that already happened is
  // history, not something to act on.
  const forward = series.slice(safeToday);
  const low = forward.reduce((m, p) => (p.freeSavingsMinor < m.freeSavingsMinor ? p : m), forward[0]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarSearch className="h-4 w-4" /> Free savings on any date
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Up to today, what the pool actually was — every posted movement across your cash and bank
          accounts. After today, today&apos;s pool + income received by the chosen day − known costs
          by then. Drag the slider or hover the graph.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground">Free savings today</div>
            <Money minor={current} currency={currency} className="text-lg font-semibold" />
          </div>
          <div
            className={cn(
              "rounded-lg border px-3 py-2",
              negative ? "border-negative/40 bg-negative/10" : "bg-card",
            )}
          >
            <div className="text-xs text-muted-foreground">
              {isToday
                ? "Today"
                : `${isPast ? "Actual" : "Projected"} · ${format(date, "d MMM yyyy")}`}
            </div>
            <Money
              minor={point.freeSavingsMinor}
              currency={currency}
              colored={negative}
              className="text-lg font-semibold"
            />
          </div>
          <div className="rounded-lg border px-3 py-2">
            <div className="text-xs text-muted-foreground">Costs by then</div>
            <Money minor={point.cumCostsMinor} currency={currency} className="text-lg font-semibold" />
          </div>
          <div className="rounded-lg border px-3 py-2">
            <div className="text-xs text-muted-foreground">Income by then</div>
            <Money minor={point.cumIncomeMinor} currency={currency} className="text-lg font-semibold" />
          </div>
        </div>

        {/* Scrubber */}
        <div>
          <input
            type="range"
            min={0}
            max={maxOffset}
            value={safeOffset}
            onChange={(e) => setOffset(Number(e.target.value))}
            aria-label="Choose a date to inspect free savings"
            aria-valuetext={`${format(date, "d MMMM yyyy")}: ${formatMoney(point.freeSavingsMinor, currency)}`}
            className="scrubber"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{format(new Date(series[0].t), "d MMM yyyy")}</span>
            <button
              type="button"
              onClick={() => setOffset(safeToday)}
              className="rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Today
            </button>
            <span>{format(new Date(series[maxOffset].t), "d MMM yyyy")}</span>
          </div>
        </div>

        <div className="h-[190px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={series}
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
              // Hovering/dragging the plot scrubs it, same as the slider.
              onMouseMove={(state) => {
                const i = state?.activeTooltipIndex;
                if (typeof i === "number" && i >= 0) setOffset(i);
              }}
            >
              <defs>
                <linearGradient id="freeSavingsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-income)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--chart-income)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => format(new Date(t), "MMM yy")}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                interval="preserveStartEnd"
                minTickGap={32}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                width={54}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickFormatter={(v) => formatMoney(v, currency, { showCurrency: false, compact: true })}
                tickLine={false}
                axisLine={false}
              />
              {low.freeSavingsMinor < 0 && (
                <ReferenceLine y={0} stroke="var(--negative)" strokeDasharray="4 4" />
              )}
              <Area
                type="monotone"
                dataKey="freeSavingsMinor"
                stroke="var(--chart-income)"
                strokeWidth={2}
                fill="url(#freeSavingsFill)"
                isAnimationActive={false}
                activeDot={false}
              />
              {/* The recorded/projected boundary, so the two halves are never
                  mistaken for each other. */}
              {safeToday > 0 && (
                <ReferenceLine
                  x={today.getTime()}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1}
                  label={{
                    value: "Today",
                    position: "insideTopLeft",
                    fill: "var(--muted-foreground)",
                    fontSize: 11,
                  }}
                />
              )}
              {/* The scrubbed day, direct-labelled instead of every point. */}
              <ReferenceLine x={point.t} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
              {/* 2px surface ring so the marker reads over the area fill. */}
              <ReferenceDot
                x={point.t}
                y={point.freeSavingsMinor}
                r={5}
                fill="var(--chart-income)"
                stroke="var(--card)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <p className={cn("text-xs", negative && !isPast ? "text-negative" : "text-muted-foreground")}>
          {isPast
            ? `On ${format(date, "d MMM yyyy")} your free-savings pool actually stood at ${formatMoney(point.freeSavingsMinor, currency)}.`
            : negative
              ? `On ${format(date, "d MMM yyyy")} your known costs outrun savings and income by ${formatMoney(Math.abs(point.freeSavingsMinor), currency)}.`
              : low.freeSavingsMinor < 0
                ? `Dips to ${formatMoney(low.freeSavingsMinor, currency)} on ${format(new Date(low.t), "d MMM")} — free savings today, plus income, minus every known cost to that date.`
                : "Free savings today, plus income received by this date, minus every known cost to it."}
        </p>
      </CardContent>
    </Card>
  );
}

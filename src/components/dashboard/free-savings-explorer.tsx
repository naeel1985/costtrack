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
 * Scrub to any day in the next year and read the free savings projected for it.
 * A single series, so no legend — the title names it; the selected day is
 * direct-labelled rather than labelling every point.
 */
export function FreeSavingsExplorer({
  daily,
  currency,
}: {
  daily: FreeSavingsPoint[];
  currency: string;
}) {
  const maxOffset = Math.max(0, daily.length - 1);
  const [offset, setOffset] = React.useState(0);

  // Clamp if the series shrinks under us (e.g. after a revalidate).
  const safeOffset = Math.min(offset, maxOffset);
  const point = freeSavingsAt(daily, safeOffset);

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
            Add accounts and recurring items to project your savings across the year.
          </p>
        </CardContent>
      </Card>
    );
  }

  const date = new Date(point.t);
  const today = new Date(daily[0].t);
  const start = daily[0].freeSavingsMinor;
  const change = point.freeSavingsMinor - start;
  const low = daily.reduce((m, p) => (p.freeSavingsMinor < m.freeSavingsMinor ? p : m), daily[0]);
  const negative = point.freeSavingsMinor < 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarSearch className="h-4 w-4" /> Free savings on any date
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag through the next 12 months to see what&apos;s left after everything committed.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div className="text-xs text-muted-foreground">
              {safeOffset === 0 ? "Today" : format(date, "EEEE, d MMMM yyyy")}
            </div>
            <Money
              minor={point.freeSavingsMinor}
              currency={currency}
              colored={negative}
              className="text-3xl font-bold"
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Change from today</div>
            <Money minor={change} currency={currency} colored signed className="text-sm font-medium" />
          </div>
          {low.freeSavingsMinor < 0 && (
            <div>
              <div className="text-xs text-negative">Lowest point</div>
              <div className="text-sm font-medium text-negative">
                {formatMoney(low.freeSavingsMinor, currency)} · {format(new Date(low.t), "d MMM")}
              </div>
            </div>
          )}
        </div>

        {/* Scrubber — the required "any date within the year" control */}
        <div>
          <input
            type="range"
            min={0}
            max={maxOffset}
            value={safeOffset}
            onChange={(e) => setOffset(Number(e.target.value))}
            aria-label="Choose a date to inspect free savings"
            aria-valuetext={`${format(date, "d MMMM yyyy")}: ${formatMoney(point.freeSavingsMinor, currency)}`}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{format(today, "d MMM yyyy")}</span>
            <span>{format(new Date(daily[maxOffset].t), "d MMM yyyy")}</span>
          </div>
        </div>

        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                tickFormatter={(t) => format(new Date(t), "MMM")}
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
              />
              {/* The scrubbed day, direct-labelled */}
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

        <p className={cn("text-xs", negative ? "text-negative" : "text-muted-foreground")}>
          {negative
            ? `On this date your committed costs outrun your savings by ${formatMoney(Math.abs(point.freeSavingsMinor), currency)}.`
            : "Savings plus expected income, minus every committed cost up to this date."}
        </p>
      </CardContent>
    </Card>
  );
}

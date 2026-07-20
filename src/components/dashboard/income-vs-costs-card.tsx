"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CycleBucket, FreeSavingsPoint } from "@/lib/cashflow-timeline";

/** Configurable horizons — number of salary cycles to show. */
const PERIODS = [3, 6, 9, 12] as const;
type Period = (typeof PERIODS)[number];

type Grain = "cycle" | "day";

const SERIES = [
  { key: "incomeMinor", label: "Income", color: "var(--chart-income)" },
  { key: "costsMinor", label: "Costs", color: "var(--chart-cost)" },
] as const;

export function IncomeVsCostsCard({
  cycles,
  daily,
  currency,
}: {
  cycles: CycleBucket[];
  daily: FreeSavingsPoint[];
  currency: string;
}) {
  const [period, setPeriod] = React.useState<Period>(6);
  const [grain, setGrain] = React.useState<Grain>("cycle");
  const data = cycles.slice(0, period);

  const totalIncome = data.reduce((s, m) => s + m.incomeMinor, 0);
  const totalCosts = data.reduce((s, m) => s + m.costsMinor, 0);
  const totalCardBills = data.reduce((s, m) => s + m.cardBillsMinor, 0);
  const net = totalIncome - totalCosts;
  const empty = totalIncome === 0 && totalCosts === 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Income vs costs</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Expected {grain === "day" ? "day by day" : "salary cycle by cycle"} — recurring income
            and costs, scheduled spend, cheques due, provisions and credit-card bills on their due
            date.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div
            role="tablist"
            aria-label="Time range"
            className="flex items-center gap-1 rounded-lg bg-muted p-1"
          >
            {PERIODS.map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  period === p ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p === 12 ? "1 yr" : `${p}m`}
              </button>
            ))}
          </div>
          <div
            role="tablist"
            aria-label="Granularity"
            className="flex items-center gap-1 rounded-lg bg-muted p-1"
          >
            {(["cycle", "day"] as const).map((g) => (
              <button
                key={g}
                role="tab"
                aria-selected={grain === g}
                onClick={() => setGrain(g)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  grain === g ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {g === "cycle" ? "Cycle" : "Daily"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Totals + legend. The legend is always present for these two series, so
            identity never rests on colour alone. */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <div className="text-xs text-muted-foreground">Income</div>
            <Money minor={totalIncome} currency={currency} className="text-xl font-semibold" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Costs</div>
            <Money minor={totalCosts} currency={currency} className="text-xl font-semibold" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Net</div>
            <Money
              minor={net}
              currency={currency}
              colored
              signed
              className="text-xl font-semibold"
            />
          </div>
          {totalCardBills > 0 && (
            <div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CreditCard className="h-3 w-3" /> Card bills
              </div>
              <Money minor={totalCardBills} currency={currency} className="text-xl font-semibold" />
            </div>
          )}
          <ul className="ml-auto flex items-center gap-4">
            {SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </li>
            ))}
          </ul>
        </div>

        {empty ? (
          <p className="py-14 text-center text-sm text-muted-foreground">
            Nothing scheduled in this window yet. Add recurring income and costs to see the shape of
            your year.
          </p>
        ) : grain === "day" ? (
          <DailyChart daily={daily} months={period} currency={currency} />
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
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
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const m = payload[0].payload as CycleBucket;
                    return (
                      <div className="min-w-40 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                        <div className="mb-1.5 font-medium">{m.rangeLabel}</div>
                        {SERIES.map((s) => (
                          <div key={s.key} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <span
                                aria-hidden
                                className="h-2 w-2 rounded-sm"
                                style={{ backgroundColor: s.color }}
                              />
                              {s.label}
                            </span>
                            <span className="tabular">{formatMoney(m[s.key], currency)}</span>
                          </div>
                        ))}
                        {m.cardBillsMinor > 0 && (
                          <div className="mt-0.5 flex items-center justify-between gap-4 text-muted-foreground">
                            <span className="flex items-center gap-1.5 pl-3.5">incl. card bills</span>
                            <span className="tabular">{formatMoney(m.cardBillsMinor, currency)}</span>
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center justify-between gap-4 border-t pt-1.5">
                          <span className="text-muted-foreground">Net</span>
                          <span
                            className={cn("tabular font-medium", m.netMinor < 0 && "text-negative")}
                          >
                            {formatMoney(m.netMinor, currency, { signed: true })}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                {SERIES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Day-by-day distribution over the selected window. Income is a soft area
 * baseline; costs are bars, so a credit-card "Total Amount Due" lands as a
 * visible spike on its payment due date. Card-bill days are drawn in a deeper
 * cost tone and named in the tooltip.
 */
function DailyChart({
  daily,
  months,
  currency,
}: {
  daily: FreeSavingsPoint[];
  months: number;
  currency: string;
}) {
  // The daily series spans a full year; clamp it to the chosen window.
  const cutoff = daily.length ? daily[0].t + months * 31 * 86_400_000 : 0;
  const data = daily.filter((p) => p.t <= cutoff);

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="dayIncomeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-income)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--chart-income)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => format(new Date(t), "d MMM")}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            interval="preserveStartEnd"
            minTickGap={44}
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
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as FreeSavingsPoint;
              if (p.dayIncomeMinor === 0 && p.dayCostsMinor === 0) return null;
              return (
                <div className="min-w-44 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                  <div className="mb-1.5 font-medium">{format(new Date(p.t), "EEE d MMM yyyy")}</div>
                  {p.dayIncomeMinor > 0 && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-sm"
                          style={{ backgroundColor: "var(--chart-income)" }}
                        />
                        Income
                      </span>
                      <span className="tabular">{formatMoney(p.dayIncomeMinor, currency)}</span>
                    </div>
                  )}
                  {p.dayCostsMinor > 0 && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-sm"
                          style={{ backgroundColor: "var(--chart-cost)" }}
                        />
                        Costs
                      </span>
                      <span className="tabular">{formatMoney(p.dayCostsMinor, currency)}</span>
                    </div>
                  )}
                  {p.dayCardBillsMinor > 0 && (
                    <div className="mt-0.5 flex items-center justify-between gap-4 text-muted-foreground">
                      <span className="flex items-center gap-1.5 pl-3.5">
                        <CreditCard className="h-3 w-3" /> Card bill due
                      </span>
                      <span className="tabular">{formatMoney(p.dayCardBillsMinor, currency)}</span>
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="dayIncomeMinor"
            stroke="var(--chart-income)"
            strokeWidth={1.5}
            fill="url(#dayIncomeFill)"
            isAnimationActive={false}
            activeDot={false}
          />
          <Bar dataKey="dayCostsMinor" fill="var(--chart-cost)" maxBarSize={10} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

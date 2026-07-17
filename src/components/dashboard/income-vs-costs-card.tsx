"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MonthBucket } from "@/lib/cashflow-timeline";

/** Configurable horizons, in months. */
const PERIODS = [3, 6, 9, 12] as const;
type Period = (typeof PERIODS)[number];

const SERIES = [
  { key: "incomeMinor", label: "Income", color: "var(--chart-income)" },
  { key: "costsMinor", label: "Costs", color: "var(--chart-cost)" },
] as const;

export function IncomeVsCostsCard({
  months,
  currency,
}: {
  months: MonthBucket[];
  currency: string;
}) {
  const [period, setPeriod] = React.useState<Period>(6);
  const data = months.slice(0, period);

  const totalIncome = data.reduce((s, m) => s + m.incomeMinor, 0);
  const totalCosts = data.reduce((s, m) => s + m.costsMinor, 0);
  const net = totalIncome - totalCosts;
  const empty = totalIncome === 0 && totalCosts === 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Income vs costs</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Expected month by month — recurring income and costs, scheduled spend, cheques due and
            provisions with a due date.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Time range"
          className="flex shrink-0 items-center gap-1 rounded-lg bg-muted p-1"
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
                    const m = payload[0].payload as MonthBucket;
                    return (
                      <div className="min-w-40 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                        <div className="mb-1.5 font-medium">{m.label}</div>
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

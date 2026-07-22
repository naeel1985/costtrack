"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { StatCard, EmptyState } from "@/components/shared";
import { formatMoney } from "@/lib/money";
import type { ReportData } from "@/server/queries";
import { cn } from "@/lib/utils";

export function ReportsView({ data, monthsBack }: { data: ReportData; monthsBack: number }) {
  const router = useRouter();
  const onChangeRange = (m: number) => router.push(`/reports?months=${m}`);
  const cur = data.baseCurrency;
  const netMinor = data.totalIncomeMinor - data.totalExpenseMinor;
  const catTotal = data.byCategory.reduce((s, c) => s + c.amountMinor, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {[3, 6, 12].map((m) => (
            <button
              key={m}
              onClick={() => onChangeRange(m)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                monthsBack === m ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}mo
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Income (${monthsBack}mo)`} value={<Money minor={data.totalIncomeMinor} currency={cur} />} tone="positive" />
        <StatCard label={`Spent (${monthsBack}mo)`} value={<Money minor={data.totalExpenseMinor} currency={cur} />} tone="negative" />
        <StatCard label="Net" value={<Money minor={netMinor} currency={cur} colored />} />
        <StatCard label="Avg spend / mo" value={<Money minor={data.avgMonthlyExpenseMinor} currency={cur} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Income vs spending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.months} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis
                    width={48}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(v) => formatMoney(v, cur, { showCurrency: false, compact: true })}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const inc = payload.find((p) => p.dataKey === "incomeMinor")?.value as number;
                      const exp = payload.find((p) => p.dataKey === "expenseMinor")?.value as number;
                      return (
                        <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                          <div className="mb-1 font-medium">{label}</div>
                          <div className="text-positive">In {formatMoney(inc, cur)}</div>
                          <div className="text-negative">Out {formatMoney(exp, cur)}</div>
                          <div className="mt-1 border-t pt-1">Net {formatMoney(inc - exp, cur)}</div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    formatter={(v) => (v === "incomeMinor" ? "Income" : "Spending")}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="incomeMinor" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenseMinor" fill="var(--color-chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spending by category</CardTitle>
          </CardHeader>
          <CardContent>
            {data.byCategory.length === 0 ? (
              <EmptyState title="No spending yet" className="py-16" />
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="h-[200px] w-[200px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.byCategory}
                        dataKey="amountMinor"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={90}
                        paddingAngle={2}
                        stroke="var(--card)"
                      >
                        {data.byCategory.map((c) => (
                          <Cell key={c.name} fill={c.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as ReportData["byCategory"][number];
                          const pct = catTotal ? Math.round((d.amountMinor / catTotal) * 100) : 0;
                          return (
                            <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                              <div className="font-medium">{d.name}</div>
                              <div className="tabular">
                                {formatMoney(d.amountMinor, cur)} · {pct}%
                              </div>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-1.5 self-stretch">
                  {data.byCategory.slice(0, 7).map((c) => {
                    const pct = catTotal ? Math.round((c.amountMinor / catTotal) * 100) : 0;
                    return (
                      <li key={c.name} className="flex items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="tabular text-muted-foreground">{pct}%</span>
                        <Money minor={c.amountMinor} currency={cur} className="w-24 text-right font-medium" />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top merchants & payees</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topPayees.length === 0 ? (
            <EmptyState title="Nothing to show yet" className="py-10" />
          ) : (
            <ul className="space-y-2">
              {data.topPayees.map((p) => {
                const max = data.topPayees[0].amountMinor || 1;
                return (
                  <li key={p.name} className="flex items-center gap-3">
                    <div className="w-40 truncate text-sm font-medium">{p.name}</div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-chart-4"
                        style={{ width: `${(p.amountMinor / max) * 100}%`, backgroundColor: "var(--color-chart-4)" }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">×{p.count}</div>
                    <Money minor={p.amountMinor} currency={cur} className="w-24 text-right text-sm font-medium" />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

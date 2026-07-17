import { format } from "date-fns";
import { PiggyBank, TrendingUp, TrendingDown, CreditCard, CalendarRange } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import type { SalaryPeriodResult } from "@/lib/salary-period";

/**
 * The salary-period card: how much of your savings is genuinely free, and
 * whether the upcoming salary covers the upcoming period's committed costs or
 * eats into savings. See `lib/salary-period.ts` for the definitions.
 */
export function SalaryPeriodCard({
  period,
  creditCardOwedMinor,
  currency,
}: {
  period: SalaryPeriodResult;
  creditCardOwedMinor: number;
  currency: string;
}) {
  const covers = period.coversCosts;
  // Fill the bar by how much of the salary the costs consume.
  const consumed =
    period.salaryMinor > 0
      ? Math.min(100, Math.round((period.costsMinor / period.salaryMinor) * 100))
      : period.costsMinor > 0
        ? 100
        : 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PiggyBank className="h-4 w-4" /> Free savings
        </CardTitle>
        {period.hasSalary && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" />
            {format(period.periodStart, "d MMM")} – {format(period.periodEnd, "d MMM")}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Headline free-savings figure */}
        <div>
          <Money
            minor={period.freeSavingsMinor}
            currency={currency}
            className="text-3xl font-bold"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Cash that isn&apos;t already spoken for this salary period
            {period.shortfallMinor > 0 ? " (after covering the shortfall below)" : ""}.
          </p>
        </div>

        {!period.hasSalary ? (
          <div className="rounded-lg border border-dashed bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
            Add your salary as a <span className="font-medium text-foreground">monthly recurring
            income</span> to see whether each period covers its own costs.
          </div>
        ) : (
          <>
            {/* Salary vs costs bar */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-positive" /> Salary
                </span>
                <Money minor={period.salaryMinor} currency={currency} className="font-medium" />
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-positive/20">
                <div
                  className={covers ? "h-full rounded-full bg-positive" : "h-full rounded-full bg-negative"}
                  style={{ width: `${consumed}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <TrendingDown className="h-3.5 w-3.5 text-negative" /> Committed costs
                </span>
                <Money minor={period.costsMinor} currency={currency} className="font-medium" />
              </div>
            </div>

            {/* Verdict */}
            <div
              className={
                covers
                  ? "rounded-lg bg-positive/10 px-3 py-2.5 text-sm"
                  : "rounded-lg bg-negative/10 px-3 py-2.5 text-sm"
              }
            >
              {covers ? (
                <span>
                  Salary covers this period —{" "}
                  <Money minor={period.surplusMinor} currency={currency} className="font-semibold text-positive" />{" "}
                  flows into your free savings.
                </span>
              ) : (
                <span>
                  Costs exceed salary by{" "}
                  <Money minor={period.shortfallMinor} currency={currency} className="font-semibold text-negative" />{" "}
                  — it will be drawn from your savings.
                </span>
              )}
            </div>
          </>
        )}

        {creditCardOwedMinor > 0 && (
          <div className="flex items-center justify-between border-t pt-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5" /> Credit card owed
            </span>
            <Money minor={creditCardOwedMinor} currency={currency} className="font-semibold text-[#7c3aed]" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

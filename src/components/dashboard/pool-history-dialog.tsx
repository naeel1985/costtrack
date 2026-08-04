"use client";

import * as React from "react";
import { format } from "date-fns";
import { AlertTriangle, Flag, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import type { FreeSavingsHistory } from "@/server/queries";

/**
 * Where the pool came from, back to the account's creation.
 *
 * The pool is a cumulative ledger, so its current value is only meaningful
 * alongside the cycles that produced it: each confirmed salary folds one
 * cycle's income minus costs into the running total. This lists them oldest
 * first, ending at today.
 *
 * When nothing has closed yet it says so plainly rather than showing an empty
 * table — the figure on the card is then a live balance, not a realized ledger,
 * and that distinction matters.
 */
export function PoolHistoryDialog({
  history,
  currency,
  children,
}: {
  history: FreeSavingsHistory;
  currency: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const { cycles, realized, accountCreatedAt, anchorDate, poolMinor, salaryRuleMissing } = history;

  const totalIncome = cycles.reduce((s, c) => s + c.incomeMinor, 0);
  const totalCosts = cycles.reduce((s, c) => s + c.costsMinor, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-lg text-left transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Show how the free-savings pool was built"
      >
        {children}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Free-savings pool · history
            </DialogTitle>
            <DialogDescription>
              Since your account opened on {format(accountCreatedAt, "d MMM yyyy")}. The pool moves
              only when a confirmed salary closes a cycle.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-baseline justify-between gap-3 rounded-lg bg-muted/50 px-3.5 py-3">
            <span className="text-sm text-muted-foreground">
              {realized ? "Pool today" : "Live balance today"}
            </span>
            <Money minor={poolMinor} currency={currency} colored className="text-xl font-bold" />
          </div>

          {!realized ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="text-xs">
                  <div className="font-semibold">No cycle has closed yet</div>
                  <p className="mt-1 text-muted-foreground">
                    The pool becomes a running ledger the first time you confirm a salary debit.
                    Until then the figure above is simply your current balance across cash and bank
                    accounts — useful, but not yet the cumulative pool.
                  </p>
                </div>
              </div>

              {salaryRuleMissing && (
                <div className="flex items-start gap-2.5 rounded-lg border border-negative/30 bg-negative/10 px-3.5 py-3">
                  <Flag className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
                  <div className="text-xs">
                    <div className="font-semibold text-negative">
                      No income rule is marked as your salary
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      A cycle can only close against the rule flagged as salary, so none can close
                      today. Open <span className="font-medium text-foreground">Income → recurring</span>{" "}
                      and turn on <span className="font-medium text-foreground">This is my salary</span>{" "}
                      for the right rule.
                    </p>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Accruing since {format(anchorDate, "d MMM yyyy")}.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Cycles closed" value={String(cycles.length)} />
                <Stat
                  label="Income banked"
                  value={<Money minor={totalIncome} currency={currency} showCurrency={false} />}
                  tone="positive"
                />
                <Stat
                  label="Costs absorbed"
                  value={<Money minor={totalCosts} currency={currency} showCurrency={false} />}
                  tone="negative"
                />
              </div>

              <div className="max-h-[340px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 text-left font-medium">Cycle</th>
                      <th className="py-2 text-right font-medium">Income</th>
                      <th className="py-2 text-right font-medium">Costs</th>
                      <th className="py-2 text-right font-medium">Saved</th>
                      <th className="py-2 text-right font-medium">Pool after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycles.map((c) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-2 text-xs whitespace-nowrap">
                          {format(c.cycleStart, "d MMM")} – {format(c.cycleEnd, "d MMM yy")}
                        </td>
                        <td className="py-2 text-right tabular">
                          <Money minor={c.incomeMinor} currency={currency} showCurrency={false} />
                        </td>
                        <td className="py-2 text-right tabular">
                          <Money minor={c.costsMinor} currency={currency} showCurrency={false} />
                        </td>
                        <td className="py-2 text-right">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 tabular font-medium",
                              c.savingsMinor >= 0 ? "text-positive" : "text-negative",
                            )}
                          >
                            {c.savingsMinor >= 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            <Money
                              minor={Math.abs(c.savingsMinor)}
                              currency={currency}
                              showCurrency={false}
                            />
                          </span>
                        </td>
                        <td className="py-2 text-right tabular font-semibold">
                          <Money minor={c.poolAfterMinor} currency={currency} showCurrency={false} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground">
                Current cycle accruing since {format(anchorDate, "d MMM yyyy")} — it joins the table
                once you confirm the next salary.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 tabular font-semibold",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </div>
    </div>
  );
}

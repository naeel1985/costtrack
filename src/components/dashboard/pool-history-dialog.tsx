"use client";

import * as React from "react";
import { format, isSameDay } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Money } from "@/components/money";
import { Pager, usePagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PoolLedger } from "@/server/queries";

const PAGE_SIZES = [5, 10, 20, 50, 100];

/**
 * The pool's full history: every movement in and out, back to the opening
 * balance, newest first.
 *
 * Running the list from the bottom up reproduces the figure on the card to the
 * fils — that is the point of showing it, so the balance column is never
 * dropped. Direction is carried by an arrow and a sign as well as colour, so it
 * survives a red-green colour deficiency (see the palette note in DECISIONS.md).
 *
 * The running balance is computed server-side across the whole history, so
 * paging through the list never changes a figure — a page is a window onto the
 * ledger, not a recalculation of it.
 *
 * Posted movements only, up to today. What is still expected belongs to the
 * "Free savings on any date" explorer, not here.
 */
export function PoolHistoryDialog({
  ledger,
  currency,
  children,
}: {
  ledger: PoolLedger;
  currency: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [pageSize, setPageSize] = React.useState(20);
  const { rows, totalInMinor, totalOutMinor, poolMinor, accountCreatedAt } = ledger;
  const today = new Date();
  const { page, setPage, pageCount, start, end, total, pageItems } = usePagination(rows, pageSize);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-lg text-left transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Show every movement in and out of the free-savings pool"
      >
        {children}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Free-savings pool · full history
            </DialogTitle>
            <DialogDescription>
              Every movement in and out since your account opened on{" "}
              {format(accountCreatedAt, "d MMM yyyy")}, up to today.
            </DialogDescription>
          </DialogHeader>

          {/* Totals first: the three numbers that summarise the list below. */}
          <div className="grid shrink-0 grid-cols-3 gap-2">
            <Summary
              label="In"
              icon={<ArrowUpRight className="h-3.5 w-3.5" />}
              value={<Money minor={totalInMinor} currency={currency} showCurrency={false} />}
              tone="positive"
            />
            <Summary
              label="Out"
              icon={<ArrowDownRight className="h-3.5 w-3.5" />}
              value={<Money minor={totalOutMinor} currency={currency} showCurrency={false} />}
              tone="negative"
            />
            <Summary
              label="Pool today"
              value={<Money minor={poolMinor} currency={currency} showCurrency={false} />}
            />
          </div>

          {/* Sized to the page, capped so 100 rows still scroll rather than
              running off the viewport. */}
          <div className="max-h-[52vh] min-h-0 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
                <tr className="text-xs text-muted-foreground">
                  <th className="py-2 pl-3 text-left font-medium">Date</th>
                  <th className="py-2 text-left font-medium">Description</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                  <th className="py-2 pr-3 text-right font-medium">Pool</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => {
                  const inbound = r.deltaMinor >= 0;
                  return (
                    <tr key={r.id} className="border-t align-top">
                      <td className="py-2 pl-3 text-xs whitespace-nowrap text-muted-foreground">
                        {format(r.date, "d MMM yy")}
                        {isSameDay(r.date, today) && (
                          <span className="ml-1 text-[10px] font-medium text-foreground">today</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className={cn("truncate", r.opening && "font-medium")}>{r.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.detail}</div>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 tabular font-medium",
                            inbound ? "text-positive" : "text-negative",
                          )}
                        >
                          {inbound ? (
                            <ArrowUpRight className="h-3 w-3 shrink-0" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3 shrink-0" />
                          )}
                          {/* Sign hugs the figure; only the arrow is spaced off it. */}
                          <span>
                            {inbound ? "+" : "−"}
                            <Money
                              minor={Math.abs(r.deltaMinor)}
                              currency={currency}
                              showCurrency={false}
                            />
                          </span>
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular font-semibold whitespace-nowrap">
                        <Money minor={r.balanceMinor} currency={currency} showCurrency={false} colored={r.balanceMinor < 0} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="shrink-0 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Rows per page
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(0); // a resize makes the old page number meaningless
                  }}
                >
                  <SelectTrigger className="h-8 w-[72px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="flex items-center gap-3">
                {/* Kept outside Pager, which hides itself entirely on a single
                    page — the count is worth showing either way. */}
                <span className="text-xs text-muted-foreground">
                  {start + 1}–{end} of {total} movement{total === 1 ? "" : "s"}
                </span>
                <Pager page={page} pageCount={pageCount} onPage={setPage} className="pt-0" label="" />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Newest first; the oldest row is your opening balance. Credit-card charges are not here
              — they leave the pool when the card is paid, which shows as a single payment row.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Summary({
  label,
  icon,
  value,
  tone,
}: {
  label: string;
  icon?: React.ReactNode;
  value: React.ReactNode;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 tabular text-lg font-semibold",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </div>
    </div>
  );
}

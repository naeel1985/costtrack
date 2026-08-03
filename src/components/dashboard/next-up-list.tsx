import { format, differenceInCalendarDays } from "date-fns";
import { CreditCard, FileText, Target, TrendingUp } from "lucide-react";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import type { NextCardDue, NextCheque, NextProvision, NextSalary } from "@/server/queries";

/**
 * The next event of each kind — salary, card statement, cheque, provision —
 * in date order. Four rows, one per obligation type, so "what lands next" is
 * legible at a glance without reading the whole obligations list.
 *
 * Presentation only: each value is picked server-side in `loadForwardView`.
 */
export function NextUpList({
  nextSalary,
  nextCardDue,
  nextCheque,
  nextProvision,
  currency,
}: {
  nextSalary: NextSalary | null;
  nextCardDue: NextCardDue | null;
  nextCheque: NextCheque | null;
  nextProvision: NextProvision | null;
  currency: string;
}) {
  const rows: {
    key: string;
    icon: React.ReactNode;
    kind: string;
    detail: string;
    date: Date;
    amountMinor: number;
    positive: boolean;
  }[] = [];

  if (nextSalary) {
    rows.push({
      key: "salary",
      icon: <TrendingUp className="h-4 w-4 text-positive" />,
      kind: "Salary",
      detail: nextSalary.name,
      date: nextSalary.date,
      amountMinor: nextSalary.amountMinor,
      positive: true,
    });
  }
  if (nextCardDue) {
    rows.push({
      key: "card",
      icon: <CreditCard className="h-4 w-4 text-[#7c3aed]" />,
      kind: "Card due",
      detail: nextCardDue.cardName,
      date: nextCardDue.date,
      amountMinor: nextCardDue.amountMinor,
      positive: false,
    });
  }
  if (nextCheque) {
    rows.push({
      key: "cheque",
      icon: <FileText className="h-4 w-4 text-muted-foreground" />,
      kind: nextCheque.direction === "issued" ? "Cheque payable" : "Cheque receivable",
      detail: nextCheque.counterparty,
      date: nextCheque.date,
      amountMinor: nextCheque.amountMinor,
      positive: nextCheque.direction === "received",
    });
  }
  if (nextProvision) {
    rows.push({
      key: "provision",
      icon: <Target className="h-4 w-4 text-warning" />,
      kind: "Provision due",
      detail: nextProvision.name,
      date: nextProvision.date,
      amountMinor: nextProvision.amountMinor,
      positive: false,
    });
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  const today = new Date();

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="mb-4 text-base font-semibold">What&apos;s next</h2>

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Nothing upcoming yet — add a salary, card, cheque or provision to see what&apos;s next.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => {
            const days = differenceInCalendarDays(r.date, today);
            return (
              <li
                key={r.key}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-secondary/60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  {r.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.kind}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {format(r.date, "d MMM")}
                    {days >= 0 ? ` · in ${days === 0 ? "today" : `${days}d`}` : ""}
                    {r.detail ? ` · ${r.detail}` : ""}
                  </div>
                </div>
                <Money
                  minor={r.amountMinor}
                  currency={currency}
                  className={cn(
                    "shrink-0 text-sm font-semibold",
                    r.positive ? "text-positive" : "text-foreground",
                  )}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

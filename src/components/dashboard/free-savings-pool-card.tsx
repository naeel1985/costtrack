import { format } from "date-fns";
import { Wallet, TrendingUp, CreditCard, FileText, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import type { NextCardDue, NextCheque, NextProvision, NextSalary } from "@/server/queries";

/**
 * The free-savings pool card: the current realized pool (updates only when a
 * confirmed salary debit closes a cycle — see `lib/free-savings-pool.ts`),
 * what's coming next across every obligation type, and a provisional preview
 * of the pool at the next salary date.
 */
export function FreeSavingsPoolCard({
  poolMinor,
  nextSalary,
  nextCardDue,
  nextCheque,
  nextProvision,
  provisionalPoolAtNextSalaryMinor,
  currency,
}: {
  poolMinor: number;
  nextSalary: NextSalary | null;
  nextCardDue: NextCardDue | null;
  nextCheque: NextCheque | null;
  nextProvision: NextProvision | null;
  provisionalPoolAtNextSalaryMinor: number | null;
  currency: string;
}) {
  const rows: { icon: React.ReactNode; label: string; date: Date; amountMinor: number; positive: boolean }[] = [];
  if (nextSalary) {
    rows.push({
      icon: <TrendingUp className="h-3.5 w-3.5 text-positive" />,
      label: `Next salary · ${nextSalary.name}`,
      date: nextSalary.date,
      amountMinor: nextSalary.amountMinor,
      positive: true,
    });
  }
  if (nextCardDue) {
    rows.push({
      icon: <CreditCard className="h-3.5 w-3.5 text-[#7c3aed]" />,
      label: `Next credit card due · ${nextCardDue.cardName}`,
      date: nextCardDue.date,
      amountMinor: nextCardDue.amountMinor,
      positive: false,
    });
  }
  if (nextCheque) {
    rows.push({
      icon: <FileText className="h-3.5 w-3.5 text-muted-foreground" />,
      label:
        nextCheque.direction === "issued"
          ? `Next cheque payable · ${nextCheque.counterparty}`
          : `Next cheque receivable · ${nextCheque.counterparty}`,
      date: nextCheque.date,
      amountMinor: nextCheque.amountMinor,
      positive: nextCheque.direction === "received",
    });
  }
  if (nextProvision) {
    rows.push({
      icon: <Target className="h-3.5 w-3.5 text-warning" />,
      label: `Next provision due · ${nextProvision.name}`,
      date: nextProvision.date,
      amountMinor: nextProvision.amountMinor,
      positive: false,
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" /> Free savings pool
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div>
          <Money minor={poolMinor} currency={currency} colored className="text-3xl font-bold" />
          <p className="mt-1 text-xs text-muted-foreground">
            As of {format(new Date(), "d MMM yyyy")} — only changes when a confirmed salary closes a cycle.
          </p>
        </div>

        {rows.length > 0 ? (
          <ul className="space-y-2 border-t pt-3">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  {r.icon}
                  <span className="truncate">
                    {r.label} · {format(r.date, "d MMM")}
                  </span>
                </span>
                <Money minor={r.amountMinor} currency={currency} className="shrink-0 font-medium" colored={r.positive} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Nothing upcoming yet — add a salary, cards, cheques or provisions to see what&apos;s next.
          </p>
        )}

        {nextSalary && provisionalPoolAtNextSalaryMinor != null && (
          <div className="rounded-lg bg-primary/10 px-3 py-2.5 text-sm">
            <div className="text-xs text-muted-foreground">
              Provisional pool at next salary ({format(nextSalary.date, "d MMM")})
            </div>
            <Money
              minor={provisionalPoolAtNextSalaryMinor}
              currency={currency}
              colored
              className="text-lg font-semibold"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

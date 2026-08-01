import { format } from "date-fns";
import { Wallet, TrendingUp, CreditCard, FileText, Target, AlertTriangle, ShieldCheck } from "lucide-react";
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
  poolDryDate,
  poolDryAmountMinor,
  currency,
}: {
  poolMinor: number;
  nextSalary: NextSalary | null;
  nextCardDue: NextCardDue | null;
  nextCheque: NextCheque | null;
  nextProvision: NextProvision | null;
  provisionalPoolAtNextSalaryMinor: number | null;
  poolDryDate: Date | null;
  poolDryAmountMinor: number | null;
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

        {poolDryDate ? (
          <div className="flex items-start gap-2 rounded-lg border border-negative/30 bg-negative/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
            <div className="text-xs">
              <div className="font-medium text-negative">Pool projected to run dry</div>
              <p className="mt-0.5 text-muted-foreground">
                If everything known lands as expected, your free savings goes negative around{" "}
                <span className="font-medium text-foreground">{format(poolDryDate, "d MMM yyyy")}</span>
                {poolDryAmountMinor != null && (
                  <>
                    {" "}
                    (<Money minor={poolDryAmountMinor} currency={currency} showCurrency={false} />)
                  </>
                )}
                .
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-positive/25 bg-positive/10 px-3 py-2 text-xs text-positive">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Projected to stay positive for the next 2 years.
          </div>
        )}

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

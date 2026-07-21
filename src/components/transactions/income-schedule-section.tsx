"use client";

import * as React from "react";
import { format } from "date-fns";
import { BadgeDollarSign, CalendarClock, Check, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Money } from "@/components/money";
import { SectionTitle, EmptyState } from "@/components/shared";
import { Field } from "@/components/forms/field";
import { Pager, usePagination } from "@/components/ui/pagination";
import { useConfirm } from "@/components/confirm";
import { debitRecurringOccurrence, undoRecurringOccurrence } from "@/server/actions";
import type { IncomeOccurrence } from "@/server/queries";
import { formatMoney } from "@/lib/money";

export function IncomeScheduleSection({ occurrences }: { occurrences: IncomeOccurrence[] }) {
  const [, startTransition] = React.useTransition();
  const [target, setTarget] = React.useState<IncomeOccurrence | null>(null);
  const [amount, setAmount] = React.useState("");
  const confirm = useConfirm();
  const { page, setPage, pageCount, pageItems } = usePagination(occurrences, 8);

  const readyCount = occurrences.filter((o) => o.debitable).length;

  function openDebit(occ: IncomeOccurrence) {
    setTarget(occ);
    setAmount((occ.defaultAmountMinor / 100).toString());
  }

  function submitDebit() {
    if (!target) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    const occ = target;
    setTarget(null);
    startTransition(async () => {
      const res = await debitRecurringOccurrence({ ruleId: occ.ruleId, date: occ.date, amount: value });
      if (res.ok) toast.success(`Debited to ${occ.accountName || "account"}`);
      else toast.error(res.error ?? "Failed");
    });
  }

  function undo(occ: IncomeOccurrence) {
    startTransition(async () => {
      const ok = await confirm({
        title: "Undo this debit?",
        description: `Removes the ${formatMoney(occ.postedAmountMinor ?? occ.defaultAmountMinor, occ.currency)} deposited into ${occ.accountName || "the account"} on ${format(occ.date, "d MMM yyyy")}.`,
        confirmLabel: "Undo debit",
        tone: "destructive",
      });
      if (!ok) return;
      const res = await undoRecurringOccurrence({ ruleId: occ.ruleId, date: occ.date });
      if (res.ok) toast.success("Debit reversed");
      else toast.error(res.error ?? "Failed");
    });
  }

  return (
    <div>
      <SectionTitle
        action={
          readyCount > 0 ? (
            <Badge variant="neutral" className="gap-1">
              <BadgeDollarSign className="h-3.5 w-3.5" /> {readyCount} ready to debit
            </Badge>
          ) : undefined
        }
      >
        Income schedule
      </SectionTitle>

      {occurrences.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-6 w-6" />}
          title="No scheduled income"
          description="Add a recurring income rule (like your salary) and each expected pay date shows up here, ready to debit into its account when it lands."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {pageItems.map((occ) => (
                <li key={occ.key} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: occ.color }}
                  >
                    {occ.ruleName.charAt(0) || "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{occ.ruleName}</div>
                    <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <Wallet className="h-3 w-3 shrink-0" />
                      <span className="truncate">{occ.accountName}</span>
                      <span aria-hidden>·</span>
                      <span className="shrink-0 tabular">{format(occ.date, "d MMM yyyy")}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <Money
                      minor={occ.debited ? occ.postedAmountMinor ?? occ.defaultAmountMinor : occ.defaultAmountMinor}
                      currency={occ.currency}
                      className="text-sm font-semibold"
                    />
                    {occ.debited ? (
                      <button
                        onClick={() => undo(occ)}
                        className="flex items-center gap-1 text-[11px] text-positive transition-colors hover:text-foreground"
                      >
                        <Check className="h-3 w-3" /> Debited
                        <Undo2 className="ml-0.5 h-3 w-3 opacity-70" />
                      </button>
                    ) : occ.debitable ? (
                      <Button size="sm" className="h-7 gap-1 px-2.5" onClick={() => openDebit(occ)}>
                        <BadgeDollarSign className="h-3.5 w-3.5" /> Debit
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Upcoming</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-3 pb-2">
              <Pager page={page} pageCount={pageCount} onPage={setPage} />
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={target != null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Debit income</DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Deposit <span className="font-medium text-foreground">{target.ruleName}</span> for{" "}
                <span className="tabular">{format(target.date, "d MMM yyyy")}</span> into{" "}
                <span className="font-medium text-foreground">{target.accountName || "its account"}</span>. Adjust the
                amount if what landed differs.
              </p>
              <Field label="Amount" hint={target.currency}>
                <Input
                  autoFocus
                  inputMode="decimal"
                  className="tabular"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitDebit();
                    }
                  }}
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitDebit}>Debit to account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

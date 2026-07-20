"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CreditCard, Wallet, Plus, ArrowDownToLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { Money } from "@/components/money";
import { TransactionForm } from "@/components/forms/transaction-form";
import { recordCreditCardPayment } from "@/server/actions";
import { cn } from "@/lib/utils";
import type { TxRow } from "./transactions-view";
import type { AccountLite, CategoryLite } from "@/lib/view-types";

function CostList({ rows, empty }: { rows: TxRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="divide-y">
      {rows.slice(0, 8).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {r.note || r.category?.name || "Cost"}
            </div>
            <div className="text-xs text-muted-foreground">
              {format(r.date, "d MMM")}
              {r.account?.name ? ` · ${r.account.name}` : ""}
            </div>
          </div>
          <Money minor={r.amountMinor} currency={r.currency} className="text-sm font-semibold" />
        </li>
      ))}
    </ul>
  );
}

// ── Credit card ───────────────────────────────────────────────────────────────

export interface CardStatementLite {
  statementDate: Date;
  paymentDueDate: Date;
  totalAmountDueMinor: number;
}

export interface CreditCardLite {
  id: string;
  name: string;
  owedMinor: number;
  limitMinor?: number | null;
  dueDay?: number | null;
  /** Current issued statement first, then future cycles (recurring charges). */
  statements: CardStatementLite[];
}

export function CreditCardSection({
  rows,
  cards,
  currency,
  assetAccounts,
  categories,
}: {
  rows: TxRow[];
  cards: CreditCardLite[];
  currency: string;
  assetAccounts: AccountLite[];
  categories: CategoryLite[];
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const owedMinor = cards.reduce((s, c) => s + c.owedMinor, 0);
  // Total Amount Due this cycle: the sum of each card's current (issued but
  // unpaid) statement bill — index 0 of its upcoming statements.
  const dueMinor = cards.reduce((s, c) => s + (c.statements[0]?.totalAmountDueMinor ?? 0), 0);
  const hasStatements = cards.some((c) => c.statements.length > 0);
  const monthTotal = rows
    .filter((r) => new Date(r.date).getMonth() === new Date().getMonth())
    .reduce((s, r) => s + r.amountMinor, 0);

  return (
    <Card className="border-l-4" style={{ borderLeftColor: "#7c3aed" }}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4 text-[#7c3aed]" /> Credit cards
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPayOpen(true)} disabled={owedMinor <= 0}>
            <ArrowDownToLine className="h-4 w-4" /> Record payment
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add cost
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/50 px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Total owed{cards.length > 1 ? ` · ${cards.length} cards` : ""}
            </div>
            <Money
              minor={owedMinor}
              currency={currency}
              className="text-2xl font-bold text-[#7c3aed]"
            />
            <div className="mt-0.5 text-xs text-muted-foreground">
              Added this month <Money minor={monthTotal} currency={currency} showCurrency={false} />
            </div>
          </div>
          <div className="rounded-lg border border-[#7c3aed]/25 bg-[#7c3aed]/5 px-4 py-3">
            <div className="text-xs text-muted-foreground">Total amount due (this cycle)</div>
            <Money minor={dueMinor} currency={currency} className="text-2xl font-bold" />
            <div className="mt-0.5 text-xs text-muted-foreground">
              {hasStatements ? "Current issued statements" : "Set due days to bill statements"}
            </div>
          </div>
        </div>

        {/* Per-card breakdown: owed + available credit, then the current statement. */}
        <ul className="mb-3 space-y-2.5">
          {cards.map((c) => {
            const available = c.limitMinor != null ? Math.max(0, c.limitMinor - c.owedMinor) : null;
            const overLimit = c.limitMinor != null && c.owedMinor > c.limitMinor;
            const current = c.statements[0];
            // Upcoming cycles carrying a projected charge (recurring costs).
            const upcoming = c.statements.slice(1).filter((s) => s.totalAmountDueMinor > 0);
            return (
              <li key={c.id} className="rounded-lg border bg-card/60 px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{c.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {c.limitMinor != null && (
                      <span className={cn("text-xs", overLimit ? "text-negative" : "text-muted-foreground")}>
                        {overLimit ? (
                          "over limit"
                        ) : (
                          <>
                            <Money minor={available ?? 0} currency={currency} showCurrency={false} /> left
                          </>
                        )}
                      </span>
                    )}
                    <Money minor={c.owedMinor} currency={currency} className="font-semibold" />
                  </span>
                </div>
                {current ? (
                  <>
                    <div className="mt-1.5 flex items-end justify-between gap-3 rounded-md bg-muted/40 px-2.5 py-1.5">
                      <div className="text-xs text-muted-foreground">
                        <div className="font-medium text-foreground">Total amount due</div>
                        <div>
                          Statement {format(new Date(current.statementDate), "d MMM")} · pay by{" "}
                          {format(new Date(current.paymentDueDate), "d MMM")}
                        </div>
                      </div>
                      <Money
                        minor={current.totalAmountDueMinor}
                        currency={currency}
                        className="text-base font-semibold text-[#7c3aed]"
                      />
                    </div>
                    {upcoming.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {upcoming.slice(0, 3).map((s) => (
                          <li
                            key={s.paymentDueDate.getTime()}
                            className="flex items-center justify-between gap-3 px-2.5 text-xs text-muted-foreground"
                          >
                            <span>
                              Next · statement {format(new Date(s.statementDate), "d MMM")} · pay by{" "}
                              {format(new Date(s.paymentDueDate), "d MMM")}
                            </span>
                            <Money
                              minor={s.totalAmountDueMinor}
                              currency={currency}
                              showCurrency={false}
                              className="font-medium text-foreground"
                            />
                          </li>
                        ))}
                        {upcoming.length > 3 && (
                          <li className="px-2.5 text-xs text-muted-foreground">
                            +{upcoming.length - 3} more upcoming cycles
                          </li>
                        )}
                      </ul>
                    )}
                  </>
                ) : (
                  c.dueDay == null && (
                    <div className="mt-1 text-xs text-warning">
                      Set a payment due day (edit the card) to schedule its bill.
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>

        <CostList rows={rows} empty="No credit-card costs yet. Add one — it accumulates as debt." />
      </CardContent>

      {/* Add credit-card cost */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add credit-card cost</DialogTitle>
            <DialogDescription>
              This adds to your credit-card balance owed. It won&apos;t touch a cash account.
            </DialogDescription>
          </DialogHeader>
          <TransactionForm
            accounts={[...assetAccounts, ...cards.map(toAccountLite)]}
            categories={categories}
            defaultType="expense"
            defaultMethod="credit_card"
            onDone={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Record payment */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record credit-card payment</DialogTitle>
            <DialogDescription>
              Move money from a funding account to pay down the {formatMoney(owedMinor, currency)}{" "}
              owed.
            </DialogDescription>
          </DialogHeader>
          <PaymentForm
            accounts={assetAccounts}
            cards={cards}
            currency={currency}
            onDone={() => setPayOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Cards are Accounts underneath; the form takes AccountLite. */
function toAccountLite(c: CreditCardLite): AccountLite {
  return { id: c.id, name: c.name, type: "credit_card", currency: "AED", color: "#7c3aed" };
}

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function PaymentForm({
  accounts,
  cards,
  currency,
  onDone,
}: {
  accounts: AccountLite[];
  cards: CreditCardLite[];
  currency: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [fromAccountId, setFromAccountId] = React.useState(accounts[0]?.id ?? "");
  // Default to the card carrying the most debt — the one you'd usually pay.
  const defaultCard = [...cards].sort((a, b) => b.owedMinor - a.owedMinor)[0];
  const [cardId, setCardId] = React.useState(defaultCard?.id ?? "");
  const selectedCard = cards.find((c) => c.id === cardId) ?? defaultCard;
  const [amount, setAmount] = React.useState(String((defaultCard?.owedMinor ?? 0) / 100));

  // Paying more than is owed would push the card into credit — clamp the hint.
  const value = Number(amount.replace(/,/g, ""));
  const overpay =
    Number.isFinite(value) && selectedCard ? value * 100 > selectedCard.owedMinor : false;

  function chooseCard(id: string) {
    setCardId(id);
    const card = cards.find((c) => c.id === id);
    if (card) setAmount(String(card.owedMinor / 100));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await recordCreditCardPayment({ fromAccountId, cardId, amount, currency });
      if (res.ok) {
        toast.success("Payment recorded");
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {cards.length > 1 && (
        <Field label="Card to pay">
          <Select value={cardId} onValueChange={chooseCard}>
            <SelectTrigger>
              <SelectValue placeholder="Choose card" />
            </SelectTrigger>
            <SelectContent>
              {cards.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} — {formatMoney(c.owedMinor, currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field label="From account">
        <Select value={fromAccountId} onValueChange={setFromAccountId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        label="Amount"
        hint={currency}
        error={overpay ? "More than this card owes — it'll go into credit." : undefined}
      >
        <Input
          inputMode="decimal"
          className="tabular text-lg"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !fromAccountId || !(value > 0)}>
          {pending ? "Saving…" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}

// ── Debit card ────────────────────────────────────────────────────────────────

export function DebitCardSection({
  rows,
  currency,
  accounts,
  categories,
}: {
  rows: TxRow[];
  currency: string;
  accounts: AccountLite[];
  categories: CategoryLite[];
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const monthTotal = rows
    .filter((r) => new Date(r.date).getMonth() === new Date().getMonth())
    .reduce((s, r) => s + r.amountMinor, 0);

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" /> Debit card usage
        </CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add spend
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-3 flex items-end justify-between rounded-lg bg-muted/50 px-4 py-3">
          <div>
            <div className="text-xs text-muted-foreground">Spent this month</div>
            <Money minor={monthTotal} currency={currency} className="text-2xl font-bold" />
          </div>
          <div className="text-right text-xs text-muted-foreground">
            Drawn from your linked accounts
          </div>
        </div>
        <CostList rows={rows} empty="No debit-card spend recorded yet." />
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add debit-card spend</DialogTitle>
            <DialogDescription>
              Choose the account your debit card is linked to. It draws down that balance.
            </DialogDescription>
          </DialogHeader>
          <TransactionForm
            accounts={accounts}
            categories={categories}
            defaultType="expense"
            defaultMethod="debit_card"
            onDone={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

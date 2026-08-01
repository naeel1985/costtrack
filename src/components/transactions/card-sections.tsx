"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CreditCard, Wallet, Plus, ArrowDownToLine, Receipt } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Pager, usePagination } from "@/components/ui/pagination";
import { Money } from "@/components/money";
import { TransactionForm } from "@/components/forms/transaction-form";
import { recordCreditCardPayment } from "@/server/actions";
import { cn } from "@/lib/utils";
import type { TxRow } from "./transactions-view";
import type { AccountLite, CategoryLite } from "@/lib/view-types";

function CostList({ rows, empty }: { rows: TxRow[]; empty: string }) {
  const { page, setPage, pageCount, pageItems } = usePagination(rows, 6);
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <>
      <ul className="divide-y">
        {pageItems.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                <span className="truncate">{r.note || r.category?.name || "Cost"}</span>
                {r.isRecurring && (
                  <Badge variant="neutral" className="shrink-0 px-1.5 py-0 text-[10px]">
                    recurring
                  </Badge>
                )}
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
      <Pager page={page} pageCount={pageCount} onPage={setPage} />
    </>
  );
}

/** Itemized breakdown behind a clicked statement total — a due bill or the
 *  currently-accumulating one. */
function StatementDetailsDialog({
  detail,
  currency,
  onClose,
  onPay,
}: {
  detail: { title: string; cardId: string; cardName: string; statement: CardStatementLite } | null;
  currency: string;
  onClose: () => void;
  onPay: (preset: { cardId: string; amountMinor: number }) => void;
}) {
  return (
    <Dialog open={detail != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {detail && (
          <>
            <DialogHeader>
              <DialogTitle>
                {detail.title} · {detail.cardName}
              </DialogTitle>
              <DialogDescription>
                Statement {format(detail.statement.statementDate, "d MMM yyyy")} · pay by{" "}
                {format(detail.statement.paymentDueDate, "d MMM yyyy")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <span className="text-sm text-muted-foreground">Total</span>
              <Money minor={detail.statement.totalAmountDueMinor} currency={currency} className="text-lg font-bold" />
            </div>
            {detail.statement.items.length > 0 ? (
              <ul className="max-h-[320px] divide-y overflow-y-auto">
                {detail.statement.items.map((item, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate font-medium">
                        <span className="truncate">{item.label}</span>
                        {item.recurring && (
                          <Badge variant="neutral" className="shrink-0 px-1.5 py-0 text-[10px]">
                            recurring
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{format(item.date, "d MMM yyyy")}</div>
                    </div>
                    <Money minor={item.amountMinor} currency={currency} className="shrink-0 font-medium" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No line items registered for this statement yet.
              </p>
            )}
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                disabled={detail.statement.totalAmountDueMinor <= 0}
                onClick={() => {
                  onPay({ cardId: detail.cardId, amountMinor: detail.statement.totalAmountDueMinor });
                  onClose();
                }}
              >
                <ArrowDownToLine className="h-4 w-4" /> Record payment
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** "Total owed" breakdown across all cards, with a per-card shortcut into payment. */
function TotalOwedDialog({
  open,
  onClose,
  cards,
  currency,
  onPay,
}: {
  open: boolean;
  onClose: () => void;
  cards: CreditCardLite[];
  currency: string;
  onPay: (preset: { cardId: string; amountMinor: number }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Total owed</DialogTitle>
          <DialogDescription>What each card owes right now, and what&apos;s due this cycle.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y">
          {cards.map((c) => {
            const dueThisCycle = c.statements[0]?.totalAmountDueMinor ?? c.owedMinor;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Due this cycle <Money minor={dueThisCycle} currency={currency} showCurrency={false} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Money minor={c.owedMinor} currency={currency} className="font-semibold" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={c.owedMinor <= 0}
                    onClick={() => {
                      onPay({ cardId: c.id, amountMinor: dueThisCycle });
                      onClose();
                    }}
                  >
                    Pay
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// ── Credit card ───────────────────────────────────────────────────────────────

export interface StatementItem {
  date: Date;
  amountMinor: number;
  label: string;
  recurring: boolean;
}

export interface CardStatementLite {
  statementDate: Date;
  paymentDueDate: Date;
  totalAmountDueMinor: number;
  /** The charges that sum to totalAmountDueMinor — shown in the details popup. */
  items: StatementItem[];
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
  const [payPreset, setPayPreset] = React.useState<{ cardId: string; amountMinor: number } | null>(null);
  const [detail, setDetail] = React.useState<{
    title: string;
    cardId: string;
    cardName: string;
    statement: CardStatementLite;
  } | null>(null);
  const [owedOpen, setOwedOpen] = React.useState(false);

  function openPay(preset: { cardId: string; amountMinor: number } | null) {
    setPayPreset(preset);
    setPayOpen(true);
  }

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
          <Button size="sm" variant="outline" onClick={() => openPay(null)} disabled={owedMinor <= 0}>
            <ArrowDownToLine className="h-4 w-4" /> Record payment
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add cost
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setOwedOpen(true)}
            disabled={cards.length === 0}
            className="rounded-lg bg-muted/50 px-4 py-3 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-muted/50"
          >
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
          </button>
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
                    <button
                      type="button"
                      onClick={() =>
                        setDetail({ title: "Total amount due", cardId: c.id, cardName: c.name, statement: current })
                      }
                      className="mt-1.5 flex w-full items-end justify-between gap-3 rounded-md bg-muted/40 px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
                    >
                      <div className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1 font-medium text-foreground">
                          Total amount due <Receipt className="h-3 w-3 opacity-60" />
                        </div>
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
                    </button>
                    {upcoming.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {upcoming.slice(0, 3).map((s, i) => (
                          <li key={s.paymentDueDate.getTime()}>
                            <button
                              type="button"
                              onClick={() =>
                                setDetail({
                                  title: i === 0 ? "Accumulating this cycle" : "Upcoming cycle",
                                  cardId: c.id,
                                  cardName: c.name,
                                  statement: s,
                                })
                              }
                              className="flex w-full items-center justify-between gap-3 rounded px-2.5 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60"
                            >
                              <span>
                                {i === 0 ? "Accumulating" : "Next"} · statement{" "}
                                {format(new Date(s.statementDate), "d MMM")} · pay by{" "}
                                {format(new Date(s.paymentDueDate), "d MMM")}
                              </span>
                              <Money
                                minor={s.totalAmountDueMinor}
                                currency={currency}
                                showCurrency={false}
                                className="font-medium text-foreground"
                              />
                            </button>
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
      <Dialog
        open={payOpen}
        onOpenChange={(o) => {
          setPayOpen(o);
          if (!o) setPayPreset(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record credit-card payment</DialogTitle>
            <DialogDescription>
              Move money from a funding account — your free-savings pool — to pay down the card.
            </DialogDescription>
          </DialogHeader>
          <PaymentForm
            accounts={assetAccounts}
            cards={cards}
            currency={currency}
            initialCardId={payPreset?.cardId}
            initialAmountMinor={payPreset?.amountMinor}
            onDone={() => setPayOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <StatementDetailsDialog detail={detail} currency={currency} onClose={() => setDetail(null)} onPay={openPay} />
      <TotalOwedDialog open={owedOpen} onClose={() => setOwedOpen(false)} cards={cards} currency={currency} onPay={openPay} />
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
  initialCardId,
  initialAmountMinor,
}: {
  accounts: AccountLite[];
  cards: CreditCardLite[];
  currency: string;
  onDone: () => void;
  /** Pre-target a specific card — e.g. clicked in from a statement popup. */
  initialCardId?: string;
  /** Pre-fill the amount — e.g. that statement's total, current or upcoming cycle. */
  initialAmountMinor?: number;
}) {
  const [pending, startTransition] = React.useTransition();
  const [fromAccountId, setFromAccountId] = React.useState(accounts[0]?.id ?? "");
  // Preset card wins; otherwise default to the card carrying the most debt.
  const defaultCard =
    (initialCardId ? cards.find((c) => c.id === initialCardId) : undefined) ??
    [...cards].sort((a, b) => b.owedMinor - a.owedMinor)[0];
  const [cardId, setCardId] = React.useState(defaultCard?.id ?? "");
  const selectedCard = cards.find((c) => c.id === cardId) ?? defaultCard;
  // This cycle's total amount due, not the card's full (possibly multi-cycle) balance.
  const dueThisCycle = (card: CreditCardLite | undefined) => card?.statements[0]?.totalAmountDueMinor ?? card?.owedMinor ?? 0;
  const [amount, setAmount] = React.useState(String((initialAmountMinor ?? dueThisCycle(defaultCard)) / 100));

  // Paying more than the full balance owed would push the card into credit —
  // paying more than just this cycle (to also cover an upcoming one) is fine.
  const value = Number(amount.replace(/,/g, ""));
  const overpay =
    Number.isFinite(value) && selectedCard ? value * 100 > selectedCard.owedMinor : false;

  function chooseCard(id: string) {
    setCardId(id);
    const card = cards.find((c) => c.id === id);
    setAmount(String(dueThisCycle(card) / 100));
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

export interface DebitCycleLite {
  cycleStart: Date;
  spentSinceCycleMinor: number;
  nextSalaryDate: Date | null;
  provisionedUntilNextSalaryMinor: number;
}

export function DebitCardSection({
  rows,
  currency,
  accounts,
  categories,
  cycle,
}: {
  rows: TxRow[];
  currency: string;
  accounts: AccountLite[];
  categories: CategoryLite[];
  /** Null on pages that don't load it (e.g. the income view never renders this section). */
  cycle: DebitCycleLite | null;
}) {
  const [addOpen, setAddOpen] = React.useState(false);

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
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/50 px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Spent since {cycle ? format(cycle.cycleStart, "d MMM") : "last cycle"}
            </div>
            <Money minor={cycle?.spentSinceCycleMinor ?? 0} currency={currency} className="text-2xl font-bold" />
            <div className="mt-0.5 text-xs text-muted-foreground">Since the last confirmed salary</div>
          </div>
          <div className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Provisioned{cycle?.nextSalaryDate ? ` until ${format(cycle.nextSalaryDate, "d MMM")}` : " (next 30 days)"}
            </div>
            <Money
              minor={cycle?.provisionedUntilNextSalaryMinor ?? 0}
              currency={currency}
              className="text-2xl font-bold"
            />
            <div className="mt-0.5 text-xs text-muted-foreground">
              {cycle?.nextSalaryDate ? "Recurring + scheduled, until next salary" : "No salary configured yet"}
            </div>
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

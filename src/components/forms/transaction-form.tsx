"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "./field";
import { cn } from "@/lib/utils";
import { saveRecurring, saveTransaction } from "@/server/actions";
import {
  EXPENSE_METHOD_LABELS,
  type ExpenseMethod,
  type RecurrenceFrequency,
  type TransactionType,
} from "@/lib/domain";
import type { AccountLite, CategoryLite } from "@/lib/view-types";

type RepeatMode = "one_time" | "recurring";

interface FormValues {
  type: TransactionType;
  method: ExpenseMethod;
  amount: string;
  date: string;
  accountId: string;
  transferAccountId: string;
  categoryId: string;
  note: string;
  tags: string;
  repeat: RepeatMode;
  frequency: RecurrenceFrequency;
  occurrenceCount: string;
}

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: "week",
  monthly: "month",
  yearly: "year",
  custom: "period",
};

export interface TransactionInitial {
  id?: string;
  type?: TransactionType;
  method?: ExpenseMethod;
  amountMinor?: number;
  date?: Date;
  accountId?: string;
  transferAccountId?: string | null;
  categoryId?: string | null;
  note?: string | null;
  tagList?: string[];
}

const TYPES: { value: TransactionType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

const METHODS: { value: ExpenseMethod; label: string }[] = [
  { value: "account", label: EXPENSE_METHOD_LABELS.account },
  { value: "debit_card", label: EXPENSE_METHOD_LABELS.debit_card },
  { value: "credit_card", label: EXPENSE_METHOD_LABELS.credit_card },
];

export function TransactionForm({
  accounts,
  categories,
  initial,
  defaultType = "expense",
  defaultMethod = "account",
  onDone,
}: {
  accounts: AccountLite[];
  categories: CategoryLite[];
  initial?: TransactionInitial;
  defaultType?: TransactionType;
  defaultMethod?: ExpenseMethod;
  onDone?: () => void;
}) {
  const [pending, startTransition] = React.useTransition();

  // Cards are liabilities, not spendable accounts: they're only ever offered in
  // the credit-card picker, never as a cash/debit/transfer account.
  const creditCards = accounts.filter((a) => a.type === "credit_card");
  const assetAccounts = accounts.filter((a) => a.type !== "credit_card" && !a.isSystem);

  const startMethod = initial?.method ?? defaultMethod;
  const startsOnCard = (initial?.type ?? defaultType) === "expense" && startMethod === "credit_card";
  const defaultAccountId =
    initial?.accountId ?? (startsOnCard ? creditCards[0]?.id : assetAccounts[0]?.id) ?? "";

  const { register, handleSubmit, watch, setValue, formState } = useForm<FormValues>({
    defaultValues: {
      type: initial?.type ?? defaultType,
      method: startMethod,
      amount: initial?.amountMinor != null ? String(initial.amountMinor / 100) : "",
      date: format(initial?.date ?? new Date(), "yyyy-MM-dd"),
      accountId: defaultAccountId,
      transferAccountId: initial?.transferAccountId ?? "",
      categoryId: initial?.categoryId ?? "",
      note: initial?.note ?? "",
      tags: initial?.tagList?.join(", ") ?? "",
      repeat: "one_time",
      frequency: "monthly",
      occurrenceCount: "",
    },
  });

  const type = watch("type");
  const method = watch("method");
  const repeat = watch("repeat");
  const frequency = watch("frequency");
  const isCreditCard = type === "expense" && method === "credit_card";
  const pickableAccounts = isCreditCard ? creditCards : assetAccounts;
  // Recurring is offered for income and expenses (incl. credit-card costs), and
  // never when editing an existing one-off, or for transfers.
  const canRepeat = !initial?.id && type !== "transfer";
  const isRecurring = canRepeat && repeat === "recurring";

  const accountId = watch("accountId");
  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? "AED";
  const relevantCategories = categories.filter((c) =>
    type === "income" ? c.kind === "income" : c.kind === "expense",
  );

  /**
   * Switching method switches which pool the account field draws from, so
   * repoint it — otherwise a card cost could keep pointing at a bank account.
   */
  function chooseMethod(next: ExpenseMethod) {
    setValue("method", next);
    const pool = next === "credit_card" ? creditCards : assetAccounts;
    if (!pool.some((a) => a.id === accountId)) setValue("accountId", pool[0]?.id ?? "");
  }

  function submit(values: FormValues) {
    startTransition(async () => {
      // Recurring income / cost → a rule (repeats each period, optionally for a
      // fixed number of cycles). Credit-card recurring costs need a real card.
      if (canRepeat && values.repeat === "recurring") {
        if (values.type === "expense" && values.method === "credit_card" && !values.accountId) {
          toast.error("Add a credit card first (Accounts page) to set a recurring card cost.");
          return;
        }
        const catName = categories.find((c) => c.id === values.categoryId)?.name;
        const name =
          (values.note || catName || (values.type === "income" ? "Recurring income" : "Recurring cost"))
            .slice(0, 80);
        const res = await saveRecurring({
          type: values.type,
          name,
          frequency: values.frequency,
          interval: 1,
          startDate: values.date,
          occurrenceCount: values.occurrenceCount ? Number(values.occurrenceCount) : null,
          amount: values.amount,
          currency,
          accountId: values.accountId,
          categoryId: values.categoryId || null,
          note: values.note || null,
        });
        if (res.ok) {
          toast.success("Recurring item added");
          onDone?.();
        } else {
          toast.error(res.error);
        }
        return;
      }

      const res = await saveTransaction({
        id: initial?.id,
        type: values.type,
        method: values.type === "expense" ? values.method : "account",
        amount: values.amount,
        currency,
        date: values.date,
        // Empty is only legal for a credit-card cost — the server then resolves
        // (or creates) the user's default card.
        accountId: values.accountId || null,
        transferAccountId: values.transferAccountId || null,
        categoryId: values.categoryId || null,
        note: values.note || null,
        tags: values.tags
          ? values.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
      });
      if (res.ok) {
        toast.success(initial?.id ? "Transaction updated" : "Transaction added");
        onDone?.();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      {/* Type segmented control */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setValue("type", t.value)}
            className={cn(
              "rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
              type === t.value
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Payment method — expenses only */}
      {type === "expense" && (
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => chooseMethod(m.value)}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                method === m.value
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor="amount" hint={currency} error={formState.errors.amount?.message}>
          <Input
            id="amount"
            inputMode="decimal"
            placeholder="0.00"
            className="tabular text-lg"
            autoFocus
            {...register("amount", { required: "Required", pattern: { value: /^[0-9.,]+$/, message: "Numbers only" } })}
          />
        </Field>
        <Field label="Date" htmlFor="date">
          <Input id="date" type="date" {...register("date", { required: true })} />
        </Field>
      </div>

      {isCreditCard && creditCards.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          A <span className="font-medium text-foreground">Credit Card</span> will be created for
          this cost. Add more cards any time from the Accounts page.
        </div>
      ) : (
        <Field
          label={
            type === "transfer"
              ? "From account"
              : isCreditCard
                ? "Credit card"
                : method === "debit_card"
                  ? "Linked account"
                  : "Account"
          }
          error={formState.errors.accountId?.message}
        >
          <Select value={accountId} onValueChange={(v) => setValue("accountId", v)}>
            <SelectTrigger>
              <SelectValue placeholder={isCreditCard ? "Choose card" : "Choose account"} />
            </SelectTrigger>
            <SelectContent>
              {pickableAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {isCreditCard && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Adds to the card&apos;s balance owed — repaid from cash/debit card on the card&apos;s due date,
          which is when it reaches your free savings.
        </p>
      )}

      {type === "transfer" ? (
        <Field label="To account">
          <Select
            value={watch("transferAccountId")}
            onValueChange={(v) => setValue("transferAccountId", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose destination" />
            </SelectTrigger>
            <SelectContent>
              {pickableAccounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <Field label="Category">
          <Select value={watch("categoryId")} onValueChange={(v) => setValue("categoryId", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Uncategorised" />
            </SelectTrigger>
            <SelectContent>
              {relevantCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field label="Note" htmlFor="note">
        <Input id="note" placeholder="What was it for?" {...register("note")} />
      </Field>

      {!isRecurring && (
        <Field label="Tags" htmlFor="tags" hint="comma separated">
          <Input id="tags" placeholder="weekly, work" {...register("tags")} />
        </Field>
      )}

      {/* One-time vs recurring — income and costs (incl. credit-card) */}
      {canRepeat && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(["one_time", "recurring"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setValue("repeat", m)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                  repeat === m
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "one_time" ? "One-time" : "Recurring"}
              </button>
            ))}
          </div>

          {isRecurring && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Repeats every">
                <Select value={frequency} onValueChange={(v) => setValue("frequency", v as RecurrenceFrequency)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Month</SelectItem>
                    <SelectItem value="weekly">Week</SelectItem>
                    <SelectItem value="yearly">Year</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label={isCreditCard ? "For how many cycles" : `For how many ${FREQUENCY_LABELS[frequency]}s`}
                hint="blank = ongoing"
              >
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 6"
                  className="tabular"
                  {...register("occurrenceCount")}
                />
              </Field>
            </div>
          )}

          {isRecurring && (
            <p className="text-xs text-muted-foreground">
              {isCreditCard
                ? `Charges the card ${FREQUENCY_LABELS[frequency]}ly; each charge is repaid on the card's due date.`
                : `Adds automatically every ${FREQUENCY_LABELS[frequency]} from the start date.`}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : initial?.id
              ? "Save changes"
              : isRecurring
                ? "Add recurring"
                : "Add transaction"}
        </Button>
      </div>
    </form>
  );
}

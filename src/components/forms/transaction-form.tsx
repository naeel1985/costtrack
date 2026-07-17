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
import { saveTransaction } from "@/server/actions";
import { EXPENSE_METHOD_LABELS, type ExpenseMethod, type TransactionType } from "@/lib/domain";
import type { AccountLite, CategoryLite } from "@/lib/view-types";

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
}

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
    },
  });

  const type = watch("type");
  const method = watch("method");
  const isCreditCard = type === "expense" && method === "credit_card";
  const pickableAccounts = isCreditCard ? creditCards : assetAccounts;

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
          Adds to the card&apos;s balance owed — no cash account is touched until you record a
          payment.
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

      <Field label="Tags" htmlFor="tags" hint="comma separated">
        <Input id="tags" placeholder="weekly, work" {...register("tags")} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial?.id ? "Save changes" : "Add transaction"}
        </Button>
      </div>
    </form>
  );
}

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
import type { TransactionType } from "@/lib/domain";
import type { AccountLite, CategoryLite } from "@/lib/view-types";

interface FormValues {
  type: TransactionType;
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

export function TransactionForm({
  accounts,
  categories,
  initial,
  defaultType = "expense",
  onDone,
}: {
  accounts: AccountLite[];
  categories: CategoryLite[];
  initial?: TransactionInitial;
  defaultType?: TransactionType;
  onDone?: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const { register, handleSubmit, watch, setValue, formState } = useForm<FormValues>({
    defaultValues: {
      type: initial?.type ?? defaultType,
      amount: initial?.amountMinor != null ? String(initial.amountMinor / 100) : "",
      date: format(initial?.date ?? new Date(), "yyyy-MM-dd"),
      accountId: initial?.accountId ?? accounts[0]?.id ?? "",
      transferAccountId: initial?.transferAccountId ?? "",
      categoryId: initial?.categoryId ?? "",
      note: initial?.note ?? "",
      tags: initial?.tagList?.join(", ") ?? "",
    },
  });

  const type = watch("type");
  const accountId = watch("accountId");
  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? "AED";
  const relevantCategories = categories.filter((c) =>
    type === "income" ? c.kind === "income" : c.kind === "expense",
  );

  function submit(values: FormValues) {
    startTransition(async () => {
      const res = await saveTransaction({
        id: initial?.id,
        type: values.type,
        amount: values.amount,
        currency,
        date: values.date,
        accountId: values.accountId,
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

      <Field label={type === "transfer" ? "From account" : "Account"} error={formState.errors.accountId?.message}>
        <Select value={accountId} onValueChange={(v) => setValue("accountId", v)}>
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
              {accounts
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

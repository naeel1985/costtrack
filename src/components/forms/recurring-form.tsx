"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { addMonths, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Field } from "./field";
import { saveRecurring } from "@/server/actions";
import { RECURRENCE_FREQUENCIES } from "@/lib/domain";
import { expandRecurrence } from "@/lib/projection";
import { formatMoney } from "@/lib/money";
import type { AccountLite, CategoryLite } from "@/lib/view-types";

interface FormValues {
  name: string;
  amount: string;
  accountId: string;
  categoryId: string;
  frequency: string;
  interval: string;
  startDate: string;
  endMode: "never" | "date" | "count";
  endDate: string;
  occurrenceCount: string;
  note: string;
  isSalary: boolean;
}

export interface RecurringInitial {
  id?: string;
  name?: string;
  amountMinor?: number;
  accountId?: string;
  categoryId?: string | null;
  frequency?: string;
  interval?: number;
  startDate?: Date;
  endDate?: Date | null;
  occurrenceCount?: number | null;
  note?: string | null;
  isSalary?: boolean;
}

export function RecurringForm({
  kind,
  accounts,
  categories,
  initial,
  onDone,
}: {
  kind: "income" | "expense";
  accounts: AccountLite[];
  categories: CategoryLite[];
  initial?: RecurringInitial;
  onDone?: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? "",
      amount: initial?.amountMinor != null ? String(initial.amountMinor / 100) : "",
      accountId: initial?.accountId ?? accounts[0]?.id ?? "",
      categoryId: initial?.categoryId ?? "",
      frequency: initial?.frequency ?? "monthly",
      interval: String(initial?.interval ?? 1),
      startDate: format(initial?.startDate ?? new Date(), "yyyy-MM-dd"),
      endMode: initial?.endDate ? "date" : initial?.occurrenceCount ? "count" : "never",
      endDate: format(initial?.endDate ?? addMonths(new Date(), 12), "yyyy-MM-dd"),
      occurrenceCount: String(initial?.occurrenceCount ?? 12),
      note: initial?.note ?? "",
      isSalary: initial?.isSalary ?? false,
    },
  });

  const values = watch();
  const account = accounts.find((a) => a.id === values.accountId);
  const currency = account?.currency ?? "AED";

  // Live preview of the next few occurrences.
  const preview = React.useMemo(() => {
    try {
      const start = new Date(values.startDate);
      if (Number.isNaN(start.getTime())) return [];
      return expandRecurrence(
        {
          frequency: values.frequency as never,
          interval: Number(values.interval) || 1,
          startDate: start,
          endDate: values.endMode === "date" ? new Date(values.endDate) : null,
          occurrenceCount: values.endMode === "count" ? Number(values.occurrenceCount) : null,
        },
        start,
        addMonths(start, 18),
      ).slice(0, 5);
    } catch {
      return [];
    }
  }, [values.startDate, values.frequency, values.interval, values.endMode, values.endDate, values.occurrenceCount]);

  function submit(v: FormValues) {
    startTransition(async () => {
      const res = await saveRecurring({
        id: initial?.id,
        name: v.name,
        type: kind,
        frequency: v.frequency,
        interval: Number(v.interval) || 1,
        startDate: v.startDate,
        endDate: v.endMode === "date" ? v.endDate : null,
        occurrenceCount: v.endMode === "count" ? Number(v.occurrenceCount) : null,
        amount: v.amount,
        currency,
        accountId: v.accountId,
        categoryId: v.categoryId || null,
        note: v.note || null,
        isSalary: kind === "income" ? v.isSalary : false,
      });
      if (res.ok) {
        toast.success(initial?.id ? "Recurring rule updated" : "Recurring rule created");
        onDone?.();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <Field label="Name" htmlFor="rname">
        <Input id="rname" placeholder={kind === "income" ? "Salary" : "Rent"} {...register("name", { required: true })} />
      </Field>

      {kind === "income" && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
          <div>
            <div className="text-sm font-medium">This is my salary</div>
            <p className="text-xs text-muted-foreground">
              Confirming a debit of this income closes a free-savings cycle. Only one rule can be marked as
              salary — marking this one unmarks any other.
            </p>
          </div>
          <Switch checked={values.isSalary} onCheckedChange={(v) => setValue("isSalary", v)} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" hint={currency}>
          <Input inputMode="decimal" placeholder="0.00" className="tabular" {...register("amount", { required: true })} />
        </Field>
        <Field label="Start date">
          <Input type="date" {...register("startDate", { required: true })} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Account">
          <Select value={values.accountId} onValueChange={(v) => setValue("accountId", v)}>
            <SelectTrigger>
              <SelectValue />
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
        <Field label="Category">
          <Select value={values.categoryId} onValueChange={(v) => setValue("categoryId", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequency">
          <Select value={values.frequency} onValueChange={(v) => setValue("frequency", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECURRENCE_FREQUENCIES.map((f) => (
                <SelectItem key={f} value={f} className="capitalize">
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Every" hint={values.frequency === "custom" ? "days" : `${values.frequency.replace("ly", "(s)")}`}>
          <Input type="number" min={1} className="tabular" {...register("interval")} />
        </Field>
      </div>

      <Field label="Ends">
        <div className="grid grid-cols-3 gap-2">
          {(["never", "date", "count"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setValue("endMode", m)}
              className={`rounded-md border px-2 py-1.5 text-sm capitalize transition-colors ${
                values.endMode === m ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              {m === "count" ? "After N" : m}
            </button>
          ))}
        </div>
      </Field>
      {values.endMode === "date" && (
        <Field label="End date">
          <Input type="date" {...register("endDate")} />
        </Field>
      )}
      {values.endMode === "count" && (
        <Field label="Number of occurrences">
          <Input type="number" min={1} className="tabular" {...register("occurrenceCount")} />
        </Field>
      )}

      {preview.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="mb-1.5 font-medium text-muted-foreground">Next occurrences</div>
          <div className="flex flex-wrap gap-1.5">
            {preview.map((d, i) => (
              <span key={i} className="rounded-full bg-card px-2 py-0.5 tabular">
                {format(d, "d MMM yy")}
              </span>
            ))}
            <span className="px-1 text-muted-foreground">
              · {values.amount ? formatMoney(Math.round(Number(values.amount) * 100), currency) : ""} each
            </span>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial?.id ? "Save changes" : "Create rule"}
        </Button>
      </div>
    </form>
  );
}

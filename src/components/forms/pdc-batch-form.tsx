"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { addMonths, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "./field";
import { createPdcBatch } from "@/server/actions";
import { PDC_DIRECTION_LABELS, PDC_DIRECTIONS, type PdcDirection } from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import type { AccountLite, CategoryLite } from "@/lib/view-types";
import { cn } from "@/lib/utils";

interface FormValues {
  direction: PdcDirection;
  counterparty: string;
  amount: string;
  count: string;
  firstDueDate: string;
  bankName: string;
  startChequeNumber: string;
  accountId: string;
  categoryId: string;
  notes: string;
}

export function PdcBatchForm({
  accounts,
  categories,
  onDone,
}: {
  accounts: AccountLite[];
  categories: CategoryLite[];
  onDone?: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [createRule, setCreateRule] = React.useState(true);
  const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      direction: "issued",
      counterparty: "",
      amount: "",
      count: "12",
      firstDueDate: format(addMonths(new Date(), 1), "yyyy-MM-dd"),
      bankName: "",
      startChequeNumber: "",
      accountId: accounts[0]?.id ?? "",
      categoryId: "",
      notes: "",
    },
  });

  const v = watch();
  const currency = accounts.find((a) => a.id === v.accountId)?.currency ?? "AED";
  const count = Number(v.count) || 0;
  const each = Number(v.amount) || 0;
  const totalMinor = Math.round(each * 100) * count;

  function submit(values: FormValues) {
    startTransition(async () => {
      const res = await createPdcBatch({
        direction: values.direction,
        counterparty: values.counterparty,
        amount: values.amount,
        currency,
        count: Number(values.count),
        firstDueDate: values.firstDueDate,
        bankName: values.bankName || null,
        startChequeNumber: values.startChequeNumber ? Number(values.startChequeNumber) : null,
        accountId: values.accountId,
        categoryId: values.categoryId || null,
        createRecurringRule: createRule,
        notes: values.notes || null,
      });
      if (res.ok) {
        toast.success(`${values.count} cheques created`);
        onDone?.();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {PDC_DIRECTIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setValue("direction", d)}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              v.direction === d ? "bg-card shadow-sm text-foreground" : "text-muted-foreground",
            )}
          >
            {PDC_DIRECTION_LABELS[d]}
          </button>
        ))}
      </div>

      <Field label={v.direction === "issued" ? "Payee" : "Payer"}>
        <Input placeholder="e.g. Landlord" {...register("counterparty", { required: true })} />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Amount each" hint={currency}>
          <Input inputMode="decimal" className="tabular" {...register("amount", { required: true })} />
        </Field>
        <Field label="How many">
          <Input type="number" min={1} max={60} className="tabular" {...register("count", { required: true })} />
        </Field>
        <Field label="First clears">
          <Input type="date" {...register("firstDueDate", { required: true })} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Account">
          <Select value={v.accountId} onValueChange={(val) => setValue("accountId", val)}>
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
          <Select value={v.categoryId} onValueChange={(val) => setValue("categoryId", val)}>
            <SelectTrigger>
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              {categories
                .filter((c) => c.kind === (v.direction === "issued" ? "expense" : "income"))
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
        <Field label="Bank">
          <Input placeholder="Emirates NBD" {...register("bankName")} />
        </Field>
        <Field label="First cheque #" hint="auto-increments">
          <Input inputMode="numeric" className="tabular" {...register("startChequeNumber")} />
        </Field>
      </div>

      <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
        <div>
          <div className="font-medium">Also create a recurring rule</div>
          <div className="text-xs text-muted-foreground">Feeds the projection as a recurring cost/income</div>
        </div>
        <Switch checked={createRule} onCheckedChange={setCreateRule} />
      </label>

      {count > 0 && each > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <span className="text-muted-foreground">Total across {count} cheques: </span>
          <span className="font-semibold tabular">{formatMoney(totalMinor, currency)}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create cheques"}
        </Button>
      </div>
    </form>
  );
}

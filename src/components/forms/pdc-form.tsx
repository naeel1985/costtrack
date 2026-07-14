"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { addMonths, format } from "date-fns";
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
import { savePdc } from "@/server/actions";
import { PDC_DIRECTION_LABELS, PDC_DIRECTIONS, type PdcDirection } from "@/lib/domain";
import type { AccountLite } from "@/lib/view-types";
import { cn } from "@/lib/utils";

interface FormValues {
  direction: PdcDirection;
  counterparty: string;
  amount: string;
  issueDate: string;
  dueDate: string;
  bankName: string;
  chequeNumber: string;
  accountId: string;
  notes: string;
}

export interface PdcInitial {
  id?: string;
  direction?: PdcDirection;
  counterparty?: string;
  amountMinor?: number;
  issueDate?: Date;
  dueDate?: Date;
  bankName?: string | null;
  chequeNumber?: string | null;
  accountId?: string;
  notes?: string | null;
}

export function PdcForm({
  accounts,
  initial,
  onDone,
}: {
  accounts: AccountLite[];
  initial?: PdcInitial;
  onDone?: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      direction: initial?.direction ?? "issued",
      counterparty: initial?.counterparty ?? "",
      amount: initial?.amountMinor != null ? String(initial.amountMinor / 100) : "",
      issueDate: format(initial?.issueDate ?? new Date(), "yyyy-MM-dd"),
      dueDate: format(initial?.dueDate ?? addMonths(new Date(), 1), "yyyy-MM-dd"),
      bankName: initial?.bankName ?? "",
      chequeNumber: initial?.chequeNumber ?? "",
      accountId: initial?.accountId ?? accounts[0]?.id ?? "",
      notes: initial?.notes ?? "",
    },
  });

  const direction = watch("direction");
  const accountId = watch("accountId");
  const currency = accounts.find((a) => a.id === accountId)?.currency ?? "AED";

  function submit(v: FormValues) {
    startTransition(async () => {
      const res = await savePdc({
        id: initial?.id,
        direction: v.direction,
        counterparty: v.counterparty,
        amount: v.amount,
        currency,
        issueDate: v.issueDate,
        dueDate: v.dueDate,
        bankName: v.bankName || null,
        chequeNumber: v.chequeNumber || null,
        accountId: v.accountId,
        notes: v.notes || null,
      });
      if (res.ok) {
        toast.success(initial?.id ? "Cheque updated" : "Cheque added");
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
              direction === d ? "bg-card shadow-sm text-foreground" : "text-muted-foreground",
            )}
          >
            {PDC_DIRECTION_LABELS[d]}
          </button>
        ))}
      </div>

      <Field label={direction === "issued" ? "Payee" : "Payer"}>
        <Input
          placeholder={direction === "issued" ? "Who you're paying" : "Who's paying you"}
          {...register("counterparty", { required: true })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" hint={currency}>
          <Input inputMode="decimal" placeholder="0.00" className="tabular" {...register("amount", { required: true })} />
        </Field>
        <Field label="Account">
          <Select value={accountId} onValueChange={(v) => setValue("accountId", v)}>
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Issue date">
          <Input type="date" {...register("issueDate", { required: true })} />
        </Field>
        <Field label="Clearing date">
          <Input type="date" {...register("dueDate", { required: true })} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Bank">
          <Input placeholder="Emirates NBD" {...register("bankName")} />
        </Field>
        <Field label="Cheque #">
          <Input placeholder="000204" className="tabular" {...register("chequeNumber")} />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea placeholder="Optional" {...register("notes")} />
      </Field>

      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial?.id ? "Save changes" : "Add cheque"}
        </Button>
      </div>
    </form>
  );
}

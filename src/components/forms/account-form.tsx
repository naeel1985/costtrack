"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "./field";
import { saveAccount } from "@/server/actions";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/domain";
import { CURRENCIES } from "@/lib/money";
import { cn } from "@/lib/utils";

const COLORS = ["#2563eb", "#16a34a", "#db2777", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#475569"];

interface FormValues {
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: string;
  safetyBuffer: string;
  color: string;
}

export interface AccountInitial {
  id?: string;
  name?: string;
  type?: AccountType;
  currency?: string;
  openingBalanceMinor?: number;
  safetyBufferMinor?: number;
  color?: string;
}

export function AccountForm({ initial, onDone }: { initial?: AccountInitial; onDone?: () => void }) {
  const [pending, startTransition] = React.useTransition();
  const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? "",
      type: initial?.type ?? "bank",
      currency: initial?.currency ?? "AED",
      openingBalance: initial?.openingBalanceMinor != null ? String(initial.openingBalanceMinor / 100) : "0",
      safetyBuffer: initial?.safetyBufferMinor != null ? String(initial.safetyBufferMinor / 100) : "0",
      color: initial?.color ?? COLORS[0],
    },
  });
  const color = watch("color");

  function submit(v: FormValues) {
    startTransition(async () => {
      const res = await saveAccount({ id: initial?.id, ...v });
      if (res.ok) {
        toast.success(initial?.id ? "Account updated" : "Account created");
        onDone?.();
      } else toast.error(res.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <Field label="Name">
        <Input placeholder="Emirates NBD — Current" {...register("name", { required: true })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={watch("type")} onValueChange={(v) => setValue("type", v as AccountType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Currency">
          <Select value={watch("currency")} onValueChange={(v) => setValue("currency", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(CURRENCIES).map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening balance" hint={watch("currency")}>
          <Input inputMode="decimal" className="tabular" {...register("openingBalance")} />
        </Field>
        <Field label="Safety buffer" hint="warn below">
          <Input inputMode="decimal" className="tabular" {...register("safetyBuffer")} />
        </Field>
      </div>
      <Field label="Colour">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setValue("color", c)}
              className={cn(
                "h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition-all",
                color === c && "ring-2 ring-ring",
              )}
              style={{ backgroundColor: c }}
              aria-label={`Colour ${c}`}
            />
          ))}
        </div>
      </Field>
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial?.id ? "Save changes" : "Create account"}
        </Button>
      </div>
    </form>
  );
}

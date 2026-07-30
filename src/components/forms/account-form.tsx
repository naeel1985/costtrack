"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Landmark } from "lucide-react";
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
import { BankPickerDialog } from "./bank-picker-dialog";
import { saveAccount } from "@/server/actions";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/domain";
import { findBank } from "@/lib/banks";
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
  dueDay: string;
  creditLimit: string;
  bankName: string;
  cardLast4: string;
}

export interface AccountInitial {
  id?: string;
  name?: string;
  type?: AccountType;
  currency?: string;
  openingBalanceMinor?: number;
  safetyBufferMinor?: number;
  color?: string;
  dueDay?: number | null;
  creditLimitMinor?: number | null;
  bankName?: string | null;
  cardLast4?: string | null;
}

export function AccountForm({ initial, onDone }: { initial?: AccountInitial; onDone?: () => void }) {
  const [pending, startTransition] = React.useTransition();
  const [bankPickerOpen, setBankPickerOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState,
  } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? "",
      type: initial?.type ?? "bank",
      currency: initial?.currency ?? "AED",
      openingBalance: initial?.openingBalanceMinor != null ? String(initial.openingBalanceMinor / 100) : "0",
      safetyBuffer: initial?.safetyBufferMinor != null ? String(initial.safetyBufferMinor / 100) : "0",
      color: initial?.color ?? COLORS[0],
      dueDay: initial?.dueDay != null ? String(initial.dueDay) : "",
      creditLimit: initial?.creditLimitMinor != null ? String(initial.creditLimitMinor / 100) : "",
      bankName: initial?.bankName ?? "",
      cardLast4: initial?.cardLast4 ?? "",
    },
  });
  const color = watch("color");
  const type = watch("type");
  const bankName = watch("bankName");
  const isCard = type === "credit_card";
  // Both debit-card ("bank") and credit-card accounts must carry an issuing
  // bank; cash and wallet accounts don't have one.
  const needsBank = type === "bank" || type === "credit_card";
  const selectedBank = bankName ? findBank(bankName) : undefined;

  function submit(v: FormValues) {
    startTransition(async () => {
      const res = await saveAccount({
        id: initial?.id,
        ...v,
        // A card's balance starts at zero owed; the entered figure is its limit.
        openingBalance: v.type === "credit_card" ? "0" : v.openingBalance,
        creditLimit: v.type === "credit_card" && v.creditLimit !== "" ? v.creditLimit : null,
        // Only cards carry a due day.
        dueDay: v.type === "credit_card" && v.dueDay !== "" ? v.dueDay : null,
      });
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
        {isCard ? (
          <Field label="Maximum limit" hint={watch("currency")}>
            <Input
              inputMode="decimal"
              placeholder="e.g. 20000"
              className="tabular"
              {...register("creditLimit")}
            />
          </Field>
        ) : (
          <Field label="Opening balance" hint={watch("currency")}>
            <Input inputMode="decimal" className="tabular" {...register("openingBalance")} />
          </Field>
        )}
        {isCard ? (
          <Field
            label="Payment due day"
            hint="each month"
            error={formState.errors.dueDay?.message}
          >
            <Input
              inputMode="numeric"
              placeholder="e.g. 2"
              className="tabular"
              {...register("dueDay", {
                required: "Choose the day of the month the card is due",
                min: { value: 1, message: "Day must be 1–31" },
                max: { value: 31, message: "Day must be 1–31" },
              })}
            />
          </Field>
        ) : (
          <Field label="Safety buffer" hint="warn below">
            <Input inputMode="decimal" className="tabular" {...register("safetyBuffer")} />
          </Field>
        )}
      </div>
      {isCard && (
        <p className="-mt-2 text-xs text-muted-foreground">
          A credit card is a loan: spend up to the limit, then repay from cash/debit card by the due day.
          Costs charged between two due dates form one bill — that is when it hits your free savings.
          A day past the month&apos;s length (e.g. 31) falls on the last day instead.
        </p>
      )}
      {needsBank && (
        <>
          <input
            type="hidden"
            {...register("bankName", {
              validate: (v) => {
                const t = getValues("type");
                if ((t === "bank" || t === "credit_card") && !v) return "Select the issuing bank";
                return true;
              },
            })}
          />
          <Field label="Issuing bank" error={formState.errors.bankName?.message}>
            <button
              type="button"
              onClick={() => setBankPickerOpen(true)}
              className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors hover:bg-accent"
            >
              <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />
              {selectedBank ? (
                <span className="flex-1 truncate text-left">
                  {selectedBank.name}
                  {selectedBank.abbreviation && (
                    <span className="text-muted-foreground"> ({selectedBank.abbreviation})</span>
                  )}
                </span>
              ) : (
                <span className="flex-1 text-left text-muted-foreground">Select bank…</span>
              )}
            </button>
          </Field>
          <BankPickerDialog
            open={bankPickerOpen}
            onOpenChange={setBankPickerOpen}
            onSelect={(name) => setValue("bankName", name, { shouldValidate: true })}
          />
        </>
      )}
      {needsBank && (
        <Field
          label="Card last 4"
          hint="optional"
          error={formState.errors.cardLast4?.message}
        >
          <Input
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
            className="tabular"
            {...register("cardLast4", {
              pattern: { value: /^(\d{4})?$/, message: "Enter the last 4 digits" },
            })}
          />
        </Field>
      )}
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

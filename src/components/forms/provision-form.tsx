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
import { Field } from "./field";
import { saveProvision } from "@/server/actions";
import { PRIORITIES } from "@/lib/domain";
import type { AccountLite } from "@/lib/view-types";

interface FormValues {
  name: string;
  target: string;
  dueDate: string;
  hasDueDate: boolean;
  priority: string;
  accountId: string;
}

export interface ProvisionInitial {
  id?: string;
  name?: string;
  targetMinor?: number;
  dueDate?: Date | null;
  priority?: number;
  accountId?: string | null;
}

export function ProvisionForm({
  accounts,
  initial,
  onDone,
}: {
  accounts: AccountLite[];
  initial?: ProvisionInitial;
  onDone?: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [hasDue, setHasDue] = React.useState(initial ? initial.dueDate != null : true);
  const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? "",
      target: initial?.targetMinor != null ? String(initial.targetMinor / 100) : "",
      dueDate: format(initial?.dueDate ?? addMonths(new Date(), 6), "yyyy-MM-dd"),
      priority: String(initial?.priority ?? 2),
      accountId: initial?.accountId ?? accounts[0]?.id ?? "",
    },
  });
  const currency = accounts.find((a) => a.id === watch("accountId"))?.currency ?? "AED";

  function submit(v: FormValues) {
    startTransition(async () => {
      const res = await saveProvision({
        id: initial?.id,
        name: v.name,
        target: v.target,
        currency,
        dueDate: hasDue ? v.dueDate : null,
        priority: Number(v.priority),
        accountId: v.accountId || null,
      });
      if (res.ok) {
        toast.success(initial?.id ? "Provision updated" : "Provision created");
        onDone?.();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <Field label="Name">
        <Input placeholder="e.g. Car insurance renewal" {...register("name", { required: true })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target amount" hint={currency}>
          <Input inputMode="decimal" className="tabular" {...register("target", { required: true })} />
        </Field>
        <Field label="Priority">
          <Select value={watch("priority")} onValueChange={(v) => setValue("priority", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={String(p.value)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Fund from account">
        <Select value={watch("accountId")} onValueChange={(v) => setValue("accountId", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Optional" />
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
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hasDue} onChange={(e) => setHasDue(e.target.checked)} className="accent-primary" />
        Has a due date
      </label>
      {hasDue && (
        <Field label="Due date">
          <Input type="date" {...register("dueDate")} />
        </Field>
      )}
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial?.id ? "Save changes" : "Create provision"}
        </Button>
      </div>
    </form>
  );
}

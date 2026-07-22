"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Plus, Trash2, Save, Sun, Moon, Monitor } from "lucide-react";
import { toast } from "sonner";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/forms/field";
import { PageHeader } from "@/components/shared";
import { CURRENCIES } from "@/lib/money";
import { CATEGORY_KINDS } from "@/lib/domain";
import { deleteCategory, deleteRate, saveCategory, saveRate, updateSettings } from "@/server/actions";
import { cn } from "@/lib/utils";

export interface RateRow {
  id: string;
  base: string;
  quote: string;
  rate: number;
}
export interface CategoryRow {
  id: string;
  name: string;
  kind: string;
  color: string;
}

export function SettingsView({
  baseCurrency,
  defaultBufferMinor,
  rates,
  categories,
}: {
  baseCurrency: string;
  defaultBufferMinor: number;
  rates: RateRow[];
  categories: CategoryRow[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Preferences, currencies and categories." />
      <GeneralCard baseCurrency={baseCurrency} defaultBufferMinor={defaultBufferMinor} />
      <RatesCard baseCurrency={baseCurrency} rates={rates} />
      <CategoriesCard categories={categories} />
    </div>
  );
}

function GeneralCard({ baseCurrency, defaultBufferMinor }: { baseCurrency: string; defaultBufferMinor: number }) {
  const { theme, setTheme } = useTheme();
  const [currency, setCurrency] = React.useState(baseCurrency);
  const [buffer, setBuffer] = React.useState(String(defaultBufferMinor / 100));
  const [pending, startTransition] = React.useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateSettings({ baseCurrency: currency, defaultBuffer: buffer, theme: theme ?? "system" });
      if (res.ok) toast.success("Settings saved");
      else toast.error(res.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">General</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Base currency" hint="for totals & net worth">
            <Select value={currency} onValueChange={setCurrency}>
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
          <Field label="Default safety buffer" hint={currency}>
            <Input inputMode="decimal" className="tabular" value={buffer} onChange={(e) => setBuffer(e.target.value)} />
          </Field>
        </div>
        <Field label="Theme">
          <div className="flex gap-2">
            {[
              { v: "light", label: "Light", Icon: Sun },
              { v: "dark", label: "Dark", Icon: Moon },
              { v: "system", label: "System", Icon: Monitor },
            ].map(({ v, label, Icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => setTheme(v)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors",
                  theme === v ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex justify-end">
          <Button onClick={save} disabled={pending} className="gap-1.5">
            <Save className="h-4 w-4" /> {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RatesCard({ baseCurrency, rates }: { baseCurrency: string; rates: RateRow[] }) {
  const [quote, setQuote] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function add() {
    if (!quote || !rate) return;
    startTransition(async () => {
      const res = await saveRate({ base: baseCurrency, quote, rate });
      if (res.ok) {
        toast.success("Rate saved");
        setQuote("");
        setRate("");
      } else toast.error(res.error);
    });
  }
  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteRate(id);
      if (res.ok) toast.success("Rate removed");
      else toast.error(res.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Exchange rates</CardTitle>
        <p className="text-sm text-muted-foreground">
          Manually maintained — no external API. 1 {baseCurrency} = rate × quote currency.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rates.length > 0 && (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pair</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.base} → {r.quote}
                    </TableCell>
                    <TableCell className="text-right tabular">{r.rate}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" onClick={() => remove(r.id)}>
                        <Trash2 className="h-4 w-4 text-negative" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Field label="Quote currency" className="flex-1">
            <Select value={quote} onValueChange={setQuote}>
              <SelectTrigger>
                <SelectValue placeholder="e.g. USD" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(CURRENCIES)
                  .filter((c) => c.code !== baseCurrency)
                  .map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rate" className="flex-1">
            <Input inputMode="decimal" className="tabular" placeholder="0.2723" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Button onClick={add} disabled={pending} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoriesCard({ categories }: { categories: CategoryRow[] }) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<"income" | "expense">("expense");
  const [pending, startTransition] = React.useTransition();

  function add() {
    if (!name) return;
    startTransition(async () => {
      const res = await saveCategory({ name, kind, color: "#64748b", icon: "Circle" });
      if (res.ok) {
        toast.success("Category added");
        setName("");
      } else toast.error(res.error);
    });
  }
  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteCategory(id);
      if (res.ok) toast.success("Category removed");
      else toast.error(res.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Categories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {CATEGORY_KINDS.map((k) => (
          <div key={k}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {k === "income" ? "Income" : "Expense"}
            </div>
            <div className="flex flex-wrap gap-2">
              {categories
                .filter((c) => c.kind === k)
                .map((c) => (
                  <Badge key={c.id} variant="neutral" className="gap-1.5 py-1 pr-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                    <button onClick={() => remove(c.id)} aria-label={`Remove ${c.name}`} className="ml-0.5 rounded-full p-0.5 hover:bg-background">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              {categories.filter((c) => c.kind === k).length === 0 && (
                <span className="text-xs text-muted-foreground">None yet</span>
              )}
            </div>
          </div>
        ))}
        <div className="flex items-end gap-2">
          <Field label="New category" className="flex-1">
            <Input placeholder="e.g. Education" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Select value={kind} onValueChange={(v) => setKind(v as "income" | "expense")}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={add} disabled={pending} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

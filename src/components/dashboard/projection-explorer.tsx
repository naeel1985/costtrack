"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FlaskConical, Plus, X } from "lucide-react";
import {
  projectSeries,
  type SerializedProjection,
  type WhatIfInput,
} from "@/server/projection-actions";
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
import { Money } from "@/components/money";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const HORIZONS = [30, 60, 90] as const;

export function ProjectionExplorer({
  initial,
  currency,
}: {
  initial: SerializedProjection;
  currency: string;
}) {
  const [horizon, setHorizon] = React.useState<number>(90);
  const [data, setData] = React.useState<SerializedProjection>(initial);
  const [whatIf, setWhatIf] = React.useState<WhatIfInput[]>([]);
  const [pending, startTransition] = React.useTransition();
  const [showWhatIf, setShowWhatIf] = React.useState(false);

  const rerun = React.useCallback((h: number, wi: WhatIfInput[]) => {
    startTransition(async () => {
      const res = await projectSeries(h, wi);
      setData(res);
    });
  }, []);

  function changeHorizon(h: number) {
    setHorizon(h);
    rerun(h, whatIf);
  }

  function addWhatIf(w: WhatIfInput) {
    const next = [...whatIf, w];
    setWhatIf(next);
    rerun(horizon, next);
  }

  function removeWhatIf(i: number) {
    const next = whatIf.filter((_, idx) => idx !== i);
    setWhatIf(next);
    rerun(horizon, next);
  }

  const points = data.points;
  const minTotal = Math.min(0, ...points.map((p) => p.total));
  const endTotal = points.at(-1)?.total ?? 0;
  const startTotal = points[0]?.total ?? 0;
  const dips = points.filter((p) => p.total < 0).length;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Projected balance</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Combined across accounts, factoring income, recurring costs & pending cheques.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {HORIZONS.map((h) => (
            <button
              key={h}
              onClick={() => changeHorizon(h)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                horizon === h ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {h}d
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div className="text-xs text-muted-foreground">In {horizon} days</div>
            <Money minor={endTotal} currency={currency} className="text-xl font-semibold" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Change</div>
            <Money
              minor={endTotal - startTotal}
              currency={currency}
              colored
              signed
              className="text-sm font-medium"
            />
          </div>
          {dips > 0 && (
            <div className="text-negative">
              <div className="text-xs">Days below zero</div>
              <div className="text-sm font-semibold tabular">{dips}</div>
            </div>
          )}
          <Button
            variant={showWhatIf ? "secondary" : "outline"}
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => setShowWhatIf((s) => !s)}
          >
            <FlaskConical className="h-4 w-4" /> What-if
          </Button>
        </div>

        <div className={cn("h-[260px] w-full transition-opacity", pending && "opacity-60")}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                interval="preserveStartEnd"
                minTickGap={40}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                width={54}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickFormatter={(v) => formatMoney(v, currency, { showCurrency: false, compact: true })}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof points)[number];
                  return (
                    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                      <div className="font-medium">{p.label}</div>
                      <div className={cn("tabular", p.total < 0 && "text-negative")}>
                        {formatMoney(p.total, currency)}
                      </div>
                    </div>
                  );
                }}
              />
              {minTotal < 0 && (
                <ReferenceLine y={0} stroke="var(--negative)" strokeDasharray="4 4" />
              )}
              <Area
                type="monotone"
                dataKey="total"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                fill="url(#balFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {showWhatIf && (
          <WhatIfPanel
            accounts={data.accounts}
            whatIf={whatIf}
            currency={currency}
            onAdd={addWhatIf}
            onRemove={removeWhatIf}
          />
        )}
      </CardContent>
    </Card>
  );
}

function WhatIfPanel({
  accounts,
  whatIf,
  currency,
  onAdd,
  onRemove,
}: {
  accounts: SerializedProjection["accounts"];
  whatIf: WhatIfInput[];
  currency: string;
  onAdd: (w: WhatIfInput) => void;
  onRemove: (i: number) => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [direction, setDirection] = React.useState<"out" | "in">("out");
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [days, setDays] = React.useState("7");
  const [label, setLabel] = React.useState("");

  function add() {
    const value = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0) return;
    onAdd({
      accountId,
      amountMinor: Math.round(value * 100) * (direction === "out" ? -1 : 1),
      daysFromNow: Math.max(0, Number(days) || 0),
      label: label || (direction === "out" ? "Hypothetical expense" : "Hypothetical income"),
    });
    setAmount("");
    setLabel("");
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <FlaskConical className="h-4 w-4 text-primary" /> Simulate a scenario
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <Select value={direction} onValueChange={(v) => setDirection(v as "out" | "in")}>
          <SelectTrigger className="col-span-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="out">Spend</SelectItem>
            <SelectItem value="in">Receive</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="col-span-1 tabular"
          placeholder="Amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="col-span-2 sm:col-span-2">
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
        <div className="col-span-1 flex items-center gap-1">
          <Input
            className="tabular"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">d</span>
        </div>
        <Button size="sm" className="col-span-1 gap-1" onClick={add}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      <Input
        className="mt-2"
        placeholder="Label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      {whatIf.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {whatIf.map((w, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs"
            >
              <span className={cn("tabular", w.amountMinor < 0 ? "text-negative" : "text-positive")}>
                {formatMoney(w.amountMinor, currency, { signed: true })}
              </span>
              <span className="text-muted-foreground">· {w.label} · +{w.daysFromNow}d</span>
              <button onClick={() => onRemove(i)} aria-label="Remove scenario">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

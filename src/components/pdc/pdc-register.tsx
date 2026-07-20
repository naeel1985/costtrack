"use client";

import * as React from "react";
import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
  addDays,
} from "date-fns";
import {
  Plus,
  Layers,
  CalendarDays,
  List,
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  Ban,
  Pencil,
  Trash2,
  MoreHorizontal,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader, StatCard, EmptyState } from "@/components/shared";
import { PdcForm, type PdcInitial } from "@/components/forms/pdc-form";
import { PdcBatchForm } from "@/components/forms/pdc-batch-form";
import { deletePdc, setPdcStatus } from "@/server/actions";
import { useConfirm } from "@/components/confirm";
import { PDC_STATUSES } from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import type { AccountLite, CategoryLite } from "@/lib/view-types";
import { cn } from "@/lib/utils";

export interface PdcRow {
  id: string;
  direction: "issued" | "received";
  counterparty: string;
  amountMinor: number;
  currency: string;
  issueDate: Date;
  dueDate: Date;
  bankName: string | null;
  chequeNumber: string | null;
  status: string;
  notes: string | null;
  accountId: string;
  accountName: string;
}

export function PdcRegister({
  pdcs,
  accounts,
  categories,
}: {
  pdcs: PdcRow[];
  accounts: AccountLite[];
  categories: CategoryLite[];
}) {
  const [status, setStatus] = React.useState("all");
  const [direction, setDirection] = React.useState("all");
  const [bank, setBank] = React.useState("all");
  const [view, setView] = React.useState<"list" | "calendar">("list");
  const [formOpen, setFormOpen] = React.useState(false);
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PdcInitial | null>(null);
  const [, startTransition] = React.useTransition();
  const confirm = useConfirm();

  const banks = React.useMemo(
    () => [...new Set(pdcs.map((p) => p.bankName).filter(Boolean))] as string[],
    [pdcs],
  );

  const filtered = pdcs.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (direction !== "all" && p.direction !== direction) return false;
    if (bank !== "all" && p.bankName !== bank) return false;
    return true;
  });

  const now = new Date();
  const pendingSoon = pdcs.filter(
    (p) => p.status === "pending" && differenceInCalendarDays(p.dueDate, now) <= 7 && differenceInCalendarDays(p.dueDate, now) >= 0,
  );
  const pendingOut = pdcs
    .filter((p) => p.status === "pending" && p.direction === "issued")
    .reduce((s, p) => s + p.amountMinor, 0);
  const pendingIn = pdcs
    .filter((p) => p.status === "pending" && p.direction === "received")
    .reduce((s, p) => s + p.amountMinor, 0);
  const currency = accounts[0]?.currency ?? "AED";

  function changeStatus(id: string, next: string, label: string) {
    startTransition(async () => {
      const res = await setPdcStatus({ id, status: next });
      if (res.ok) toast.success(label);
      else toast.error(res.error);
    });
  }
  async function remove(id: string) {
    const ok = await confirm({
      title: "Delete this cheque?",
      description: "Any reconciled ledger entry is removed too. This can't be undone.",
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deletePdc(id);
      if (res.ok) toast.success("Cheque deleted");
      else toast.error(res.error);
    });
  }
  function openEdit(p: PdcRow) {
    setEditing({
      id: p.id,
      direction: p.direction,
      counterparty: p.counterparty,
      amountMinor: p.amountMinor,
      issueDate: p.issueDate,
      dueDate: p.dueDate,
      bankName: p.bankName,
      chequeNumber: p.chequeNumber,
      accountId: p.accountId,
      notes: p.notes,
    });
    setFormOpen(true);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cheque register"
        description="Post-dated cheques you've issued and received, reconciled into the ledger when they clear."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBatchOpen(true)}>
              <Layers className="h-4 w-4" /> Batch
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add cheque
            </Button>
          </div>
        }
      />

      {pendingSoon.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground dark:text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-medium">
              {pendingSoon.length} cheque{pendingSoon.length > 1 ? "s" : ""} clearing within 7 days.
            </span>{" "}
            {pendingSoon
              .slice(0, 3)
              .map((p) => `${p.chequeNumber ? `#${p.chequeNumber} ` : ""}${formatMoney(p.amountMinor, p.currency)} (${format(p.dueDate, "d MMM")})`)
              .join(", ")}
            {pendingSoon.length > 3 ? "…" : ""}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Pending out" value={<Money minor={pendingOut} currency={currency} />} tone="negative" icon={<ArrowUpRight className="h-4 w-4" />} />
        <StatCard label="Pending in" value={<Money minor={pendingIn} currency={currency} />} tone="positive" icon={<ArrowDownLeft className="h-4 w-4" />} />
        <StatCard label="Net pending" value={<Money minor={pendingIn - pendingOut} currency={currency} colored />} className="col-span-2 sm:col-span-1" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PDC_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={direction} onValueChange={setDirection}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Both ways</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="received">Received</SelectItem>
          </SelectContent>
        </Select>
        {banks.length > 0 && (
          <Select value={bank} onValueChange={setBank}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Bank" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All banks</SelectItem>
              {banks.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setView("list")}
            className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", view === "list" ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            onClick={() => setView("calendar")}
            className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", view === "calendar" ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Calendar
          </button>
        </div>
      </div>

      {view === "list" ? (
        filtered.length === 0 ? (
          <EmptyState title="No cheques" description="Add a post-dated cheque or create a batch (e.g. 12 monthly rent cheques)." />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clears</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead className="hidden sm:table-cell">Cheque #</TableHead>
                  <TableHead className="hidden md:table-cell">Bank</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const days = differenceInCalendarDays(p.dueDate, now);
                  const soon = p.status === "pending" && days >= 0 && days <= 7;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">
                        <div className="font-medium">{format(p.dueDate, "d MMM")}</div>
                        {p.status === "pending" && (
                          <div className={cn("text-xs", soon ? "text-warning-foreground dark:text-warning" : "text-muted-foreground")}>
                            {days < 0 ? `${-days}d overdue` : days === 0 ? "today" : `in ${days}d`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 font-medium">
                          {p.direction === "issued" ? (
                            <ArrowUpRight className="h-3.5 w-3.5 text-negative" />
                          ) : (
                            <ArrowDownLeft className="h-3.5 w-3.5 text-positive" />
                          )}
                          <span className="truncate">{p.counterparty}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{p.accountName}</div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell tabular text-muted-foreground">
                        {p.chequeNumber ? `#${p.chequeNumber}` : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">{p.bankName ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money
                          minor={p.direction === "issued" ? -p.amountMinor : p.amountMinor}
                          currency={p.currency}
                          colored
                          className="font-medium"
                        />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {p.status !== "cleared" && (
                              <DropdownMenuItem onClick={() => changeStatus(p.id, "cleared", "Cleared & reconciled")}>
                                <Check className="text-positive" /> Mark cleared
                              </DropdownMenuItem>
                            )}
                            {p.status !== "bounced" && (
                              <DropdownMenuItem onClick={() => changeStatus(p.id, "bounced", "Marked bounced")}>
                                <Ban className="text-negative" /> Mark bounced
                              </DropdownMenuItem>
                            )}
                            {p.status !== "pending" && (
                              <DropdownMenuItem onClick={() => changeStatus(p.id, "pending", "Reopened")}>
                                <RotateCcw /> Reopen (pending)
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openEdit(p)}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-negative focus:text-negative" onClick={() => remove(p.id)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )
      ) : (
        <PdcCalendar pdcs={filtered} />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit cheque" : "Add cheque"}</DialogTitle>
          </DialogHeader>
          <PdcForm accounts={accounts} initial={editing ?? undefined} onDone={() => setFormOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a batch of cheques</DialogTitle>
          </DialogHeader>
          <PdcBatchForm accounts={accounts} categories={categories} onDone={() => setBatchOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PdcCalendar({ pdcs }: { pdcs: PdcRow[] }) {
  const [month, setMonth] = React.useState(startOfMonth(new Date()));
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthEnd = endOfMonth(month);

  const byDay = (day: Date) => pdcs.filter((p) => isSameDay(p.dueDate, day));

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold">{format(month, "MMMM yyyy")}</div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
              Today
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            const items = byDay(day);
            const inMonth = day >= startOfMonth(month) && day <= monthEnd;
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={i}
                className={cn(
                  "min-h-[64px] rounded-md border p-1 text-left",
                  !inMonth && "opacity-40",
                  isToday && "border-primary ring-1 ring-primary/40",
                )}
              >
                <div className="text-[11px] tabular text-muted-foreground">{format(day, "d")}</div>
                <div className="mt-0.5 space-y-0.5">
                  {items.slice(0, 3).map((p) => (
                    <div
                      key={p.id}
                      title={`${p.counterparty} · ${formatMoney(p.amountMinor, p.currency)}`}
                      className={cn(
                        "truncate rounded px-1 py-0.5 text-[10px] font-medium",
                        p.direction === "issued"
                          ? "bg-negative/12 text-negative"
                          : "bg-positive/12 text-positive",
                        p.status !== "pending" && "opacity-50 line-through",
                      )}
                    >
                      {formatMoney(p.amountMinor, p.currency, { showCurrency: false, compact: true })}{" "}
                      {p.counterparty.split(" ")[0]}
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className="px-1 text-[10px] text-muted-foreground">+{items.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

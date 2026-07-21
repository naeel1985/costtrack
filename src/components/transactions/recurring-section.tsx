"use client";

import * as React from "react";
import { format } from "date-fns";
import { Plus, Repeat, Zap, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Money } from "@/components/money";
import { SectionTitle, EmptyState } from "@/components/shared";
import { RecurringForm, type RecurringInitial } from "@/components/forms/recurring-form";
import { Pager, usePagination } from "@/components/ui/pagination";
import { useConfirm } from "@/components/confirm";
import { deleteRecurring, postRecurringOccurrence, toggleRecurring } from "@/server/actions";
import type { AccountLite, CategoryLite } from "@/lib/view-types";

export interface RecurringRow {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  frequency: string;
  interval: number;
  nextRunDate: Date;
  startDate: Date;
  endDate: Date | null;
  occurrenceCount: number | null;
  isActive: boolean;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
}

export function RecurringSection({
  kind,
  rules,
  accounts,
  categories,
}: {
  kind: "income" | "expense";
  rules: RecurringRow[];
  accounts: AccountLite[];
  categories: CategoryLite[];
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RecurringInitial | null>(null);
  const [, startTransition] = React.useTransition();
  const confirm = useConfirm();
  const { page, setPage, pageCount, pageItems } = usePagination(rules, 6);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(r: RecurringRow) {
    setEditing({
      id: r.id,
      name: r.name,
      amountMinor: r.amountMinor,
      accountId: r.accountId,
      categoryId: r.categoryId,
      frequency: r.frequency,
      interval: r.interval,
      startDate: r.startDate,
      endDate: r.endDate,
      occurrenceCount: r.occurrenceCount,
    });
    setDialogOpen(true);
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(msg);
      else toast.error(res.error ?? "Failed");
    });
  }

  return (
    <div>
      <SectionTitle
        action={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openNew}>
            <Plus className="h-4 w-4" /> New rule
          </Button>
        }
      >
        Recurring {kind === "income" ? "income" : "costs"}
      </SectionTitle>

      {rules.length === 0 ? (
        <EmptyState
          icon={<Repeat className="h-6 w-6" />}
          title="No recurring rules yet"
          description={`Automate ${kind === "income" ? "salary and regular income" : "rent, subscriptions and installments"}. Rules feed the balance projection.`}
          action={
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4" /> Add rule
            </Button>
          }
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {pageItems.map((r) => (
            <Card key={r.id} className={r.isActive ? "" : "opacity-60"}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Repeat className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    {r.categoryName && (
                      <Badge variant="neutral" className="px-1.5 py-0 text-[10px]">
                        {r.categoryName}
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    Every {r.interval > 1 ? `${r.interval} ` : ""}
                    {r.frequency === "custom" ? "days" : r.frequency.replace("ly", "")}
                    {r.isActive ? ` · next ${format(r.nextRunDate, "d MMM")}` : " · paused"}
                  </div>
                </div>
                <Money minor={r.amountMinor} currency={r.currency} className="text-sm font-semibold" />
                <div className="flex items-center gap-1">
                  <Switch
                    checked={r.isActive}
                    onCheckedChange={(v) => act(() => toggleRecurring(r.id, v), v ? "Resumed" : "Paused")}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(r)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => act(() => postRecurringOccurrence(r.id), "Posted to ledger")}
                      >
                        <Zap /> Post next now
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-negative focus:text-negative"
                        onSelect={async () => {
                          const ok = await confirm({
                            title: "Delete this recurring rule?",
                            description: "Future occurrences stop. Entries already posted stay.",
                            confirmLabel: "Delete",
                            tone: "destructive",
                          });
                          if (ok) act(() => deleteRecurring(r.id), "Recurring rule deleted");
                        }}
                      >
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
          <Pager page={page} pageCount={pageCount} onPage={setPage} className="sm:col-span-2" />
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit recurring rule" : "New recurring rule"}</DialogTitle>
          </DialogHeader>
          <RecurringForm
            kind={kind}
            accounts={accounts}
            categories={categories}
            initial={editing ?? undefined}
            onDone={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

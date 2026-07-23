"use client";

import * as React from "react";
import {
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Money } from "@/components/money";
import { PageHeader, StatCard } from "@/components/shared";
import { AccountForm, type AccountInitial } from "@/components/forms/account-form";
import { useConfirm } from "@/components/confirm";
import { AddTransactionButton } from "@/components/add-transaction-button";
import { archiveAccount, deleteAccount } from "@/server/actions";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/domain";

export interface AccountRow {
  id: string;
  name: string;
  type: string;
  currency: string;
  balanceMinor: number;
  openingBalanceMinor: number;
  safetyBufferMinor: number;
  /** Credit cards only: day of the month the bill falls due. */
  dueDay?: number | null;
  /** Credit cards only: the borrowing limit. */
  creditLimitMinor?: number | null;
  /** Optional: issuing bank + last 4 digits. */
  bankName?: string | null;
  cardLast4?: string | null;
  color: string;
  isArchived: boolean;
}

export function AccountsView({ accounts, baseCurrency }: { accounts: AccountRow[]; baseCurrency: string }) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AccountInitial | null>(null);
  const [, startTransition] = React.useTransition();
  const confirm = useConfirm();

  const active = accounts.filter((a) => !a.isArchived);
  const netWorth = active.reduce((s, a) => s + a.balanceMinor, 0);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(msg);
      else toast.error(res.error ?? "Failed");
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Accounts"
        description="Cash, bank, cards and wallets. Balances are computed from your ledger."
        action={
          <div className="flex gap-2">
            <AddTransactionButton txType="transfer" label="Transfer" variant="outline" size="sm" />
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New account
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Net position" value={<Money minor={netWorth} currency={baseCurrency} colored={netWorth < 0} />} className="col-span-2" />
        <StatCard label="Accounts" value={active.length} />
        <StatCard label="Currencies" value={new Set(active.map((a) => a.currency)).size} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id} className={a.isArchived ? "opacity-60" : ""}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: a.color }}
                  >
                    {a.name.charAt(0)}
                  </span>
                  <div>
                    <div className="font-medium leading-tight">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {ACCOUNT_TYPE_LABELS[a.type as AccountType] ?? a.type} · {a.currency}
                    </div>
                    {(a.bankName || a.cardLast4) && (
                      <div className="text-xs text-muted-foreground">
                        {[a.bankName, a.cardLast4 ? `•••• ${a.cardLast4}` : null].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing({
                          id: a.id,
                          name: a.name,
                          type: a.type as AccountType,
                          currency: a.currency,
                          openingBalanceMinor: a.openingBalanceMinor,
                          safetyBufferMinor: a.safetyBufferMinor,
                          color: a.color,
                          dueDay: a.dueDay,
                          creditLimitMinor: a.creditLimitMinor,
                          bankName: a.bankName,
                          cardLast4: a.cardLast4,
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => act(() => archiveAccount(a.id, !a.isArchived), a.isArchived ? "Restored" : "Archived")}>
                      {a.isArchived ? <ArchiveRestore /> : <Archive />}
                      {a.isArchived ? "Restore" : "Archive"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-negative focus:text-negative"
                      onSelect={async () => {
                        const ok = await confirm({
                          title: `Delete ${a.name}?`,
                          description:
                            "This permanently removes the account and every transaction on it. This can't be undone.",
                          confirmLabel: "Delete account",
                          tone: "destructive",
                        });
                        if (ok) act(() => deleteAccount(a.id), "Account deleted");
                      }}
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {a.type === "credit_card" ? (
                (() => {
                  const owed = Math.max(0, -a.balanceMinor);
                  const limit = a.creditLimitMinor ?? null;
                  const available = limit != null ? Math.max(0, limit - owed) : null;
                  const overLimit = limit != null && owed > limit;
                  return (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-xs text-muted-foreground">Owed</div>
                          <Money
                            minor={owed}
                            currency={a.currency}
                            colored={owed > 0}
                            className="text-xl font-semibold"
                          />
                        </div>
                        {a.dueDay != null && (
                          <Badge variant="neutral" className="gap-1">
                            due day {a.dueDay}
                          </Badge>
                        )}
                      </div>
                      {limit != null && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Available of <Money minor={limit} currency={a.currency} showCurrency={false} />
                          </span>
                          <span className={overLimit ? "font-medium text-negative" : "font-medium"}>
                            {overLimit ? (
                              "Over limit"
                            ) : (
                              <Money minor={available ?? 0} currency={a.currency} showCurrency={false} />
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="mt-3 flex items-end justify-between">
                  <Money
                    minor={a.balanceMinor}
                    currency={a.currency}
                    colored={a.balanceMinor < 0}
                    className="text-xl font-semibold"
                  />
                  {a.safetyBufferMinor > 0 && (
                    <Badge variant={a.balanceMinor < a.safetyBufferMinor ? "warning" : "neutral"} className="gap-1">
                      buffer <Money minor={a.safetyBufferMinor} currency={a.currency} showCurrency={false} />
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing?.id ? <Pencil className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}
              {editing?.id ? "Edit account" : "New account"}
            </DialogTitle>
          </DialogHeader>
          <AccountForm initial={editing ?? undefined} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

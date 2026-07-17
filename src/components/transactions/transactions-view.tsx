"use client";

import * as React from "react";
import { format } from "date-fns";
import { MoreHorizontal, Pencil, Trash2, Search, Filter, X, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared";
import { TransactionForm } from "@/components/forms/transaction-form";
import { deleteTransaction } from "@/server/actions";
import type { AccountLite, CategoryLite } from "@/lib/view-types";
import { cn } from "@/lib/utils";

export interface TxRow {
  id: string;
  type: string;
  method?: string;
  amountMinor: number;
  currency: string;
  date: Date;
  note: string | null;
  tagList: string[];
  accountId: string;
  account: { name: string; color: string };
  transferAccount: { name: string } | null;
  categoryId: string | null;
  category: { name: string; color: string } | null;
}

export function TransactionsView({
  rows,
  accounts,
  categories,
  kind,
}: {
  rows: TxRow[];
  accounts: AccountLite[];
  categories: CategoryLite[];
  kind: "income" | "expense";
}) {
  const [search, setSearch] = React.useState("");
  const [accountId, setAccountId] = React.useState("all");
  const [categoryId, setCategoryId] = React.useState("all");
  const [tag, setTag] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(false);
  const [editing, setEditing] = React.useState<TxRow | null>(null);
  const [, startTransition] = React.useTransition();

  const allTags = React.useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.tagList.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (search && !(r.note ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    if (accountId !== "all" && r.accountId !== accountId) return false;
    if (categoryId !== "all" && r.categoryId !== categoryId) return false;
    if (tag !== "all" && !r.tagList.includes(tag)) return false;
    if (from && r.date < new Date(from)) return false;
    if (to && r.date > new Date(`${to}T23:59:59`)) return false;
    return true;
  });

  const total = filtered.reduce((s, r) => s + r.amountMinor, 0);
  const hasActiveFilters =
    accountId !== "all" || categoryId !== "all" || tag !== "all" || !!from || !!to;

  function clearFilters() {
    setAccountId("all");
    setCategoryId("all");
    setTag("all");
    setFrom("");
    setTo("");
  }

  function onDelete(id: string) {
    if (!confirm("Delete this transaction?")) return;
    startTransition(async () => {
      const res = await deleteTransaction(id);
      if (res.ok) toast.success("Deleted");
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant={showFilters ? "secondary" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setShowFilters((s) => !s)}
        >
          <Filter className="h-4 w-4" /> Filters
          {hasActiveFilters && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" />}
        </Button>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-5">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger>
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {allTags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="gap-1" onClick={clearFilters}>
              <X className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between px-1 text-sm">
        <span className="text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
        </span>
        <span className="font-medium">
          Total <Money minor={total} currency={accounts[0]?.currency ?? "AED"} className="ml-1" />
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No transactions"
          description={
            rows.length === 0
              ? `Add your first ${kind === "income" ? "income" : "cost"} with the button above or press N.`
              : "Try adjusting your filters."
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="hidden sm:table-cell">Category</TableHead>
                <TableHead className="hidden md:table-cell">Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {format(r.date, "d MMM")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {r.type === "transfer" && <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="truncate">
                        {r.note || (r.type === "transfer" ? `→ ${r.transferAccount?.name}` : "—")}
                      </span>
                    </div>
                    {r.tagList.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.tagList.map((t) => (
                          <Badge key={t} variant="neutral" className="px-1.5 py-0 text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {r.category ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: r.category.color }}
                        />
                        {r.category.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {r.account.name}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money
                      minor={r.type === "income" ? r.amountMinor : -r.amountMinor}
                      currency={r.currency}
                      colored={r.type !== "transfer"}
                      className={cn("font-medium", r.type === "transfer" && "text-muted-foreground")}
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
                        <DropdownMenuItem onClick={() => setEditing(r)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-negative focus:text-negative"
                          onClick={() => onDelete(r.id)}
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit transaction</DialogTitle>
          </DialogHeader>
          {editing && (
            <TransactionForm
              accounts={accounts}
              categories={categories}
              initial={{
                id: editing.id,
                type: editing.type as "income" | "expense" | "transfer",
                amountMinor: editing.amountMinor,
                date: editing.date,
                accountId: editing.accountId,
                transferAccountId: editing.transferAccount ? undefined : undefined,
                categoryId: editing.categoryId,
                note: editing.note,
                tagList: editing.tagList,
              }}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

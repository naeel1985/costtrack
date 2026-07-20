"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  Plus,
  PiggyBank,
  Pencil,
  Trash2,
  MoreHorizontal,
  CircleDollarSign,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Money } from "@/components/money";
import { PageHeader, EmptyState } from "@/components/shared";
import { ProvisionForm, type ProvisionInitial } from "@/components/forms/provision-form";
import { addAllocation, deleteProvision } from "@/server/actions";
import { useConfirm } from "@/components/confirm";
import { formatMoney } from "@/lib/money";
import { PRIORITIES } from "@/lib/domain";
import type { AccountLite } from "@/lib/view-types";
import { cn } from "@/lib/utils";

export interface ProvisionCard {
  id: string;
  name: string;
  targetMinor: number;
  currency: string;
  dueDate: Date | null;
  priority: number;
  status: string;
  accountId: string | null;
  accountName: string | null;
  fundedMinor: number;
  remainingMinor: number;
  progress: number;
  monthsLeft: number | null;
  suggestedMonthlyMinor: number;
  onTrack: boolean;
  allocations: { id: string; amountMinor: number; date: Date; note: string | null }[];
}

export function ProvisionsView({
  provisions,
  accounts,
}: {
  provisions: ProvisionCard[];
  accounts: AccountLite[];
}) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ProvisionInitial | null>(null);
  const [allocFor, setAllocFor] = React.useState<ProvisionCard | null>(null);
  const confirm = useConfirm();

  const totalTarget = provisions.reduce((s, p) => s + p.targetMinor, 0);
  const totalFunded = provisions.reduce((s, p) => s + p.fundedMinor, 0);
  const currency = provisions[0]?.currency ?? accounts[0]?.currency ?? "AED";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Provisions"
        description="Sinking funds for known upcoming costs — set money aside before it's due."
        action={
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New provision
          </Button>
        }
      />

      {provisions.length === 0 ? (
        <EmptyState
          icon={<PiggyBank className="h-6 w-6" />}
          title="No provisions yet"
          description="Create a sinking fund for things like insurance renewals, travel, or a new laptop, and track how on-pace you are."
          action={
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> New provision
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Total set aside</div>
                <div className="mt-1 text-xl font-semibold tabular">
                  <Money minor={totalFunded} currency={currency} />
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}of <Money minor={totalTarget} currency={currency} />
                  </span>
                </div>
              </div>
              <div className="w-full max-w-xs">
                <Progress value={totalTarget > 0 ? (totalFunded / totalTarget) * 100 : 0} indicatorClassName="bg-positive" />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {provisions.map((p) => {
              const pct = Math.round(p.progress * 100);
              const done = p.remainingMinor === 0;
              const priorityLabel = PRIORITIES.find((x) => x.value === p.priority)?.label;
              return (
                <Card key={p.id}>
                  <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{p.name}</span>
                        {done ? (
                          <Badge variant="positive" className="gap-1">
                            <Check className="h-3 w-3" /> Funded
                          </Badge>
                        ) : p.dueDate ? (
                          <Badge variant={p.onTrack ? "info" : "warning"}>
                            {p.onTrack ? "On track" : "Behind"}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {p.dueDate ? `Due ${format(p.dueDate, "d MMM yyyy")}` : "No due date"}
                        {priorityLabel ? ` · ${priorityLabel} priority` : ""}
                        {p.accountName ? ` · ${p.accountName}` : ""}
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
                              id: p.id,
                              name: p.name,
                              targetMinor: p.targetMinor,
                              dueDate: p.dueDate,
                              priority: p.priority,
                              accountId: p.accountId,
                            });
                            setFormOpen(true);
                          }}
                        >
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-negative focus:text-negative"
                          onSelect={async () => {
                            const ok = await confirm({
                              title: "Delete this provision?",
                              description: "The provision and all its allocations are removed.",
                              confirmLabel: "Delete",
                              tone: "destructive",
                            });
                            if (ok)
                              deleteProvision(p.id).then((r) =>
                                r.ok ? toast.success("Provision deleted") : toast.error(r.error),
                              );
                          }}
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-end justify-between">
                      <Money minor={p.fundedMinor} currency={p.currency} className="text-lg font-semibold" />
                      <span className="text-sm text-muted-foreground">
                        of <Money minor={p.targetMinor} currency={p.currency} /> · {pct}%
                      </span>
                    </div>
                    <Progress
                      value={pct}
                      indicatorClassName={done ? "bg-positive" : p.onTrack ? "bg-primary" : "bg-warning"}
                    />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {done ? (
                          "Fully funded 🎉"
                        ) : (
                          <>
                            <Money minor={p.remainingMinor} currency={p.currency} /> to go
                            {p.monthsLeft != null && p.monthsLeft > 0 && (
                              <>
                                {" · "}
                                <span className="font-medium text-foreground">
                                  {formatMoney(p.suggestedMonthlyMinor, p.currency)}/mo
                                </span>{" "}
                                suggested
                              </>
                            )}
                          </>
                        )}
                      </span>
                      {!done && (
                        <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setAllocFor(p)}>
                          <CircleDollarSign className="h-3.5 w-3.5" /> Add money
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit provision" : "New provision"}</DialogTitle>
          </DialogHeader>
          <ProvisionForm accounts={accounts} initial={editing ?? undefined} onDone={() => setFormOpen(false)} />
        </DialogContent>
      </Dialog>

      <AllocationDialog provision={allocFor} accounts={accounts} onClose={() => setAllocFor(null)} />
    </div>
  );
}

function AllocationDialog({
  provision,
  accounts,
  onClose,
}: {
  provision: ProvisionCard | null;
  accounts: AccountLite[];
  onClose: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (provision) setAmount(String(Math.max(0, provision.suggestedMonthlyMinor) / 100));
  }, [provision]);

  function submit() {
    if (!provision) return;
    startTransition(async () => {
      const res = await addAllocation({
        provisionId: provision.id,
        amount,
        date: new Date(),
        accountId: provision.accountId,
      });
      if (res.ok) {
        toast.success("Money set aside");
        onClose();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={provision !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set money aside</DialogTitle>
        </DialogHeader>
        {provision && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Adding to <span className="font-medium text-foreground">{provision.name}</span>.{" "}
              <Money minor={provision.remainingMinor} currency={provision.currency} /> remaining.
            </p>
            <Input
              inputMode="decimal"
              className="tabular text-lg"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="positive" onClick={submit} disabled={pending}>
                {pending ? "Saving…" : "Add money"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

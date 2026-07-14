"use client";

import { Plus } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useApp } from "@/components/app-interactive";
import type { TransactionType } from "@/lib/domain";

export function AddTransactionButton({
  txType = "expense",
  label = "Add",
  ...props
}: { txType?: TransactionType; label?: string } & ButtonProps) {
  const { openQuickAdd } = useApp();
  return (
    <Button type="button" onClick={() => openQuickAdd(txType)} {...props}>
      <Plus className="h-4 w-4" /> {label}
    </Button>
  );
}

"use client";

import * as React from "react";
import { Check, Landmark } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { UAE_BANKS, type Bank } from "@/lib/banks";

/**
 * Bank picker: search the full UAE bank list, then confirm the pick against
 * its four reference columns (name, abbreviation, type, headquarter) before
 * it's written to the form. Always opens on the search step, even when a bank
 * is already selected — the trigger button (outside this dialog) already
 * shows the current value.
 */
export function BankPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (bankName: string) => void;
}) {
  const [picked, setPicked] = React.useState<Bank | null>(null);

  // Reset on close (rather than on open, via an effect) so the dialog always
  // starts back at the search step next time it's opened.
  function handleOpenChange(next: boolean) {
    if (!next) setPicked(null);
    onOpenChange(next);
  }

  function confirm() {
    if (!picked) return;
    onSelect(picked.name);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        {!picked ? (
          <Command>
            <DialogHeader className="px-4 pb-2 pt-4">
              <DialogTitle>Select bank</DialogTitle>
            </DialogHeader>
            <CommandInput placeholder="Search banks…" />
            <CommandList>
              <CommandEmpty>No bank found.</CommandEmpty>
              {UAE_BANKS.map((b) => (
                <CommandItem key={b.name} value={b.name} onSelect={() => setPicked(b)}>
                  <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{b.name}</span>
                  {b.abbreviation && (
                    <span className="shrink-0 text-xs text-muted-foreground">{b.abbreviation}</span>
                  )}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        ) : (
          <div className="p-4">
            <DialogHeader>
              <DialogTitle>{picked.name}</DialogTitle>
            </DialogHeader>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Name" value={picked.name} />
              <Row label="Abbreviation" value={picked.abbreviation ?? "—"} />
              <Row label="Type" value={picked.bankType} />
              <Row label="Headquarter" value={picked.headquarter} />
            </dl>
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setPicked(null)}>
                Change
              </Button>
              <Button type="button" onClick={confirm}>
                <Check className="mr-1.5 h-4 w-4" /> Confirm
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 text-left last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

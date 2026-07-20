"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "destructive" tints the confirm button red and shows a warning icon. */
  tone?: "default" | "destructive";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/**
 * In-app replacement for `window.confirm`. Returns a promise that resolves true
 * when the user confirms, false otherwise — so call sites read the same:
 *   if (await confirm({ title: "Delete this?" })) …
 */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

interface Pending extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);

  const confirm = React.useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => setPending({ ...options, resolve }));
  }, []);

  const settle = React.useCallback(
    (value: boolean) => {
      setPending((p) => {
        p?.resolve(value);
        return null;
      });
    },
    [],
  );

  const destructive = pending?.tone === "destructive";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={pending != null} onOpenChange={(open) => !open && settle(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {destructive && <AlertTriangle className="h-5 w-5 text-negative" />}
              {pending?.title}
            </DialogTitle>
            {pending?.description && <DialogDescription>{pending.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => settle(false)}>
              {pending?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
              autoFocus
            >
              {pending?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

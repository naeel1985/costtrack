"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shows a recovery code exactly once. This is the ONLY way to recover encrypted
 * data after a forgotten password — we can't reissue it, because we never hold
 * the key. So the UI is deliberately blunt about saving it.
 */
export function RecoveryCodePanel({
  code,
  onAcknowledge,
  acknowledgeLabel = "I've saved it",
}: {
  code: string;
  onAcknowledge?: () => void;
  acknowledgeLabel?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, permissions) — the code is
      // on screen to copy by hand, so this is a nicety, not a failure.
      toast.message("Copy it manually", { description: "Clipboard access was blocked." });
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-warning/50 bg-warning/10 p-4">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div className="text-sm">
          <div className="font-semibold">Save your recovery code</div>
          <p className="mt-1 text-muted-foreground">
            If you ever forget your password, this code is the only thing that can unlock your
            financial data. We can&apos;t show it again and we can&apos;t reset it for you — your
            data is encrypted with a key we don&apos;t hold.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5">
        <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <code className="flex-1 select-all break-all font-mono text-sm font-semibold tracking-wider">
          {code}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={copy} className="shrink-0">
          {copied ? <Check className="h-4 w-4 text-positive" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span>I&apos;ve stored this somewhere safe (password manager, printed, offline).</span>
      </label>

      {onAcknowledge && (
        <Button type="button" className="w-full" disabled={!confirmed} onClick={onAcknowledge}>
          {acknowledgeLabel}
        </Button>
      )}
    </div>
  );
}

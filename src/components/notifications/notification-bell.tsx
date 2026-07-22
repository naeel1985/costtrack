"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BadgeDollarSign,
  Check,
  CheckCheck,
  CreditCard,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { acknowledgeNotifications } from "@/server/actions";
import type { NotificationItem, NotificationSeverity, NotificationType } from "@/lib/notifications";

const TYPE_ICON: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  salary_ready: BadgeDollarSign,
  account_negative: ShieldAlert,
  account_positive: TrendingUp,
  card_over_limit: CreditCard,
};

const SEVERITY_TONE: Record<NotificationSeverity, string> = {
  critical: "text-negative",
  warning: "text-warning dark:text-warning",
  info: "text-primary",
  positive: "text-positive",
};

export function NotificationBell({ initial }: { initial: NotificationItem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const [open, setOpen] = React.useState(false);
  const [, startTransition] = React.useTransition();
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Re-seed when the server sends a fresh set (navigation / refresh). Adjusting
  // state during render on a changed prop is React's recommended pattern, and
  // avoids a cascading effect.
  const signature = initial.map((n) => n.key).join("|");
  const [seenSignature, setSeenSignature] = React.useState(signature);
  if (signature !== seenSignature) {
    setSeenSignature(signature);
    setItems(initial);
  }

  // Close on outside click / Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function acknowledge(keys: string[]) {
    if (keys.length === 0) return;
    const drop = new Set(keys);
    setItems((prev) => prev.filter((n) => !drop.has(n.key)));
    startTransition(async () => {
      await acknowledgeNotifications(keys);
      router.refresh();
    });
  }

  const count = items.length;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={count > 0 ? `Notifications (${count} new)` : "Notifications"}
        className="relative flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[10px] font-semibold leading-none text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(70vh,480px)] w-[min(92vw,360px)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
        >
          <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {count > 0 && (
              <button
                onClick={() => acknowledge(items.map((n) => n.key))}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </header>

          {count === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Bell className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">You&apos;re all caught up</p>
              <p className="text-xs text-muted-foreground">
                We&apos;ll let you know about balances going negative, cards nearing their limit, or income ready to
                debit.
              </p>
            </div>
          ) : (
            <ul className="divide-y overflow-y-auto">
              {items.map((n) => {
                const Icon = TYPE_ICON[n.type];
                return (
                  <li key={n.key} className="flex items-start gap-3 px-4 py-3">
                    <span className={cn("mt-0.5 shrink-0", SEVERITY_TONE[n.severity])}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug">{n.title}</div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                      {n.date && (
                        <div className="mt-1 text-[11px] text-muted-foreground/80">
                          {formatDistanceToNow(new Date(n.date), { addSuffix: true })}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      aria-label="Acknowledge"
                      onClick={() => acknowledge([n.key])}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

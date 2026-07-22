import { differenceInCalendarDays, format } from "date-fns";
import { ScrollText, Repeat, PiggyBank } from "lucide-react";
import type { UpcomingObligation } from "@/server/queries";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/shared";
import { cn } from "@/lib/utils";

const ICONS = {
  pdc: ScrollText,
  recurring: Repeat,
  provision: PiggyBank,
};

function relative(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days < 30) return `in ${Math.round(days / 7)} wk`;
  return `in ${Math.round(days / 30)} mo`;
}

export function ObligationsList({
  items,
  limit,
}: {
  items: UpcomingObligation[];
  limit?: number;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  if (shown.length === 0) {
    return (
      <EmptyState
        title="Nothing due soon"
        description="No cheques, recurring costs or provisions coming up in this window."
      />
    );
  }
  const now = new Date();

  return (
    <ul className="divide-y">
      {shown.map((item) => {
        const Icon = ICONS[item.kind];
        const days = differenceInCalendarDays(item.date, now);
        const outflow = item.amountMinor < 0;
        return (
          <li key={item.id} className="flex items-center gap-3 py-2.5">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                outflow ? "bg-negative/10 text-negative" : "bg-positive/10 text-positive",
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{item.label}</div>
              <div className="truncate text-xs text-muted-foreground">
                {format(item.date, "d MMM")} · {relative(days)}
                {item.sublabel ? ` · ${item.sublabel}` : ""}
              </div>
            </div>
            <Money
              minor={item.amountMinor}
              currency={item.currency}
              colored
              signed
              className="text-sm font-medium"
            />
          </li>
        );
      })}
    </ul>
  );
}

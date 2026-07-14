import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { ProjectionWarning } from "@/lib/projection";
import { cn } from "@/lib/utils";

export function WarningsBanner({ warnings }: { warnings: ProjectionWarning[] }) {
  if (warnings.length === 0) return null;
  const critical = warnings.filter((w) => w.severity === "critical");
  const shown = [...critical, ...warnings.filter((w) => w.severity === "warning")].slice(0, 4);

  return (
    <div className="space-y-2">
      {shown.map((w, i) => {
        const isCritical = w.severity === "critical";
        return (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
              isCritical
                ? "border-negative/30 bg-negative/8 text-negative"
                : "border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning",
            )}
          >
            {isCritical ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="font-medium">{w.message}</span>
          </div>
        );
      })}
    </div>
  );
}

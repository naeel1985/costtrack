import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  error,
  className,
  hint,
  children,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  className?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <div className="flex items-baseline justify-between">
          <Label htmlFor={htmlFor}>{label}</Label>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
      )}
      {children}
      {error && <p className="text-xs font-medium text-negative">{error}</p>}
    </div>
  );
}

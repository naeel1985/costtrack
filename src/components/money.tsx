import { formatMoney, type FormatOptions } from "@/lib/money";
import { cn } from "@/lib/utils";

interface MoneyProps extends FormatOptions {
  minor: number;
  currency?: string;
  className?: string;
  /**
   * Colour by sign (green positive / red negative). Off by default — colour is
   * meaningful, so callers opt in only where direction matters.
   */
  colored?: boolean;
  /** Treat zero as neutral (not green). Default true. */
  zeroNeutral?: boolean;
}

/** Tabular, decimal-safe money display with optional semantic colour. */
export function Money({
  minor,
  currency = "AED",
  className,
  colored = false,
  zeroNeutral = true,
  ...opts
}: MoneyProps) {
  const tone =
    !colored || (zeroNeutral && minor === 0)
      ? undefined
      : minor > 0
        ? "text-positive"
        : "text-negative";
  return (
    <span className={cn("tabular", tone, className)}>
      {formatMoney(minor, currency, opts)}
    </span>
  );
}

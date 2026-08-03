import { currencyMeta } from "@/lib/money";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cn } from "@/lib/utils";

/**
 * A money figure that counts up on first view — for hero numbers only.
 *
 * Wraps Magic UI's NumberTicker so currency rules still hold: the ticker is
 * told how many decimals this currency actually uses (KWD 3, JPY 0), and the
 * code stays outside the animated span so only the digits move. Sign colouring
 * matches `<Money>` so the two can sit side by side.
 *
 * `<Money>` remains the default everywhere else — a table of twenty animating
 * numbers is noise, not delight.
 */
export function AnimatedMoney({
  minor,
  currency = "AED",
  className,
  colored = false,
  zeroNeutral = true,
  showCurrency = true,
  delay = 0,
}: {
  minor: number;
  currency?: string;
  className?: string;
  colored?: boolean;
  zeroNeutral?: boolean;
  showCurrency?: boolean;
  delay?: number;
}) {
  const { decimals } = currencyMeta(currency);
  const tone =
    !colored || (zeroNeutral && minor === 0)
      ? undefined
      : minor > 0
        ? "text-positive"
        : "text-negative";

  return (
    <span className={cn("tabular inline-flex items-baseline gap-1.5", tone, className)}>
      {showCurrency && <span>{currency}</span>}
      <NumberTicker value={minor / 10 ** decimals} decimalPlaces={decimals} delay={delay} />
    </span>
  );
}

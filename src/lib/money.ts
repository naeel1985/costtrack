// Decimal-safe money handling.
//
// Every amount in the database is an integer number of *minor units* (fils,
// cents, ...). We only ever convert to a floating point number at the very edge
// (formatting for display or parsing user input), never for arithmetic on
// totals. This eliminates the classic 0.1 + 0.2 rounding class of bugs.

export interface CurrencyMeta {
  code: string;
  symbol: string;
  /** Number of minor-unit digits (AED/USD = 2, KWD = 3, JPY = 0). */
  decimals: number;
  name: string;
}

export const CURRENCIES: Record<string, CurrencyMeta> = {
  AED: { code: "AED", symbol: "AED", decimals: 2, name: "UAE Dirham" },
  USD: { code: "USD", symbol: "$", decimals: 2, name: "US Dollar" },
  EUR: { code: "EUR", symbol: "€", decimals: 2, name: "Euro" },
  GBP: { code: "GBP", symbol: "£", decimals: 2, name: "British Pound" },
  INR: { code: "INR", symbol: "₹", decimals: 2, name: "Indian Rupee" },
  SAR: { code: "SAR", symbol: "SAR", decimals: 2, name: "Saudi Riyal" },
  KWD: { code: "KWD", symbol: "KWD", decimals: 3, name: "Kuwaiti Dinar" },
  JPY: { code: "JPY", symbol: "¥", decimals: 0, name: "Japanese Yen" },
};

export const DEFAULT_CURRENCY = "AED";

export function currencyMeta(code: string): CurrencyMeta {
  return (
    CURRENCIES[code] ?? { code, symbol: code, decimals: 2, name: code }
  );
}

/** Convert a user-entered major-unit string/number to integer minor units. */
export function toMinor(amount: number | string, currency = DEFAULT_CURRENCY): number {
  const { decimals } = currencyMeta(currency);
  const value = typeof amount === "string" ? Number(amount.replace(/,/g, "")) : amount;
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  // Round on the string-free numeric value; add a tiny epsilon guard for the
  // representation of e.g. 19.99 * 100.
  return Math.round(value * factor);
}

/** Convert integer minor units back to a major-unit number (for inputs only). */
export function toMajor(minor: number, currency = DEFAULT_CURRENCY): number {
  const { decimals } = currencyMeta(currency);
  return minor / 10 ** decimals;
}

export interface FormatOptions {
  /** Show the currency code / symbol. Default true. */
  showCurrency?: boolean;
  /** Force a leading +/- sign. Default false. */
  signed?: boolean;
  /** Abbreviate large numbers (1.2K, 3.4M). Default false. */
  compact?: boolean;
}

/** Format integer minor units as a human-readable money string. */
export function formatMoney(
  minor: number,
  currency = DEFAULT_CURRENCY,
  opts: FormatOptions = {},
): string {
  const { showCurrency = true, signed = false, compact = false } = opts;
  const meta = currencyMeta(currency);
  const major = toMajor(minor, currency);
  const abs = Math.abs(major);

  let body: string;
  if (compact && abs >= 1000) {
    body = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(abs);
  } else {
    body = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    }).format(abs);
  }

  const sign = minor < 0 ? "-" : signed ? "+" : "";
  const prefix = showCurrency ? `${meta.symbol} ` : "";
  return `${sign}${prefix}${body}`;
}

/** Sum a list of minor-unit amounts safely (plain integer addition). */
export function sumMinor(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

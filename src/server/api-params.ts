import "server-only";

const DEFAULT_HORIZON = 90;
const MAX_HORIZON = 365;

/** A day-horizon query param, defaulted and clamped so it can't be unbounded. */
export function clampHorizon(raw: string | null, fallback = DEFAULT_HORIZON): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_HORIZON) : fallback;
}

/** A bounded integer query param (e.g. reports monthsBack). */
export function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), min), max) : fallback;
}

/** Parse an ISO date query param; returns undefined for missing/invalid input. */
export function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Trimmed non-empty string, or undefined. */
export function str(raw: string | null): string | undefined {
  const s = raw?.trim();
  return s ? s : undefined;
}

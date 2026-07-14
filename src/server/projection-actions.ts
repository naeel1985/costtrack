"use server";

import { getProjection, type WhatIfEvent } from "./queries";

export interface SeriesPoint {
  t: number; // epoch ms
  label: string;
  total: number;
  balances: Record<string, number>;
}

export interface SerializedWarning {
  type: string;
  severity: "critical" | "warning";
  accountId: string;
  accountName: string;
  t: number;
  message: string;
  projectedBalanceMinor: number;
}

export interface SerializedProjection {
  points: SeriesPoint[];
  warnings: SerializedWarning[];
  accounts: {
    id: string;
    name: string;
    currency: string;
    currentBalanceMinor: number;
    safetyBufferMinor: number;
    color?: string;
  }[];
}

export interface WhatIfInput {
  accountId: string;
  amountMinor: number; // signed
  daysFromNow: number;
  label: string;
}

export async function projectSeries(
  horizonDays: number,
  whatIf: WhatIfInput[] = [],
): Promise<SerializedProjection> {
  const now = new Date();
  const events: WhatIfEvent[] = whatIf.map((w) => ({
    accountId: w.accountId,
    amountMinor: w.amountMinor,
    label: w.label,
    date: new Date(now.getTime() + w.daysFromNow * 86_400_000),
  }));

  const { result, accounts } = await getProjection({ horizonDays, whatIf: events });

  return {
    points: result.days.map((d) => ({
      t: d.date.getTime(),
      label: d.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      total: d.totalMinor,
      balances: d.balances,
    })),
    warnings: result.warnings.map((w) => ({
      type: w.type,
      severity: w.severity,
      accountId: w.accountId,
      accountName: w.accountName,
      t: w.date.getTime(),
      message: w.message,
      projectedBalanceMinor: w.projectedBalanceMinor,
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      currentBalanceMinor: a.currentBalanceMinor,
      safetyBufferMinor: a.safetyBufferMinor,
    })),
  };
}

import { describe, expect, it } from "vitest";
import {
  computeRunway,
  eventsFromPdcs,
  eventsFromRecurring,
  expandRecurrence,
  projectBalances,
  type PdcInput,
  type ProjectionAccount,
  type RecurringInput,
} from "./projection";

// Build/compare dates in LOCAL time to match the engine's local day
// boundaries (this is a single-user local-first app; the user's calendar day is
// the local day, not UTC).
const d = (s: string) => {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
};
const ymd = (date: Date | null | undefined) => {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const account = (over: Partial<ProjectionAccount> = {}): ProjectionAccount => ({
  id: "acc1",
  name: "Main",
  currency: "AED",
  currentBalanceMinor: 1_000_00, // 1,000 AED
  safetyBufferMinor: 0,
  ...over,
});

describe("expandRecurrence", () => {
  it("expands monthly occurrences within a window", () => {
    const dates = expandRecurrence(
      { frequency: "monthly", interval: 1, startDate: d("2026-01-15"), endDate: null, occurrenceCount: null },
      d("2026-01-01"),
      d("2026-04-30"),
    );
    expect(dates.map((x) => ymd(x))).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("respects occurrenceCount counted from the true start date", () => {
    const dates = expandRecurrence(
      { frequency: "monthly", interval: 1, startDate: d("2026-01-01"), endDate: null, occurrenceCount: 2 },
      d("2026-01-01"),
      d("2026-12-31"),
    );
    expect(dates).toHaveLength(2);
    expect(ymd(dates[1])).toBe("2026-02-01");
  });

  it("respects endDate", () => {
    const dates = expandRecurrence(
      { frequency: "weekly", interval: 1, startDate: d("2026-01-01"), endDate: d("2026-01-20"), occurrenceCount: null },
      d("2026-01-01"),
      d("2026-12-31"),
    );
    // Jan 1, 8, 15 (22 is past endDate)
    expect(dates).toHaveLength(3);
  });

  it("handles custom (every N days) frequency", () => {
    const dates = expandRecurrence(
      { frequency: "custom", interval: 10, startDate: d("2026-01-01"), endDate: null, occurrenceCount: null },
      d("2026-01-01"),
      d("2026-01-31"),
    );
    expect(dates.map((x) => ymd(x))).toEqual([
      "2026-01-01",
      "2026-01-11",
      "2026-01-21",
      "2026-01-31",
    ]);
  });
});

describe("projectBalances — recurring generation", () => {
  it("adds recurring income and subtracts recurring costs on the right days", () => {
    const rules: RecurringInput[] = [
      {
        id: "salary",
        name: "Salary",
        type: "income",
        frequency: "monthly",
        interval: 1,
        startDate: d("2026-01-25"),
        endDate: null,
        occurrenceCount: null,
        amountMinor: 500_00,
        accountId: "acc1",
      },
      {
        id: "rent",
        name: "Rent",
        type: "expense",
        frequency: "monthly",
        interval: 1,
        startDate: d("2026-01-05"),
        endDate: null,
        occurrenceCount: null,
        amountMinor: 200_00,
        accountId: "acc1",
      },
    ];
    const events = eventsFromRecurring(rules, d("2026-01-01"), d("2026-01-31"));
    const result = projectBalances({
      accounts: [account()],
      events,
      start: d("2026-01-01"),
      horizonDays: 30,
    });

    // Start 1000, -200 on the 5th, +500 on the 25th => 1300 at end.
    expect(result.perAccount["acc1"].endBalanceMinor).toBe(1_300_00);
    // Minimum happens after rent, before salary: 800.
    expect(result.perAccount["acc1"].minBalanceMinor).toBe(800_00);
  });
});

describe("projectBalances — PDC clearing effect", () => {
  it("debits an issued cheque from the linked account on its due date", () => {
    const pdcs: PdcInput[] = [
      {
        id: "pdc1",
        direction: "issued",
        counterparty: "Landlord",
        amountMinor: 400_00,
        dueDate: d("2026-01-10"),
        accountId: "acc1",
        chequeNumber: "204",
        status: "pending",
      },
    ];
    const events = eventsFromPdcs(pdcs, d("2026-01-01"), d("2026-01-31"));
    const result = projectBalances({
      accounts: [account()],
      events,
      start: d("2026-01-01"),
      horizonDays: 30,
    });
    expect(result.perAccount["acc1"].endBalanceMinor).toBe(600_00);
  });

  it("ignores non-pending cheques", () => {
    const pdcs: PdcInput[] = [
      {
        id: "pdc1",
        direction: "issued",
        counterparty: "Landlord",
        amountMinor: 400_00,
        dueDate: d("2026-01-10"),
        accountId: "acc1",
        chequeNumber: "204",
        status: "cleared",
      },
    ];
    const events = eventsFromPdcs(pdcs, d("2026-01-01"), d("2026-01-31"));
    expect(events).toHaveLength(0);
  });
});

describe("projectBalances — negative-balance & bounce detection", () => {
  it("flags a cheque that would overdraw the account", () => {
    const pdcs: PdcInput[] = [
      {
        id: "pdc1",
        direction: "issued",
        counterparty: "Supplier",
        amountMinor: 5_000_00,
        dueDate: d("2026-08-15"),
        accountId: "acc1",
        chequeNumber: "204",
        status: "pending",
      },
    ];
    const events = eventsFromPdcs(pdcs, d("2026-08-01"), d("2026-08-31"));
    const result = projectBalances({
      accounts: [account({ currentBalanceMinor: 3_200_00 })],
      events,
      start: d("2026-08-01"),
      horizonDays: 30,
    });

    const bounce = result.warnings.find((w) => w.type === "pdc_bounce");
    expect(bounce).toBeDefined();
    expect(bounce!.severity).toBe("critical");
    expect(bounce!.message).toContain("Cheque #204");
    expect(bounce!.message).toContain("may bounce");
    // 3,200 - 5,000 = -1,800
    expect(bounce!.projectedBalanceMinor).toBe(-1_800_00);
  });

  it("emits a buffer-breach warning when balance dips below the safety buffer", () => {
    const rules: RecurringInput[] = [
      {
        id: "big",
        name: "Big cost",
        type: "expense",
        frequency: "monthly",
        interval: 1,
        startDate: d("2026-01-10"),
        endDate: null,
        occurrenceCount: 1,
        amountMinor: 700_00,
        accountId: "acc1",
      },
    ];
    const events = eventsFromRecurring(rules, d("2026-01-01"), d("2026-01-31"));
    const result = projectBalances({
      accounts: [account({ safetyBufferMinor: 500_00 })],
      events,
      start: d("2026-01-01"),
      horizonDays: 30,
    });
    // 1000 - 700 = 300, below the 500 buffer but not negative.
    const buffer = result.warnings.find((w) => w.type === "buffer");
    expect(buffer).toBeDefined();
    expect(buffer!.severity).toBe("warning");
    const negative = result.warnings.find((w) => w.type === "negative");
    expect(negative).toBeUndefined();
  });

  it("records the first negative date and minimum balance", () => {
    const rules: RecurringInput[] = [
      {
        id: "drain",
        name: "Drain",
        type: "expense",
        frequency: "custom",
        interval: 5,
        startDate: d("2026-01-06"),
        endDate: null,
        occurrenceCount: null,
        amountMinor: 400_00,
        accountId: "acc1",
      },
    ];
    const events = eventsFromRecurring(rules, d("2026-01-01"), d("2026-01-31"));
    const result = projectBalances({
      accounts: [account()],
      events,
      start: d("2026-01-01"),
      horizonDays: 30,
    });
    // 1000 -> 600 (6th) -> 200 (11th) -> -200 (16th): first negative on the 16th.
    expect(ymd(result.perAccount["acc1"].firstNegativeDate)).toBe("2026-01-16");
    expect(result.perAccount["acc1"].minBalanceMinor).toBeLessThan(0);
  });
});

describe("computeRunway", () => {
  it("returns Infinity when net cash flow is non-negative", () => {
    const r = computeRunway(10_000_00, 500_00);
    expect(r.months).toBe(Infinity);
    expect(r.depletionDate).toBeNull();
  });

  it("computes months of runway when burning cash", () => {
    const r = computeRunway(10_000_00, -2_000_00);
    expect(r.months).toBe(5);
    expect(r.depletionDate).not.toBeNull();
  });
});

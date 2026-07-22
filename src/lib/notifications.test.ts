import { describe, expect, it } from "vitest";
import { buildNotifications, type AccountSignal, type SalaryReadySignal } from "./notifications";

const d = (s: string) => {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
};

const asset = (over: Partial<AccountSignal> = {}): AccountSignal => ({
  id: "a1",
  name: "Main",
  type: "bank",
  currency: "AED",
  balanceMinor: 1_000_00,
  creditLimitMinor: null,
  firstNegativeDate: null,
  firstPositiveDate: null,
  minBalanceMinor: 1_000_00,
  minBalanceDate: d("2026-07-22"),
  ...over,
});

const salary = (over: Partial<SalaryReadySignal> = {}): SalaryReadySignal => ({
  ruleId: "sal",
  ruleName: "Salary",
  accountName: "Main",
  amountMinor: 10_000_00,
  currency: "AED",
  date: d("2026-07-25"),
  ...over,
});

describe("buildNotifications — accounts", () => {
  it("warns when a positive account is projected to go negative", () => {
    const n = buildNotifications({
      accounts: [asset({ balanceMinor: 500_00, firstNegativeDate: d("2026-08-10") })],
      salaryReady: [],
    });
    expect(n).toHaveLength(1);
    expect(n[0].type).toBe("account_negative");
    expect(n[0].severity).toBe("critical");
    expect(n[0].key).toContain("account_negative:a1:");
  });

  it("stays quiet for a healthy account", () => {
    const n = buildNotifications({ accounts: [asset()], salaryReady: [] });
    expect(n).toHaveLength(0);
  });

  it("reassures when an overdrawn account is projected to recover", () => {
    const n = buildNotifications({
      accounts: [asset({ balanceMinor: -200_00, firstNegativeDate: d("2026-07-22"), firstPositiveDate: d("2026-07-25") })],
      salaryReady: [],
    });
    expect(n).toHaveLength(1);
    expect(n[0].type).toBe("account_positive");
    expect(n[0].severity).toBe("positive");
  });

  it("flags an overdrawn account with no recovery as critical and undated", () => {
    const n = buildNotifications({
      accounts: [asset({ balanceMinor: -200_00, firstNegativeDate: d("2026-07-22"), firstPositiveDate: null })],
      salaryReady: [],
    });
    expect(n[0].type).toBe("account_negative");
    expect(n[0].key).toBe("account_negative:a1:now");
    expect(n[0].date).toBeNull();
  });
});

describe("buildNotifications — credit cards", () => {
  const card = (over: Partial<AccountSignal> = {}): AccountSignal =>
    asset({ id: "c1", name: "Visa", type: "credit_card", balanceMinor: -1_000_00, ...over });

  it("warns only when projected debt exceeds the limit", () => {
    const over = buildNotifications({
      accounts: [card({ creditLimitMinor: 5_000_00, minBalanceMinor: -6_000_00, minBalanceDate: d("2026-08-02") })],
      salaryReady: [],
    });
    expect(over).toHaveLength(1);
    expect(over[0].type).toBe("card_over_limit");

    const under = buildNotifications({
      accounts: [card({ creditLimitMinor: 5_000_00, minBalanceMinor: -3_000_00 })],
      salaryReady: [],
    });
    expect(under).toHaveLength(0);
  });

  it("never treats a card's owed balance as 'going negative'", () => {
    const n = buildNotifications({
      accounts: [card({ creditLimitMinor: null, firstNegativeDate: d("2026-07-22") })],
      salaryReady: [],
    });
    expect(n).toHaveLength(0);
  });
});

describe("buildNotifications — salary + ordering", () => {
  it("emits a salary-ready notification per occurrence", () => {
    const n = buildNotifications({ accounts: [], salaryReady: [salary()] });
    expect(n).toHaveLength(1);
    expect(n[0].type).toBe("salary_ready");
    expect(n[0].key).toContain("salary_ready:sal:");
  });

  it("orders critical before info before positive", () => {
    const n = buildNotifications({
      accounts: [
        asset({ id: "pos", balanceMinor: -50_00, firstNegativeDate: d("2026-07-22"), firstPositiveDate: d("2026-07-30") }),
        asset({ id: "neg", balanceMinor: 100_00, firstNegativeDate: d("2026-08-01") }),
      ],
      salaryReady: [salary()],
    });
    expect(n.map((x) => x.type)).toEqual(["account_negative", "salary_ready", "account_positive"]);
  });

  it("produces stable keys for identical inputs", () => {
    const input = { accounts: [asset({ balanceMinor: 10_00, firstNegativeDate: d("2026-08-10") })], salaryReady: [salary()] };
    expect(buildNotifications(input).map((x) => x.key)).toEqual(buildNotifications(input).map((x) => x.key));
  });
});

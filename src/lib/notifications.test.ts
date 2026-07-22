import { describe, expect, it } from "vitest";
import {
  buildNotifications,
  type RecoveringAccount,
  type SalaryReadySignal,
} from "./notifications";
import type { ProjectionWarning } from "./projection";

const d = (s: string) => {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
};

const warn = (over: Partial<ProjectionWarning> = {}): ProjectionWarning => ({
  type: "negative",
  severity: "critical",
  accountId: "a1",
  accountName: "Main",
  date: d("2026-08-10"),
  message: "Main is projected to go negative",
  projectedBalanceMinor: -500_00,
  ...over,
});

const recovering = (over: Partial<RecoveringAccount> = {}): RecoveringAccount => ({
  id: "a1",
  name: "Main",
  currency: "AED",
  balanceMinor: -200_00,
  firstPositiveDate: d("2026-07-25"),
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

describe("buildNotifications — projection warnings", () => {
  it("maps a negative warning to a critical notification carrying its message", () => {
    const n = buildNotifications({ warnings: [warn()], recovering: [], salaryReady: [] });
    expect(n).toHaveLength(1);
    expect(n[0].type).toBe("account_negative");
    expect(n[0].severity).toBe("critical");
    expect(n[0].body).toBe("Main is projected to go negative");
    expect(n[0].key).toContain("account_negative:a1:");
  });

  it("maps buffer and pdc_bounce warnings", () => {
    const n = buildNotifications({
      warnings: [
        warn({ type: "buffer", severity: "warning", message: "Main drops below its safety buffer" }),
        warn({ type: "pdc_bounce", refId: "pdc9", accountId: "a2", message: "Cheque #004 may bounce" }),
      ],
      recovering: [],
      salaryReady: [],
    });
    expect(n.map((x) => x.type)).toContain("account_buffer");
    const bounce = n.find((x) => x.type === "pdc_bounce")!;
    expect(bounce.severity).toBe("critical");
    expect(bounce.key).toBe(`pdc_bounce:pdc9:${String(d("2026-08-10").getTime())}`);
  });

  it("empty in → empty out", () => {
    expect(buildNotifications({ warnings: [], recovering: [], salaryReady: [] })).toEqual([]);
  });
});

describe("buildNotifications — recovery replaces the scary warning", () => {
  it("suppresses a negative/buffer warning for a recovering account and shows recovery instead", () => {
    const n = buildNotifications({
      warnings: [warn({ date: d("2026-07-22") }), warn({ type: "buffer", severity: "warning" })],
      recovering: [recovering()],
      salaryReady: [],
    });
    expect(n).toHaveLength(1);
    expect(n[0].type).toBe("account_positive");
    expect(n[0].severity).toBe("positive");
  });

  it("still surfaces a bounce warning even while an account is recovering", () => {
    const n = buildNotifications({
      warnings: [warn({ type: "pdc_bounce", refId: "pdc1", message: "Cheque may bounce" })],
      recovering: [recovering()],
      salaryReady: [],
    });
    expect(n.map((x) => x.type).sort()).toEqual(["account_positive", "pdc_bounce"]);
  });
});

describe("buildNotifications — salary + ordering", () => {
  it("emits a salary-ready notification per occurrence", () => {
    const n = buildNotifications({ warnings: [], recovering: [], salaryReady: [salary()] });
    expect(n).toHaveLength(1);
    expect(n[0].type).toBe("salary_ready");
    expect(n[0].key).toContain("salary_ready:sal:");
  });

  it("orders critical before info before positive", () => {
    const n = buildNotifications({
      warnings: [warn({ accountId: "neg", accountName: "Neg" })],
      recovering: [recovering({ id: "pos", name: "Pos" })],
      salaryReady: [salary()],
    });
    expect(n.map((x) => x.type)).toEqual(["account_negative", "salary_ready", "account_positive"]);
  });

  it("produces stable keys for identical inputs", () => {
    const input = { warnings: [warn()], recovering: [], salaryReady: [salary()] };
    expect(buildNotifications(input).map((x) => x.key)).toEqual(buildNotifications(input).map((x) => x.key));
  });
});

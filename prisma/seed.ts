/* eslint-disable no-console */
// Seed script — populates a realistic AED single-user dataset so the app is
// alive on first run: a salaried job, rent paid via 12 post-dated cheques,
// everyday expenses, recurring subscriptions, a couple of sinking funds and a
// small multi-currency rate table.

import { PrismaClient } from "@prisma/client";
import {
  addDays,
  addMonths,
  setDate,
  startOfMonth,
  subDays,
  subMonths,
  format,
} from "date-fns";

const prisma = new PrismaClient();

// Minor-unit helpers (AED has 2 decimals).
const aed = (major: number) => Math.round(major * 100);
const now = new Date();
const monthKey = (d: Date) => format(d, "yyyy-MM");

async function main() {
  console.log("🌱 Seeding database…");

  // Clean slate (respect FK order).
  await prisma.provisionAllocation.deleteMany();
  await prisma.provision.deleteMany();
  await prisma.pDC.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.recurringRule.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.category.deleteMany();
  await prisma.account.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.appSetting.deleteMany();

  // ── Settings ──────────────────────────────────────────────────────────────
  await prisma.appSetting.create({
    data: {
      id: "singleton",
      baseCurrency: "AED",
      defaultBufferMinor: aed(2000),
      theme: "system",
    },
  });

  // ── Exchange rates (1 AED = rate) ───────────────────────────────────────────
  await prisma.exchangeRate.createMany({
    data: [
      { base: "AED", quote: "USD", rate: 0.2723 },
      { base: "AED", quote: "EUR", rate: 0.2512 },
      { base: "AED", quote: "GBP", rate: 0.2145 },
      { base: "AED", quote: "INR", rate: 22.71 },
      { base: "AED", quote: "SAR", rate: 1.021 },
    ],
  });

  // ── Accounts ────────────────────────────────────────────────────────────────
  const bank = await prisma.account.create({
    data: {
      name: "Emirates NBD — Current",
      type: "bank",
      currency: "AED",
      openingBalanceMinor: aed(18500),
      safetyBufferMinor: aed(3000),
      color: "#2563eb",
      sortOrder: 0,
    },
  });
  const cash = await prisma.account.create({
    data: {
      name: "Cash Wallet",
      type: "cash",
      currency: "AED",
      openingBalanceMinor: aed(650),
      safetyBufferMinor: 0,
      color: "#16a34a",
      sortOrder: 1,
    },
  });
  const card = await prisma.account.create({
    data: {
      name: "ADCB Credit Card",
      type: "credit_card",
      currency: "AED",
      openingBalanceMinor: aed(-2400),
      safetyBufferMinor: 0,
      color: "#db2777",
      sortOrder: 2,
    },
  });

  // ── Categories ──────────────────────────────────────────────────────────────
  const mk = (
    name: string,
    kind: "income" | "expense",
    icon: string,
    color: string,
    sortOrder: number,
  ) => prisma.category.create({ data: { name, kind, icon, color, sortOrder } });

  const cSalary = await mk("Salary", "income", "Wallet", "#16a34a", 0);
  const cFreelance = await mk("Freelance", "income", "Laptop", "#0d9488", 1);
  const cReimb = await mk("Reimbursement", "income", "Receipt", "#0891b2", 2);
  const cGifts = await mk("Gifts", "income", "Gift", "#7c3aed", 3);

  const cRent = await mk("Rent", "expense", "Home", "#dc2626", 0);
  const cGroceries = await mk("Groceries", "expense", "ShoppingCart", "#ea580c", 1);
  const cDining = await mk("Dining", "expense", "Utensils", "#d97706", 2);
  const cTransport = await mk("Transport", "expense", "Car", "#ca8a04", 3);
  const cUtilities = await mk("Utilities", "expense", "Zap", "#65a30d", 4);
  const cSubs = await mk("Subscriptions", "expense", "Repeat", "#0ea5e9", 5);
  const cShopping = await mk("Shopping", "expense", "ShoppingBag", "#8b5cf6", 6);
  const cHealth = await mk("Health", "expense", "HeartPulse", "#e11d48", 7);
  const cLoan = await mk("Loan", "expense", "Landmark", "#475569", 8);

  // ── Recurring rules ─────────────────────────────────────────────────────────
  const salaryDay = setDate(now, 25);
  const salaryRule = await prisma.recurringRule.create({
    data: {
      name: "Monthly Salary",
      type: "income",
      frequency: "monthly",
      interval: 1,
      startDate: setDate(subMonths(now, 6), 25),
      nextRunDate: salaryDay > now ? salaryDay : setDate(addMonths(now, 1), 25),
      amountMinor: aed(22000),
      accountId: bank.id,
      categoryId: cSalary.id,
      note: "Net salary",
    },
  });

  await prisma.recurringRule.create({
    data: {
      name: "Netflix",
      type: "expense",
      frequency: "monthly",
      interval: 1,
      startDate: setDate(subMonths(now, 6), 3),
      nextRunDate: setDate(addMonths(now, 1), 3),
      amountMinor: aed(56),
      accountId: card.id,
      categoryId: cSubs.id,
      note: "Netflix Premium",
    },
  });
  await prisma.recurringRule.create({
    data: {
      name: "Gym Membership",
      type: "expense",
      frequency: "monthly",
      interval: 1,
      startDate: setDate(subMonths(now, 3), 1),
      nextRunDate: setDate(addMonths(now, 1), 1),
      amountMinor: aed(300),
      accountId: bank.id,
      categoryId: cHealth.id,
      note: "Fitness First",
    },
  });
  await prisma.recurringRule.create({
    data: {
      name: "Car Loan Installment",
      type: "expense",
      frequency: "monthly",
      interval: 1,
      startDate: setDate(subMonths(now, 10), 5),
      endDate: setDate(addMonths(now, 14), 5),
      nextRunDate: setDate(now, 5) > now ? setDate(now, 5) : setDate(addMonths(now, 1), 5),
      amountMinor: aed(1650),
      accountId: bank.id,
      categoryId: cLoan.id,
      note: "Toyota — 24 month plan",
    },
  });
  await prisma.recurringRule.create({
    data: {
      name: "DEWA Utilities",
      type: "expense",
      frequency: "monthly",
      interval: 1,
      startDate: setDate(subMonths(now, 6), 12),
      nextRunDate: setDate(now, 12) > now ? setDate(now, 12) : setDate(addMonths(now, 1), 12),
      amountMinor: aed(480),
      accountId: bank.id,
      categoryId: cUtilities.id,
      note: "Electricity + water",
    },
  });

  // ── Rent via 12 monthly PDCs ────────────────────────────────────────────────
  const rentRule = await prisma.recurringRule.create({
    data: {
      name: "Annual Rent (12 cheques)",
      type: "expense",
      frequency: "monthly",
      interval: 1,
      startDate: startOfMonth(subMonths(now, 2)),
      endDate: startOfMonth(addMonths(now, 9)),
      nextRunDate: startOfMonth(addMonths(now, 1)),
      amountMinor: aed(5500),
      accountId: bank.id,
      categoryId: cRent.id,
      note: "Apartment rent",
    },
  });

  for (let i = 0; i < 12; i++) {
    const due = setDate(addMonths(startOfMonth(subMonths(now, 2)), i), 1);
    const isPast = due < subDays(now, 1);
    await prisma.pDC.create({
      data: {
        direction: "issued",
        counterparty: "Al Habtoor Properties",
        amountMinor: aed(5500),
        currency: "AED",
        issueDate: startOfMonth(subMonths(now, 2)),
        dueDate: due,
        bankName: "Emirates NBD",
        chequeNumber: String(100200 + i),
        status: isPast ? "cleared" : "pending",
        accountId: bank.id,
        recurringRuleId: rentRule.id,
        notes: `Rent cheque ${i + 1} of 12`,
      },
    });
  }

  // A received cheque (freelance client) + a standalone issued cheque.
  await prisma.pDC.create({
    data: {
      direction: "received",
      counterparty: "Meridian Design LLC",
      amountMinor: aed(8000),
      currency: "AED",
      issueDate: subDays(now, 5),
      dueDate: addDays(now, 12),
      bankName: "Mashreq",
      chequeNumber: "556677",
      status: "pending",
      accountId: bank.id,
      notes: "Freelance project — final payment",
    },
  });
  await prisma.pDC.create({
    data: {
      direction: "issued",
      counterparty: "Gulf Auto Garage",
      amountMinor: aed(3200),
      currency: "AED",
      issueDate: subDays(now, 2),
      dueDate: addDays(now, 20),
      bankName: "Emirates NBD",
      chequeNumber: "204",
      status: "pending",
      accountId: bank.id,
      notes: "Car service & tyres",
    },
  });

  // ── Historical transactions (last ~45 days of real life) ────────────────────
  type TxSeed = {
    daysAgo: number;
    type: "income" | "expense";
    amount: number;
    accountId: string;
    categoryId: string;
    note: string;
    tags?: string[];
  };
  const txs: TxSeed[] = [
    { daysAgo: 19, type: "income", amount: 22000, accountId: bank.id, categoryId: cSalary.id, note: "Net salary — June" },
    { daysAgo: 40, type: "income", amount: 3500, accountId: bank.id, categoryId: cFreelance.id, note: "Logo design project" },
    { daysAgo: 8, type: "income", amount: 420, accountId: bank.id, categoryId: cReimb.id, note: "Work travel reimbursement" },
    { daysAgo: 2, type: "expense", amount: 214.5, accountId: card.id, categoryId: cGroceries.id, note: "Carrefour", tags: ["weekly"] },
    { daysAgo: 3, type: "expense", amount: 68, accountId: cash.id, categoryId: cDining.id, note: "Lunch with team" },
    { daysAgo: 4, type: "expense", amount: 45, accountId: cash.id, categoryId: cTransport.id, note: "Careem" },
    { daysAgo: 6, type: "expense", amount: 320, accountId: card.id, categoryId: cShopping.id, note: "Noon — home stuff" },
    { daysAgo: 7, type: "expense", amount: 132.75, accountId: card.id, categoryId: cGroceries.id, note: "Spinneys" },
    { daysAgo: 9, type: "expense", amount: 89, accountId: cash.id, categoryId: cDining.id, note: "Dinner out" },
    { daysAgo: 11, type: "expense", amount: 250, accountId: bank.id, categoryId: cHealth.id, note: "Pharmacy + clinic" },
    { daysAgo: 12, type: "expense", amount: 60, accountId: cash.id, categoryId: cTransport.id, note: "Salik + fuel" },
    { daysAgo: 14, type: "expense", amount: 410, accountId: card.id, categoryId: cGroceries.id, note: "Lulu Hypermarket", tags: ["weekly"] },
    { daysAgo: 16, type: "expense", amount: 175, accountId: card.id, categoryId: cDining.id, note: "Weekend brunch" },
    { daysAgo: 18, type: "expense", amount: 56, accountId: card.id, categoryId: cSubs.id, note: "Netflix" },
    { daysAgo: 21, type: "expense", amount: 300, accountId: bank.id, categoryId: cHealth.id, note: "Gym membership" },
    { daysAgo: 22, type: "expense", amount: 1650, accountId: bank.id, categoryId: cLoan.id, note: "Car loan installment" },
    { daysAgo: 24, type: "expense", amount: 480, accountId: bank.id, categoryId: cUtilities.id, note: "DEWA bill" },
    { daysAgo: 27, type: "expense", amount: 220, accountId: card.id, categoryId: cShopping.id, note: "Clothing" },
    { daysAgo: 30, type: "expense", amount: 95, accountId: cash.id, categoryId: cDining.id, note: "Coffee & snacks" },
    { daysAgo: 33, type: "expense", amount: 380, accountId: card.id, categoryId: cGroceries.id, note: "Carrefour", tags: ["weekly"] },
  ];

  for (const t of txs) {
    await prisma.transaction.create({
      data: {
        type: t.type,
        amountMinor: aed(t.amount),
        currency: "AED",
        date: subDays(now, t.daysAgo),
        note: t.note,
        tags: JSON.stringify(t.tags ?? []),
        accountId: t.accountId,
        categoryId: t.categoryId,
        recurringRuleId: t.categoryId === cSalary.id ? salaryRule.id : undefined,
      },
    });
  }

  // ── Provisions (sinking funds) ──────────────────────────────────────────────
  const insurance = await prisma.provision.create({
    data: {
      name: "Car Insurance Renewal",
      targetMinor: aed(2400),
      dueDate: addMonths(now, 4),
      priority: 1,
      accountId: bank.id,
      status: "active",
    },
  });
  await prisma.provisionAllocation.createMany({
    data: [
      { provisionId: insurance.id, amountMinor: aed(600), date: subMonths(now, 2), accountId: bank.id },
      { provisionId: insurance.id, amountMinor: aed(600), date: subMonths(now, 1), accountId: bank.id },
    ],
  });

  const laptop = await prisma.provision.create({
    data: {
      name: "New Laptop",
      targetMinor: aed(7000),
      dueDate: addMonths(now, 6),
      priority: 2,
      accountId: bank.id,
      status: "active",
    },
  });
  await prisma.provisionAllocation.create({
    data: { provisionId: laptop.id, amountMinor: aed(1500), date: subDays(now, 10), accountId: bank.id },
  });

  const travel = await prisma.provision.create({
    data: {
      name: "Eid Travel Fund",
      targetMinor: aed(5000),
      dueDate: addMonths(now, 2),
      priority: 2,
      accountId: bank.id,
      status: "active",
    },
  });
  await prisma.provisionAllocation.create({
    data: { provisionId: travel.id, amountMinor: aed(1200), date: subDays(now, 20), accountId: bank.id },
  });

  // ── Budgets (this month) ────────────────────────────────────────────────────
  const thisMonth = monthKey(now);
  await prisma.budget.createMany({
    data: [
      { categoryId: cGroceries.id, month: thisMonth, plannedMinor: aed(1800) },
      { categoryId: cDining.id, month: thisMonth, plannedMinor: aed(800) },
      { categoryId: cTransport.id, month: thisMonth, plannedMinor: aed(500) },
      { categoryId: cShopping.id, month: thisMonth, plannedMinor: aed(700) },
      { categoryId: cSubs.id, month: thisMonth, plannedMinor: aed(200) },
    ],
  });

  const counts = {
    accounts: await prisma.account.count(),
    categories: await prisma.category.count(),
    transactions: await prisma.transaction.count(),
    pdcs: await prisma.pDC.count(),
    provisions: await prisma.provision.count(),
    recurring: await prisma.recurringRule.count(),
  };
  console.log("✅ Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

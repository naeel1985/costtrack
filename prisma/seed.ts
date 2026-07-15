/* eslint-disable no-console */
// Seed: bootstrap the admin account from environment variables, and create a
// verified demo user populated with realistic AED sample data (encrypted with
// the demo user's own key, exactly as the app would store it).

import { PrismaClient } from "@prisma/client";
import { addDays, addMonths, setDate, startOfMonth, subDays, subMonths } from "date-fns";
import { hashPassword, createWrappedDek, encrypt } from "../src/lib/crypto";

const prisma = new PrismaClient();

const aed = (major: number) => Math.round(major * 100);
const now = new Date();

// Encryption helpers bound to a DEK (mirror src/server/crypto-map).
const enc =
  (dek: Buffer) =>
  (s: string) =>
    encrypt(s, dek);
const encI =
  (dek: Buffer) =>
  (n: number) =>
    encrypt(String(Math.trunc(n)), dek);

async function upsertAdmin() {
  const username = (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
  const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

  const passwordHash = hashPassword(password);
  const { dekWrapped, dekSalt } = createWrappedDek(password);

  const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        username,
        email,
        role: "admin",
        emailVerified: true,
        emailVerifiedAt: new Date(),
        isActive: true,
        passwordHash,
        dekWrapped,
        dekSalt,
      },
    });
    console.log(`✅ Admin updated: ${username} / ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      username,
      email,
      fullName: "Administrator",
      role: "admin",
      emailVerified: true,
      emailVerifiedAt: new Date(),
      passwordHash,
      dekWrapped,
      dekSalt,
      settings: { create: {} },
    },
  });
  console.log(`✅ Admin created: ${username} / ${email}`);
}

async function seedDemoUser() {
  const email = "demo@cashflow.local";
  const password = "DemoPass123!";
  // Fresh start for the demo user.
  await prisma.user.deleteMany({ where: { email } });

  const passwordHash = hashPassword(password);
  const { dek, dekWrapped, dekSalt } = createWrappedDek(password);
  const e = enc(dek);
  const ei = encI(dek);

  const user = await prisma.user.create({
    data: {
      username: "demo",
      email,
      fullName: "Demo User",
      phone: "+971 50 123 4567",
      role: "user",
      emailVerified: true,
      emailVerifiedAt: new Date(),
      passwordHash,
      dekWrapped,
      dekSalt,
      settings: { create: { baseCurrency: "AED", defaultBufferMinor: aed(2000) } },
      exchangeRates: {
        create: [
          { base: "AED", quote: "USD", rate: 0.2723 },
          { base: "AED", quote: "EUR", rate: 0.2512 },
          { base: "AED", quote: "INR", rate: 22.71 },
        ],
      },
    },
  });
  const userId = user.id;

  const bank = await prisma.account.create({
    data: { userId, nameEnc: e("Emirates NBD — Current"), type: "bank", currency: "AED", openingBalanceEnc: ei(aed(18500)), safetyBufferEnc: ei(aed(3000)), color: "#2563eb", sortOrder: 0 },
  });
  const cash = await prisma.account.create({
    data: { userId, nameEnc: e("Cash Wallet"), type: "cash", currency: "AED", openingBalanceEnc: ei(aed(650)), safetyBufferEnc: ei(0), color: "#16a34a", sortOrder: 1 },
  });
  const card = await prisma.account.create({
    data: { userId, nameEnc: e("ADCB Credit Card"), type: "credit_card", currency: "AED", openingBalanceEnc: ei(aed(-2400)), safetyBufferEnc: ei(0), color: "#db2777", sortOrder: 2 },
  });

  const mkCat = (name: string, kind: "income" | "expense", icon: string, color: string, sortOrder: number) =>
    prisma.category.create({ data: { userId, nameEnc: e(name), kind, icon, color, sortOrder } });

  const cSalary = await mkCat("Salary", "income", "Wallet", "#16a34a", 0);
  const cFreelance = await mkCat("Freelance", "income", "Laptop", "#0d9488", 1);
  const cReimb = await mkCat("Reimbursement", "income", "Receipt", "#0891b2", 2);
  const cRent = await mkCat("Rent", "expense", "Home", "#dc2626", 0);
  const cGroceries = await mkCat("Groceries", "expense", "ShoppingCart", "#ea580c", 1);
  const cDining = await mkCat("Dining", "expense", "Utensils", "#d97706", 2);
  const cTransport = await mkCat("Transport", "expense", "Car", "#ca8a04", 3);
  const cUtilities = await mkCat("Utilities", "expense", "Zap", "#65a30d", 4);
  const cSubs = await mkCat("Subscriptions", "expense", "Repeat", "#0ea5e9", 5);
  const cHealth = await mkCat("Health", "expense", "HeartPulse", "#e11d48", 7);
  const cLoan = await mkCat("Loan", "expense", "Landmark", "#475569", 8);

  const nextOn = (day: number) => (setDate(now, day) > now ? setDate(now, day) : setDate(addMonths(now, 1), day));

  const salaryRule = await prisma.recurringRule.create({
    data: { userId, nameEnc: e("Monthly Salary"), type: "income", frequency: "monthly", interval: 1, startDate: setDate(subMonths(now, 6), 25), nextRunDate: nextOn(25), amountEnc: ei(aed(22000)), currency: "AED", accountId: bank.id, categoryId: cSalary.id, noteEnc: e("Net salary") },
  });
  await prisma.recurringRule.create({
    data: { userId, nameEnc: e("Netflix"), type: "expense", frequency: "monthly", interval: 1, startDate: setDate(subMonths(now, 6), 3), nextRunDate: nextOn(3), amountEnc: ei(aed(56)), currency: "AED", accountId: card.id, categoryId: cSubs.id, noteEnc: e("Netflix Premium") },
  });
  await prisma.recurringRule.create({
    data: { userId, nameEnc: e("Car Loan Installment"), type: "expense", frequency: "monthly", interval: 1, startDate: setDate(subMonths(now, 10), 5), endDate: setDate(addMonths(now, 14), 5), nextRunDate: nextOn(5), amountEnc: ei(aed(1650)), currency: "AED", accountId: bank.id, categoryId: cLoan.id, noteEnc: e("Toyota — 24 month plan") },
  });
  await prisma.recurringRule.create({
    data: { userId, nameEnc: e("DEWA Utilities"), type: "expense", frequency: "monthly", interval: 1, startDate: setDate(subMonths(now, 6), 12), nextRunDate: nextOn(12), amountEnc: ei(aed(480)), currency: "AED", accountId: bank.id, categoryId: cUtilities.id, noteEnc: e("Electricity + water") },
  });

  const rentRule = await prisma.recurringRule.create({
    data: { userId, nameEnc: e("Annual Rent (12 cheques)"), type: "expense", frequency: "monthly", interval: 1, startDate: startOfMonth(subMonths(now, 2)), endDate: startOfMonth(addMonths(now, 9)), nextRunDate: startOfMonth(addMonths(now, 1)), amountEnc: ei(aed(5500)), currency: "AED", accountId: bank.id, categoryId: cRent.id, noteEnc: e("Apartment rent") },
  });
  for (let i = 0; i < 12; i++) {
    const due = setDate(addMonths(startOfMonth(subMonths(now, 2)), i), 1);
    const isPast = due < subDays(now, 1);
    await prisma.pDC.create({
      data: { userId, direction: "issued", counterpartyEnc: e("Al Habtoor Properties"), amountEnc: ei(aed(5500)), currency: "AED", issueDate: startOfMonth(subMonths(now, 2)), dueDate: due, bankNameEnc: e("Emirates NBD"), chequeNumberEnc: e(String(100200 + i)), status: isPast ? "cleared" : "pending", accountId: bank.id, recurringRuleId: rentRule.id, notesEnc: e(`Rent cheque ${i + 1} of 12`) },
    });
  }
  await prisma.pDC.create({
    data: { userId, direction: "received", counterpartyEnc: e("Meridian Design LLC"), amountEnc: ei(aed(8000)), currency: "AED", issueDate: subDays(now, 5), dueDate: addDays(now, 12), bankNameEnc: e("Mashreq"), chequeNumberEnc: e("556677"), status: "pending", accountId: bank.id, notesEnc: e("Freelance project — final payment") },
  });
  await prisma.pDC.create({
    data: { userId, direction: "issued", counterpartyEnc: e("Gulf Auto Garage"), amountEnc: ei(aed(3200)), currency: "AED", issueDate: subDays(now, 2), dueDate: addDays(now, 20), bankNameEnc: e("Emirates NBD"), chequeNumberEnc: e("204"), status: "pending", accountId: bank.id, notesEnc: e("Car service & tyres") },
  });

  const txs = [
    { daysAgo: 19, type: "income", amount: 22000, accountId: bank.id, categoryId: cSalary.id, note: "Net salary — last month", rule: salaryRule.id },
    { daysAgo: 40, type: "income", amount: 3500, accountId: bank.id, categoryId: cFreelance.id, note: "Logo design project" },
    { daysAgo: 8, type: "income", amount: 420, accountId: bank.id, categoryId: cReimb.id, note: "Work travel reimbursement" },
    { daysAgo: 2, type: "expense", amount: 214.5, accountId: card.id, categoryId: cGroceries.id, note: "Carrefour", tags: ["weekly"] },
    { daysAgo: 3, type: "expense", amount: 68, accountId: cash.id, categoryId: cDining.id, note: "Lunch with team" },
    { daysAgo: 4, type: "expense", amount: 45, accountId: cash.id, categoryId: cTransport.id, note: "Careem" },
    { daysAgo: 6, type: "expense", amount: 320, accountId: card.id, categoryId: cGroceries.id, note: "Noon — home stuff" },
    { daysAgo: 9, type: "expense", amount: 89, accountId: cash.id, categoryId: cDining.id, note: "Dinner out" },
    { daysAgo: 11, type: "expense", amount: 250, accountId: bank.id, categoryId: cHealth.id, note: "Pharmacy + clinic" },
    { daysAgo: 14, type: "expense", amount: 410, accountId: card.id, categoryId: cGroceries.id, note: "Lulu Hypermarket", tags: ["weekly"] },
    { daysAgo: 18, type: "expense", amount: 56, accountId: card.id, categoryId: cSubs.id, note: "Netflix" },
    { daysAgo: 22, type: "expense", amount: 1650, accountId: bank.id, categoryId: cLoan.id, note: "Car loan installment" },
    { daysAgo: 24, type: "expense", amount: 480, accountId: bank.id, categoryId: cUtilities.id, note: "DEWA bill" },
    { daysAgo: 33, type: "expense", amount: 380, accountId: card.id, categoryId: cGroceries.id, note: "Carrefour", tags: ["weekly"] },
  ] as const;
  for (const t of txs) {
    await prisma.transaction.create({
      data: { userId, type: t.type, amountEnc: ei(aed(t.amount)), currency: "AED", date: subDays(now, t.daysAgo), noteEnc: e(t.note), tagsEnc: e(JSON.stringify((t as { tags?: string[] }).tags ?? [])), accountId: t.accountId, categoryId: t.categoryId, recurringRuleId: (t as { rule?: string }).rule },
    });
  }

  const insurance = await prisma.provision.create({
    data: { userId, nameEnc: e("Car Insurance Renewal"), targetEnc: ei(aed(2400)), currency: "AED", dueDate: addMonths(now, 4), priority: 1, accountId: bank.id, status: "active" },
  });
  await prisma.provisionAllocation.createMany({
    data: [
      { userId, provisionId: insurance.id, amountEnc: ei(aed(600)), date: subMonths(now, 2), accountId: bank.id },
      { userId, provisionId: insurance.id, amountEnc: ei(aed(600)), date: subMonths(now, 1), accountId: bank.id },
    ],
  });
  const laptop = await prisma.provision.create({
    data: { userId, nameEnc: e("New Laptop"), targetEnc: ei(aed(7000)), currency: "AED", dueDate: addMonths(now, 6), priority: 2, accountId: bank.id, status: "active" },
  });
  await prisma.provisionAllocation.create({
    data: { userId, provisionId: laptop.id, amountEnc: ei(aed(1500)), date: subDays(now, 10), accountId: bank.id },
  });

  console.log(`✅ Demo user seeded: demo@cashflow.local / DemoPass123!`);
}

async function main() {
  console.log("🌱 Seeding…");
  await upsertAdmin();
  await seedDemoUser();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

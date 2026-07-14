/* eslint-disable no-console */
// Wipe all data but keep the schema — leaves the app running with pristine
// empty states. Re-populate any time with `npm run db:seed`.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Clearing all data…");
  // Delete in FK-safe order.
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

  // Recreate the settings singleton so the app has a base currency.
  await prisma.appSetting.create({
    data: { id: "singleton", baseCurrency: "AED", defaultBufferMinor: 0, theme: "system" },
  });

  console.log("✅ Database is empty (settings singleton kept).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

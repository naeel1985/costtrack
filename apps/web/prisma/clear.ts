/* eslint-disable no-console */
// Wipe ALL data (every user and their encrypted records) but keep the schema.
// Run `npm run db:seed` afterwards to recreate the admin + demo user.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Clearing all data…");
  // Deleting users cascades to sessions, tokens, and all domain data.
  await prisma.loginAttempt.deleteMany();
  await prisma.user.deleteMany();
  console.log("✅ Database is empty.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

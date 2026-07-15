/* eslint-disable no-console */
// Verifies the security model against the live DB: a user's password unwraps
// their DEK and decrypts their data; the admin's DEK cannot.
import { PrismaClient } from "@prisma/client";
import { verifyPassword, unwrapDek, decrypt } from "../src/lib/crypto";

const prisma = new PrismaClient();

async function main() {
  const demo = await prisma.user.findUniqueOrThrow({ where: { email: "demo@cashflow.local" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "admin" } });

  console.log("1) demo password verifies:", verifyPassword("DemoPass123!", demo.passwordHash));
  console.log("   wrong password rejected:", !verifyPassword("nope", demo.passwordHash));

  const demoDek = unwrapDek("DemoPass123!", { dekWrapped: demo.dekWrapped, dekSalt: demo.dekSalt });
  const account = await prisma.account.findFirstOrThrow({ where: { userId: demo.id, type: "bank" } });
  console.log("2) demo decrypts own account name:", decrypt(account.nameEnc, demoDek));

  const adminDek = unwrapDek(process.env.ADMIN_PASSWORD ?? "AdminKanz2206!", { dekWrapped: admin.dekWrapped, dekSalt: admin.dekSalt });
  let adminBlocked = false;
  try {
    decrypt(account.nameEnc, adminDek);
  } catch {
    adminBlocked = true;
  }
  console.log("3) admin CANNOT decrypt demo's data:", adminBlocked);

  console.log("4) ciphertext at rest (nameEnc):", account.nameEnc.slice(0, 40) + "…");

  const counts = {
    users: await prisma.user.count(),
    accounts: await prisma.account.count(),
    transactions: await prisma.transaction.count(),
    pdcs: await prisma.pDC.count(),
  };
  console.log("5) row counts:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

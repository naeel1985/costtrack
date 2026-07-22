/* eslint-disable no-console */
// Mint a real session for a user (used only for local end-to-end verification).
// Usage: tsx scripts/login-token.ts <email> <password>
import { PrismaClient } from "@prisma/client";
import { verifyPassword, unwrapDek, generateToken, hashToken, sealDekForSession } from "../src/lib/crypto";

const prisma = new PrismaClient();

async function main() {
  const [email, password] = process.argv.slice(2);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  if (!verifyPassword(password, user.passwordHash)) throw new Error("bad password");
  const dek = unwrapDek(password, { dekWrapped: user.dekWrapped, dekSalt: user.dekSalt });
  const token = generateToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      encDek: sealDekForSession(dek),
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    },
  });
  console.log(token);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

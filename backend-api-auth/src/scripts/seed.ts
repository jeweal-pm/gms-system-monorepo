import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { prisma } from "../database/prisma-client";
import { CATALOG_LEAF_KEYS } from "../permission/catalog";

const demoPassword = "password123";
const demoUsers = [
  { name: "Super Admin", email: "superadmin@demo.com", role: "admin" },
  { name: "Demo User", email: "user@demo.com", role: "user" },
] as const;

async function seed() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Demo accounts can only be seeded when NODE_ENV=development.");
  }

  const passwordHash = await argon2.hash(demoPassword, { type: argon2.argon2id });
  for (const demoUser of demoUsers) {
    const now = new Date();
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      update: { name: demoUser.name, role: demoUser.role, emailVerified: true, updatedAt: now },
      create: {
        id: randomUUID(),
        ...demoUser,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });
    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
      select: { id: true },
    });

    if (account) {
      await prisma.account.update({ where: { id: account.id }, data: { password: passwordHash, updatedAt: now } });
    } else {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          accountId: user.id,
          providerId: "credential",
          userId: user.id,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    if (demoUser.role === "user") {
      // Development only (BE-UP-013): the demo regular user gets VIEW on every catalog leaf.
      await prisma.userPermission.createMany({
        data: CATALOG_LEAF_KEYS.map((menuKey) => ({ userId: user.id, menuKey, action: "VIEW" as const })),
        skipDuplicates: true,
      });
    }
  }

  console.info(`Seeded ${demoUsers.length} local demo accounts; the demo user has VIEW on ${CATALOG_LEAF_KEYS.length} menus.`);
}

seed().catch((error: unknown) => {
  console.error("Demo account seeding failed.", error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});

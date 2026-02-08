import { hashPassword } from "./auth";
import { env } from "./env";
import { prisma } from "./prisma";

export async function ensureAdminUser(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: env.adminEmail } });
  if (existing) {
    return;
  }

  const passwordHash = await hashPassword(env.adminPassword);
  await prisma.user.create({
    data: {
      email: env.adminEmail,
      name: "System Administrator",
      passwordHash,
      role: "ADMIN"
    }
  });
}

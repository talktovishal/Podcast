import { hashPassword } from "./auth";
import { env } from "./env";
import { prisma } from "./prisma";

export async function ensureAdminUser(): Promise<void> {
  if (!env.adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD environment variable is required but not set. " +
      "Add it to your .env file or deployment environment before starting the server."
    );
  }

  const passwordHash = await hashPassword(env.adminPassword);
  const existing = await prisma.user.findUnique({ where: { email: env.adminEmail } });
  if (existing) {
    await prisma.user.update({ where: { email: env.adminEmail }, data: { passwordHash } });
    return;
  }

  await prisma.user.create({
    data: {
      email: env.adminEmail,
      name: "System Administrator",
      passwordHash,
      role: "ADMIN"
    }
  });
}

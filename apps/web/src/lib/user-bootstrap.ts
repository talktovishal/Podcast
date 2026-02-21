import { hashPassword } from "./auth";
import { env } from "./env";
import { logger } from "./logger";
import { prisma } from "./prisma";

const DEFAULT_ADMIN_PASSWORD = "admin-demo-password";

export async function ensureAdminUser(): Promise<void> {
  if (process.env.NODE_ENV === "production" && env.adminPassword === DEFAULT_ADMIN_PASSWORD) {
    void logger.warn("SECURITY: ADMIN_PASSWORD is not set. The admin account is using the default insecure password. Set ADMIN_PASSWORD in your environment.");
  }

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

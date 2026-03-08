import { hashPassword } from "./auth";
import { env } from "./env";
import { createPrimaryUser, findPrimaryUserByEmail, updatePrimaryUser } from "./metadata-primary-auth";

let _bootstrapped = false;

export async function ensureAdminUser(): Promise<void> {
  if (_bootstrapped) return;
  // Mark as bootstrapped before the first await so concurrent requests skip this path.
  _bootstrapped = true;
  try {
    if (!env.adminPassword) {
      throw new Error(
        "ADMIN_PASSWORD environment variable is required but not set. " +
        "Add it to your .env file or deployment environment before starting the server."
      );
    }

    const existing = await findPrimaryUserByEmail(env.adminEmail);
    const passwordHash = await hashPassword(env.adminPassword);
    if (existing) {
      await updatePrimaryUser(existing.id, { passwordHash });
      return;
    }

    await createPrimaryUser({
      email: env.adminEmail,
      name: "System Administrator",
      passwordHash,
      role: "ADMIN"
    });
  } catch (error) {
    _bootstrapped = false;
    throw error;
  }
}

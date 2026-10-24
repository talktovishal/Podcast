/**
 * Next.js instrumentation hook — runs once when the server starts.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
import { PHASE_PRODUCTION_BUILD } from "next/constants";

declare global {
  var __articlepodServerKeepalive__: ReturnType<typeof setInterval> | undefined;
}

export async function register() {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return;
  }
  // Only run in the Node.js runtime (not Edge), where Prisma and bcrypt are available.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.ARTICLEPOD_SERVER_KEEPALIVE === "1" && !global.__articlepodServerKeepalive__) {
      global.__articlepodServerKeepalive__ = setInterval(() => undefined, 60 * 60 * 1000);
    }

    if (process.env.ARTICLEPOD_BOOTSTRAP_ADMIN_ON_STARTUP !== "0") {
      const { ensureAdminUser } = await import("./lib/user-bootstrap");
      await ensureAdminUser();
    }
  }
}

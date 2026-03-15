import { test as teardown, expect } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./helpers";

const BASE_URL = process.env.APP_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@articlepod.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// Title of the seeded demo item that must NOT be deleted
const SEED_ITEM_TITLE = "Welcome to ArticlePod";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Global teardown that runs after all test projects.
 * 1. Logs in as demo user → deletes any non-seed items
 * 2. Finds and deletes any e2e-* test user accounts
 * 3. Logs in as admin → resets demo user submission quota
 */
teardown("cleanup test data", async ({ request }) => {
  // Wait for login rate limiter (10 req/min/IP) to fully reset from test login calls.
  // The rate limit window is 60s; auth tests consume ~7 slots.
  // A 12s delay ensures enough slots have recovered.
  await delay(12000);

  // ── 1. Clean up demo user's test-created items ──────────────────
  const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { mode: "login", email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });

  if (loginRes.ok()) {
    const itemsRes = await request.get(`${BASE_URL}/api/seed-demo`);
    if (itemsRes.ok()) {
      const { items } = await itemsRes.json();
      const testItems = (items || []).filter(
        (item: { title: string | null }) =>
          item.title !== SEED_ITEM_TITLE
      );

      for (const item of testItems) {
        const delRes = await request.delete(
          `${BASE_URL}/api/items/${item.id}`
        );
        if (delRes.ok()) {
          console.log(`  [cleanup] Deleted demo item: "${item.title}" (${item.id})`);
        } else {
          console.warn(`  [cleanup] Failed to delete item ${item.id}: ${delRes.status()}`);
        }
      }

      if (testItems.length === 0) {
        console.log("  [cleanup] No test items to clean up for demo user.");
      }
    }

    // Log out demo user
    await request.post(`${BASE_URL}/api/auth/logout`);
  }

  // ── 2. Clean up e2e-* test user accounts ────────────────────────
  const { readFileSync, unlinkSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const trackingFile = resolve(process.cwd(), "e2e/.auth/test-users.json");

  try {
    const raw = readFileSync(trackingFile, "utf-8");
    const testUsers: Array<{ email: string; password: string }> = JSON.parse(raw);

    for (const user of testUsers) {
      await delay(1000); // Avoid rate limiter
      const userLoginRes = await request.post(`${BASE_URL}/api/auth/login`, {
        data: { mode: "login", email: user.email, password: user.password },
      });

      if (userLoginRes.ok()) {
        const delRes = await request.delete(`${BASE_URL}/api/account/delete`);
        if (delRes.ok()) {
          console.log(`  [cleanup] Deleted test user: ${user.email}`);
        } else {
          console.warn(`  [cleanup] Failed to delete user ${user.email}: ${delRes.status()}`);
        }
      } else {
        console.warn(`  [cleanup] Could not log in as ${user.email} for cleanup: ${userLoginRes.status()}`);
      }
    }

    // Remove the tracking file
    unlinkSync(trackingFile);
    console.log("  [cleanup] Removed test-users tracking file.");
  } catch {
    // No tracking file — nothing to clean
  }

  // ── 3. Reset demo user submission quota via admin API ───────────
  if (ADMIN_PASSWORD) {
    await delay(1000); // Avoid rate limiter
    const adminLoginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { mode: "login", email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    if (adminLoginRes.ok()) {
      const usersRes = await request.get(
        `${BASE_URL}/api/admin/users/quota?q=${encodeURIComponent(DEMO_EMAIL)}`
      );

      if (usersRes.ok()) {
        const { users } = await usersRes.json();
        const demoUser = (users || []).find(
          (u: { email: string }) => u.email.toLowerCase() === DEMO_EMAIL.toLowerCase()
        );

        if (demoUser && demoUser.submissionCount > 0) {
          // Grant enough extra credits to cover all past submissions
          const resetRes = await request.post(`${BASE_URL}/api/admin/users/quota`, {
            data: {
              userId: demoUser.id,
              complimentaryPro: demoUser.complimentaryPro ?? false,
              extraSubmissionCredits: demoUser.submissionCount,
            },
          });

          if (resetRes.ok()) {
            console.log(
              `  [cleanup] Reset demo user quota: granted ${demoUser.submissionCount} extra credits`
            );
          } else {
            console.warn(`  [cleanup] Failed to reset demo quota: ${resetRes.status()}`);
          }
        } else {
          console.log("  [cleanup] Demo user quota OK, no reset needed.");
        }
      }

      await request.post(`${BASE_URL}/api/auth/logout`);
    } else {
      console.warn("  [cleanup] Could not log in as admin for quota reset.");
    }
  }
});

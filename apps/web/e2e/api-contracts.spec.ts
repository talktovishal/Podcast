import { test as baseTest, expect } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./helpers";

// Tests that verify unauthenticated access use clean (no-cookie) state
const unauthTest = baseTest.extend({
  storageState: async ({}, use) => {
    await use({ cookies: [], origins: [] });
  },
});

baseTest.describe("API Contract Tests (Authenticated)", () => {
  baseTest("GET /api/health returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("profile");
    expect(body).toHaveProperty("timestamp");
  });

  baseTest("GET /api/auth/providers returns provider configuration", async ({ request }) => {
    const res = await request.get("/api/auth/providers");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty("providers");
    expect(body.providers).toHaveProperty("google");
  });

  baseTest("Authenticated URL submission flow via API", async ({ request }) => {
    const submitRes = await request.post("/api/items/url", {
      data: { url: "https://example.com/api-e2e-test" },
    });
    const submitBody = await submitRes.json();
    expect(submitRes.ok(), `Submission failed: ${JSON.stringify(submitBody)}`).toBe(true);
    expect(submitBody.ok).toBe(true);
    expect(submitBody).toHaveProperty("item_id");
    expect(submitBody.status).toBe("queued");
  });
});

unauthTest.describe("API Contract Tests (Unauthenticated)", () => {
  unauthTest("POST /api/auth/login with valid demo credentials returns ok", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { mode: "login", email: DEMO_EMAIL, password: DEMO_PASSWORD },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("role");
  });

  unauthTest("POST /api/auth/login rejects invalid credentials", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { mode: "login", email: "nobody@test.com", password: "badpassword1" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error_code).toBe("UNAUTHORIZED");
  });

  unauthTest("POST /api/auth/login rejects short passwords", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { mode: "signup", email: "short@test.com", password: "abc" },
    });
    expect(res.ok()).toBe(false);
  });

  unauthTest("POST /api/items/url rejects unauthenticated requests", async ({ request }) => {
    const res = await request.post("/api/items/url", {
      data: { url: "https://example.com" },
    });
    expect(res.status()).toBe(401);
  });

  unauthTest("POST /api/feed-token/rotate rejects unauthenticated requests", async ({ request }) => {
    const res = await request.post("/api/feed-token/rotate", {
      data: {},
    });
    expect(res.status()).toBe(401);
  });

  unauthTest("GET /rss/invalid-token returns 404", async ({ request }) => {
    const res = await request.get("/rss/nonexistent-token-abc123.xml");
    expect(res.status()).toBe(404);
  });

  unauthTest("DELETE /api/account/delete rejects unauthenticated requests", async ({ request }) => {
    const res = await request.delete("/api/account/delete");
    expect(res.status()).toBe(401);
  });
});

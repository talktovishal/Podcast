import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_COOKIE_NAMES } from "@articlepod/core";
import { NextRequest } from "next/server";
import { isPublicPathForAuth, middleware } from "../src/middleware";

test("isPublicPathForAuth allows expected unauthenticated assets and pages", () => {
  const allowed = [
    "/",
    "/login",
    "/api/share/cta",
    "/api/items/html-snapshot",
    "/manifest.webmanifest",
    "/extension-smoke.html",
    "/apple-icon.png",
    "/brand/brain-mark-192.png",
    "/rss/token",
    "/api/media/items/demo/episode.mp3",
    "/api/share-media/items/demo/episode.mp3"
  ];

  for (const pathname of allowed) {
    assert.equal(isPublicPathForAuth(pathname), true, `${pathname} should be public`);
  }
});

test("isPublicPathForAuth protects authenticated workspace paths", () => {
  assert.equal(isPublicPathForAuth("/app"), false);
  assert.equal(isPublicPathForAuth("/app/settings"), false);
  assert.equal(isPublicPathForAuth("/api/items/url"), false);
});

test("middleware redirects unauthenticated page requests to the root auth landing page", () => {
  const response = middleware(new NextRequest("http://localhost/app"));
  assert.equal(response.status, 307);
  const location = response.headers.get("location") || "";
  const redirect = new URL(location, "http://localhost");
  assert.equal(redirect.pathname, "/");
  assert.equal(redirect.searchParams.get("next"), "/app");
});

test("middleware returns 401 for unauthenticated protected API requests", async () => {
  const response = middleware(new NextRequest("http://localhost/api/items/url"));
  assert.equal(response.status, 401);
  const payload = (await response.json()) as { ok: boolean; error_code: string };
  assert.equal(payload.ok, false);
  assert.equal(payload.error_code, "UNAUTHORIZED");
});

test("middleware allows public asset requests without a session cookie", () => {
  const response = middleware(new NextRequest("http://localhost/brand/brain-mark-192.png"));
  assert.notEqual(response.status, 307);
  assert.equal(response.headers.get("location"), null);
});

test("middleware allows extension snapshot API requests without a session cookie", () => {
  const response = middleware(new NextRequest("http://localhost/api/items/html-snapshot", { method: "POST" }));
  assert.notEqual(response.status, 401);
  assert.equal(response.headers.get("location"), null);
});

test("middleware allows protected pages with current or legacy session cookie names", () => {
  const token = "a".repeat(32);

  const withCurrentCookie = middleware(
    new NextRequest("http://localhost/app", {
      headers: {
        cookie: `${AUTH_COOKIE_NAMES.session}=${token}`
      }
    })
  );
  assert.notEqual(withCurrentCookie.status, 307);

  const withLegacyCookie = middleware(
    new NextRequest("http://localhost/app", {
      headers: {
        cookie: `${AUTH_COOKIE_NAMES.legacySession}=${token}`
      }
    })
  );
  assert.notEqual(withLegacyCookie.status, 307);
});

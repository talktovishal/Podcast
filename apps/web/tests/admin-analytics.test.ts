import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { GET as exportGet } from "../src/app/api/admin/analytics/export/route";
import { GET as summaryGet } from "../src/app/api/admin/analytics/summary/route";
import { GET as usersGet } from "../src/app/api/admin/analytics/users/route";
import { createSession } from "../src/lib/auth";
import { recordAnalyticsEvent } from "../src/lib/admin-analytics/events";
import { env } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";

let dbReady = false;

function ensureDbBootstrap(): void {
  if (dbReady || process.env.ARTICLEPOD_TEST_DB_READY === "1") {
    dbReady = true;
    return;
  }

  const here = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = resolve(here, "../../..");
  const result = spawnSync("npx", ["pnpm", "--filter", "@articlepod/web", "run", "db:bootstrap"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "db bootstrap failed");
  }

  dbReady = true;
}

test("admin analytics summary route requires admin auth", async () => {
  ensureDbBootstrap();

  const unauthorizedRequest = new NextRequest("http://localhost/api/admin/analytics/summary", {
    method: "GET"
  });
  const unauthorizedResponse = await summaryGet(unauthorizedRequest);
  assert.equal(unauthorizedResponse.status, 403);
});

test("admin analytics summary/users/export routes return structured data", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const now = new Date();

  const admin = await prisma.user.create({
    data: {
      email: `admin-analytics-${uniq}@articlepod.local`,
      role: "ADMIN"
    }
  });

  const user = await prisma.user.create({
    data: {
      email: `user-analytics-${uniq}@articlepod.local`,
      role: "USER",
      firstSeenAt: now,
      firstSeenCountryCode: "US",
      firstSeenRegionCode: "CA",
      firstSeenCity: "San Francisco",
      lastSeenAt: now,
      lastSeenCountryCode: "US",
      lastSeenRegionCode: "CA",
      lastSeenCity: "San Francisco"
    }
  });

  await prisma.userDemographicSurvey.create({
    data: {
      userId: user.id,
      status: "COMPLETED",
      ageBand: "AGE_25_34",
      genderIdentity: "WOMAN",
      completedAt: now
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      sourceType: "URL",
      sourceUrl: `https://example.com/${uniq}`,
      status: "READY"
    }
  });

  await prisma.job.create({
    data: {
      itemId: item.id,
      status: "QUEUED"
    }
  });

  await prisma.jobEvent.create({
    data: {
      jobId: (await prisma.job.findFirstOrThrow({ where: { itemId: item.id } })).id,
      itemId: item.id,
      stage: "tts",
      eventType: "error",
      payloadJson: {
        error_code: "TTS_PROVIDER_UNAVAILABLE"
      }
    }
  });

  await recordAnalyticsEvent({
    eventType: "USER_SIGNUP",
    userId: user.id,
    authMethod: "LOCAL",
    segmentAuth: "LOCAL_ONLY",
    userRole: "USER",
    dedupeKey: `user_signup:${user.id}`,
    occurredAt: now
  });
  await recordAnalyticsEvent({
    eventType: "ITEM_SUBMITTED",
    userId: user.id,
    itemId: item.id,
    sourceType: "URL",
    authMethod: "LOCAL",
    segmentAuth: "LOCAL_ONLY",
    userRole: "USER",
    dedupeKey: `item_submitted:${item.id}`,
    occurredAt: now
  });
  await recordAnalyticsEvent({
    eventType: "ITEM_READY",
    userId: user.id,
    itemId: item.id,
    sourceType: "URL",
    authMethod: "LOCAL",
    segmentAuth: "LOCAL_ONLY",
    userRole: "USER",
    dedupeKey: `item_ready:${item.id}`,
    occurredAt: now,
    metadata: {
      queue_wait_ms: 500,
      processing_duration_ms: 2500
    }
  });

  try {
    const sessionToken = await createSession(admin.id, { authMethod: "LOCAL" });
    const cookie = `articlepod_session=${sessionToken}`;

    const summaryRequest = new NextRequest("http://localhost/api/admin/analytics/summary", {
      method: "GET",
      headers: {
        cookie
      }
    });
    const summaryResponse = await summaryGet(summaryRequest);
    assert.equal(summaryResponse.status, 200);
    const summaryBody = (await summaryResponse.json()) as {
      ok: boolean;
      summary: {
        acquisition: {
          newSignups: number;
        };
        engagement: {
          mau: number;
        };
        funnel: {
          readyItems: number;
        };
      };
    };
    assert.equal(summaryBody.ok, true);
    assert.ok(summaryBody.summary.acquisition.newSignups >= 1);
    assert.ok(summaryBody.summary.funnel.readyItems >= 1);

    const usersMaskedRequest = new NextRequest("http://localhost/api/admin/analytics/users", {
      method: "GET",
      headers: {
        cookie
      }
    });
    const usersMaskedResponse = await usersGet(usersMaskedRequest);
    assert.equal(usersMaskedResponse.status, 200);
    const usersMaskedBody = (await usersMaskedResponse.json()) as {
      ok: boolean;
      users: {
        rows: Array<{
          userId: string;
          email: string;
          firstSeenCountryCode: string | null;
          firstSeenRegionCode: string | null;
          firstSeenCity: string | null;
          ageBand: string | null;
          genderIdentity: string | null;
        }>;
      };
    };
    assert.equal(usersMaskedBody.ok, true);
    const maskedUserRow = usersMaskedBody.users.rows.find((row) => row.userId === user.id);
    assert.ok(maskedUserRow);
    assert.equal(maskedUserRow!.email.includes("*"), true);
    assert.equal(maskedUserRow!.firstSeenCountryCode, "US");
    assert.equal(maskedUserRow!.firstSeenRegionCode, "CA");
    assert.equal(maskedUserRow!.firstSeenCity, null);
    assert.equal(maskedUserRow!.ageBand, null);
    assert.equal(maskedUserRow!.genderIdentity, null);

    const usersPiiRequest = new NextRequest("http://localhost/api/admin/analytics/users?pii=1", {
      method: "GET",
      headers: {
        cookie
      }
    });
    const usersPiiResponse = await usersGet(usersPiiRequest);
    assert.equal(usersPiiResponse.status, 200);
    const usersPiiBody = (await usersPiiResponse.json()) as {
      users: {
        rows: Array<{
          userId: string;
          email: string;
          firstSeenCountryCode: string | null;
          firstSeenRegionCode: string | null;
          firstSeenCity: string | null;
          ageBand: string | null;
          genderIdentity: string | null;
        }>;
      };
    };
    const piiUserRow = usersPiiBody.users.rows.find((row) => row.userId === user.id);
    assert.ok(piiUserRow);
    assert.equal(piiUserRow!.email, user.email);
    assert.equal(piiUserRow!.firstSeenCountryCode, "US");
    assert.equal(piiUserRow!.firstSeenRegionCode, "CA");
    assert.equal(piiUserRow!.firstSeenCity, "San Francisco");
    assert.equal(piiUserRow!.ageBand, "AGE_25_34");
    assert.equal(piiUserRow!.genderIdentity, "WOMAN");

    const exportRequest = new NextRequest("http://localhost/api/admin/analytics/export?dataset=summary", {
      method: "GET",
      headers: {
        cookie
      }
    });
    const exportResponse = await exportGet(exportRequest);
    assert.equal(exportResponse.status, 200);
    assert.equal(exportResponse.headers.get("content-type"), "text/csv; charset=utf-8");
    const csv = await exportResponse.text();
    assert.equal(csv.includes("metric,value"), true);

    const usersExportRequest = new NextRequest("http://localhost/api/admin/analytics/export?dataset=users&pii=1", {
      method: "GET",
      headers: {
        cookie
      }
    });
    const usersExportResponse = await exportGet(usersExportRequest);
    assert.equal(usersExportResponse.status, 200);
    const usersCsv = await usersExportResponse.text();
    assert.equal(usersCsv.includes("first_seen_country_code"), true);
    assert.equal(usersCsv.includes("gender_identity"), true);
  } finally {
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("recordAnalyticsEvent dedupes by dedupeKey", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: `dedupe-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  try {
    const dedupeKey = `dedupe-test:${uniq}`;
    const firstWrite = await recordAnalyticsEvent({
      eventType: "USER_SIGNUP",
      userId: user.id,
      authMethod: "LOCAL",
      segmentAuth: "LOCAL_ONLY",
      userRole: "USER",
      dedupeKey,
      occurredAt: new Date()
    });
    const secondWrite = await recordAnalyticsEvent({
      eventType: "USER_SIGNUP",
      userId: user.id,
      authMethod: "LOCAL",
      segmentAuth: "LOCAL_ONLY",
      userRole: "USER",
      dedupeKey,
      occurredAt: new Date()
    });
    assert.equal(firstWrite, true);
    assert.equal(secondWrite, false);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("recordAnalyticsEvent skips persistence when analytics storage is off", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: `analytics-off-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const previousMode = env.analyticsStorageMode;
  env.analyticsStorageMode = "off";

  try {
    const dedupeKey = `analytics-off:${uniq}`;
    const persisted = await recordAnalyticsEvent({
      eventType: "USER_SIGNUP",
      userId: user.id,
      authMethod: "LOCAL",
      segmentAuth: "LOCAL_ONLY",
      userRole: "USER",
      dedupeKey,
      occurredAt: new Date()
    });

    const stored = await prisma.analyticsEvent.findUnique({
      where: { dedupeKey }
    });

    assert.equal(persisted, false);
    assert.equal(stored, null);
  } finally {
    env.analyticsStorageMode = previousMode;
    await prisma.user.delete({ where: { id: user.id } });
  }
});

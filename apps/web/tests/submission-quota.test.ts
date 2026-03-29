import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { GET as adminQuotaGet, POST as adminQuotaPost } from "../src/app/api/admin/users/quota/route";
import { POST as htmlSnapshotPost } from "../src/app/api/items/html-snapshot/route";
import { createSession } from "../src/lib/auth";
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

function htmlSnapshotRequest(sessionToken: string, suffix: string): NextRequest {
  return new NextRequest("http://localhost/api/items/html-snapshot", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `articlepod_session=${sessionToken}`
    },
    body: JSON.stringify({
      url: `https://example.com/quota/${suffix}`,
      title: `Quota ${suffix}`,
      html: `<html><body><article><h1>${suffix}</h1><p>quota test content ${suffix}</p></article></body></html>`,
      capturedAt: "2026-02-10T00:00:00.000Z"
    })
  });
}

test("submission quota blocks free users after two submissions and admin can grant extra tries", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const [admin, user] = await Promise.all([
    prisma.user.create({
      data: {
        email: `quota-admin-${uniq}@articlepod.local`,
        role: "ADMIN",
        ttsProvider: "kokoro",
        ttsVoice: "af_heart"
      }
    }),
    prisma.user.create({
      data: {
        email: `quota-user-${uniq}@articlepod.local`,
        role: "USER",
        ttsProvider: "kokoro",
        ttsVoice: "af_heart"
      }
    })
  ]);

  try {
    const [adminSession, userSession] = await Promise.all([createSession(admin.id), createSession(user.id)]);

    const first = await htmlSnapshotPost(htmlSnapshotRequest(userSession, `${uniq}-1`));
    assert.equal(first.status, 200);

    const second = await htmlSnapshotPost(htmlSnapshotRequest(userSession, `${uniq}-2`));
    assert.equal(second.status, 200);

    const third = await htmlSnapshotPost(htmlSnapshotRequest(userSession, `${uniq}-3`));
    assert.equal(third.status, 402);
    const thirdPayload = (await third.json()) as {
      ok: boolean;
      error_code: string;
    };
    assert.equal(thirdPayload.ok, false);
    assert.equal(thirdPayload.error_code, "USAGE_LIMIT_EXCEEDED");

    const blockedUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(blockedUser?.submissionCount, 2);
    assert.equal(blockedUser?.extraSubmissionCredits, 0);

    const grantRequest = new NextRequest("http://localhost/api/admin/users/quota", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `articlepod_session=${adminSession}`
      },
      body: JSON.stringify({
        userId: user.id,
        complimentaryPro: false,
        extraSubmissionCredits: 3
      })
    });
    const grantResponse = await adminQuotaPost(grantRequest);
    assert.equal(grantResponse.status, 200);

    const fourth = await htmlSnapshotPost(htmlSnapshotRequest(userSession, `${uniq}-4`));
    assert.equal(fourth.status, 200);

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(updatedUser?.submissionCount, 3);
    assert.equal(updatedUser?.extraSubmissionCredits, 3);
    assert.equal(updatedUser?.complimentaryPro, false);
  } finally {
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("admin quota API is admin-only and returns quota rows", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const [admin, user] = await Promise.all([
    prisma.user.create({
      data: {
        email: `quota-api-admin-${uniq}@articlepod.local`,
        role: "ADMIN",
        ttsProvider: "kokoro",
        ttsVoice: "af_heart"
      }
    }),
    prisma.user.create({
      data: {
        email: `quota-api-user-${uniq}@articlepod.local`,
        role: "USER",
        ttsProvider: "kokoro",
        ttsVoice: "af_heart"
      }
    })
  ]);

  try {
    const [adminSession, userSession] = await Promise.all([createSession(admin.id), createSession(user.id)]);

    const forbiddenGet = await adminQuotaGet(
      new NextRequest("http://localhost/api/admin/users/quota", {
        headers: {
          cookie: `articlepod_session=${userSession}`
        }
      })
    );
    assert.equal(forbiddenGet.status, 403);

    const listResponse = await adminQuotaGet(
      new NextRequest(`http://localhost/api/admin/users/quota?q=${encodeURIComponent(user.email)}`, {
        headers: {
          cookie: `articlepod_session=${adminSession}`
        }
      })
    );
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as {
      ok: boolean;
      users: Array<{
        id: string;
        email: string;
        complimentaryPro: boolean;
        quota: {
          totalFreeSubmissionAllowance: number;
          remainingFreeSubmissions: number | null;
        };
      }>;
    };

    assert.equal(listPayload.ok, true);
    const row = listPayload.users.find((candidate) => candidate.id === user.id);
    assert.ok(row);
    assert.equal(row?.email, user.email);
    assert.equal(row?.complimentaryPro, false);
    assert.equal(row?.quota.totalFreeSubmissionAllowance, 2);
    assert.equal(row?.quota.remainingFreeSubmissions, 2);
  } finally {
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("paid users are capped at 15 new podcast episodes per 24 hours", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-paid`;

  const user = await prisma.user.create({
    data: {
      email: `quota-paid-${uniq}@articlepod.local`,
      role: "USER",
      isPaid: true,
      billingPlanCode: "PRO_MONTHLY",
      billingStatus: "ACTIVE",
      billingEntitlementStatus: "ACTIVE",
      billingLastPaymentStatus: "PAID",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const userSession = await createSession(user.id);

    for (let index = 0; index < 15; index += 1) {
      const response = await htmlSnapshotPost(htmlSnapshotRequest(userSession, `${uniq}-${index}`));
      assert.equal(response.status, 200);
    }

    const blocked = await htmlSnapshotPost(htmlSnapshotRequest(userSession, `${uniq}-blocked`));
    assert.equal(blocked.status, 402);
    const payload = (await blocked.json()) as {
      ok: boolean;
      error_code: string;
      error_message: string;
    };
    assert.equal(payload.ok, false);
    assert.equal(payload.error_code, "USAGE_LIMIT_EXCEEDED");
    assert.equal(payload.error_message.includes("15 new podcast episodes per 24 hours"), true);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

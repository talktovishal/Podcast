import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { DELETE as deleteAccount } from "../src/app/api/account/delete/route";
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

test("account delete route blocks admin account deletion", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const admin = await prisma.user.create({
    data: {
      email: `admin-delete-block-${uniq}@articlepod.local`,
      role: "ADMIN"
    }
  });

  try {
    const sessionToken = await createSession(admin.id, { authMethod: "LOCAL" });
    const request = new NextRequest("http://localhost/api/account/delete", {
      method: "DELETE",
      headers: {
        cookie: `articlepod_session=${sessionToken}`
      }
    });

    const response = await deleteAccount(request);
    assert.equal(response.status, 403);
    const body = (await response.json()) as {
      ok: boolean;
      error_code: string;
      error_message: string;
    };
    assert.equal(body.ok, false);
    assert.equal(body.error_code, "ADMIN_DELETE_FORBIDDEN");
    assert.equal(body.error_message, "Admin accounts cannot be deleted.");

    const stillExists = await prisma.user.findUnique({ where: { id: admin.id } });
    assert.ok(stillExists);
  } finally {
    await prisma.user.delete({ where: { id: admin.id } });
  }
});

test("account delete route allows non-admin deletion", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: `user-delete-ok-${uniq}@articlepod.local`,
      role: "USER"
    }
  });
  await prisma.userDemographicSurvey.create({
    data: {
      userId: user.id,
      status: "COMPLETED",
      ageBand: "AGE_35_44",
      genderIdentity: "MAN",
      completedAt: new Date()
    }
  });

  try {
    const sessionToken = await createSession(user.id, { authMethod: "LOCAL" });
    const request = new NextRequest("http://localhost/api/account/delete", {
      method: "DELETE",
      headers: {
        cookie: `articlepod_session=${sessionToken}`
      }
    });

    const response = await deleteAccount(request);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean };
    assert.equal(body.ok, true);

    const deleted = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(deleted, null);

    const deletedSurvey = await prisma.userDemographicSurvey.findUnique({
      where: { userId: user.id }
    });
    assert.equal(deletedSurvey, null);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

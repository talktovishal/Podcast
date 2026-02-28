import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import {
  DELETE as demographicsDelete,
  GET as demographicsGet,
  POST as demographicsPost
} from "../src/app/api/account/demographics/route";
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

test("demographics API requires auth", async () => {
  ensureDbBootstrap();

  const getRequest = new NextRequest("http://localhost/api/account/demographics", { method: "GET" });
  const getResponse = await demographicsGet(getRequest);
  assert.equal(getResponse.status, 401);

  const postRequest = new NextRequest("http://localhost/api/account/demographics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "skip" })
  });
  const postResponse = await demographicsPost(postRequest);
  assert.equal(postResponse.status, 401);

  const deleteRequest = new NextRequest("http://localhost/api/account/demographics", { method: "DELETE" });
  const deleteResponse = await demographicsDelete(deleteRequest);
  assert.equal(deleteResponse.status, 401);
});

test("demographics API supports save, skip, edit, and delete lifecycle", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `demographic-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  try {
    const sessionToken = await createSession(user.id);
    const authCookie = `articlepod_session=${sessionToken}`;

    const initialResponse = await demographicsGet(
      new NextRequest("http://localhost/api/account/demographics", {
        method: "GET",
        headers: { cookie: authCookie }
      })
    );
    assert.equal(initialResponse.status, 200);
    const initialPayload = (await initialResponse.json()) as {
      survey: {
        status: string;
        ageBand: string | null;
        genderIdentity: string | null;
      };
    };
    assert.equal(initialPayload.survey.status, "PENDING");
    assert.equal(initialPayload.survey.ageBand, null);
    assert.equal(initialPayload.survey.genderIdentity, null);

    const invalidResponse = await demographicsPost(
      new NextRequest("http://localhost/api/account/demographics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: authCookie
        },
        body: JSON.stringify({
          action: "save",
          ageBand: "AGE_25_34",
          genderIdentity: "SELF_DESCRIBE"
        })
      })
    );
    assert.equal(invalidResponse.status, 400);

    const saveResponse = await demographicsPost(
      new NextRequest("http://localhost/api/account/demographics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: authCookie
        },
        body: JSON.stringify({
          action: "save",
          ageBand: "AGE_25_34",
          genderIdentity: "WOMAN"
        })
      })
    );
    assert.equal(saveResponse.status, 200);
    const savePayload = (await saveResponse.json()) as {
      survey: {
        status: string;
        ageBand: string | null;
        genderIdentity: string | null;
        completedAt: string | null;
      };
    };
    assert.equal(savePayload.survey.status, "COMPLETED");
    assert.equal(savePayload.survey.ageBand, "AGE_25_34");
    assert.equal(savePayload.survey.genderIdentity, "WOMAN");
    assert.ok(savePayload.survey.completedAt);

    const skipResponse = await demographicsPost(
      new NextRequest("http://localhost/api/account/demographics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: authCookie
        },
        body: JSON.stringify({
          action: "skip"
        })
      })
    );
    assert.equal(skipResponse.status, 200);
    const skipPayload = (await skipResponse.json()) as {
      survey: {
        status: string;
        ageBand: string | null;
        genderIdentity: string | null;
        skippedAt: string | null;
      };
    };
    assert.equal(skipPayload.survey.status, "SKIPPED");
    assert.equal(skipPayload.survey.ageBand, null);
    assert.equal(skipPayload.survey.genderIdentity, null);
    assert.ok(skipPayload.survey.skippedAt);

    const editResponse = await demographicsPost(
      new NextRequest("http://localhost/api/account/demographics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: authCookie
        },
        body: JSON.stringify({
          action: "save",
          ageBand: "AGE_35_44",
          genderIdentity: "SELF_DESCRIBE",
          genderSelfDescribe: "Agender"
        })
      })
    );
    assert.equal(editResponse.status, 200);
    const editPayload = (await editResponse.json()) as {
      survey: {
        status: string;
        ageBand: string | null;
        genderIdentity: string | null;
        genderSelfDescribe: string | null;
      };
    };
    assert.equal(editPayload.survey.status, "COMPLETED");
    assert.equal(editPayload.survey.ageBand, "AGE_35_44");
    assert.equal(editPayload.survey.genderIdentity, "SELF_DESCRIBE");
    assert.equal(editPayload.survey.genderSelfDescribe, "Agender");

    const deleteResponse = await demographicsDelete(
      new NextRequest("http://localhost/api/account/demographics", {
        method: "DELETE",
        headers: {
          cookie: authCookie
        }
      })
    );
    assert.equal(deleteResponse.status, 200);
    const deletePayload = (await deleteResponse.json()) as {
      survey: {
        status: string;
        ageBand: string | null;
        genderIdentity: string | null;
        deletedAt: string | null;
      };
    };
    assert.equal(deletePayload.survey.status, "SKIPPED");
    assert.equal(deletePayload.survey.ageBand, null);
    assert.equal(deletePayload.survey.genderIdentity, null);
    assert.ok(deletePayload.survey.deletedAt);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

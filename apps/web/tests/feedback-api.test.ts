import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { GET as adminFeedbackGet } from "../src/app/api/admin/feedback/route";
import { POST as adminFeedbackMirrorPost } from "../src/app/api/admin/feedback/[id]/mirror/route";
import { POST as adminFeedbackStatusPost } from "../src/app/api/admin/feedback/[id]/status/route";
import { POST as feedbackPost } from "../src/app/api/feedback/route";
import { createSession } from "../src/lib/auth";
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

test("feedback route requires auth", async () => {
  const request = new NextRequest("http://localhost/api/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message: "Need better seeking support."
    })
  });
  const response = await feedbackPost(request);
  assert.equal(response.status, 401);
});

test("feedback submission enforces message, keeps optional metadata nullable, and defaults contact flag to true", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `feedback-user-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const previousMirrorEnabled = env.feedbackMirrorEnabled;
  env.feedbackMirrorEnabled = false;

  try {
    const sessionToken = await createSession(user.id);

    const invalidResponse = await feedbackPost(
      new NextRequest("http://localhost/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${sessionToken}`
        },
        body: JSON.stringify({
          message: "   "
        })
      })
    );
    assert.equal(invalidResponse.status, 400);

    const validResponse = await feedbackPost(
      new NextRequest("http://localhost/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${sessionToken}`
        },
        body: JSON.stringify({
          message: "Please make playback speed easier to find."
        })
      })
    );
    assert.equal(validResponse.status, 200);
    const payload = (await validResponse.json()) as {
      ok: boolean;
      feedback: {
        id: string;
      };
    };
    assert.equal(payload.ok, true);

    const row = await prisma.userFeedback.findUnique({
      where: { id: payload.feedback.id }
    });
    assert.ok(row);
    assert.equal(row?.feedbackType, null);
    assert.equal(row?.featureArea, null);
    assert.equal(row?.allowEmailContact, true);
    assert.equal(row?.mirrorStatus, "SKIPPED");
  } finally {
    env.feedbackMirrorEnabled = previousMirrorEnabled;
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("admin feedback APIs are role-gated and support status updates", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-admin`;

  const admin = await prisma.user.create({
    data: {
      email: `feedback-admin-${uniq}@articlepod.local`,
      role: "ADMIN"
    }
  });
  const user = await prisma.user.create({
    data: {
      email: `feedback-member-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const feedback = await prisma.userFeedback.create({
    data: {
      userId: user.id,
      message: "Please add category sorting for episodes.",
      feedbackType: "FEATURE",
      featureArea: "RSS_FEED",
      allowEmailContact: true,
      status: "NEW",
      mirrorStatus: "SKIPPED"
    }
  });

  try {
    const memberSession = await createSession(user.id);
    const memberListResponse = await adminFeedbackGet(
      new NextRequest("http://localhost/api/admin/feedback", {
        method: "GET",
        headers: {
          cookie: `articlepod_session=${memberSession}`
        }
      })
    );
    assert.equal(memberListResponse.status, 403);

    const adminSession = await createSession(admin.id);
    const adminListResponse = await adminFeedbackGet(
      new NextRequest("http://localhost/api/admin/feedback?status=NEW", {
        method: "GET",
        headers: {
          cookie: `articlepod_session=${adminSession}`
        }
      })
    );
    assert.equal(adminListResponse.status, 200);
    const listPayload = (await adminListResponse.json()) as {
      ok: boolean;
      feedback: {
        rows: Array<{
          id: string;
        }>;
      };
    };
    assert.equal(listPayload.ok, true);
    assert.equal(listPayload.feedback.rows.some((row) => row.id === feedback.id), true);

    const updateStatusResponse = await adminFeedbackStatusPost(
      new NextRequest(`http://localhost/api/admin/feedback/${feedback.id}/status`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${adminSession}`
        },
        body: JSON.stringify({
          status: "IN_REVIEW"
        })
      }),
      { params: Promise.resolve({ id: feedback.id }) }
    );
    assert.equal(updateStatusResponse.status, 200);

    const refreshed = await prisma.userFeedback.findUnique({
      where: { id: feedback.id },
      select: { status: true }
    });
    assert.equal(refreshed?.status, "IN_REVIEW");
  } finally {
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("feedback mirror success stores issue metadata and issue body excludes user email", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-mirror-ok`;

  const user = await prisma.user.create({
    data: {
      email: `feedback-mirror-ok-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const previousMirrorConfig = {
    enabled: env.feedbackMirrorEnabled,
    owner: env.feedbackMirrorOwner,
    repo: env.feedbackMirrorRepo,
    token: env.feedbackMirrorToken,
    labels: env.feedbackMirrorLabels
  };
  const previousFetch = globalThis.fetch;
  const fetchCalls: Array<{ body: string }> = [];

  env.feedbackMirrorEnabled = true;
  env.feedbackMirrorOwner = "private-owner";
  env.feedbackMirrorRepo = "private-repo";
  env.feedbackMirrorToken = "ghp_test_token";
  env.feedbackMirrorLabels = ["feedback"];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({
      body: String(init?.body || "")
    });
    return new Response(
      JSON.stringify({
        number: 42,
        html_url: "https://github.com/private-owner/private-repo/issues/42"
      }),
      {
        status: 201,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  try {
    const sessionToken = await createSession(user.id);
    const response = await feedbackPost(
      new NextRequest("http://localhost/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${sessionToken}`
        },
        body: JSON.stringify({
          message: "Mirror this item please.",
          feedbackType: "GENERAL",
          sourcePath: "/app/feedback"
        })
      })
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      feedback: {
        id: string;
      };
    };
    const row = await prisma.userFeedback.findUnique({
      where: { id: payload.feedback.id }
    });
    assert.equal(row?.mirrorStatus, "MIRRORED");
    assert.equal(row?.mirrorIssueNumber, 42);
    assert.equal(row?.mirrorIssueUrl, "https://github.com/private-owner/private-repo/issues/42");
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].body.includes(user.email), false);
  } finally {
    env.feedbackMirrorEnabled = previousMirrorConfig.enabled;
    env.feedbackMirrorOwner = previousMirrorConfig.owner;
    env.feedbackMirrorRepo = previousMirrorConfig.repo;
    env.feedbackMirrorToken = previousMirrorConfig.token;
    env.feedbackMirrorLabels = previousMirrorConfig.labels;
    globalThis.fetch = previousFetch;
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("mirror failures do not block submission and admin can retry mirror", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-mirror-retry`;

  const admin = await prisma.user.create({
    data: {
      email: `feedback-mirror-admin-${uniq}@articlepod.local`,
      role: "ADMIN"
    }
  });
  const user = await prisma.user.create({
    data: {
      email: `feedback-mirror-user-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const previousMirrorConfig = {
    enabled: env.feedbackMirrorEnabled,
    owner: env.feedbackMirrorOwner,
    repo: env.feedbackMirrorRepo,
    token: env.feedbackMirrorToken,
    labels: env.feedbackMirrorLabels
  };
  const previousFetch = globalThis.fetch;

  env.feedbackMirrorEnabled = true;
  env.feedbackMirrorOwner = "private-owner";
  env.feedbackMirrorRepo = "private-repo";
  env.feedbackMirrorToken = "ghp_test_token";
  env.feedbackMirrorLabels = [];

  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "temporary failure" }), {
        status: 500,
        headers: { "content-type": "application/json" }
      })) as typeof fetch;

    const userSession = await createSession(user.id);
    const submitResponse = await feedbackPost(
      new NextRequest("http://localhost/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${userSession}`
        },
        body: JSON.stringify({
          message: "Mirror retry path."
        })
      })
    );
    assert.equal(submitResponse.status, 200);
    const submitPayload = (await submitResponse.json()) as {
      feedback: {
        id: string;
      };
    };
    const failedMirror = await prisma.userFeedback.findUnique({
      where: { id: submitPayload.feedback.id }
    });
    assert.equal(failedMirror?.mirrorStatus, "FAILED");

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          number: 51,
          html_url: "https://github.com/private-owner/private-repo/issues/51"
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" }
        }
      )) as typeof fetch;

    const adminSession = await createSession(admin.id);
    const retryResponse = await adminFeedbackMirrorPost(
      new NextRequest(`http://localhost/api/admin/feedback/${submitPayload.feedback.id}/mirror`, {
        method: "POST",
        headers: {
          cookie: `articlepod_session=${adminSession}`
        }
      }),
      { params: Promise.resolve({ id: submitPayload.feedback.id }) }
    );
    assert.equal(retryResponse.status, 200);

    const mirroredRow = await prisma.userFeedback.findUnique({
      where: { id: submitPayload.feedback.id }
    });
    assert.equal(mirroredRow?.mirrorStatus, "MIRRORED");
    assert.equal(mirroredRow?.mirrorIssueNumber, 51);
  } finally {
    env.feedbackMirrorEnabled = previousMirrorConfig.enabled;
    env.feedbackMirrorOwner = previousMirrorConfig.owner;
    env.feedbackMirrorRepo = previousMirrorConfig.repo;
    env.feedbackMirrorToken = previousMirrorConfig.token;
    env.feedbackMirrorLabels = previousMirrorConfig.labels;
    globalThis.fetch = previousFetch;
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

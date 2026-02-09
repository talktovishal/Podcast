import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { GET as appleStartGet } from "../src/app/api/auth/apple/start/route";
import { POST as connectCodePost } from "../src/app/api/auth/extension/connect-code/route";
import { POST as exchangePost } from "../src/app/api/auth/extension/exchange/route";
import { GET as googleStartGet } from "../src/app/api/auth/google/start/route";
import { GET as providersGet } from "../src/app/api/auth/providers/route";
import { POST as htmlSnapshotPost } from "../src/app/api/items/html-snapshot/route";
import { createSession } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

let dbReady = false;

function ensureDbBootstrap(): void {
  if (dbReady || process.env.LISTENLATER_TEST_DB_READY === "1") {
    dbReady = true;
    return;
  }

  const here = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = resolve(here, "../../..");
  const result = spawnSync("npx", ["pnpm", "--filter", "@listenlater/web", "run", "db:bootstrap"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "db bootstrap failed");
  }

  dbReady = true;
}

test("providers endpoint reports configuration flags", async () => {
  const response = await providersGet();
  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    ok: boolean;
    providers: {
      google: { configured: boolean };
      apple: { configured: boolean };
    };
  };

  assert.equal(payload.ok, true);
  assert.equal(typeof payload.providers.google.configured, "boolean");
  assert.equal(typeof payload.providers.apple.configured, "boolean");
});

test("oauth start routes redirect based on provider configuration", async () => {
  const providerResponse = await providersGet();
  const providerPayload = (await providerResponse.json()) as {
    providers: {
      google: { configured: boolean };
      apple: { configured: boolean };
    };
  };

  const googleResponse = await googleStartGet();
  assert.equal(googleResponse.status, 307);
  const googleLocation = googleResponse.headers.get("location") || "";
  if (providerPayload.providers.google.configured) {
    assert.ok(googleLocation.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"));
  } else {
    assert.ok(googleLocation.includes("/login?oauth_error=google_not_configured"));
  }

  const appleResponse = await appleStartGet();
  assert.equal(appleResponse.status, 307);
  const appleLocation = appleResponse.headers.get("location") || "";
  if (providerPayload.providers.apple.configured) {
    assert.ok(appleLocation.startsWith("https://appleid.apple.com/auth/authorize?"));
  } else {
    assert.ok(appleLocation.includes("/login?oauth_error=apple_not_configured"));
  }
});

test("extension connect-code requires authenticated session", async () => {
  const request = new NextRequest("http://localhost/api/auth/extension/connect-code", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ label: "demo" })
  });

  const response = await connectCodePost(request);
  assert.equal(response.status, 401);

  const payload = (await response.json()) as {
    ok: boolean;
    error_code: string;
  };

  assert.equal(payload.ok, false);
  assert.equal(payload.error_code, "UNAUTHORIZED");
});

test("extension connect-code validates request body", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `connect-validate-${uniq}@listenlater.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const sessionToken = await createSession(user.id);

    const request = new NextRequest("http://localhost/api/auth/extension/connect-code", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `listenlater_session=${sessionToken}`
      },
      body: JSON.stringify({ label: "x".repeat(81) })
    });

    const response = await connectCodePost(request);
    assert.equal(response.status, 400);

    const payload = (await response.json()) as {
      ok: boolean;
      error_code: string;
      error_message: string;
    };

    assert.equal(payload.ok, false);
    assert.equal(payload.error_code, "INVALID_INPUT");
    assert.ok(payload.error_message.toLowerCase().includes("label"));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("extension exchange validates payload and rejects unknown code", async () => {
  ensureDbBootstrap();

  const malformedRequest = new NextRequest("http://localhost/api/auth/extension/exchange", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ connectCode: "short" })
  });

  const malformedResponse = await exchangePost(malformedRequest);
  assert.equal(malformedResponse.status, 400);

  const malformedPayload = (await malformedResponse.json()) as {
    ok: boolean;
    error_code: string;
  };

  assert.equal(malformedPayload.ok, false);
  assert.equal(malformedPayload.error_code, "INVALID_INPUT");

  const unknownRequest = new NextRequest("http://localhost/api/auth/extension/exchange", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      connectCode: "missing-connect-code-1234567890",
      label: "test"
    })
  });

  const unknownResponse = await exchangePost(unknownRequest);
  assert.equal(unknownResponse.status, 401);

  const unknownPayload = (await unknownResponse.json()) as {
    ok: boolean;
    error_code: string;
  };

  assert.equal(unknownPayload.ok, false);
  assert.equal(unknownPayload.error_code, "UNAUTHORIZED");
});

test("html snapshot route requires auth", async () => {
  const request = new NextRequest("http://localhost/api/items/html-snapshot", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "https://example.com/private",
      html: "<html><body><article><p>Demo text for auth check.</p></article></body></html>"
    })
  });

  const response = await htmlSnapshotPost(request);
  assert.equal(response.status, 401);

  const payload = (await response.json()) as {
    ok: boolean;
    error_code: string;
  };

  assert.equal(payload.ok, false);
  assert.equal(payload.error_code, "UNAUTHORIZED");
});

test("html snapshot validates payload and queues item for session user", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `snapshot-${uniq}@listenlater.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const sessionToken = await createSession(user.id);

    const invalidRequest = new NextRequest("http://localhost/api/items/html-snapshot", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `listenlater_session=${sessionToken}`
      },
      body: JSON.stringify({
        url: "not-a-url",
        html: "<html><body></body></html>"
      })
    });

    const invalidResponse = await htmlSnapshotPost(invalidRequest);
    assert.equal(invalidResponse.status, 400);

    const invalidPayload = (await invalidResponse.json()) as {
      ok: boolean;
      error_code: string;
      error_message: string;
    };

    assert.equal(invalidPayload.ok, false);
    assert.equal(invalidPayload.error_code, "INVALID_INPUT");
    assert.ok(invalidPayload.error_message.toLowerCase().includes("url"));

    const html = `
      <html>
        <head><title>Captured ${uniq}</title></head>
        <body>
          <article>
            <h1>Captured ${uniq}</h1>
            <p>This snapshot should create a queued item for the authenticated session user.</p>
            <p>It includes enough text to satisfy extraction minimums during worker processing.</p>
            <p>Unique marker ${uniq} keeps this test deterministic.</p>
          </article>
        </body>
      </html>
    `;

    const validRequest = new NextRequest("http://localhost/api/items/html-snapshot", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `listenlater_session=${sessionToken}`
      },
      body: JSON.stringify({
        url: `https://example.com/session/${uniq}`,
        title: `Session Snapshot ${uniq}`,
        html,
        capturedAt: "2026-02-08T00:00:00.000Z"
      })
    });

    const validResponse = await htmlSnapshotPost(validRequest);
    assert.equal(validResponse.status, 200);

    const validPayload = (await validResponse.json()) as {
      ok: boolean;
      item_id: string;
      status: string;
    };

    assert.equal(validPayload.ok, true);
    assert.equal(validPayload.status, "queued");

    const item = await prisma.item.findUnique({ where: { id: validPayload.item_id } });
    assert.ok(item);
    assert.equal(item?.userId, user.id);
    assert.equal(item?.sourceType, "HTML_SNAPSHOT");
    assert.equal(item?.status, "QUEUED");
    assert.ok(item?.sourceHtml?.includes(`Unique marker ${uniq}`));
    assert.equal(item?.sourceCapturedAt?.toISOString(), "2026-02-08T00:00:00.000Z");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AUTH_COOKIE_NAMES, HTML_SNAPSHOT_MAX_BYTES, createSecretToken } from "@articlepod/core";
import { NextRequest } from "next/server";
import { GET as appleStartGet } from "../src/app/api/auth/apple/start/route";
import { POST as connectCodePost } from "../src/app/api/auth/extension/connect-code/route";
import { POST as exchangePost } from "../src/app/api/auth/extension/exchange/route";
import { POST as extensionRevokePost } from "../src/app/api/auth/extension/revoke/route";
import { GET as facebookCallbackGet } from "../src/app/api/auth/facebook/callback/route";
import { GET as facebookStartGet } from "../src/app/api/auth/facebook/start/route";
import { GET as googleStartGet } from "../src/app/api/auth/google/start/route";
import { GET as providersGet } from "../src/app/api/auth/providers/route";
import { PATCH as itemPatch } from "../src/app/api/items/[id]/route";
import { POST as htmlSnapshotPost } from "../src/app/api/items/html-snapshot/route";
import { POST as pdfPost } from "../src/app/api/items/pdf/route";
import { POST as urlPost } from "../src/app/api/items/url/route";
import { GET as itemMarkdownGet } from "../src/app/api/items/[id]/markdown/route";
import { buildLoginHref } from "../src/lib/auth-redirect";
import { createSession } from "../src/lib/auth";
import { env } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";
import { getArtifactStorage } from "../src/lib/storage";

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

test("providers endpoint reports configuration flags", async () => {
  const response = await providersGet();
  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    ok: boolean;
    providers: {
      google: { configured: boolean };
      facebook: { configured: boolean };
      apple: { configured: boolean };
    };
  };

  assert.equal(payload.ok, true);
  assert.equal(typeof payload.providers.google.configured, "boolean");
  assert.equal(typeof payload.providers.facebook.configured, "boolean");
  assert.equal(typeof payload.providers.apple.configured, "boolean");
});

test("oauth start routes redirect based on provider configuration", async () => {
  const providerResponse = await providersGet();
  const providerPayload = (await providerResponse.json()) as {
    providers: {
      google: { configured: boolean };
      facebook: { configured: boolean };
      apple: { configured: boolean };
    };
  };

  const googleResponse = await googleStartGet(new NextRequest("http://localhost/api/auth/google/start?next=%2Fpricing"));
  assert.equal(googleResponse.status, 307);
  const googleLocation = googleResponse.headers.get("location") || "";
  if (providerPayload.providers.google.configured) {
    assert.ok(googleLocation.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"));
    assert.match(googleResponse.headers.get("set-cookie") || "", /articlepod_auth_return=%2Fpricing|articlepod_auth_return=\/pricing/);
  } else {
    assert.equal(googleLocation, `${env.appUrl}${buildLoginHref({ oauthError: "google_not_configured", next: "/pricing" })}`);
  }

  const facebookResponse = await facebookStartGet(new NextRequest("http://localhost/api/auth/facebook/start?next=%2Fpricing"));
  assert.equal(facebookResponse.status, 307);
  const facebookLocation = facebookResponse.headers.get("location") || "";
  if (providerPayload.providers.facebook.configured) {
    assert.ok(facebookLocation.startsWith("https://www.facebook.com/dialog/oauth?"));
    assert.match(facebookResponse.headers.get("set-cookie") || "", /articlepod_auth_return=%2Fpricing|articlepod_auth_return=\/pricing/);
  } else {
    assert.equal(facebookLocation, `${env.appUrl}${buildLoginHref({ oauthError: "facebook_not_configured", next: "/pricing" })}`);
  }

  const appleResponse = await appleStartGet(new NextRequest("http://localhost/api/auth/apple/start?next=%2Fpricing"));
  assert.equal(appleResponse.status, 307);
  const appleLocation = appleResponse.headers.get("location") || "";
  if (providerPayload.providers.apple.configured) {
    assert.ok(appleLocation.startsWith("https://appleid.apple.com/auth/authorize?"));
    assert.match(appleResponse.headers.get("set-cookie") || "", /articlepod_auth_return=%2Fpricing|articlepod_auth_return=\/pricing/);
  } else {
    assert.equal(appleLocation, `${env.appUrl}${buildLoginHref({ oauthError: "apple_not_configured", next: "/pricing" })}`);
  }
});

test("facebook callback rejects invalid oauth state", async () => {
  const request = new NextRequest("http://localhost/api/auth/facebook/callback?code=test-code&state=wrong-state", {
    method: "GET",
    headers: {
      cookie: `${AUTH_COOKIE_NAMES.oauthPrefix}_facebook=expected-state; articlepod_auth_return=%2Fpricing`
    }
  });

  const response = await facebookCallbackGet(request);
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    `${env.appUrl}${buildLoginHref({ oauthError: "facebook_state", next: "/pricing" })}`
  );
});

test("facebook callback maps token exchange failures back to login", async () => {
  const previousAppId = env.facebookAppId;
  const previousAppSecret = env.facebookAppSecret;
  const previousFetch = globalThis.fetch;

  env.facebookAppId = "fb-app-id";
  env.facebookAppSecret = "fb-app-secret";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "bad token" } }), {
      status: 500,
      headers: {
        "content-type": "application/json"
      }
    })) as typeof fetch;

  try {
    const request = new NextRequest("http://localhost/api/auth/facebook/callback?code=test-code&state=expected-state", {
      method: "GET",
      headers: {
        cookie: `${AUTH_COOKIE_NAMES.oauthPrefix}_facebook=expected-state; articlepod_auth_return=%2Fpricing`
      }
    });

    const response = await facebookCallbackGet(request);
    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get("location"),
      `${env.appUrl}${buildLoginHref({ oauthError: "facebook_token", next: "/pricing" })}`
    );
  } finally {
    env.facebookAppId = previousAppId;
    env.facebookAppSecret = previousAppSecret;
    globalThis.fetch = previousFetch;
  }
});

test("facebook callback creates a linked user and session", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const email = `facebook-callback-${uniq}@articlepod.local`;
  const previousAppId = env.facebookAppId;
  const previousAppSecret = env.facebookAppSecret;
  const previousFetch = globalThis.fetch;

  env.facebookAppId = "fb-app-id";
  env.facebookAppSecret = "fb-app-secret";

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: "facebook-access-token" }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }

    if (url.startsWith("https://graph.facebook.com/me")) {
      return new Response(
        JSON.stringify({
          id: `fb-${uniq}`,
          email,
          name: "Facebook Callback User"
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    const request = new NextRequest("http://localhost/api/auth/facebook/callback?code=test-code&state=expected-state", {
      method: "GET",
      headers: {
        cookie: `${AUTH_COOKIE_NAMES.oauthPrefix}_facebook=expected-state; articlepod_auth_return=%2Fpricing`
      }
    });

    const response = await facebookCallbackGet(request);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), `${env.appUrl}/pricing`);
    assert.match(response.headers.get("set-cookie") || "", /articlepod_session=/);

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        oauthIdentities: true
      }
    });

    assert.ok(user);
    assert.equal(user?.passwordHash, null);
    assert.equal(user?.oauthIdentities.length, 1);
    assert.equal(user?.oauthIdentities[0]?.provider, "facebook");
  } finally {
    await prisma.user.deleteMany({
      where: {
        email
      }
    });
    env.facebookAppId = previousAppId;
    env.facebookAppSecret = previousAppSecret;
    globalThis.fetch = previousFetch;
  }
});

test("facebook callback does not rotate an existing user's hidden legacy feed token", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const email = `facebook-existing-${uniq}@articlepod.local`;
  const previousAppId = env.facebookAppId;
  const previousAppSecret = env.facebookAppSecret;
  const previousFetch = globalThis.fetch;
  const legacyToken = createSecretToken();

  env.facebookAppId = "fb-app-id";
  env.facebookAppSecret = "fb-app-secret";

  const user = await prisma.user.create({
    data: {
      email,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart",
      oauthIdentities: {
        create: {
          provider: "facebook",
          providerUserId: `fb-existing-${uniq}`,
          emailAtLink: email
        }
      },
      feedTokens: {
        create: {
          tokenHash: legacyToken.hash,
          tokenValue: null,
          active: true
        }
      }
    },
    include: {
      feedTokens: true
    }
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: "facebook-access-token" }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }

    if (url.startsWith("https://graph.facebook.com/me")) {
      return new Response(
        JSON.stringify({
          id: `fb-existing-${uniq}`,
          email,
          name: "Existing Facebook User"
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    const request = new NextRequest("http://localhost/api/auth/facebook/callback?code=test-code&state=expected-state", {
      method: "GET",
      headers: {
        cookie: `${AUTH_COOKIE_NAMES.oauthPrefix}_facebook=expected-state`
      }
    });

    const response = await facebookCallbackGet(request);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), `${env.appUrl}/app`);

    const activeRows = await prisma.feedToken.findMany({
      where: { userId: user.id, active: true },
      select: { id: true, tokenHash: true, tokenValue: true }
    });
    assert.equal(activeRows.length, 1);
    assert.equal(activeRows[0]?.id, user.feedTokens[0]?.id);
    assert.equal(activeRows[0]?.tokenHash, legacyToken.hash);
    assert.equal(activeRows[0]?.tokenValue, null);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    env.facebookAppId = previousAppId;
    env.facebookAppSecret = previousAppSecret;
    globalThis.fetch = previousFetch;
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
      email: `connect-validate-${uniq}@articlepod.local`,
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
        cookie: `articlepod_session=${sessionToken}`
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

test("extension connect-code accepts legacy session cookie name", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `connect-legacy-cookie-${uniq}@articlepod.local`,
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
        cookie: `${AUTH_COOKIE_NAMES.legacySession}=${sessionToken}`
      },
      body: JSON.stringify({ label: "legacy-cookie-test" })
    });

    const response = await connectCodePost(request);
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      ok: boolean;
      connect_code: string;
      expires_at: string;
    };

    assert.equal(payload.ok, true);
    assert.ok(payload.connect_code.length >= 20);
    assert.ok(payload.expires_at.length > 0);
    const expiresAt = Date.parse(payload.expires_at);
    const now = Date.now();
    const twentyThreeHoursMs = 23 * 60 * 60 * 1000;
    const twentyFiveHoursMs = 25 * 60 * 60 * 1000;
    assert.equal(Number.isFinite(expiresAt), true);
    assert.equal(expiresAt >= now + twentyThreeHoursMs, true);
    assert.equal(expiresAt <= now + twentyFiveHoursMs, true);
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

test("extension exchange rejects expired connect codes and tells the user to generate a new one", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: `expired-connect-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const connectCode = createSecretToken();
    await prisma.extensionConnectCode.create({
      data: {
        userId: user.id,
        codeHash: connectCode.hash,
        label: "expired-connect-code",
        expiresAt: new Date(Date.now() - 60_000)
      }
    });

    const request = new NextRequest("http://localhost/api/auth/extension/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        connectCode: connectCode.plain,
        label: "extension-popup"
      })
    });

    const response = await exchangePost(request);
    assert.equal(response.status, 401);

    const payload = (await response.json()) as {
      ok: boolean;
      error_code: string;
      error_message: string;
    };

    assert.equal(payload.ok, false);
    assert.equal(payload.error_code, "UNAUTHORIZED");
    assert.equal(payload.error_message.includes("Generate a new one from the web app."), true);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
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

test("url route stores canonical importance and normalized tags", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-url-tags`;
  const previousFetch = globalThis.fetch;

  const user = await prisma.user.create({
    data: {
      email: `url-tags-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    globalThis.fetch = (async () =>
      new Response("", {
        status: 200,
        headers: {
          "content-type": "text/plain"
        }
      })) as typeof fetch;

    const sessionToken = await createSession(user.id);
    const request = new NextRequest("http://localhost/api/items/url", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `articlepod_session=${sessionToken}`
      },
      body: JSON.stringify({
        url: `https://1.1.1.1/articles/${uniq}`,
        title: `URL ${uniq}`,
        importance: "HIGH",
        tags: "Financial, retirement, financial"
      })
    });

    const response = await urlPost(request);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      ok: boolean;
      item_id: string;
    };

    assert.equal(payload.ok, true);
    const item = await prisma.item.findUnique({ where: { id: payload.item_id } });
    assert.ok(item);
    assert.equal(item?.priority, "HIGH");
    assert.equal(item?.tagsJson, '["financial","retirement"]');
    assert.equal(item?.sourceUrl, `https://1.1.1.1/articles/${uniq}`);
  } finally {
    globalThis.fetch = previousFetch;
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("pdf route stores importance and normalized tags", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-pdf-tags`;

  const user = await prisma.user.create({
    data: {
      email: `pdf-tags-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const sessionToken = await createSession(user.id);
    const formData = new FormData();
    formData.set(
      "file",
      new File([Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF", "utf8")], "test.pdf", {
        type: "application/pdf"
      })
    );
    formData.set("title", `PDF ${uniq}`);
    formData.set("importance", "MEDIUM");
    formData.set("tags", "Personal, planning, personal");

    const request = new NextRequest("http://localhost/api/items/pdf", {
      method: "POST",
      headers: {
        cookie: `articlepod_session=${sessionToken}`
      },
      body: formData
    });

    const response = await pdfPost(request);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      ok: boolean;
      item_id: string;
    };

    assert.equal(payload.ok, true);
    const item = await prisma.item.findUnique({ where: { id: payload.item_id } });
    assert.ok(item);
    assert.equal(item?.priority, "MEDIUM");
    assert.equal(item?.tagsJson, '["personal","planning"]');
    assert.ok(item?.sourceFilePath?.endsWith(".pdf"));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("html snapshot route enforces the byte limit after schema parsing", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-bytes`;

  const user = await prisma.user.create({
    data: {
      email: `snapshot-bytes-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const sessionToken = await createSession(user.id);
    const multiBytePayload = "é".repeat(Math.ceil(HTML_SNAPSHOT_MAX_BYTES / 2));
    const request = new NextRequest("http://localhost/api/items/html-snapshot", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `articlepod_session=${sessionToken}`
      },
      body: JSON.stringify({
        url: `https://example.com/session/${uniq}`,
        html: `<html><body><article><p>${multiBytePayload}</p></article></body></html>`
      })
    });

    const response = await htmlSnapshotPost(request);
    assert.equal(response.status, 400);

    const payload = (await response.json()) as {
      ok: boolean;
      error_code: string;
      error_message: string;
    };

    assert.equal(payload.ok, false);
    assert.equal(payload.error_code, "INVALID_INPUT");
    assert.match(payload.error_message, /too large/i);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("html snapshot validates payload and queues item for session user", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `snapshot-${uniq}@articlepod.local`,
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
        cookie: `articlepod_session=${sessionToken}`
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
        cookie: `articlepod_session=${sessionToken}`
      },
      body: JSON.stringify({
        url: `https://example.com/session/${uniq}`,
        title: `Session Snapshot ${uniq}`,
        html,
        capturedAt: "2026-02-08T00:00:00.000Z",
        importance: "HIGH",
        tags: "Technology, personal, technology"
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
    assert.equal(item?.priority, "HIGH");
    assert.equal(item?.tagsJson, '["technology","personal"]');
    assert.ok(item?.sourceFilePath?.endsWith(".html"));
    assert.equal(item?.sourceHtml, null);
    assert.equal(item?.sourceCapturedAt?.toISOString(), "2026-02-08T00:00:00.000Z");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("item metadata patch accepts priority alias and canonical tags response", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-item-patch`;

  const user = await prisma.user.create({
    data: {
      email: `item-patch-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const sessionToken = await createSession(user.id);
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        sourceType: "URL",
        sourceUrl: `https://example.com/${uniq}`,
        status: "QUEUED",
        priority: "LOW",
        tagsJson: '["personal"]'
      }
    });

    const request = new NextRequest(`http://localhost/api/items/${item.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: `articlepod_session=${sessionToken}`
      },
      body: JSON.stringify({
        priority: "MEDIUM",
        tags: "Retirement, personal"
      })
    });

    const response = await itemPatch(request, { params: { id: item.id } });
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      ok: boolean;
      importance: string;
      tags: string[];
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.importance, "MEDIUM");
    assert.deepEqual(payload.tags, ["retirement", "personal"]);

    const updated = await prisma.item.findUnique({ where: { id: item.id } });
    assert.equal(updated?.priority, "MEDIUM");
    assert.equal(updated?.tagsJson, '["retirement","personal"]');
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("item markdown route requires admin role", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `markdown-owner-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const markdown = `# Fixture ${uniq}\n\nThis is a markdown artifact fixture.`;
    const storageKey = `items/${uniq}/artifacts/source.md`;
    const stored = await storage.putObject(storageKey, Buffer.from(markdown, "utf8"), {
      contentType: "text/markdown; charset=utf-8"
    });

    const item = await prisma.item.create({
      data: {
        userId: user.id,
        sourceType: "URL",
        sourceUrl: `https://example.com/${uniq}`,
        status: "READY"
      }
    });

    await prisma.itemArtifact.create({
      data: {
        itemId: item.id,
        kind: "MARKDOWN",
        storageKey: stored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: stored.bytes
      }
    });

    const sessionToken = await createSession(user.id);
    const request = new NextRequest(`http://localhost/api/items/${item.id}/markdown`, {
      headers: {
        cookie: `articlepod_session=${sessionToken}`
      }
    });

    const response = await itemMarkdownGet(request, { params: { id: item.id } });
    assert.equal(response.status, 403);
    const payload = (await response.json()) as { ok: boolean; error_code: string };
    assert.equal(payload.ok, false);
    assert.equal(payload.error_code, "UNAUTHORIZED");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("item markdown route returns markdown for admin", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const storage = getArtifactStorage();

  const owner = await prisma.user.create({
    data: {
      email: `markdown-owner-admin-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });
  const admin = await prisma.user.create({
    data: {
      email: `markdown-admin-${uniq}@articlepod.local`,
      role: "ADMIN",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const markdown = `# Admin fixture ${uniq}\n\nThis markdown should be visible to admins.`;
    const storageKey = `items/${uniq}/artifacts/source.md`;
    const stored = await storage.putObject(storageKey, Buffer.from(markdown, "utf8"), {
      contentType: "text/markdown; charset=utf-8"
    });

    const item = await prisma.item.create({
      data: {
        userId: owner.id,
        sourceType: "URL",
        sourceUrl: `https://example.com/${uniq}`,
        status: "READY"
      }
    });

    await prisma.itemArtifact.create({
      data: {
        itemId: item.id,
        kind: "MARKDOWN",
        storageKey: stored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: stored.bytes
      }
    });

    const sessionToken = await createSession(admin.id);
    const request = new NextRequest(`http://localhost/api/items/${item.id}/markdown`, {
      headers: {
        cookie: `articlepod_session=${sessionToken}`
      }
    });

    const response = await itemMarkdownGet(request, { params: { id: item.id } });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { ok: boolean; markdown: string };
    assert.equal(payload.ok, true);
    assert.equal(payload.markdown, markdown);
  } finally {
    await prisma.user.delete({ where: { id: owner.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  }
});

test("extension token revoke route revokes active tokens", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `revoke-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    await prisma.extensionToken.create({
      data: {
        userId: user.id,
        tokenHash: `hash-${uniq}`,
        tokenValue: `value-${uniq}`,
        label: "test-token",
        scope: "ingest:html_snapshot",
        expiresAt: new Date(Date.now() + 60_000)
      }
    });

    const sessionToken = await createSession(user.id);
    const request = new NextRequest("http://localhost/api/auth/extension/revoke", {
      method: "POST",
      headers: {
        cookie: `articlepod_session=${sessionToken}`
      }
    });

    const response = await extensionRevokePost(request);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { ok: boolean; revoked: number };
    assert.equal(payload.ok, true);
    assert.equal(payload.revoked, 1);

    const token = await prisma.extensionToken.findFirst({ where: { userId: user.id } });
    assert.ok(token?.revokedAt instanceof Date);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

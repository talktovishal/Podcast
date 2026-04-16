import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { POST as connectCodePost } from "../src/app/api/auth/extension/connect-code/route";
import { POST as exchangePost } from "../src/app/api/auth/extension/exchange/route";
import { POST as pdfPost } from "../src/app/api/items/pdf/route";
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
  const result = spawnSync(
    "npx",
    ["pnpm", "--filter", "@articlepod/web", "run", "db:bootstrap"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "db bootstrap failed");
  }

  dbReady = true;
}

function buildPdfFormData() {
  const formData = new FormData();
  formData.set(
    "file",
    new File(
      [
        Buffer.from(
          "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF",
          "utf8",
        ),
      ],
      "captured.pdf",
      { type: "application/pdf" },
    ),
  );
  return formData;
}

test("pdf route requires auth", async () => {
  const response = await pdfPost(
    new NextRequest("http://localhost/api/items/pdf", {
      method: "POST",
      body: buildPdfFormData(),
    }),
  );
  assert.equal(response.status, 401);

  const payload = (await response.json()) as {
    ok: boolean;
    error_code: string;
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error_code, "UNAUTHORIZED");
});

test("pdf route accepts extension token auth", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-pdf-extension`;

  const user = await prisma.user.create({
    data: {
      email: `pdf-extension-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart",
    },
  });

  try {
    const sessionToken = await createSession(user.id);
    const connectResponse = await connectCodePost(
      new NextRequest("http://localhost/api/auth/extension/connect-code", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${sessionToken}`,
        },
        body: JSON.stringify({ label: "pdf-extension-test" }),
      }),
    );
    assert.equal(connectResponse.status, 200);
    const connectPayload = (await connectResponse.json()) as {
      connect_code: string;
    };

    const exchangeResponse = await exchangePost(
      new NextRequest("http://localhost/api/auth/extension/exchange", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          connectCode: connectPayload.connect_code,
          label: "pdf-extension-test",
        }),
      }),
    );
    assert.equal(exchangeResponse.status, 200);
    const exchangePayload = (await exchangeResponse.json()) as {
      extension_token: string;
    };

    const formData = buildPdfFormData();
    formData.set("importance", "HIGH");
    formData.set("tags", "Research, strategy, research");

    const response = await pdfPost(
      new NextRequest("http://localhost/api/items/pdf", {
        method: "POST",
        headers: {
          authorization: `Bearer ${exchangePayload.extension_token}`,
        },
        body: formData,
      }),
    );
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      ok: boolean;
      item_id: string;
    };
    assert.equal(payload.ok, true);

    const item = await prisma.item.findUnique({
      where: { id: payload.item_id },
    });
    assert.ok(item);
    assert.equal(item?.sourceType, "PDF");
    assert.equal(item?.priority, "HIGH");
    assert.equal(item?.tagsJson, '["research","strategy"]');
    assert.ok(item?.sourceFilePath?.endsWith(".pdf"));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

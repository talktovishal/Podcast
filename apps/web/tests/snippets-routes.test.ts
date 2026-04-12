import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createSecretToken } from "@articlepod/core";
import { NextRequest } from "next/server";
import { DELETE as snippetDelete, PATCH as snippetPatch } from "../src/app/api/snippets/[id]/route";
import { GET as snippetsGet, POST as snippetsPost } from "../src/app/api/snippets/route";
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

test("snippets list route requires an authenticated session", async () => {
  const response = await snippetsGet(new NextRequest("http://localhost/api/snippets"));
  assert.equal(response.status, 401);
});

test("snippets routes support session CRUD, ownership checks, and do not enqueue jobs", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const [user, otherUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `snippet-owner-${uniq}@articlepod.local`,
        role: "USER"
      }
    }),
    prisma.user.create({
      data: {
        email: `snippet-other-${uniq}@articlepod.local`,
        role: "USER"
      }
    })
  ]);

  try {
    const [session, otherSession] = await Promise.all([
      createSession(user.id),
      createSession(otherUser.id)
    ]);
    const createResponse = await snippetsPost(
      new NextRequest("http://localhost/api/snippets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${session}`
        },
        body: JSON.stringify({
          sourceUrl: `https://example.com/snippets/${uniq}`,
          sourceTitle: `Snippet ${uniq}`,
          selectedText: "A saved highlight from the page.",
          selectedHtml: "<p>A saved <strong>highlight</strong> from the page.</p>",
          contextHtml:
            "<article><h2>Important section</h2><p>A saved <strong>highlight</strong> from the page.</p><p>Supporting context.</p></article>",
          pageMetadata: {
            canonicalUrl: `https://example.com/snippets/${uniq}`,
            siteName: "Example Site",
            author: "Jane Writer",
            publishedAt: "2026-04-08T10:00:00Z",
            sectionHeadings: ["Main topic", "Important section"]
          },
          comment: "remember this"
        })
      })
    );
    assert.equal(createResponse.status, 200);
    const createPayload = (await createResponse.json()) as {
      ok: boolean;
      snippet: { id: string; comment: string | null; selectedText: string; captureMarkdown: string | null };
    };
    assert.equal(createPayload.ok, true);
    assert.equal(createPayload.snippet.comment, "remember this");
    assert.equal(createPayload.snippet.selectedText, "A saved highlight from the page.");
    assert.match(createPayload.snippet.captureMarkdown || "", /## Selected passage/);

    const createdSnippet = await prisma.snippet.findUnique({
      where: { id: createPayload.snippet.id }
    });
    assert.ok(createdSnippet);
    assert.equal(createdSnippet?.userId, user.id);
    assert.equal(createdSnippet?.selectedHtml, "<p>A saved <strong>highlight</strong> from the page.</p>");
    assert.match(createdSnippet?.selectionMarkdown || "", /\*\*highlight\*\*/);
    assert.match(createdSnippet?.contextMarkdown || "", /Supporting context/);
    assert.match(createdSnippet?.captureMarkdown || "", /Section path: Main topic > Important section/);
    assert.equal(createdSnippet?.pageMetadataJson?.includes('"siteName":"Example Site"'), true);
    assert.equal(await prisma.item.count({ where: { userId: user.id } }), 0);
    assert.equal(
      await prisma.job.count({ where: { item: { userId: user.id } } }),
      0,
    );

    const listResponse = await snippetsGet(
      new NextRequest("http://localhost/api/snippets?limit=10", {
        headers: {
          cookie: `articlepod_session=${session}`
        }
      })
    );
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as {
      ok: boolean;
      snippets: Array<{ id: string }>;
    };
    assert.equal(listPayload.ok, true);
    assert.equal(listPayload.snippets.some((snippet) => snippet.id === createPayload.snippet.id), true);

    const forbiddenPatch = await snippetPatch(
      new NextRequest(`http://localhost/api/snippets/${createPayload.snippet.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${otherSession}`
        },
        body: JSON.stringify({
          comment: "steal"
        })
      }),
      { params: { id: createPayload.snippet.id } }
    );
    assert.equal(forbiddenPatch.status, 404);

    const patchResponse = await snippetPatch(
      new NextRequest(`http://localhost/api/snippets/${createPayload.snippet.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${session}`
        },
        body: JSON.stringify({
          comment: "updated note"
        })
      }),
      { params: { id: createPayload.snippet.id } }
    );
    assert.equal(patchResponse.status, 200);
    const patchPayload = (await patchResponse.json()) as {
      ok: boolean;
      snippet: { comment: string | null };
    };
    assert.equal(patchPayload.ok, true);
    assert.equal(patchPayload.snippet.comment, "updated note");

    const deleteResponse = await snippetDelete(
      new NextRequest(`http://localhost/api/snippets/${createPayload.snippet.id}`, {
        method: "DELETE",
        headers: {
          cookie: `articlepod_session=${session}`
        }
      }),
      { params: { id: createPayload.snippet.id } }
    );
    assert.equal(deleteResponse.status, 200);
    assert.equal(await prisma.snippet.findUnique({ where: { id: createPayload.snippet.id } }), null);
  } finally {
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [user.id, otherUser.id]
        }
      }
    });
  }
});

test("snippets create route accepts extension token auth", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-extension`;
  const user = await prisma.user.create({
    data: {
      email: `snippet-extension-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  try {
    const extensionToken = createSecretToken();
    await prisma.extensionToken.create({
      data: {
        userId: user.id,
        tokenHash: extensionToken.hash,
        label: "test-extension",
        scope: "ingest:html_snapshot"
      }
    });

    const response = await snippetsPost(
      new NextRequest("http://localhost/api/snippets", {
        method: "POST",
        headers: {
          authorization: `Bearer ${extensionToken.plain}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sourceUrl: `https://example.com/extension/${uniq}`,
          sourceTitle: "Extension capture",
          selectedText: "Extension-saved selection",
          selectedHtml: "<p>Extension-saved <em>selection</em></p>",
          contextHtml: "<article><p>Extension-saved <em>selection</em> with context.</p></article>",
          pageMetadata: {
            siteName: "Extension Site",
            sectionHeadings: ["Saved from extension"]
          },
          comment: "context from extension"
        })
      })
    );
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      ok: boolean;
      snippet: { id: string; comment: string | null };
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.snippet.comment, "context from extension");

    const snippet = await prisma.snippet.findUnique({
      where: { id: payload.snippet.id }
    });
    assert.ok(snippet);
    assert.equal(snippet?.userId, user.id);
    assert.equal(snippet?.pageMetadataJson?.includes('"siteName":"Extension Site"'), true);
    assert.equal(await prisma.item.count({ where: { userId: user.id } }), 0);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

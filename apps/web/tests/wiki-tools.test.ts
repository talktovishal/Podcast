import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildUserItemMarkdownStorageKey,
  buildUserWikiBuildStateStorageKey,
  buildUserWikiManifestStorageKey,
  buildUserWikiPageStorageKey
} from "@articlepod/core";
import { createSnippetForUser } from "../src/lib/snippets";
import { prisma } from "../src/lib/prisma";
import { getArtifactStorage } from "../src/lib/storage";
import {
  getUserWikiSourceAvailabilityForApp,
  getUserWikiManifestForApp,
  getUserWikiPageForApp,
  lintPreparedWikiRun,
  prepareUserWikiBuild,
  publishPreparedWikiRun,
  sanitizeWikiMarkdownForDisplay,
  verifyPreparedWikiRun
} from "../src/lib/wiki";

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

function repoRootFromHere(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  return resolve(here, "../../..");
}

test("wiki display sanitizer removes internal metadata and source plumbing", () => {
  const cleaned = sanitizeWikiMarkdownForDisplay(
    `title: "Busy people are the biggest losers. | LinkedIn"
summary: "TLDR"
tags: ["ai"]
source_ids: ["abc-123"]
updated: "2026-03-30"

Busy people are the biggest losers. | LinkedIn
Snapshot
Source id: abc-123
sources/items/abc-123.md

Useful body copy.
`,
    {
      path: "sources/items/abc-123.md",
      summary: "TLDR",
      title: "Busy people are the biggest losers. | LinkedIn",
      type: "source_item"
    }
  );

  assert.equal(cleaned.includes("title:"), false);
  assert.equal(cleaned.includes("source_ids"), false);
  assert.equal(cleaned.includes("Source id:"), false);
  assert.equal(cleaned.includes("sources/items/abc-123.md"), false);
  assert.equal(cleaned.includes("Snapshot"), false);
  assert.equal(cleaned.includes("Useful body copy."), true);
});

test("wiki source availability counts submitted items, ready items, and snippets", async () => {
  ensureDbBootstrap();
  const uniq = `wiki-source-availability-${Date.now().toString(36)}`;

  const user = await prisma.user.create({
    data: {
      email: `${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  await prisma.item.createMany({
    data: [
      {
        userId: user.id,
        title: "Ready wiki article",
        sourceType: "URL",
        sourceUrl: `https://example.com/${uniq}/ready`,
        status: "READY"
      },
      {
        userId: user.id,
        title: "Queued wiki article",
        sourceType: "PDF",
        sourceUrl: `https://example.com/${uniq}/queued`,
        status: "QUEUED"
      },
      {
        userId: user.id,
        title: "Unsupported source",
        sourceType: "TEXT",
        sourceUrl: `https://example.com/${uniq}/text`,
        status: "READY"
      }
    ]
  });

  await createSnippetForUser(user.id, {
    sourceUrl: `https://example.com/${uniq}/snippet`,
    sourceTitle: undefined,
    selectedText: "Snippet for wiki placeholder counts.",
    comment: null,
    selectedHtml: undefined,
    contextHtml: undefined,
    pageMetadata: undefined
  });

  const availability = await getUserWikiSourceAvailabilityForApp(user.id);
  assert.equal(availability.submittedItemCount, 2);
  assert.equal(availability.readyItemCount, 1);
  assert.equal(availability.snippetCount, 1);
  assert.equal(availability.submittedSourceCount, 3);
  assert.equal(availability.readySourceCount, 2);
});

test("wiki prepare/publish supports a Karpathy prompt copy, manifest publishing, and incremental prepare", async () => {
  ensureDbBootstrap();
  const storage = getArtifactStorage();
  const uniq = `wiki-${Date.now().toString(36)}`;
  const promptDir = await mkdtemp(join(tmpdir(), "articlepod-wiki-"));
  const promptPath = join(promptDir, "llm-wiki.md");
  const repoRoot = repoRootFromHere();

  const user = await prisma.user.create({
    data: {
      email: `${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const createdRunIds: string[] = [];

  try {
    const items = await Promise.all(
      Array.from({ length: 4 }, async (_, index) => {
        const item = await prisma.item.create({
          data: {
            userId: user.id,
            title: `Wiki item ${index + 1}`,
            sourceType: "URL",
            sourceUrl: `https://example.com/wiki/${uniq}/${index + 1}`,
            status: "READY"
          }
        });

        const stored = await storage.putObject(
          buildUserItemMarkdownStorageKey(user.id, item.id),
          Buffer.from(`# Wiki item ${index + 1}\n\nBody ${index + 1}.`, "utf8"),
          {
            contentType: "text/markdown; charset=utf-8"
          }
        );

        await prisma.itemArtifact.create({
          data: {
            itemId: item.id,
            kind: "MARKDOWN",
            storageKey: stored.key,
            contentType: "text/markdown; charset=utf-8",
            byteLength: stored.bytes
          }
        });

        return item;
      })
    );

    const snippet = await createSnippetForUser(user.id, {
      sourceUrl: `https://example.com/wiki/${uniq}/snippet`,
      sourceTitle: "Snippet source",
      selectedText: "A saved snippet for the wiki.",
      selectedHtml: "<p>A saved <strong>snippet</strong> for the wiki.</p>",
      contextHtml: "<article><p>A saved <strong>snippet</strong> for the wiki.</p><p>More context.</p></article>",
      pageMetadata: {
        canonicalUrl: `https://example.com/wiki/${uniq}/snippet`,
        siteName: "Example",
        sectionHeadings: ["Wiki"]
      },
      comment: "remember this"
    });

    await writeFile(promptPath, "# Karpathy prompt\n\nMaintain a local wiki.\n", "utf8");

    const runOne = await prepareUserWikiBuild({
      userIds: [user.id],
      karpathyPromptPath: promptPath
    });
    createdRunIds.push(runOne.runId);

    assert.equal(runOne.workspaces.length, 1);
    assert.equal(runOne.workspaces[0]?.buildMode, "full");

    const workspaceOne = runOne.workspaces[0]!;
    assert.equal(await readFile(join(workspaceOne.workspaceDir, "KARPATHY_LLM_WIKI.md"), "utf8"), "# Karpathy prompt\n\nMaintain a local wiki.\n");
    assert.equal(
      await readFile(join(workspaceOne.workspaceDir, "AGENTS.md"), "utf8").then((value) =>
        value.includes("Read `KARPATHY_LLM_WIKI.md` first.") && value.includes("Then read `WIKI_CONVENTIONS.md`")
      ),
      true
    );
    assert.equal(
      await readFile(join(workspaceOne.workspaceDir, "WIKI_CONVENTIONS.md"), "utf8").then((value) =>
        value.includes("## Executive summary") && value.includes("1500-3000 words")
      ),
      true
    );
    assert.equal(await readFile(join(workspaceOne.rawDir, "items", `${items[0]!.id}.md`), "utf8").then((value) => value.includes("Body 1.")), true);
    assert.equal(await readFile(join(workspaceOne.rawDir, "snippets", `${snippet.id}.md`), "utf8").then((value) => value.includes("remember this")), true);

    await writeFile(
      join(workspaceOne.wikiDir, "index.md"),
      `# Index\n\nSee [[concepts/topic]] and [[sources/items/${items[0]!.id}|Item one]].\n`,
      "utf8"
    );
    await writeFile(join(workspaceOne.wikiDir, "log.md"), "# Log\n\n- First wiki build.\n", "utf8");
    await writeFile(join(workspaceOne.wikiDir, "overview.md"), "# Overview\n\nA wiki overview.\n", "utf8");
    await writeFile(
      join(workspaceOne.wikiDir, "sources/items", `${items[0]!.id}.md`),
      `# ${items[0]!.title}\n\nOriginal item source page.\n`,
      "utf8"
    );
    await writeFile(
      join(workspaceOne.wikiDir, "concepts/topic.md"),
      `---
tags: [knowledge]
source_ids: [${items[0]!.id}]
---
# Topic

## Executive summary

- Durable takeaway one.
- Durable takeaway two.
- Durable takeaway three.
- Durable takeaway four.
- Durable takeaway five.

## Working synthesis

${Array.from({ length: 260 }, (_, index) => `Synthesis paragraph word${index + 1}.`).join(" ")}

Topic page linking back to [item source](../sources/items/${items[0]!.id}.md).
`,
      "utf8"
    );

    const lintOne = await lintPreparedWikiRun({ runId: runOne.runId });
    assert.equal(lintOne[0]?.ok, true);

    const publishOne = await publishPreparedWikiRun({ runId: runOne.runId });
    assert.equal(publishOne[0]?.ok, true);

    const manifest = await getUserWikiManifestForApp(user.id);
    assert.ok(manifest);
    assert.equal(manifest?.pages.some((page) => page.path === "concepts/topic.md"), true);

    const topicPage = await getUserWikiPageForApp(user.id, { pagePath: "concepts/topic.md" });
    assert.ok(topicPage);
    assert.equal(topicPage?.content.includes(`/app/wiki/sources/items/${items[0]!.id}`), true);
    assert.equal(topicPage?.page.backlinks.includes("index.md"), true);
    assert.equal(topicPage?.content.includes("tags:"), false);
    assert.equal(topicPage?.content.includes("# Topic"), false);

    const itemArtifact = await prisma.itemArtifact.findFirst({
      where: {
        itemId: items[0]!.id,
        kind: "MARKDOWN"
      }
    });
    assert.ok(itemArtifact);

    await storage.putObject(
      itemArtifact!.storageKey,
      Buffer.from("# Wiki item 1\n\nBody 1 updated.\n", "utf8"),
      { contentType: "text/markdown; charset=utf-8" }
    );

    const runTwo = await prepareUserWikiBuild({
      userIds: [user.id],
      karpathyPromptPath: promptPath
    });
    createdRunIds.push(runTwo.runId);

    assert.equal(runTwo.workspaces[0]?.buildMode, "incremental");
    assert.equal(runTwo.workspaces[0]?.changedSourceIds.includes(`item:${items[0]!.id}`), true);

    const verifyTwo = await verifyPreparedWikiRun({ runId: runTwo.runId });
    assert.equal(verifyTwo[0]?.ok, true);
    assert.equal(
      await readFile(join(runTwo.workspaces[0]!.wikiDir, "index.md"), "utf8").then((value) =>
        value.includes("/app/wiki/concepts/topic")
      ),
      true
    );
  } finally {
    for (const runId of createdRunIds) {
      await rm(join(repoRoot, ".runtime/wiki-builds", runId), { recursive: true, force: true });
    }

    const manifest = await getUserWikiManifestForApp(user.id);
    if (manifest) {
      for (const page of manifest.pages) {
        await storage.deleteObject(page.storageKey).catch(() => undefined);
      }
      await storage.deleteObject(buildUserWikiManifestStorageKey(user.id)).catch(() => undefined);
      await storage.deleteObject(buildUserWikiBuildStateStorageKey(user.id, manifest.buildRunId)).catch(() => undefined);
    }

    const snippets = await prisma.snippet.findMany({
      where: { userId: user.id },
      select: { id: true }
    });
    for (const snippet of snippets) {
      await prisma.snippet.delete({ where: { id: snippet.id } }).catch(() => undefined);
    }

    const items = await prisma.item.findMany({
      where: { userId: user.id },
      include: { artifacts: true }
    });
    for (const item of items) {
      for (const artifact of item.artifacts) {
        await storage.deleteObject(artifact.storageKey).catch(() => undefined);
      }
    }

    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await rm(promptDir, { recursive: true, force: true });
  }
});

test("wiki prepare resolves email identifiers to user ids", async () => {
  ensureDbBootstrap();
  const storage = getArtifactStorage();
  const uniq = `wiki-email-${Date.now().toString(36)}`;
  const promptDir = await mkdtemp(join(tmpdir(), "articlepod-wiki-email-"));
  const promptPath = join(promptDir, "llm-wiki.md");
  const repoRoot = repoRootFromHere();
  const createdRunIds: string[] = [];
  let itemId: string | null = null;
  let storedKey: string | null = null;

  const user = await prisma.user.create({
    data: {
      email: `${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: "Email identifier wiki item",
        sourceType: "URL",
        sourceUrl: `https://example.com/wiki/${uniq}`,
        status: "READY"
      }
    });
    itemId = item.id;

    const stored = await storage.putObject(
      buildUserItemMarkdownStorageKey(user.id, item.id),
      Buffer.from("# Email identifier wiki item\n\nBody.\n", "utf8"),
      {
        contentType: "text/markdown; charset=utf-8"
      }
    );
    storedKey = stored.key;

    await prisma.itemArtifact.create({
      data: {
        itemId: item.id,
        kind: "MARKDOWN",
        storageKey: stored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: stored.bytes
      }
    });

    await writeFile(promptPath, "# Karpathy prompt\n\nMaintain a local wiki.\n", "utf8");

    const run = await prepareUserWikiBuild({
      userIds: [user.email],
      karpathyPromptPath: promptPath
    });
    createdRunIds.push(run.runId);

    assert.equal(run.workspaces[0]?.userId, user.id);
    assert.equal(run.workspaces[0]?.totalSources, 1);
    assert.equal(await readFile(join(run.workspaces[0]!.rawDir, "items", `${item.id}.md`), "utf8").then((value) => value.includes("Body.")), true);
  } finally {
    for (const runId of createdRunIds) {
      await rm(join(repoRoot, ".runtime/wiki-builds", runId), { recursive: true, force: true });
    }

    if (storedKey) {
      await storage.deleteObject(storedKey).catch(() => undefined);
    }
    if (itemId) {
      await prisma.itemArtifact.deleteMany({ where: { itemId } }).catch(() => undefined);
    }
    await prisma.item.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await rm(promptDir, { recursive: true, force: true });
    await storage.deleteObject(buildUserWikiManifestStorageKey(user.id)).catch(() => undefined);
  }
});

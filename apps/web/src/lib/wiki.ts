import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  buildUserWikiBuildStateStorageKey,
  buildUserWikiManifestStorageKey,
  buildUserWikiPageStorageKey,
  extractMarkdownSummary,
  extractMarkdownTitle,
  extractWikiLinkTargets,
  normalizeWikiPagePath,
  parseSimpleFrontmatter,
  parseSnippetPageMetadata,
  parseStoredItemTags,
  resolveWikiTargetToPagePath,
  rewriteWikiLinksForApp,
  wikiPagePathToRoutePath,
  wikiPagePathToSlug,
  type SnippetPageMetadata,
  type WikiBuildMode,
  type WikiManifest,
  type WikiPageMeta,
  type WikiPrepareRunState,
  type WikiPrepareWorkspaceState,
  type WikiSourceKind,
  type WikiSourceState
} from "@articlepod/core";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { hasPrismaDatabase, prisma } from "./prisma";
import { getArtifactStorage } from "./storage";

const DEFAULT_KARPATHY_PROMPT_PATH = "/Users/vishalchowdhary/Downloads/llm-wiki.md";
const WIKI_WRAPPER_VERSION = "2026-04-11-v1";
const WIKI_RUNTIME_VERSION = "2026-04-11-v1";
const WIKI_PREPARE_RUN_FILENAME = "prepare-run.json";
const WIKI_WORKSPACE_STATE_FILENAME = "workspace-state.json";
const WIKI_SOURCE_CATALOG_FILENAME = "SOURCE_CATALOG.md";
const WIKI_SOURCE_CATALOG_JSON_FILENAME = "source-catalog.json";
const REQUIRED_WIKI_PAGE_PATHS = ["index.md", "log.md"];
const SUPPORTED_WIKI_ITEM_SOURCE_TYPES = new Set(["URL", "PDF", "HTML_SNAPSHOT"]);

type WikiCorpusSource = {
  sourceKey: string;
  kind: WikiSourceKind;
  id: string;
  title: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  hash: string;
  rawPath: string;
  content: string;
};

type WikiPrepareOptions = {
  userIds: string[];
  forceFull?: boolean;
  karpathyPromptPath?: string;
  runId?: string;
};

type WikiPublishOptions = {
  runId: string;
  userIds?: string[];
};

type WikiLintOptions = {
  runId: string;
  userIds?: string[];
};

type WikiLintResult = {
  userId: string;
  workspaceDir: string;
  ok: boolean;
  issues: string[];
  warnings: string[];
  pageCount: number;
};

type WikiPublishResult = {
  userId: string;
  ok: boolean;
  manifestKey: string;
  pageCount: number;
  uploadedPages: string[];
  deletedPages: string[];
  buildStateKey: string;
};

type LocalWikiBuildState = {
  version: 1;
  userId: string;
  buildRunId: string;
  publishedAt: string;
  buildMode: WikiBuildMode;
  workspaceDir: string;
  manifestKey: string;
  buildStateKey: string;
  pageCount: number;
  uploadedPages: string[];
  deletedPages: string[];
};

type StoredWikiPage = {
  meta: WikiPageMeta;
  content: string;
};

function toIso(value: Date): string {
  return value.toISOString();
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeMarkdownText(input: string): string {
  return input.replace(/\r\n/g, "\n").trim();
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function buildSourceKey(kind: WikiSourceKind, id: string): string {
  return `${kind}:${id}`;
}

function parseUsersArg(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function parseCliArgs(argv: string[]): Map<string, string | boolean> {
  const values = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      values.set(key, true);
      continue;
    }
    values.set(key, next);
    index += 1;
  }
  return values;
}

function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : typeof record.name === "string" ? record.name : null;
  const details = record.details;
  const detailsCode =
    details && typeof details === "object" && typeof (details as Record<string, unknown>).errorCode === "string"
      ? ((details as Record<string, unknown>).errorCode as string)
      : null;
  const message = typeof record.message === "string" ? record.message : "";

  return (
    code === "ENOENT" ||
    code === "BlobNotFound" ||
    code === "NotFound" ||
    detailsCode === "BlobNotFound" ||
    message.includes("ENOENT") ||
    message.includes("BlobNotFound") ||
    message.includes("The specified blob does not exist")
  );
}

async function getRepoRoot(): Promise<string> {
  let current = resolve(process.cwd());

  while (true) {
    const packageJsonPath = join(current, "package.json");
    const packageJson = await readFile(packageJsonPath, "utf8").catch(() => null);
    if (packageJson && packageJson.includes('"name": "articlepod"')) {
      return current;
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      throw new Error("Could not locate the repo root from the current working directory.");
    }
    current = parent;
  }
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function writeUtf8File(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, content, "utf8");
}

async function readUtf8File(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

async function tryReadStorageObject(key: string): Promise<Buffer | null> {
  try {
    return await getArtifactStorage().getObject(key);
  } catch (error) {
    if (isMissingObjectError(error)) {
      return null;
    }
    throw error;
  }
}

async function loadUserWikiManifest(userId: string): Promise<WikiManifest | null> {
  const buffer = await tryReadStorageObject(buildUserWikiManifestStorageKey(userId));
  if (!buffer) {
    return null;
  }

  return JSON.parse(buffer.toString("utf8")) as WikiManifest;
}

async function loadUserWikiPageContent(userId: string, pagePath: string): Promise<string | null> {
  const buffer = await tryReadStorageObject(buildUserWikiPageStorageKey(userId, pagePath));
  return buffer ? buffer.toString("utf8") : null;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatPageMetadataBlock(pageMetadata: SnippetPageMetadata | null): string[] {
  if (!pageMetadata) {
    return [];
  }

  const lines: string[] = [];
  if (pageMetadata.canonicalUrl) {
    lines.push(`Canonical URL: ${pageMetadata.canonicalUrl}`);
  }
  if (pageMetadata.siteName) {
    lines.push(`Site: ${pageMetadata.siteName}`);
  }
  if (pageMetadata.author || pageMetadata.byline) {
    lines.push(`Author: ${pageMetadata.author || pageMetadata.byline}`);
  }
  if (pageMetadata.publishedAt) {
    lines.push(`Published: ${pageMetadata.publishedAt}`);
  }
  if (pageMetadata.language) {
    lines.push(`Language: ${pageMetadata.language}`);
  }
  if (pageMetadata.sectionHeadings?.length) {
    lines.push(`Section path: ${pageMetadata.sectionHeadings.join(" > ")}`);
  }
  return lines;
}

function buildSnippetSourceMarkdown(input: {
  id: string;
  sourceTitle: string | null;
  sourceUrl: string;
  selectedText: string;
  selectionMarkdown: string | null;
  contextMarkdown: string | null;
  captureMarkdown: string | null;
  pageMetadata: SnippetPageMetadata | null;
  comment: string | null;
}): string {
  const captureMarkdown = normalizeOptionalText(input.captureMarkdown);
  if (captureMarkdown) {
    const withComment = input.comment
      ? `${captureMarkdown}\n\n## Comment\n\n${input.comment.trim()}`
      : captureMarkdown;
    return normalizeMarkdownText(withComment);
  }

  const lines: string[] = [];
  const title = input.sourceTitle || `Snippet ${input.id}`;
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`Source URL: ${input.pageMetadata?.canonicalUrl || input.sourceUrl}`);

  const metadataLines = formatPageMetadataBlock(input.pageMetadata);
  if (metadataLines.length > 0) {
    lines.push(...metadataLines.filter((line) => line !== `Canonical URL: ${input.pageMetadata?.canonicalUrl || input.sourceUrl}`));
  }

  const bodyMarkdown =
    normalizeOptionalText(input.contextMarkdown) ||
    normalizeOptionalText(input.selectionMarkdown) ||
    normalizeOptionalText(input.selectedText) ||
    "Saved snippet.";

  if (input.pageMetadata?.description) {
    lines.push("");
    lines.push("## Page description");
    lines.push("");
    lines.push(input.pageMetadata.description);
  }

  lines.push("");
  lines.push("## Captured content");
  lines.push("");
  lines.push(bodyMarkdown);

  if (input.comment) {
    lines.push("");
    lines.push("## Comment");
    lines.push("");
    lines.push(input.comment.trim());
  }

  return normalizeMarkdownText(lines.join("\n"));
}

async function listWikiItemSourcesForUser(userId: string): Promise<WikiCorpusSource[]> {
  const storage = getArtifactStorage();

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const store = webPrimaryStore;
    const items = await store.listItemsByUser(userId, Number.MAX_SAFE_INTEGER);
    const readyItems = items.filter((item) => item.status === "READY" && SUPPORTED_WIKI_ITEM_SOURCE_TYPES.has(item.sourceType));
    const sources = await Promise.all(
      readyItems.map(async (item) => {
        const artifact = (await store.listItemArtifacts(item.id, "MARKDOWN"))[0];
        if (!artifact) {
          return null;
        }
        const content = await storage.getObject(artifact.storageKey).catch(() => null);
        if (!content) {
          return null;
        }

        const markdown = normalizeMarkdownText(content.toString("utf8"));
        const rawPath = `items/${item.id}.md`;
        const hash = sha256(
          JSON.stringify({
            kind: "item",
            id: item.id,
            title: item.title,
            sourceUrl: item.sourceUrl,
            createdAt: toIso(item.createdAt),
            updatedAt: toIso(item.updatedAt),
            markdown
          })
        );

        return {
          sourceKey: buildSourceKey("item", item.id),
          kind: "item" as const,
          id: item.id,
          title: item.title,
          sourceUrl: item.sourceUrl,
          createdAt: toIso(item.createdAt),
          updatedAt: toIso(item.updatedAt),
          rawPath,
          hash,
          content: markdown
        };
      })
    );

    return sources.filter(isPresent);
  }

  const items = await prisma.item.findMany({
    where: {
      userId,
      status: "READY",
      sourceType: {
        in: [...SUPPORTED_WIKI_ITEM_SOURCE_TYPES]
      }
    },
    include: {
      artifacts: {
        where: { kind: "MARKDOWN" },
        take: 1
      }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  const sources = await Promise.all(
    items.map(async (item) => {
      const artifact = item.artifacts[0];
      if (!artifact) {
        return null;
      }

      const content = await storage.getObject(artifact.storageKey).catch(() => null);
      if (!content) {
        return null;
      }

      const markdown = normalizeMarkdownText(content.toString("utf8"));
      const rawPath = `items/${item.id}.md`;
      const hash = sha256(
        JSON.stringify({
          kind: "item",
          id: item.id,
          title: item.title,
          sourceUrl: item.sourceUrl,
          createdAt: toIso(item.createdAt),
          updatedAt: toIso(item.updatedAt),
          tags: parseStoredItemTags(item.tagsJson),
          markdown
        })
      );

      return {
        sourceKey: buildSourceKey("item", item.id),
        kind: "item" as const,
        id: item.id,
        title: item.title,
        sourceUrl: item.sourceUrl,
        createdAt: toIso(item.createdAt),
        updatedAt: toIso(item.updatedAt),
        rawPath,
        hash,
        content: markdown
      };
    })
  );

  return sources.filter(isPresent);
}

async function listWikiSnippetSourcesForUser(userId: string): Promise<WikiCorpusSource[]> {
  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const snippets = await webPrimaryStore.listSnippetsByUser(userId, Number.MAX_SAFE_INTEGER);
    return snippets.map((snippet) => {
      const pageMetadata = snippet.pageMetadata ?? null;
      const content = buildSnippetSourceMarkdown({
        id: snippet.id,
        sourceTitle: snippet.sourceTitle,
        sourceUrl: snippet.sourceUrl,
        selectedText: snippet.selectedText,
        selectionMarkdown: snippet.selectionMarkdown,
        contextMarkdown: snippet.contextMarkdown,
        captureMarkdown: snippet.captureMarkdown,
        pageMetadata,
        comment: snippet.comment
      });
      const rawPath = `snippets/${snippet.id}.md`;
      const hash = sha256(
        JSON.stringify({
          kind: "snippet",
          id: snippet.id,
          sourceTitle: snippet.sourceTitle,
          sourceUrl: snippet.sourceUrl,
          createdAt: toIso(snippet.createdAt),
          updatedAt: toIso(snippet.updatedAt),
          comment: snippet.comment,
          pageMetadata,
          content
        })
      );

      return {
        sourceKey: buildSourceKey("snippet", snippet.id),
        kind: "snippet" as const,
        id: snippet.id,
        title: snippet.sourceTitle,
        sourceUrl: snippet.pageMetadata?.canonicalUrl || snippet.sourceUrl,
        createdAt: toIso(snippet.createdAt),
        updatedAt: toIso(snippet.updatedAt),
        rawPath,
        hash,
        content
      };
    });
  }

  const snippets = await prisma.snippet.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  return snippets.map((snippet) => {
    const pageMetadata = parseSnippetPageMetadata(snippet.pageMetadataJson) ?? null;
    const content = buildSnippetSourceMarkdown({
      id: snippet.id,
      sourceTitle: snippet.sourceTitle,
      sourceUrl: snippet.sourceUrl,
      selectedText: snippet.selectedText,
      selectionMarkdown: snippet.selectionMarkdown,
      contextMarkdown: snippet.contextMarkdown,
      captureMarkdown: snippet.captureMarkdown,
      pageMetadata,
      comment: snippet.comment
    });
    const rawPath = `snippets/${snippet.id}.md`;
    const hash = sha256(
      JSON.stringify({
        kind: "snippet",
        id: snippet.id,
        sourceTitle: snippet.sourceTitle,
        sourceUrl: snippet.sourceUrl,
        createdAt: toIso(snippet.createdAt),
        updatedAt: toIso(snippet.updatedAt),
        comment: snippet.comment,
        pageMetadata,
        content
      })
    );

    return {
      sourceKey: buildSourceKey("snippet", snippet.id),
      kind: "snippet" as const,
      id: snippet.id,
      title: snippet.sourceTitle,
      sourceUrl: pageMetadata?.canonicalUrl || snippet.sourceUrl,
      createdAt: toIso(snippet.createdAt),
      updatedAt: toIso(snippet.updatedAt),
      rawPath,
      hash,
      content
    };
  });
}

async function listWikiCorpusSourcesForUser(userId: string): Promise<WikiCorpusSource[]> {
  const [items, snippets] = await Promise.all([listWikiItemSourcesForUser(userId), listWikiSnippetSourcesForUser(userId)]);
  return [...items, ...snippets].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }
    return left.sourceKey.localeCompare(right.sourceKey);
  });
}

function buildSourceState(sources: WikiCorpusSource[], previousManifest: WikiManifest | null): WikiSourceState {
  const hashes = Object.fromEntries(sources.map((source) => [source.sourceKey, source.hash]));
  const previousHashes = previousManifest?.sourceState.hashes ?? {};
  const changedSourceIds = sources
    .filter((source) => previousHashes[source.sourceKey] !== source.hash)
    .map((source) => source.sourceKey);
  const deletedSourceIds = Object.keys(previousHashes).filter((sourceKey) => !(sourceKey in hashes));
  const items = sources.filter((source) => source.kind === "item").length;
  const snippets = sources.filter((source) => source.kind === "snippet").length;

  return {
    counts: {
      items,
      snippets,
      total: sources.length
    },
    hashes,
    changedSourceIds,
    deletedSourceIds
  };
}

function decideBuildMode(input: {
  forceFull?: boolean;
  previousManifest: WikiManifest | null;
  sourceState: WikiSourceState;
  promptHash: string;
}): { mode: WikiBuildMode; reason: string } {
  if (input.forceFull) {
    return { mode: "full", reason: "Forced full rebuild requested by operator." };
  }
  if (!input.previousManifest) {
    return { mode: "full", reason: "No previous wiki manifest exists for this user." };
  }
  if (input.previousManifest.version !== 1) {
    return { mode: "full", reason: "Published wiki manifest version changed." };
  }
  if (input.previousManifest.schema.promptHash !== input.promptHash) {
    return { mode: "full", reason: "Karpathy prompt copy changed." };
  }
  if (input.previousManifest.schema.wrapperVersion !== WIKI_WRAPPER_VERSION) {
    return { mode: "full", reason: "Wiki wrapper/runtime version changed." };
  }
  if (input.sourceState.deletedSourceIds.length > 0) {
    return { mode: "full", reason: "One or more previously indexed sources were removed." };
  }

  const totalSources = Math.max(1, input.sourceState.counts.total);
  const churnRatio = input.sourceState.changedSourceIds.length / totalSources;
  if (churnRatio > 0.2) {
    return {
      mode: "full",
      reason: `Corpus churn reached ${(churnRatio * 100).toFixed(1)}%, exceeding the 20% incremental threshold.`
    };
  }

  return {
    mode: "incremental",
    reason: input.sourceState.changedSourceIds.length === 0 ? "No source changes detected; reuse the existing wiki." : "Only a subset of sources changed."
  };
}

function buildSourceCatalogMarkdown(userId: string, sources: WikiCorpusSource[], sourceState: WikiSourceState): string {
  const lines: string[] = [];
  lines.push(`# Source Catalog for ${userId}`);
  lines.push("");
  lines.push(`- Items: ${sourceState.counts.items}`);
  lines.push(`- Snippets: ${sourceState.counts.snippets}`);
  lines.push(`- Total sources: ${sourceState.counts.total}`);
  lines.push(`- Changed sources in this run: ${sourceState.changedSourceIds.length}`);
  lines.push("");
  lines.push("| Source | Kind | Raw file | Title | URL | Updated | Hash |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");

  for (const source of sources) {
    lines.push(
      `| ${source.sourceKey} | ${source.kind} | \`${source.rawPath}\` | ${source.title || ""} | ${source.sourceUrl || ""} | ${source.updatedAt} | \`${source.hash.slice(0, 12)}\` |`
    );
  }

  return `${lines.join("\n")}\n`;
}

function buildWorkspaceAgentsMd(buildMode: WikiBuildMode): string {
  return [
    "# AGENTS.md",
    "",
    "Read `KARPATHY_LLM_WIKI.md` first. It is the primary prompt and operating philosophy for this workspace.",
    "",
    "Runtime bindings:",
    "- Raw source material lives under `raw/`.",
    "- Maintain only files under `wiki/`.",
    "- Keep `wiki/index.md` and `wiki/log.md` current.",
    `- This run is in \`${buildMode}\` mode.`,
    "- Treat the current `wiki/` tree as the artifact to maintain for this run.",
    "- Do not rewrite `KARPATHY_LLM_WIKI.md`; use it as-is.",
    "- Do not edit generated runtime helper files except `wiki/` content."
  ].join("\n");
}

function buildWorkspaceRuntimeMd(input: {
  userId: string;
  buildMode: WikiBuildMode;
  buildReason: string;
  changedSourceIds: string[];
  deletedSourceIds: string[];
  promptSourcePath: string;
  previousWikiReferenceDir: string | null;
}): string {
  const lines = [
    "# WIKI_RUNTIME.md",
    "",
    `User: ${input.userId}`,
    `Build mode: ${input.buildMode}`,
    `Reason: ${input.buildReason}`,
    `Karpathy prompt source: ${input.promptSourcePath}`,
    "",
    "Workspace contract:",
    "- `raw/` is immutable input for this run.",
    "- `wiki/` is the only tree Codex should maintain.",
    "- `index.md` and `log.md` are required.",
    "- Use incremental updates where possible; rebuild or prune aggressively only when the current mode demands it."
  ];

  if (input.previousWikiReferenceDir) {
    lines.push(`- Previous published wiki was restored to \`${input.previousWikiReferenceDir}\` for reference only.`);
  }

  if (input.changedSourceIds.length > 0) {
    lines.push("", "Changed sources:", ...input.changedSourceIds.map((value) => `- ${value}`));
  }

  if (input.deletedSourceIds.length > 0) {
    lines.push("", "Deleted sources detected:", ...input.deletedSourceIds.map((value) => `- ${value}`));
  }

  return `${lines.join("\n")}\n`;
}

async function restorePublishedWikiToDirectory(userId: string, manifest: WikiManifest, targetDir: string): Promise<void> {
  for (const page of manifest.pages) {
    const content = await loadUserWikiPageContent(userId, page.path);
    if (!content) {
      continue;
    }
    await writeUtf8File(join(targetDir, page.path), content);
  }
}

async function ensureWikiSkeleton(wikiDir: string, buildMode: WikiBuildMode, buildReason: string): Promise<void> {
  await Promise.all([
    ensureDir(join(wikiDir, "sources/items")),
    ensureDir(join(wikiDir, "sources/snippets")),
    ensureDir(join(wikiDir, "concepts")),
    ensureDir(join(wikiDir, "entities")),
    ensureDir(join(wikiDir, "outputs"))
  ]);

  const seedFiles = new Map<string, string>([
    [
      "index.md",
      `# Index\n\nThis wiki is maintained from the current \`raw/\` corpus.\n\n- Build mode: ${buildMode}\n- Reason: ${buildReason}\n`
    ],
    ["overview.md", "# Overview\n\nThis page can summarize the current wiki corpus and major themes.\n"],
    ["log.md", "# Log\n\n- Workspace prepared and ready for the next wiki update.\n"]
  ]);

  for (const [relativePath, content] of seedFiles) {
    const absolutePath = join(wikiDir, relativePath);
    if (!(await fileExists(absolutePath))) {
      await writeUtf8File(absolutePath, content);
    }
  }
}

async function readKarpathyPrompt(path: string): Promise<{ content: string; hash: string }> {
  const content = await readUtf8File(path);
  return {
    content,
    hash: sha256(content)
  };
}

function buildDefaultRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `wiki-${timestamp}-${randomUUID().slice(0, 8)}`;
}

function normalizeUserIds(userIds: string[]): string[] {
  return Array.from(new Set(userIds.map((value) => value.trim()).filter(Boolean)));
}

async function resolveWikiUserIdentifier(userIdentifier: string): Promise<string> {
  const normalized = userIdentifier.trim();
  if (!normalized.includes("@")) {
    return normalized;
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const user = await webPrimaryStore.findUserByEmail(normalized);
    if (!user) {
      throw new Error(`No user found for email ${normalized}.`);
    }
    return user.id;
  }

  if (hasPrismaDatabase()) {
    const user = await prisma.user.findUnique({
      where: { email: normalized.toLowerCase() },
      select: { id: true }
    });
    if (!user) {
      throw new Error(`No user found for email ${normalized}.`);
    }
    return user.id;
  }

  throw new Error(`Cannot resolve email ${normalized} because no user database is configured for this runtime.`);
}

async function resolveWikiUserIdentifiers(userIds: string[]): Promise<string[]> {
  const resolved = await Promise.all(userIds.map((userId) => resolveWikiUserIdentifier(userId)));
  return Array.from(new Set(resolved));
}

function shouldIncludeUser(workspace: WikiPrepareWorkspaceState, userIds: string[] | undefined): boolean {
  return !userIds || userIds.length === 0 || userIds.includes(workspace.userId);
}

async function listWorkspaceMarkdownFiles(rootDir: string, currentDir = rootDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listWorkspaceMarkdownFiles(rootDir, absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(normalizeWikiPagePath(absolutePath.slice(rootDir.length + 1)));
    }
  }

  return results.sort();
}

function inferWikiPageType(pagePath: string): string {
  if (pagePath === "index.md") {
    return "index";
  }
  if (pagePath === "log.md") {
    return "log";
  }
  if (pagePath === "overview.md") {
    return "overview";
  }
  if (pagePath.startsWith("sources/items/")) {
    return "source_item";
  }
  if (pagePath.startsWith("sources/snippets/")) {
    return "source_snippet";
  }
  if (pagePath.startsWith("concepts/")) {
    return "concept";
  }
  if (pagePath.startsWith("entities/")) {
    return "entity";
  }
  if (pagePath.startsWith("outputs/")) {
    return "output";
  }
  return "page";
}

function parseListValue(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => entry.trim()).filter(Boolean);
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function inferPageSourceIds(pagePath: string): string[] {
  if (pagePath.startsWith("sources/items/")) {
    return [pagePath.replace(/^sources\/items\//, "").replace(/\.md$/, "")];
  }
  if (pagePath.startsWith("sources/snippets/")) {
    return [pagePath.replace(/^sources\/snippets\//, "").replace(/\.md$/, "")];
  }
  return [];
}

function stripMarkdownForSearch(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?---\n?/m, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[\[([^[\]]+?)\]\]/g, "$1")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/[`*_>#|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WIKI_TOP_METADATA_LINE_RE = /^(title|summary|tags|source_ids|source_id|updated|type)\s*:/i;
const WIKI_INTERNAL_METADATA_LINE_RE =
  /^(source ids?|source url|original url|canonical url|raw file|updated|type)\s*:/i;
const WIKI_INTERNAL_PAGE_PATH_LINE_RE =
  /^(?:\.{1,2}\/)*(?:sources\/(?:items|snippets)|concepts|entities|outputs)\/[^\s]+\.md$/i;

function trimMarkdownLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && !lines[start]?.trim()) {
    start += 1;
  }
  while (end > start && !lines[end - 1]?.trim()) {
    end -= 1;
  }

  return lines.slice(start, end);
}

function normalizeDisplayedHeading(line: string): string {
  return line.replace(/^#+\s*/, "").trim().replace(/^['"]|['"]$/g, "");
}

function isWikiSourcePage(page: Pick<WikiPageMeta, "type" | "path">): boolean {
  return (
    page.type === "source_item" ||
    page.type === "source_snippet" ||
    page.path.startsWith("sources/items/") ||
    page.path.startsWith("sources/snippets/")
  );
}

export function sanitizeWikiMarkdownForDisplay(
  markdown: string,
  page: Pick<WikiPageMeta, "path" | "summary" | "title" | "type">
): string {
  const { body } = parseSimpleFrontmatter(markdown);
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let cursor = 0;

  while (cursor < lines.length && !lines[cursor]?.trim()) {
    cursor += 1;
  }
  while (cursor < lines.length && WIKI_TOP_METADATA_LINE_RE.test(lines[cursor]?.trim() || "")) {
    cursor += 1;
  }
  while (cursor < lines.length && !lines[cursor]?.trim()) {
    cursor += 1;
  }

  const normalizedTitle = page.title.trim().toLowerCase();
  if (cursor < lines.length) {
    const maybeDuplicateTitle = normalizeDisplayedHeading(lines[cursor] || "").toLowerCase();
    if (maybeDuplicateTitle === normalizedTitle) {
      cursor += 1;
      while (cursor < lines.length && !lines[cursor]?.trim()) {
        cursor += 1;
      }
    }
  }

  if (isWikiSourcePage(page)) {
    while (cursor < lines.length) {
      const normalized = normalizeDisplayedHeading(lines[cursor] || "").toLowerCase();
      if (normalized === "snapshot" || normalized === "source" || normalized === "reference") {
        cursor += 1;
        while (cursor < lines.length && !lines[cursor]?.trim()) {
          cursor += 1;
        }
        continue;
      }
      break;
    }
  }

  const cleaned = trimMarkdownLines(
    lines.slice(cursor).filter((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }
      if (WIKI_INTERNAL_PAGE_PATH_LINE_RE.test(trimmed)) {
        return false;
      }
      if (index < 16 && WIKI_INTERNAL_METADATA_LINE_RE.test(trimmed)) {
        return false;
      }
      if (index < 16 && /^source id:\s*/i.test(trimmed)) {
        return false;
      }
      return true;
    })
  ).join("\n");

  if (cleaned) {
    return `${cleaned}\n`;
  }
  if (page.summary?.trim()) {
    return `${page.summary.trim()}\n`;
  }

  return "";
}

async function readSourceCatalogJson(workspaceDir: string): Promise<WikiCorpusSource[]> {
  const path = join(workspaceDir, "raw", WIKI_SOURCE_CATALOG_JSON_FILENAME);
  return JSON.parse(await readUtf8File(path)) as WikiCorpusSource[];
}

async function buildStoredWikiPages(userId: string, workspaceDir: string): Promise<StoredWikiPage[]> {
  const wikiDir = join(workspaceDir, "wiki");
  const pagePaths = await listWorkspaceMarkdownFiles(wikiDir);
  const sourceCatalog = await readSourceCatalogJson(workspaceDir);
  const sourceById = new Map(sourceCatalog.map((source) => [source.id, source]));

  const pages = await Promise.all(
    pagePaths.map(async (pagePath) => {
      const original = await readUtf8File(join(wikiDir, pagePath));
      const rewritten = rewriteWikiLinksForApp(original, {
        currentPagePath: pagePath,
        pagePaths
      });
      const { data, body } = parseSimpleFrontmatter(rewritten);
      const titleValue = typeof data.title === "string" ? data.title : null;
      const summaryValue = typeof data.summary === "string" ? data.summary : null;
      const sourceIds = parseListValue(data.source_ids || data.sourceIds).length > 0
        ? parseListValue(data.source_ids || data.sourceIds)
        : inferPageSourceIds(pagePath);
      const outgoingLinks = extractWikiLinkTargets(original)
        .map((target) =>
          resolveWikiTargetToPagePath({
            target,
            currentPagePath: pagePath,
            pagePaths
          })
        )
        .filter((target): target is string => Boolean(target));
      const type = typeof data.type === "string" ? data.type : inferWikiPageType(pagePath);
      const inferredSourceId = inferPageSourceIds(pagePath)[0] ?? null;
      const sourceRecord = inferredSourceId ? sourceById.get(inferredSourceId) ?? null : null;
      const sourceKind: WikiSourceKind | null =
        type === "source_item" ? "item" : type === "source_snippet" ? "snippet" : null;

      return {
        meta: {
          path: pagePath,
          slug: wikiPagePathToSlug(pagePath),
          routePath: wikiPagePathToRoutePath(pagePath),
          title: titleValue || extractMarkdownTitle(body, pagePath),
          type,
          summary: summaryValue || extractMarkdownSummary(body),
          tags: parseListValue(data.tags),
          sourceIds,
          sourceKind,
          sourceUrl: sourceRecord?.sourceUrl ?? null,
          sourceTitle: sourceRecord?.title ?? null,
          hash: sha256(rewritten),
          outgoingLinks: Array.from(new Set(outgoingLinks)).sort(),
          backlinks: [],
          updated: typeof data.updated === "string" ? data.updated : null,
          sizeBytes: Buffer.byteLength(rewritten, "utf8"),
          storageKey: buildUserWikiPageStorageKey(userId, pagePath),
          searchText: stripMarkdownForSearch(
            [
              titleValue || extractMarkdownTitle(body, pagePath),
              summaryValue || extractMarkdownSummary(body) || "",
              ...parseListValue(data.tags),
              body
            ].join("\n")
          )
        },
        content: rewritten
      };
    })
  );

  const backlinksByPagePath = new Map<string, Set<string>>();
  for (const page of pages) {
    for (const outgoingLink of page.meta.outgoingLinks) {
      if (!backlinksByPagePath.has(outgoingLink)) {
        backlinksByPagePath.set(outgoingLink, new Set());
      }
      backlinksByPagePath.get(outgoingLink)?.add(page.meta.path);
    }
  }

  return pages.map((page) => ({
    ...page,
    meta: {
      ...page.meta,
      backlinks: Array.from(backlinksByPagePath.get(page.meta.path) ?? []).sort()
    }
  }));
}

async function readPrepareRunState(runId: string): Promise<WikiPrepareRunState> {
  const repoRoot = await getRepoRoot();
  const statePath = join(repoRoot, ".runtime/wiki-builds", runId, WIKI_PREPARE_RUN_FILENAME);
  return JSON.parse(await readUtf8File(statePath)) as WikiPrepareRunState;
}

export async function prepareUserWikiBuild(input: WikiPrepareOptions): Promise<WikiPrepareRunState> {
  const userIds = await resolveWikiUserIdentifiers(normalizeUserIds(input.userIds));
  if (userIds.length === 0) {
    throw new Error("Provide at least one user id or email with --users.");
  }

  const karpathyPromptPath = input.karpathyPromptPath || process.env.KARPATHY_LLM_WIKI_PATH || DEFAULT_KARPATHY_PROMPT_PATH;
  const prompt = await readKarpathyPrompt(karpathyPromptPath);
  const repoRoot = await getRepoRoot();
  const runId = input.runId || buildDefaultRunId();
  const runRoot = join(repoRoot, ".runtime/wiki-builds", runId);
  await ensureDir(runRoot);

  const workspaces: WikiPrepareWorkspaceState[] = [];

  for (const userId of userIds) {
    const workspaceDir = join(runRoot, userId);
    const rawDir = join(workspaceDir, "raw");
    const wikiDir = join(workspaceDir, "wiki");
    const previousManifest = await loadUserWikiManifest(userId);
    const sources = await listWikiCorpusSourcesForUser(userId);
    const sourceState = buildSourceState(sources, previousManifest);
    const buildDecision = decideBuildMode({
      forceFull: input.forceFull,
      previousManifest,
      sourceState,
      promptHash: prompt.hash
    });

    await rm(workspaceDir, { recursive: true, force: true });
    await ensureDir(join(rawDir, "items"));
    await ensureDir(join(rawDir, "snippets"));
    await ensureDir(wikiDir);

    for (const source of sources) {
      await writeUtf8File(join(rawDir, source.rawPath), `${source.content}\n`);
    }

    const sourceCatalogMarkdown = buildSourceCatalogMarkdown(userId, sources, sourceState);
    await writeUtf8File(join(rawDir, WIKI_SOURCE_CATALOG_FILENAME), sourceCatalogMarkdown);
    await writeUtf8File(join(rawDir, WIKI_SOURCE_CATALOG_JSON_FILENAME), `${JSON.stringify(sources, null, 2)}\n`);

    let previousWikiReferenceDir: string | null = null;
    if (previousManifest) {
      if (buildDecision.mode === "incremental") {
        await restorePublishedWikiToDirectory(userId, previousManifest, wikiDir);
      } else {
        previousWikiReferenceDir = "previous-wiki";
        await restorePublishedWikiToDirectory(userId, previousManifest, join(workspaceDir, previousWikiReferenceDir));
      }
    }

    await ensureWikiSkeleton(wikiDir, buildDecision.mode, buildDecision.reason);
    await writeUtf8File(join(workspaceDir, "KARPATHY_LLM_WIKI.md"), prompt.content);
    await writeUtf8File(join(workspaceDir, "AGENTS.md"), `${buildWorkspaceAgentsMd(buildDecision.mode)}\n`);
    await writeUtf8File(
      join(workspaceDir, "WIKI_RUNTIME.md"),
      buildWorkspaceRuntimeMd({
        userId,
        buildMode: buildDecision.mode,
        buildReason: buildDecision.reason,
        changedSourceIds: sourceState.changedSourceIds,
        deletedSourceIds: sourceState.deletedSourceIds,
        promptSourcePath: karpathyPromptPath,
        previousWikiReferenceDir
      })
    );

    const workspaceState: WikiPrepareWorkspaceState = {
      userId,
      workspaceDir,
      rawDir,
      wikiDir,
      buildMode: buildDecision.mode,
      buildReason: buildDecision.reason,
      promptHash: prompt.hash,
      promptSourcePath: karpathyPromptPath,
      changedSourceIds: sourceState.changedSourceIds,
      deletedSourceIds: sourceState.deletedSourceIds,
      totalSources: sources.length
    };

    await writeUtf8File(join(workspaceDir, WIKI_WORKSPACE_STATE_FILENAME), `${JSON.stringify(workspaceState, null, 2)}\n`);
    workspaces.push(workspaceState);
  }

  const runState: WikiPrepareRunState = {
    version: 1,
    runId,
    generatedAt: new Date().toISOString(),
    repoRoot,
    workspaces
  };
  await writeUtf8File(join(runRoot, WIKI_PREPARE_RUN_FILENAME), `${JSON.stringify(runState, null, 2)}\n`);
  return runState;
}

async function lintWikiWorkspace(workspace: WikiPrepareWorkspaceState): Promise<WikiLintResult> {
  const issues: string[] = [];
  const warnings: string[] = [];

  for (const requiredFile of ["KARPATHY_LLM_WIKI.md", "AGENTS.md", "WIKI_RUNTIME.md", `raw/${WIKI_SOURCE_CATALOG_FILENAME}`]) {
    if (!(await fileExists(join(workspace.workspaceDir, requiredFile)))) {
      issues.push(`Missing required workspace file: ${requiredFile}`);
    }
  }

  const pagePaths = await listWorkspaceMarkdownFiles(workspace.wikiDir);
  for (const requiredPagePath of REQUIRED_WIKI_PAGE_PATHS) {
    if (!pagePaths.includes(requiredPagePath)) {
      issues.push(`Missing required wiki page: ${requiredPagePath}`);
    }
  }

  if (pagePaths.length === 0) {
    issues.push("No markdown pages were found under wiki/.");
  }

  for (const pagePath of pagePaths) {
    const content = await readUtf8File(join(workspace.wikiDir, pagePath));
    const linkTargets = extractWikiLinkTargets(content);
    for (const target of linkTargets) {
      const resolved = resolveWikiTargetToPagePath({
        target,
        currentPagePath: pagePath,
        pagePaths
      });
      if (!resolved && !target.startsWith("http://") && !target.startsWith("https://") && !target.startsWith("mailto:")) {
        warnings.push(`Unresolved wiki link in ${pagePath}: ${target}`);
      }
    }
  }

  return {
    userId: workspace.userId,
    workspaceDir: workspace.workspaceDir,
    ok: issues.length === 0,
    issues,
    warnings,
    pageCount: pagePaths.length
  };
}

export async function lintPreparedWikiRun(input: WikiLintOptions): Promise<WikiLintResult[]> {
  const runState = await readPrepareRunState(input.runId);
  const results = await Promise.all(
    runState.workspaces.filter((workspace) => shouldIncludeUser(workspace, input.userIds)).map((workspace) => lintWikiWorkspace(workspace))
  );
  return results;
}

export async function verifyPreparedWikiRun(input: WikiLintOptions): Promise<WikiLintResult[]> {
  const runState = await readPrepareRunState(input.runId);
  const lintResults = await Promise.all(
    runState.workspaces.filter((workspace) => shouldIncludeUser(workspace, input.userIds)).map((workspace) => lintWikiWorkspace(workspace))
  );

  for (const result of lintResults) {
    const workspaceState = JSON.parse(
      await readUtf8File(join(result.workspaceDir, WIKI_WORKSPACE_STATE_FILENAME))
    ) as WikiPrepareWorkspaceState;
    const karpathyPrompt = await readUtf8File(join(result.workspaceDir, "KARPATHY_LLM_WIKI.md"));
    const agentsMd = await readUtf8File(join(result.workspaceDir, "AGENTS.md"));

    if (sha256(karpathyPrompt) !== workspaceState.promptHash) {
      result.ok = false;
      result.issues.push("KARPATHY_LLM_WIKI.md no longer matches the copied source prompt.");
    }

    if (!agentsMd.includes("Read `KARPATHY_LLM_WIKI.md` first.")) {
      result.ok = false;
      result.issues.push("AGENTS.md does not point Codex back to the original Karpathy prompt.");
    }

    if (!agentsMd.includes("Maintain only files under `wiki/`.")) {
      result.ok = false;
      result.issues.push("AGENTS.md does not enforce the wiki-only write scope.");
    }
  }

  return lintResults;
}

export async function publishPreparedWikiRun(input: WikiPublishOptions): Promise<WikiPublishResult[]> {
  const runState = await readPrepareRunState(input.runId);
  const storage = getArtifactStorage();
  const results: WikiPublishResult[] = [];

  for (const workspace of runState.workspaces.filter((entry) => shouldIncludeUser(entry, input.userIds))) {
    const lintResult = await lintWikiWorkspace(workspace);
    if (!lintResult.ok) {
      throw new Error(`Wiki workspace for user ${workspace.userId} failed lint: ${lintResult.issues.join("; ")}`);
    }

    const existingManifest = await loadUserWikiManifest(workspace.userId);
    const storedPages = await buildStoredWikiPages(workspace.userId, workspace.workspaceDir);
    const pagesByPath = new Map(storedPages.map((page) => [page.meta.path, page]));
    const uploadedPages: string[] = [];
    const deletedPages: string[] = [];

    for (const page of storedPages) {
      const existingPage = existingManifest?.pages.find((entry) => entry.path === page.meta.path) ?? null;
      if (!existingPage || existingPage.hash !== page.meta.hash) {
        await storage.putObject(page.meta.storageKey, Buffer.from(page.content, "utf8"), {
          contentType: "text/markdown; charset=utf-8"
        });
        uploadedPages.push(page.meta.path);
      }
    }

    for (const previousPage of existingManifest?.pages ?? []) {
      if (!pagesByPath.has(previousPage.path)) {
        await storage.deleteObject(previousPage.storageKey).catch(() => undefined);
        deletedPages.push(previousPage.path);
      }
    }

    const sourceCatalog = await readSourceCatalogJson(workspace.workspaceDir);
    const sourceState = buildSourceState(sourceCatalog, existingManifest);
    const manifest: WikiManifest = {
      version: 1,
      userId: workspace.userId,
      buildRunId: runState.runId,
      generatedAt: new Date().toISOString(),
      buildMode: workspace.buildMode,
      defaultPagePath: pagesByPath.has("index.md") ? "index.md" : storedPages[0]?.meta.path || "index.md",
      schema: {
        promptSource: "Andrej Karpathy llm-wiki.md",
        promptHash: workspace.promptHash,
        wrapperVersion: WIKI_WRAPPER_VERSION,
        runtimeVersion: WIKI_RUNTIME_VERSION,
        karpathyPromptPath: workspace.promptSourcePath
      },
      sourceState,
      pages: storedPages.map((page) => page.meta)
    };

    const manifestKey = buildUserWikiManifestStorageKey(workspace.userId);
    await storage.putObject(manifestKey, Buffer.from(JSON.stringify(manifest, null, 2), "utf8"), {
      contentType: "application/json; charset=utf-8"
    });

    const buildState: LocalWikiBuildState = {
      version: 1,
      userId: workspace.userId,
      buildRunId: runState.runId,
      publishedAt: new Date().toISOString(),
      buildMode: workspace.buildMode,
      workspaceDir: workspace.workspaceDir,
      manifestKey,
      buildStateKey: buildUserWikiBuildStateStorageKey(workspace.userId, runState.runId),
      pageCount: storedPages.length,
      uploadedPages,
      deletedPages
    };

    await storage.putObject(buildState.buildStateKey, Buffer.from(JSON.stringify(buildState, null, 2), "utf8"), {
      contentType: "application/json; charset=utf-8"
    });

    if (existingManifest && existingManifest.buildRunId !== runState.runId) {
      await storage.deleteObject(buildUserWikiBuildStateStorageKey(workspace.userId, existingManifest.buildRunId)).catch(() => undefined);
    }

    results.push({
      userId: workspace.userId,
      ok: true,
      manifestKey,
      pageCount: storedPages.length,
      uploadedPages,
      deletedPages,
      buildStateKey: buildState.buildStateKey
    });
  }

  return results;
}

export async function getUserWikiManifestForApp(userId: string): Promise<WikiManifest | null> {
  return loadUserWikiManifest(userId);
}

export async function hasWikiForUser(userId: string): Promise<boolean> {
  return Boolean(await loadUserWikiManifest(userId));
}

export async function getUserWikiPageForApp(userId: string, input?: {
  slug?: string[];
  pagePath?: string;
}): Promise<{ manifest: WikiManifest; page: WikiPageMeta; content: string } | null> {
  const manifest = await loadUserWikiManifest(userId);
  if (!manifest) {
    return null;
  }

  const resolvedPath = input?.pagePath
    ? normalizeWikiPagePath(input.pagePath)
    : input?.slug && input.slug.length > 0
      ? normalizeWikiPagePath(input.slug.join("/"))
      : manifest.defaultPagePath;
  const page = manifest.pages.find((entry) => entry.path === resolvedPath || entry.routePath === wikiPagePathToRoutePath(resolvedPath));
  if (!page) {
    return null;
  }

  const content = await loadUserWikiPageContent(userId, page.path);
  if (!content) {
    return null;
  }

  return {
    manifest,
    page,
    content: sanitizeWikiMarkdownForDisplay(content, page)
  };
}

export function formatWikiPrepareRunForCli(runState: WikiPrepareRunState): string {
  return JSON.stringify(runState, null, 2);
}

export function formatWikiLintResultsForCli(results: WikiLintResult[]): string {
  return JSON.stringify(results, null, 2);
}

export function formatWikiPublishResultsForCli(results: WikiPublishResult[]): string {
  return JSON.stringify(results, null, 2);
}

export function parseWikiPrepareCliArgs(argv: string[]): WikiPrepareOptions {
  const values = parseCliArgs(argv);
  return {
    userIds: parseUsersArg(typeof values.get("users") === "string" ? (values.get("users") as string) : undefined),
    forceFull: values.get("full") === true,
    karpathyPromptPath: typeof values.get("prompt-file") === "string" ? (values.get("prompt-file") as string) : undefined,
    runId: typeof values.get("run") === "string" ? (values.get("run") as string) : undefined
  };
}

export function parseWikiRunCliArgs(argv: string[]): WikiPublishOptions {
  const values = parseCliArgs(argv);
  const runId = typeof values.get("run") === "string" ? (values.get("run") as string) : "";
  if (!runId) {
    throw new Error("Provide --run <runId>.");
  }
  return {
    runId,
    userIds: parseUsersArg(typeof values.get("users") === "string" ? (values.get("users") as string) : undefined)
  };
}

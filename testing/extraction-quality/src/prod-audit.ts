import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { TableClient, type TableEntityResult } from "@azure/data-tables";
import { AzureBlobObjectStorage, analyzeMarkdownQuality, type MarkdownQualityAnalysis, type MarkdownQualityIssue } from "@articlepod/core";
import { EXPORT_ROOT } from "./paths.js";
import { buildProductionAuditSummary, writeProductionAuditReports } from "./report.js";
import type { CliOptions, ProductionAuditEntry, ProductionAuditKind, ProductionEntryClassification } from "./types.js";
import { runWithConcurrency, timestampSlug } from "./utils.js";

const DEFAULT_RESOURCE_GROUP = "rg-articlepod-prod";
const DEFAULT_TABLE_PREFIX = "articlepod";
const DEFAULT_STORAGE_CONTAINER = "articlepod";
const BLOB_READ_CONCURRENCY = 8;

const execFileAsync = promisify(execFile);

type AzureEntity = TableEntityResult<Record<string, unknown>>;

function normalizeTablePrefix(rawPrefix: string): string {
  const compact = rawPrefix.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!compact) {
    return DEFAULT_TABLE_PREFIX;
  }
  if (compact.length < 3) {
    return `${compact}pod`;
  }
  if (compact.length > 40) {
    return compact.slice(0, 40);
  }
  return compact;
}

function buildTableName(prefix: string, suffix: string): string {
  const normalized = `${normalizeTablePrefix(prefix)}${suffix}`.replace(/[^a-z0-9]/g, "");
  if (normalized.length <= 63) {
    return normalized;
  }
  return normalized.slice(0, 63);
}

function escapeOdataString(value: string): string {
  return value.replace(/'/g, "''");
}

function filterEquals(field: string, value: string): string {
  return `${field} eq '${escapeOdataString(value)}'`;
}

function filterGreaterThanOrEqual(field: string, value: Date): string {
  return `${field} ge '${value.toISOString()}'`;
}

function joinFilters(...parts: Array<string | undefined>): string | undefined {
  const filtered = parts.filter(Boolean);
  return filtered.length > 0 ? filtered.join(" and ") : undefined;
}

function parseString(input: unknown): string | null {
  return typeof input === "string" && input.length > 0 ? input : null;
}

function parseRequiredString(entity: AzureEntity, field: string): string {
  const value = parseString(entity[field]);
  if (!value) {
    throw new Error(`Missing required '${field}' on Azure entity.`);
  }
  return value;
}

function parseDate(input: unknown): Date | null {
  if (typeof input !== "string" || input.length === 0) {
    return null;
  }
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateIso(entity: AzureEntity, field: string): string | null {
  return parseDate(entity[field])?.toISOString() ?? null;
}

function summarizeFetchError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeIssueSet(
  analysis: MarkdownQualityAnalysis,
  suppressLowSignal: boolean
): Pick<ProductionAuditEntry, "issueCounts" | "issues" | "cleanedMarkdown" | "hasNarratableText"> {
  if (!suppressLowSignal) {
    return {
      issueCounts: analysis.issueCounts,
      issues: analysis.issues,
      cleanedMarkdown: analysis.cleanedMarkdown,
      hasNarratableText: analysis.hasNarratableText
    };
  }

  const filteredIssues = analysis.issues.filter((issue: MarkdownQualityIssue) => issue.type !== "low_signal_after_cleanup");
  return {
    issueCounts: {
      ...analysis.issueCounts,
      low_signal_after_cleanup: 0
    },
    issues: filteredIssues,
    cleanedMarkdown: analysis.cleanedMarkdown,
    hasNarratableText: analysis.hasNarratableText
  };
}

function stripMarkdownToWords(markdown: string): string[] {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~`>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function classifyGeneratedContent(
  content: string,
  options?: { suppressLowSignal?: boolean }
): Pick<ProductionAuditEntry, "issueCounts" | "issues" | "cleanedMarkdown" | "hasNarratableText" | "classification" | "notes"> {
  const analysis = analyzeMarkdownQuality(content);
  const normalized = normalizeIssueSet(analysis, options?.suppressLowSignal ?? false);
  const trimmed = content.trim();
  const words = stripMarkdownToWords(trimmed);
  const isEmpty = words.length === 0;
  const isStub = /deterministic stub provider/i.test(content) || /\bplaceholder summary\b/i.test(content);
  const isManualHeadingOnly = /^#\s*Manual studio run\s*$/i.test(trimmed);
  const isTrivial = !isEmpty && (isManualHeadingOnly || words.length <= 5 || (trimmed.split(/\n+/).filter(Boolean).length <= 2 && words.length <= 10));

  let classification: ProductionEntryClassification = "normal";
  if (isEmpty) {
    classification = "empty";
  } else if (isStub) {
    classification = "stub";
  } else if (isTrivial) {
    classification = "trivial";
  }

  const notes: string[] = [];
  if (isStub) {
    notes.push("stub_output");
  }
  if (isEmpty) {
    notes.push("empty_output");
  } else if (isTrivial) {
    notes.push("trivial_output");
  }

  return {
    ...normalized,
    classification,
    notes
  };
}

async function listEntities(client: TableClient, filter?: string): Promise<AzureEntity[]> {
  const results: AzureEntity[] = [];
  const iterator = client.listEntities<Record<string, unknown>>({
    queryOptions: filter ? { filter } : undefined
  });
  for await (const entity of iterator) {
    results.push(entity);
  }
  return results;
}

async function resolveStorageConnection(resourceGroup: string): Promise<{ connectionString: string; storageAccount: string }> {
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return {
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
      storageAccount: ""
    };
  }

  const { stdout: storageAccountStdout } = await execFileAsync("az", [
    "storage",
    "account",
    "list",
    "-g",
    resourceGroup,
    "--query",
    "[0].name",
    "-o",
    "tsv"
  ]);
  const storageAccount = storageAccountStdout.trim();
  if (!storageAccount) {
    throw new Error(`Unable to resolve a storage account in resource group '${resourceGroup}'.`);
  }

  const { stdout: connectionStringStdout } = await execFileAsync("az", [
    "storage",
    "account",
    "show-connection-string",
    "-g",
    resourceGroup,
    "-n",
    storageAccount,
    "--query",
    "connectionString",
    "-o",
    "tsv"
  ]);
  const connectionString = connectionStringStdout.trim();
  if (!connectionString) {
    throw new Error(`Unable to resolve a storage connection string for '${storageAccount}'.`);
  }

  return { connectionString, storageAccount };
}

function makeBlobStorage(connectionString: string): AzureBlobObjectStorage {
  return new AzureBlobObjectStorage({
    container: process.env.AZURE_STORAGE_CONTAINER || DEFAULT_STORAGE_CONTAINER,
    connectionString,
    createContainerIfMissing: false
  });
}

async function readBlobText(storage: AzureBlobObjectStorage, storageKey: string): Promise<string> {
  return (await storage.getObject(storageKey)).toString("utf8");
}

function baseEntry(input: {
  kind: ProductionAuditKind;
  path: string;
  id: string;
  userId: string | null;
  title: string | null;
  storageKey: string | null;
  createdAt: string | null;
  publishedAt: string | null;
}): Omit<ProductionAuditEntry, "issueCounts" | "issues" | "cleanedMarkdown" | "hasNarratableText" | "classification" | "notes" | "fetchError"> {
  return input;
}

function withContentAnalysis(
  entry: Omit<ProductionAuditEntry, "issueCounts" | "issues" | "cleanedMarkdown" | "hasNarratableText" | "classification" | "notes" | "fetchError">,
  content: string,
  options?: { suppressLowSignal?: boolean }
): ProductionAuditEntry {
  const analyzed = classifyGeneratedContent(content, options);
  return {
    ...entry,
    ...analyzed,
    fetchError: null
  };
}

function withFetchError(
  entry: Omit<ProductionAuditEntry, "issueCounts" | "issues" | "cleanedMarkdown" | "hasNarratableText" | "classification" | "notes" | "fetchError">,
  fetchError: string
): ProductionAuditEntry {
  return {
    ...entry,
    issueCounts: {
      residual_url: 0,
      leading_metadata: 0,
      image_wrapper: 0,
      table_markup: 0,
      footer_legal: 0,
      share_or_comment_noise: 0,
      language_footer: 0,
      low_signal_after_cleanup: 0
    },
    issues: [],
    cleanedMarkdown: "",
    hasNarratableText: false,
    classification: "empty",
    notes: ["fetch_error"],
    fetchError
  };
}

export async function runProductionAudit(
  options: Pick<CliOptions, "days" | "resourceGroup" | "tablePrefix">
): Promise<{ reportDir: string; results: ProductionAuditEntry[]; windowStart: Date }> {
  const resourceGroup = options.resourceGroup || process.env.AZURE_RESOURCE_GROUP || DEFAULT_RESOURCE_GROUP;
  const tablePrefix = options.tablePrefix || process.env.AZURE_TABLE_PREFIX || DEFAULT_TABLE_PREFIX;
  const windowStart = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);

  const { connectionString } = await resolveStorageConnection(resourceGroup);
  const storage = makeBlobStorage(connectionString);
  const summaryRunsClient = TableClient.fromConnectionString(connectionString, buildTableName(tablePrefix, "summaryruns"));
  const summaryEpisodesClient = TableClient.fromConnectionString(connectionString, buildTableName(tablePrefix, "summaryepisodes"));
  const episodesClient = TableClient.fromConnectionString(connectionString, buildTableName(tablePrefix, "episodes"));
  const artifactsClient = TableClient.fromConnectionString(connectionString, buildTableName(tablePrefix, "artifacts"));

  const [summaryRuns, summaryEpisodes, itemEpisodes] = await Promise.all([
    listEntities(
      summaryRunsClient,
      joinFilters(filterEquals("PartitionKey", "summaryRun"), filterEquals("status", "SUCCEEDED"), filterGreaterThanOrEqual("createdAt", windowStart))
    ),
    listEntities(
      summaryEpisodesClient,
      joinFilters(filterEquals("PartitionKey", "summaryEpisode"), filterGreaterThanOrEqual("publishedAt", windowStart))
    ),
    listEntities(episodesClient, joinFilters(filterEquals("PartitionKey", "episode"), filterGreaterThanOrEqual("publishedAt", windowStart)))
  ]);

  const summaryMarkdownEntries = await runWithConcurrency(summaryRuns, BLOB_READ_CONCURRENCY, async (row) => {
    const entry = baseEntry({
      kind: "summary_markdown",
      path: parseString(row.summaryStorageKey) || `summaryRun/${String(row.rowKey)}`,
      id: String(row.rowKey),
      userId: parseString(row.userId),
      title: parseString(row.title) || parseString(row.requestedTitle),
      storageKey: parseString(row.summaryStorageKey),
      createdAt: parseDateIso(row, "createdAt"),
      publishedAt: parseDateIso(row, "completedAt")
    });

    const storageKey = parseString(row.summaryStorageKey);
    if (!storageKey) {
      return withFetchError(entry, "Missing summaryStorageKey on summary run.");
    }

    try {
      const markdown = await readBlobText(storage, storageKey);
      return withContentAnalysis(entry, markdown);
    } catch (error) {
      return withFetchError(entry, summarizeFetchError(error));
    }
  });

  const summaryEpisodeDescriptionEntries = summaryEpisodes.map((row) =>
    withContentAnalysis(
      baseEntry({
        kind: "summary_episode_description",
        path: `summaryEpisode/${String(row.rowKey)}#description`,
        id: String(row.rowKey),
        userId: parseString(row.userId),
        title: parseString(row.title),
        storageKey: null,
        createdAt: parseDateIso(row, "createdAt"),
        publishedAt: parseDateIso(row, "publishedAt")
      }),
      parseString(row.description) ?? "",
      { suppressLowSignal: true }
    )
  );

  const episodeDescriptionEntries = itemEpisodes.map((row) =>
    withContentAnalysis(
      baseEntry({
        kind: "episode_description",
        path: `episode/${String(row.rowKey)}#description`,
        id: String(row.rowKey),
        userId: parseString(row.userId),
        title: parseString(row.title),
        storageKey: null,
        createdAt: parseDateIso(row, "createdAt"),
        publishedAt: parseDateIso(row, "publishedAt")
      }),
      parseString(row.description) ?? "",
      { suppressLowSignal: true }
    )
  );

  const itemSourceMarkdownEntries = await runWithConcurrency(itemEpisodes, BLOB_READ_CONCURRENCY, async (row) => {
    const itemId = parseRequiredString(row, "itemId");
    const entry = baseEntry({
      kind: "item_source_markdown",
      path: `item/${itemId}/artifacts/source.md`,
      id: itemId,
      userId: parseString(row.userId),
      title: parseString(row.title),
      storageKey: null,
      createdAt: parseDateIso(row, "createdAt"),
      publishedAt: parseDateIso(row, "publishedAt")
    });

    try {
      const artifact = await artifactsClient.getEntity<Record<string, unknown>>("artifact", `${itemId}::MARKDOWN`);
      const storageKey = parseRequiredString(artifact as AzureEntity, "storageKey");
      const markdown = await readBlobText(storage, storageKey);
      return withContentAnalysis({ ...entry, path: storageKey, storageKey }, markdown);
    } catch (error) {
      return withFetchError(entry, summarizeFetchError(error));
    }
  });

  const results = [
    ...summaryMarkdownEntries,
    ...itemSourceMarkdownEntries,
    ...episodeDescriptionEntries,
    ...summaryEpisodeDescriptionEntries
  ].sort((a, b) => {
    const aTime = a.publishedAt || a.createdAt || "";
    const bTime = b.publishedAt || b.createdAt || "";
    return bTime.localeCompare(aTime) || a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path);
  });

  const reportDir = join(EXPORT_ROOT, timestampSlug(), "production-audit");
  const summary = buildProductionAuditSummary(results);
  await writeProductionAuditReports(results, summary, reportDir, {
    resourceGroup,
    tablePrefix,
    days: options.days,
    windowStart: windowStart.toISOString(),
    generatedAt: new Date().toISOString()
  });

  return {
    reportDir,
    results,
    windowStart
  };
}

import { BlobServiceClient } from "@azure/storage-blob";
import { TableClient } from "@azure/data-tables";
import type { WikiManifest } from "@articlepod/core";
import {
  buildUserWikiManifestStorageKey,
  LocalObjectStorage
} from "@articlepod/core";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/lib/env";
import {
  buildMirrorCounts,
  collectMirrorStorageKeys,
  dedupeMirrorRows,
  emptyMirrorSnapshot,
  hydrateMirrorRows,
  pruneMirrorSnapshot,
  sanitizeMirrorRows,
  type MirrorSnapshot,
  type MirrorTableExportKey
} from "../src/lib/ops/user-mirror";

type CliOptions = {
  email: string;
  dryRun: boolean;
};

type SourceConfig = {
  tableConnectionString: string;
  storageConnectionString: string;
  tablePrefix: string;
  storageContainer: string;
};

type MirrorSummary = {
  email: string;
  sourceUserId: string;
  replacedLocalUserId: string | null;
  copiedObjectCount: number;
  missingObjectKeys: string[];
  counts: Record<string, number>;
  feedTokenValue: string | null;
  digestFeedTokenValue: string | null;
};

type SourceTableKey =
  | "users"
  | "sandboxBillingAccounts"
  | "sessions"
  | "feedTokens"
  | "digestFeedTokens"
  | "shareTokens"
  | "oauthIdentities"
  | "extensionConnectCodes"
  | "extensionTokens"
  | "snippets"
  | "items"
  | "jobs"
  | "itemArtifacts"
  | "episodes"
  | "chunkCache"
  | "digestSettings"
  | "digestRuns"
  | "digestEpisodes"
  | "summaryRuns"
  | "summaryRunItems"
  | "summaryEpisodes"
  | "userDemographicSurveys"
  | "feedback"
  | "billingWebhookEvents";

type SourceTableSpec = {
  suffix: string;
  exportKey: MirrorTableExportKey;
};

const sourceTableSpecs: Record<SourceTableKey, SourceTableSpec> = {
  users: { suffix: "users", exportKey: "users" },
  sandboxBillingAccounts: { suffix: "sandboxbilling", exportKey: "sandboxBillingAccounts" },
  sessions: { suffix: "sessions", exportKey: "sessions" },
  feedTokens: { suffix: "feedtokens", exportKey: "feedTokens" },
  digestFeedTokens: { suffix: "digestfeedtokens", exportKey: "digestFeedTokens" },
  shareTokens: { suffix: "sharetokens", exportKey: "shareTokens" },
  oauthIdentities: { suffix: "oauthidentities", exportKey: "oauthIdentities" },
  extensionConnectCodes: { suffix: "extensioncodes", exportKey: "extensionConnectCodes" },
  extensionTokens: { suffix: "extensiontokens", exportKey: "extensionTokens" },
  snippets: { suffix: "snippets", exportKey: "snippets" },
  items: { suffix: "items", exportKey: "items" },
  jobs: { suffix: "jobs", exportKey: "jobs" },
  itemArtifacts: { suffix: "artifacts", exportKey: "itemArtifacts" },
  episodes: { suffix: "episodes", exportKey: "episodes" },
  chunkCache: { suffix: "chunkcache", exportKey: "chunkCaches" },
  digestSettings: { suffix: "digestsettings", exportKey: "digestSettings" },
  digestRuns: { suffix: "digestruns", exportKey: "digestRuns" },
  digestEpisodes: { suffix: "digestepisodes", exportKey: "digestEpisodes" },
  summaryRuns: { suffix: "summaryruns", exportKey: "summaryRuns" },
  summaryRunItems: { suffix: "summaryrunitems", exportKey: "summaryRunItems" },
  summaryEpisodes: { suffix: "summaryepisodes", exportKey: "summaryEpisodes" },
  userDemographicSurveys: { suffix: "demographics", exportKey: "userDemographicSurveys" },
  feedback: { suffix: "feedback", exportKey: "userFeedback" },
  billingWebhookEvents: { suffix: "billingevents", exportKey: "billingWebhookEvents" }
};

function parseArgs(argv: string[]): CliOptions {
  let email = "";
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--email") {
      email = (argv[index + 1] ?? "").trim().toLowerCase();
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  if (!email) {
    throw new Error("Usage: tsx scripts/mirror-user-from-azure.ts --email <user@example.com> [--dry-run]");
  }

  return { email, dryRun };
}

function normalizeTablePrefix(rawPrefix: string): string {
  const compact = rawPrefix.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!compact) {
    return "articlepod";
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
  return normalized.length <= 63 ? normalized : normalized.slice(0, 63);
}

function escapeOdataString(value: string): string {
  return value.replace(/'/g, "''");
}

function filterEquals(field: string, value: string | number | boolean): string {
  if (typeof value === "string") {
    return `${field} eq '${escapeOdataString(value)}'`;
  }
  if (typeof value === "boolean") {
    return `${field} eq ${value ? "true" : "false"}`;
  }
  return `${field} eq ${value}`;
}

function joinFilters(...filters: Array<string | null | undefined>): string | undefined {
  const present = filters.filter((filter): filter is string => Boolean(filter));
  if (present.length === 0) {
    return undefined;
  }
  return present.length === 1 ? present[0] : present.map((filter) => `(${filter})`).join(" and ");
}

function stripTableMetadata(entity: Record<string, unknown>): Record<string, unknown> {
  const next = { ...entity };
  if (next.id === undefined && typeof next.rowKey === "string" && next.rowKey.length > 0) {
    next.id = next.rowKey;
  }
  delete next.partitionKey;
  delete next.rowKey;
  delete next.etag;
  delete next["odata.etag"];
  delete next.timestamp;
  return next;
}

function requireSourceConfig(): SourceConfig {
  const tableConnectionString =
    process.env.MIRROR_SOURCE_AZURE_TABLE_CONNECTION_STRING?.trim() || process.env.AZURE_TABLE_CONNECTION_STRING?.trim() || "";
  const storageConnectionString =
    process.env.MIRROR_SOURCE_AZURE_STORAGE_CONNECTION_STRING?.trim() ||
    process.env.AZURE_STORAGE_CONNECTION_STRING?.trim() ||
    "";
  const tablePrefix =
    process.env.MIRROR_SOURCE_AZURE_TABLE_PREFIX?.trim() || process.env.AZURE_TABLE_PREFIX?.trim() || env.azureTablePrefix;
  const storageContainer =
    process.env.MIRROR_SOURCE_AZURE_STORAGE_CONTAINER?.trim() ||
    process.env.AZURE_STORAGE_CONTAINER?.trim() ||
    env.storageContainer;

  if (!tableConnectionString) {
    throw new Error("Missing MIRROR_SOURCE_AZURE_TABLE_CONNECTION_STRING (or AZURE_TABLE_CONNECTION_STRING).");
  }
  if (!storageConnectionString) {
    throw new Error("Missing MIRROR_SOURCE_AZURE_STORAGE_CONNECTION_STRING (or AZURE_STORAGE_CONNECTION_STRING).");
  }
  if (!storageContainer) {
    throw new Error("Missing MIRROR_SOURCE_AZURE_STORAGE_CONTAINER (or AZURE_STORAGE_CONTAINER).");
  }

  return {
    tableConnectionString,
    storageConnectionString,
    tablePrefix,
    storageContainer
  };
}

function makeSourceTableClient(config: SourceConfig, key: SourceTableKey): TableClient {
  const spec = sourceTableSpecs[key];
  return TableClient.fromConnectionString(config.tableConnectionString, buildTableName(config.tablePrefix, spec.suffix));
}

async function listTableRows(
  client: TableClient,
  filter?: string
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for await (const entity of client.listEntities<Record<string, unknown>>({
    queryOptions: filter ? { filter } : undefined
  })) {
    rows.push(stripTableMetadata(entity));
  }
  return rows;
}

async function loadUserRow(config: SourceConfig, email: string): Promise<Record<string, unknown> | null> {
  const client = makeSourceTableClient(config, "users");
  const rows = await listTableRows(client, joinFilters(filterEquals("PartitionKey", "user"), filterEquals("email", email)));
  return rows[0] ?? null;
}

async function loadScopedRows(
  config: SourceConfig,
  key: SourceTableKey,
  filter?: string
): Promise<Array<Record<string, unknown>>> {
  return listTableRows(makeSourceTableClient(config, key), filter);
}

function stringIds(rows: Array<Record<string, unknown>>, field: string): string[] {
  return rows
    .map((row) => row[field])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

async function loadSourceWikiManifest(sourceBlob: BlobServiceClient, containerName: string, userId: string): Promise<WikiManifest | null> {
  const buffer = await readSourceObject(sourceBlob, containerName, buildUserWikiManifestStorageKey(userId));
  if (!buffer) {
    return null;
  }
  return JSON.parse(buffer.toString("utf8")) as WikiManifest;
}

async function loadMirrorSnapshot(config: SourceConfig, email: string): Promise<{ snapshot: MirrorSnapshot; wikiManifest: WikiManifest | null }> {
  const snapshot = emptyMirrorSnapshot();
  const user = await loadUserRow(config, email);
  if (!user) {
    throw new Error(`No source user found for '${email}'.`);
  }

  snapshot.users = [user];
  const userId = String(user.id);
  const userFilter = (partitionKey: string) => joinFilters(filterEquals("PartitionKey", partitionKey), filterEquals("userId", userId));

  snapshot.sandboxBillingAccounts = await loadScopedRows(
    config,
    "sandboxBillingAccounts",
    joinFilters(filterEquals("PartitionKey", "sandboxBilling"), filterEquals("userId", userId))
  );
  snapshot.sessions = await loadScopedRows(config, "sessions", userFilter("session"));
  snapshot.feedTokens = await loadScopedRows(config, "feedTokens", userFilter("feed"));
  snapshot.digestFeedTokens = await loadScopedRows(config, "digestFeedTokens", userFilter("digestFeed"));
  snapshot.shareTokens = await loadScopedRows(config, "shareTokens", userFilter("share"));
  snapshot.oauthIdentities = await loadScopedRows(config, "oauthIdentities", userFilter("oauth"));
  snapshot.extensionConnectCodes = await loadScopedRows(config, "extensionConnectCodes", userFilter("extCode"));
  snapshot.extensionTokens = await loadScopedRows(config, "extensionTokens", userFilter("extToken"));
  snapshot.snippets = await loadScopedRows(config, "snippets", userFilter("snippet"));
  snapshot.items = await loadScopedRows(config, "items", userFilter("item"));
  snapshot.jobs = await loadScopedRows(config, "jobs", userFilter("job"));
  snapshot.episodes = await loadScopedRows(config, "episodes", userFilter("episode"));
  snapshot.digestSettings = await loadScopedRows(
    config,
    "digestSettings",
    joinFilters(filterEquals("PartitionKey", "digestSettings"), filterEquals("userId", userId))
  );
  snapshot.digestRuns = await loadScopedRows(config, "digestRuns", userFilter("digestRun"));
  snapshot.digestEpisodes = await loadScopedRows(config, "digestEpisodes", userFilter("digestEpisode"));
  snapshot.summaryRuns = await loadScopedRows(config, "summaryRuns", userFilter("summaryRun"));
  snapshot.summaryEpisodes = await loadScopedRows(config, "summaryEpisodes", userFilter("summaryEpisode"));
  snapshot.userDemographicSurveys = await loadScopedRows(
    config,
    "userDemographicSurveys",
    joinFilters(filterEquals("PartitionKey", "survey"), filterEquals("userId", userId))
  );
  snapshot.userFeedback = await loadScopedRows(config, "feedback", userFilter("feedback"));
  snapshot.billingWebhookEvents = await loadScopedRows(config, "billingWebhookEvents", filterEquals("userId", userId));

  const itemIds = stringIds(snapshot.items, "id");
  const summaryRunIds = stringIds(snapshot.summaryRuns, "id");

  snapshot.itemArtifacts = (
    await Promise.all(
      itemIds.map((itemId) =>
        loadScopedRows(
          config,
          "itemArtifacts",
          joinFilters(filterEquals("PartitionKey", "artifact"), filterEquals("itemId", itemId))
        )
      )
    )
  ).flat();
  snapshot.chunkCaches = (
    await Promise.all(
      itemIds.map((itemId) =>
        loadScopedRows(
          config,
          "chunkCache",
          joinFilters(filterEquals("PartitionKey", "chunk"), filterEquals("itemId", itemId))
        )
      )
    )
  ).flat();
  snapshot.summaryRunItems = (
    await Promise.all(
      summaryRunIds.map((summaryRunId) =>
        loadScopedRows(
          config,
          "summaryRunItems",
          joinFilters(filterEquals("PartitionKey", "summaryRunItem"), filterEquals("summaryRunId", summaryRunId))
        )
      )
    )
  ).flat();

  const sourceBlob = BlobServiceClient.fromConnectionString(config.storageConnectionString);
  const wikiManifest = await loadSourceWikiManifest(sourceBlob, config.storageContainer, userId);

  return { snapshot: pruneMirrorSnapshot(snapshot), wikiManifest };
}

async function readSourceObject(
  sourceBlob: BlobServiceClient,
  containerName: string,
  key: string
): Promise<Buffer | null> {
  const client = sourceBlob.getContainerClient(containerName).getBlobClient(key);
  const exists = await client.exists();
  if (!exists) {
    return null;
  }

  const response = await client.download();
  if (!response.readableStreamBody) {
    return Buffer.alloc(0);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of response.readableStreamBody) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function copySourceObjectToLocal(
  sourceBlob: BlobServiceClient,
  containerName: string,
  targetStorage: LocalObjectStorage,
  key: string
): Promise<boolean> {
  const container = sourceBlob.getContainerClient(containerName);
  const blob = container.getBlobClient(key);
  const exists = await blob.exists();
  if (!exists) {
    return false;
  }
  const [download, props] = await Promise.all([blob.download(), blob.getProperties()]);
  const chunks: Buffer[] = [];
  for await (const chunk of download.readableStreamBody ?? []) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  await targetStorage.putObject(key, Buffer.concat(chunks), {
    contentType: props.contentType
  });
  return true;
}

async function loadExistingLocalStorageKeys(userId: string): Promise<string[]> {
  const [
    items,
    itemArtifacts,
    episodes,
    chunkCaches,
    digestRuns,
    digestEpisodes,
    summaryRuns,
    summaryEpisodes
  ] = await Promise.all([
    prisma.item.findMany({ where: { userId }, select: { sourceFilePath: true } }),
    prisma.itemArtifact.findMany({ where: { item: { userId } }, select: { storageKey: true } }),
    prisma.episode.findMany({ where: { item: { userId } }, select: { audioPath: true } }),
    prisma.chunkCache.findMany({ where: { item: { userId } }, select: { filePath: true } }),
    prisma.digestRun.findMany({ where: { userId }, select: { summaryStorageKey: true, emailStorageKey: true } }),
    prisma.digestEpisode.findMany({ where: { userId }, select: { audioPath: true } }),
    prisma.summaryRun.findMany({ where: { userId }, select: { summaryStorageKey: true } }),
    prisma.summaryEpisode.findMany({ where: { userId }, select: { audioPath: true } })
  ]);

  const manifestBuffer = await new LocalObjectStorage(env.storageRoot)
    .getObject(buildUserWikiManifestStorageKey(userId))
    .catch(() => null);
  const wikiManifest = manifestBuffer ? (JSON.parse(manifestBuffer.toString("utf8")) as WikiManifest) : null;

  return collectMirrorStorageKeys(
    {
      ...emptyMirrorSnapshot(),
      items: items.map((row) => ({ sourceFilePath: row.sourceFilePath })),
      itemArtifacts: itemArtifacts.map((row) => ({ storageKey: row.storageKey })),
      episodes: episodes.map((row) => ({ audioPath: row.audioPath })),
      chunkCaches: chunkCaches.map((row) => ({ filePath: row.filePath })),
      digestRuns: digestRuns.map((row) => ({
        summaryStorageKey: row.summaryStorageKey,
        emailStorageKey: row.emailStorageKey
      })),
      digestEpisodes: digestEpisodes.map((row) => ({ audioPath: row.audioPath })),
      summaryRuns: summaryRuns.map((row) => ({ summaryStorageKey: row.summaryStorageKey })),
      summaryEpisodes: summaryEpisodes.map((row) => ({ audioPath: row.audioPath }))
    },
    wikiManifest
  );
}

async function deleteExistingLocalUser(userId: string, storageKeys: string[]): Promise<void> {
  const targetStorage = new LocalObjectStorage(env.storageRoot);

  await prisma.analyticsEvent.deleteMany({ where: { userId } });
  await prisma.billingWebhookEvent.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });

  await Promise.all(storageKeys.map((key) => targetStorage.deleteObject(key).catch(() => undefined)));
}

async function importMirrorSnapshot(snapshot: MirrorSnapshot): Promise<void> {
  await prisma.user.create({ data: hydrateMirrorRows("users", snapshot.users)[0] as any });

  const plans: Array<{ exportKey: MirrorTableExportKey; delegate: keyof typeof prisma }> = [
    { exportKey: "sandboxBillingAccounts", delegate: "sandboxBillingAccount" },
    { exportKey: "sessions", delegate: "session" },
    { exportKey: "feedTokens", delegate: "feedToken" },
    { exportKey: "digestFeedTokens", delegate: "digestFeedToken" },
    { exportKey: "shareTokens", delegate: "shareToken" },
    { exportKey: "oauthIdentities", delegate: "oAuthIdentity" },
    { exportKey: "extensionConnectCodes", delegate: "extensionConnectCode" },
    { exportKey: "extensionTokens", delegate: "extensionToken" },
    { exportKey: "digestSettings", delegate: "userDigestSettings" },
    { exportKey: "items", delegate: "item" },
    { exportKey: "snippets", delegate: "snippet" },
    { exportKey: "itemArtifacts", delegate: "itemArtifact" },
    { exportKey: "jobs", delegate: "job" },
    { exportKey: "episodes", delegate: "episode" },
    { exportKey: "chunkCaches", delegate: "chunkCache" },
    { exportKey: "digestRuns", delegate: "digestRun" },
    { exportKey: "digestEpisodes", delegate: "digestEpisode" },
    { exportKey: "summaryRuns", delegate: "summaryRun" },
    { exportKey: "summaryRunItems", delegate: "summaryRunItem" },
    { exportKey: "summaryEpisodes", delegate: "summaryEpisode" },
    { exportKey: "userDemographicSurveys", delegate: "userDemographicSurvey" },
    { exportKey: "userFeedback", delegate: "userFeedback" },
    { exportKey: "billingWebhookEvents", delegate: "billingWebhookEvent" }
  ];

  for (const plan of plans) {
    const rows = sanitizeMirrorRows(
      plan.exportKey,
      dedupeMirrorRows(plan.exportKey, hydrateMirrorRows(plan.exportKey, snapshot[plan.exportKey]))
    );
    if (rows.length === 0) {
      continue;
    }
    const delegate = prisma[plan.delegate] as unknown as {
      createMany: (input: { data: Array<Record<string, unknown>> }) => Promise<unknown>;
    };
    try {
      await delegate.createMany({ data: rows });
    } catch (error) {
      throw new Error(
        `Failed importing '${plan.exportKey}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function mirrorUserToLocal(config: SourceConfig, options: CliOptions): Promise<MirrorSummary> {
  if (env.runtimeProfile !== "simple") {
    throw new Error(`This script currently targets local simple mode only. Current profile: '${env.runtimeProfile}'.`);
  }
  if (env.storageBackend !== "local") {
    throw new Error(`This script currently targets local file storage only. Current backend: '${env.storageBackend}'.`);
  }
  if (env.metadataPrimaryBackend !== "prisma") {
    throw new Error(`This script currently targets local Prisma metadata only. Current backend: '${env.metadataPrimaryBackend}'.`);
  }

  const { snapshot, wikiManifest } = await loadMirrorSnapshot(config, options.email);
  const sourceUser = snapshot.users[0];
  const sourceUserId = String(sourceUser.id);
  const existingLocalUser = await prisma.user.findUnique({
    where: { email: options.email },
    select: { id: true }
  });
  const existingLocalStorageKeys = existingLocalUser ? await loadExistingLocalStorageKeys(existingLocalUser.id) : [];

  const sourceBlob = BlobServiceClient.fromConnectionString(config.storageConnectionString);
  const targetStorage = new LocalObjectStorage(env.storageRoot);
  const storageKeys = collectMirrorStorageKeys(snapshot, wikiManifest);

  if (options.dryRun) {
    return {
      email: options.email,
      sourceUserId,
      replacedLocalUserId: existingLocalUser?.id ?? null,
      copiedObjectCount: storageKeys.length,
      missingObjectKeys: [],
      counts: buildMirrorCounts(snapshot),
      feedTokenValue: (snapshot.feedTokens.find((row) => row.active !== false)?.tokenValue as string | null | undefined) ?? null,
      digestFeedTokenValue:
        (snapshot.digestFeedTokens.find((row) => row.active !== false)?.tokenValue as string | null | undefined) ?? null
    };
  }

  if (existingLocalUser) {
    await deleteExistingLocalUser(existingLocalUser.id, existingLocalStorageKeys);
  }

  await importMirrorSnapshot(snapshot);

  let copiedObjectCount = 0;
  const missingObjectKeys: string[] = [];
  for (const key of storageKeys) {
    const copied = await copySourceObjectToLocal(sourceBlob, config.storageContainer, targetStorage, key);
    if (copied) {
      copiedObjectCount += 1;
    } else {
      missingObjectKeys.push(key);
    }
  }

  return {
    email: options.email,
    sourceUserId,
    replacedLocalUserId: existingLocalUser?.id ?? null,
    copiedObjectCount,
    missingObjectKeys,
    counts: buildMirrorCounts(snapshot),
    feedTokenValue: (snapshot.feedTokens.find((row) => row.active !== false)?.tokenValue as string | null | undefined) ?? null,
    digestFeedTokenValue:
      (snapshot.digestFeedTokens.find((row) => row.active !== false)?.tokenValue as string | null | undefined) ?? null
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = await mirrorUserToLocal(requireSourceConfig(), options);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[mirror-user-from-azure] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

type ExportBundle = {
  formatVersion: number;
  exportedAt: string;
  sourceDatabaseUrl: string;
  counts: Record<string, number>;
  data: {
    users: Array<Record<string, unknown>>;
    sessions: Array<Record<string, unknown>>;
    feedTokens: Array<Record<string, unknown>>;
    shareTokens: Array<Record<string, unknown>>;
    items: Array<Record<string, unknown>>;
    oauthIdentities: Array<Record<string, unknown>>;
    extensionConnectCodes: Array<Record<string, unknown>>;
    extensionTokens: Array<Record<string, unknown>>;
    jobs: Array<Record<string, unknown>>;
    jobEvents: Array<Record<string, unknown>>;
    episodes: Array<Record<string, unknown>>;
    itemArtifacts?: Array<Record<string, unknown>>;
    chunkCaches: Array<Record<string, unknown>>;
    demoExtractionTraces: Array<Record<string, unknown>>;
  };
};

function parseArgs(): { inFile: string; truncate: boolean } {
  const args = process.argv.slice(2);
  let inFile = "./.data/db-export.json";
  let truncate = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--in") {
      inFile = args[i + 1] ?? inFile;
      i += 1;
      continue;
    }
    if (arg === "--truncate") {
      truncate = true;
    }
  }

  return { inFile: resolve(process.cwd(), inFile), truncate };
}

function toDate(value: unknown): Date | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === "string" && value.length > 0) {
    return new Date(value);
  }
  if (value instanceof Date) {
    return value;
  }
  return undefined;
}

function castJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function maybeTruncateAll(): Promise<void> {
  await prisma.demoExtractionTrace.deleteMany();
  await prisma.chunkCache.deleteMany();
  await prisma.itemArtifact.deleteMany();
  await prisma.jobEvent.deleteMany();
  await prisma.episode.deleteMany();
  await prisma.job.deleteMany();
  await prisma.extensionToken.deleteMany();
  await prisma.extensionConnectCode.deleteMany();
  await prisma.oAuthIdentity.deleteMany();
  await prisma.item.deleteMany();
  await prisma.shareToken.deleteMany();
  await prisma.feedToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  const { inFile, truncate } = parseArgs();
  const parsed = JSON.parse(await readFile(inFile, "utf8")) as ExportBundle;

  if (parsed.formatVersion !== 1) {
    throw new Error(`Unsupported export format version '${parsed.formatVersion}'.`);
  }

  if (truncate) {
    await maybeTruncateAll();
  }

  if (parsed.data.users.length > 0) {
    await prisma.user.createMany({
      data: parsed.data.users.map((row) => ({
        ...row,
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt)
      })) as Prisma.UserCreateManyInput[]
    });
  }

  if (parsed.data.sessions.length > 0) {
    await prisma.session.createMany({
      data: parsed.data.sessions.map((row) => ({
        ...row,
        expiresAt: toDate(row.expiresAt),
        createdAt: toDate(row.createdAt)
      })) as Prisma.SessionCreateManyInput[]
    });
  }

  if (parsed.data.feedTokens.length > 0) {
    await prisma.feedToken.createMany({
      data: parsed.data.feedTokens.map((row) => ({
        ...row,
        createdAt: toDate(row.createdAt),
        rotatedAt: toDate(row.rotatedAt)
      })) as Prisma.FeedTokenCreateManyInput[]
    });
  }

  if (parsed.data.shareTokens.length > 0) {
    await prisma.shareToken.createMany({
      data: parsed.data.shareTokens.map((row) => ({
        ...row,
        expiresAt: toDate(row.expiresAt),
        createdAt: toDate(row.createdAt)
      })) as Prisma.ShareTokenCreateManyInput[]
    });
  }

  if (parsed.data.items.length > 0) {
    await prisma.item.createMany({
      data: parsed.data.items.map((row) => ({
        ...row,
        sourceCapturedAt: toDate(row.sourceCapturedAt),
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt)
      })) as Prisma.ItemCreateManyInput[]
    });
  }

  if (parsed.data.oauthIdentities.length > 0) {
    await prisma.oAuthIdentity.createMany({
      data: parsed.data.oauthIdentities.map((row) => ({
        ...row,
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt)
      })) as Prisma.OAuthIdentityCreateManyInput[]
    });
  }

  if (parsed.data.extensionConnectCodes.length > 0) {
    await prisma.extensionConnectCode.createMany({
      data: parsed.data.extensionConnectCodes.map((row) => ({
        ...row,
        expiresAt: toDate(row.expiresAt),
        consumedAt: toDate(row.consumedAt),
        createdAt: toDate(row.createdAt)
      })) as Prisma.ExtensionConnectCodeCreateManyInput[]
    });
  }

  if (parsed.data.extensionTokens.length > 0) {
    await prisma.extensionToken.createMany({
      data: parsed.data.extensionTokens.map((row) => ({
        ...row,
        expiresAt: toDate(row.expiresAt),
        revokedAt: toDate(row.revokedAt),
        lastUsedAt: toDate(row.lastUsedAt),
        createdAt: toDate(row.createdAt)
      })) as Prisma.ExtensionTokenCreateManyInput[]
    });
  }

  if (parsed.data.jobs.length > 0) {
    await prisma.job.createMany({
      data: parsed.data.jobs.map((row) => ({
        ...row,
        lockedAt: toDate(row.lockedAt),
        nextRetryAt: toDate(row.nextRetryAt),
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt)
      })) as Prisma.JobCreateManyInput[]
    });
  }

  if (parsed.data.jobEvents.length > 0) {
    await prisma.jobEvent.createMany({
      data: parsed.data.jobEvents.map((row) => ({
        ...row,
        payloadJson: castJson(row.payloadJson),
        createdAt: toDate(row.createdAt)
      })) as Prisma.JobEventCreateManyInput[]
    });
  }

  if (parsed.data.episodes.length > 0) {
    await prisma.episode.createMany({
      data: parsed.data.episodes.map((row) => ({
        ...row,
        publishedAt: toDate(row.publishedAt),
        createdAt: toDate(row.createdAt)
      })) as Prisma.EpisodeCreateManyInput[]
    });
  }

  const itemArtifacts = parsed.data.itemArtifacts ?? [];
  if (itemArtifacts.length > 0) {
    await prisma.itemArtifact.createMany({
      data: itemArtifacts.map((row) => ({
        ...row,
        expiresAt: toDate(row.expiresAt),
        createdAt: toDate(row.createdAt)
      })) as Prisma.ItemArtifactCreateManyInput[]
    });
  }

  if (parsed.data.chunkCaches.length > 0) {
    await prisma.chunkCache.createMany({
      data: parsed.data.chunkCaches.map((row) => ({
        ...row,
        createdAt: toDate(row.createdAt)
      })) as Prisma.ChunkCacheCreateManyInput[]
    });
  }

  if (parsed.data.demoExtractionTraces.length > 0) {
    await prisma.demoExtractionTrace.createMany({
      data: parsed.data.demoExtractionTraces.map((row) => ({
        ...row,
        extractionLogJson: castJson(row.extractionLogJson),
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt)
      })) as Prisma.DemoExtractionTraceCreateManyInput[]
    });
  }

  // eslint-disable-next-line no-console
  console.log(`[db:import-json] imported from ${inFile}`);
  // eslint-disable-next-line no-console
  console.log(`[db:import-json] source snapshot date ${parsed.exportedAt}`);
  // eslint-disable-next-line no-console
  console.log(`[db:import-json] source counts ${JSON.stringify(parsed.counts)}`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

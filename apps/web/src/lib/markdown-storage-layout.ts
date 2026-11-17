import {
  buildLegacyDigestEmailStorageKey,
  buildLegacyDigestSummaryStorageKey,
  buildLegacyItemMarkdownStorageKey,
  buildLegacySummaryRunStorageKey,
  buildUserDigestEmailStorageKey,
  buildUserDigestSummaryStorageKey,
  buildUserItemMarkdownStorageKey,
  buildUserSummaryRunStorageKey
} from "@articlepod/core";
import type { StoredObjectHead } from "@articlepod/core";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { prisma } from "./prisma";
import { getArtifactStorage } from "./storage";

const DEFAULT_MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";
const MAX_SCAN_LIMIT = 100_000;

type MarkdownRecordCategory = "item_markdown" | "digest_summary" | "digest_email" | "summary_run";

type MarkdownStorageRecord = {
  category: MarkdownRecordCategory;
  currentKey: string;
  targetKey: string;
  legacyKeys: string[];
  contentType: string;
  update: (input: { storageKey: string; bytes: number }) => Promise<boolean>;
};

export type MarkdownStorageLayoutMigrationOptions = {
  dryRun?: boolean;
  userId?: string;
  deleteLegacy?: boolean;
};

export type MarkdownStorageLayoutMigrationSummary = {
  dryRun: boolean;
  userId: string | null;
  deleteLegacy: boolean;
  scanned: number;
  updated: number;
  unchanged: number;
  copied: number;
  metadataUpdated: number;
  restoredFromLegacy: number;
  legacyDeleted: number;
  missing: number;
  itemMarkdownUpdated: number;
  digestSummaryUpdated: number;
  digestEmailUpdated: number;
  summaryRunUpdated: number;
};

function uniqueKeys(keys: Array<string | null | undefined>): string[] {
  return [...new Set(keys.map((key) => key?.trim()).filter((key): key is string => Boolean(key)))];
}

async function headObjectOrNull(key: string): Promise<StoredObjectHead | null> {
  return getArtifactStorage()
    .headObject(key)
    .catch(() => null);
}

async function copyObject(input: {
  sourceKey: string;
  targetKey: string;
  contentType: string;
  dryRun: boolean;
}): Promise<StoredObjectHead | null> {
  const sourceHead = await headObjectOrNull(input.sourceKey);
  if (!sourceHead) {
    return null;
  }
  if (input.dryRun) {
    return {
      key: input.targetKey,
      bytes: sourceHead.bytes,
      contentType: sourceHead.contentType || input.contentType,
      etag: sourceHead.etag,
      lastModified: sourceHead.lastModified
    };
  }

  const bytes = await getArtifactStorage().getObject(input.sourceKey);
  return getArtifactStorage().putObject(input.targetKey, bytes, {
    contentType: sourceHead.contentType || input.contentType
  });
}

function targetExistsAndMatches(targetHead: StoredObjectHead | null, sourceHead: StoredObjectHead | null): boolean {
  return Boolean(targetHead && sourceHead && targetHead.bytes === sourceHead.bytes);
}

async function loadAzureRecords(userId?: string): Promise<MarkdownStorageRecord[]> {
  const store = webPrimaryStore;
  if (!store) {
    return [];
  }

  const users = userId
    ? await store.findUserById(userId).then((user) => (user ? [user] : []))
    : await store.listUsers(MAX_SCAN_LIMIT);
  const records: MarkdownStorageRecord[] = [];

  for (const user of users) {
    const items = await store.listItemsByUser(user.id, MAX_SCAN_LIMIT);
    for (const item of items) {
      const artifacts = await store.listItemArtifacts(item.id, "MARKDOWN");
      for (const artifact of artifacts) {
        records.push({
          category: "item_markdown",
          currentKey: artifact.storageKey,
          targetKey: buildUserItemMarkdownStorageKey(user.id, item.id),
          legacyKeys: [buildLegacyItemMarkdownStorageKey(item.id)],
          contentType: artifact.contentType || DEFAULT_MARKDOWN_CONTENT_TYPE,
          update: async ({ storageKey, bytes }) => {
            await store.upsertItemArtifact({
              id: artifact.id,
              itemId: artifact.itemId,
              kind: artifact.kind,
              storageKey,
              contentType: artifact.contentType || DEFAULT_MARKDOWN_CONTENT_TYPE,
              byteLength: bytes,
              expiresAt: artifact.expiresAt,
              createdAt: artifact.createdAt
            });
            return true;
          }
        });
      }
    }

    const digestRuns = await store.listDigestRunsByUser(user.id, MAX_SCAN_LIMIT);
    for (const run of digestRuns) {
      if (run.summaryStorageKey) {
        records.push({
          category: "digest_summary",
          currentKey: run.summaryStorageKey,
          targetKey: buildUserDigestSummaryStorageKey(user.id, run.cadence, run.periodKey),
          legacyKeys: [buildLegacyDigestSummaryStorageKey(user.id, run.cadence, run.periodKey)],
          contentType: DEFAULT_MARKDOWN_CONTENT_TYPE,
          update: async ({ storageKey, bytes }) => Boolean(await store.updateDigestRun(run.id, { summaryStorageKey: storageKey, summaryBytes: bytes }))
        });
      }
      if (run.emailStorageKey) {
        records.push({
          category: "digest_email",
          currentKey: run.emailStorageKey,
          targetKey: buildUserDigestEmailStorageKey(user.id, run.cadence, run.periodKey),
          legacyKeys: [buildLegacyDigestEmailStorageKey(user.id, run.cadence, run.periodKey)],
          contentType: DEFAULT_MARKDOWN_CONTENT_TYPE,
          update: async ({ storageKey }) => Boolean(await store.updateDigestRun(run.id, { emailStorageKey: storageKey }))
        });
      }
    }

    const summaryRuns = await store.listSummaryRunsByUser(user.id, MAX_SCAN_LIMIT);
    for (const run of summaryRuns) {
      if (!run.summaryStorageKey) {
        continue;
      }
      records.push({
        category: "summary_run",
        currentKey: run.summaryStorageKey,
        targetKey: buildUserSummaryRunStorageKey(user.id, run.id),
        legacyKeys: [buildLegacySummaryRunStorageKey(user.id, run.id)],
        contentType: DEFAULT_MARKDOWN_CONTENT_TYPE,
        update: async ({ storageKey, bytes }) => Boolean(await store.updateSummaryRun(run.id, { summaryStorageKey: storageKey, summaryBytes: bytes }))
      });
    }
  }

  return records;
}

async function loadPrismaRecords(userId?: string): Promise<MarkdownStorageRecord[]> {
  const [artifacts, digestRuns, summaryRuns] = await Promise.all([
    prisma.itemArtifact.findMany({
      where: {
        kind: "MARKDOWN",
        ...(userId ? { item: { userId } } : {})
      },
      include: {
        item: {
          select: {
            id: true,
            userId: true
          }
        }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    }),
    prisma.digestRun.findMany({
      where: {
        ...(userId ? { userId } : {}),
        OR: [{ summaryStorageKey: { not: null } }, { emailStorageKey: { not: null } }]
      },
      select: {
        id: true,
        userId: true,
        cadence: true,
        periodKey: true,
        summaryStorageKey: true,
        emailStorageKey: true
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    }),
    prisma.summaryRun.findMany({
      where: {
        ...(userId ? { userId } : {}),
        summaryStorageKey: { not: null }
      },
      select: {
        id: true,
        userId: true,
        summaryStorageKey: true
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    })
  ]);

  const records: MarkdownStorageRecord[] = artifacts.map((artifact) => ({
    category: "item_markdown" as const,
    currentKey: artifact.storageKey,
    targetKey: buildUserItemMarkdownStorageKey(artifact.item.userId, artifact.itemId),
    legacyKeys: [buildLegacyItemMarkdownStorageKey(artifact.itemId)],
    contentType: artifact.contentType || DEFAULT_MARKDOWN_CONTENT_TYPE,
    update: async ({ storageKey, bytes }) => {
      const result = await prisma.itemArtifact.updateMany({
        where: { id: artifact.id },
        data: {
          storageKey,
          byteLength: bytes,
          contentType: artifact.contentType || DEFAULT_MARKDOWN_CONTENT_TYPE
        }
      });
      return result.count === 1;
    }
  }));

  for (const run of digestRuns) {
    if (run.summaryStorageKey) {
      records.push({
        category: "digest_summary",
        currentKey: run.summaryStorageKey,
        targetKey: buildUserDigestSummaryStorageKey(run.userId, run.cadence, run.periodKey),
        legacyKeys: [buildLegacyDigestSummaryStorageKey(run.userId, run.cadence, run.periodKey)],
        contentType: DEFAULT_MARKDOWN_CONTENT_TYPE,
        update: async ({ storageKey, bytes }) => {
          const result = await prisma.digestRun.updateMany({
            where: { id: run.id },
            data: {
              summaryStorageKey: storageKey,
              summaryBytes: bytes
            }
          });
          return result.count === 1;
        }
      });
    }

    if (run.emailStorageKey) {
      records.push({
        category: "digest_email",
        currentKey: run.emailStorageKey,
        targetKey: buildUserDigestEmailStorageKey(run.userId, run.cadence, run.periodKey),
        legacyKeys: [buildLegacyDigestEmailStorageKey(run.userId, run.cadence, run.periodKey)],
        contentType: DEFAULT_MARKDOWN_CONTENT_TYPE,
        update: async ({ storageKey }) => {
          const result = await prisma.digestRun.updateMany({
            where: { id: run.id },
            data: {
              emailStorageKey: storageKey
            }
          });
          return result.count === 1;
        }
      });
    }
  }

  for (const run of summaryRuns) {
    records.push({
      category: "summary_run",
      currentKey: run.summaryStorageKey as string,
      targetKey: buildUserSummaryRunStorageKey(run.userId, run.id),
      legacyKeys: [buildLegacySummaryRunStorageKey(run.userId, run.id)],
      contentType: DEFAULT_MARKDOWN_CONTENT_TYPE,
      update: async ({ storageKey, bytes }) => {
        const result = await prisma.summaryRun.updateMany({
          where: { id: run.id },
          data: {
            summaryStorageKey: storageKey,
            summaryBytes: bytes
          }
        });
        return result.count === 1;
      }
    });
  }

  return records;
}

async function loadMarkdownRecords(userId?: string): Promise<MarkdownStorageRecord[]> {
  if (webUsesAzureTablePrimary()) {
    return loadAzureRecords(userId);
  }
  return loadPrismaRecords(userId);
}

function markCategoryUpdated(summary: MarkdownStorageLayoutMigrationSummary, category: MarkdownRecordCategory) {
  switch (category) {
    case "item_markdown":
      summary.itemMarkdownUpdated += 1;
      break;
    case "digest_summary":
      summary.digestSummaryUpdated += 1;
      break;
    case "digest_email":
      summary.digestEmailUpdated += 1;
      break;
    case "summary_run":
      summary.summaryRunUpdated += 1;
      break;
  }
}

export async function migrateMarkdownStorageLayout(
  options: MarkdownStorageLayoutMigrationOptions = {}
): Promise<MarkdownStorageLayoutMigrationSummary> {
  const dryRun = options.dryRun === true;
  const deleteLegacy = options.deleteLegacy === true;
  const records = await loadMarkdownRecords(options.userId);
  const summary: MarkdownStorageLayoutMigrationSummary = {
    dryRun,
    userId: options.userId ?? null,
    deleteLegacy,
    scanned: 0,
    updated: 0,
    unchanged: 0,
    copied: 0,
    metadataUpdated: 0,
    restoredFromLegacy: 0,
    legacyDeleted: 0,
    missing: 0,
    itemMarkdownUpdated: 0,
    digestSummaryUpdated: 0,
    digestEmailUpdated: 0,
    summaryRunUpdated: 0
  };

  for (const record of records) {
    summary.scanned += 1;
    let touched = false;

    const currentKey = record.currentKey;
    const targetKey = record.targetKey;
    const legacyKeys = uniqueKeys(record.legacyKeys.filter((key) => key !== targetKey));
    const currentHead = currentKey === targetKey ? await headObjectOrNull(targetKey) : await headObjectOrNull(currentKey);
    let targetHead = await headObjectOrNull(targetKey);

    if (currentKey === targetKey) {
      if (!targetHead) {
        let restored = false;
        for (const legacyKey of legacyKeys) {
          const legacyHead = await headObjectOrNull(legacyKey);
          if (!legacyHead) {
            continue;
          }
          targetHead = await copyObject({
            sourceKey: legacyKey,
            targetKey,
            contentType: record.contentType,
            dryRun
          });
          if (!targetHead) {
            continue;
          }
          summary.copied += 1;
          summary.restoredFromLegacy += 1;
          restored = true;
          touched = true;
          break;
        }
        if (!restored) {
          summary.missing += 1;
          continue;
        }
      }
    } else {
      if (currentHead) {
        if (!targetExistsAndMatches(targetHead, currentHead)) {
          targetHead = await copyObject({
            sourceKey: currentKey,
            targetKey,
            contentType: record.contentType,
            dryRun
          });
          if (!targetHead) {
            summary.missing += 1;
            continue;
          }
          summary.copied += 1;
          touched = true;
        }
      } else if (!targetHead) {
        let restored = false;
        for (const legacyKey of legacyKeys) {
          const legacyHead = await headObjectOrNull(legacyKey);
          if (!legacyHead) {
            continue;
          }
          targetHead = await copyObject({
            sourceKey: legacyKey,
            targetKey,
            contentType: record.contentType,
            dryRun
          });
          if (!targetHead) {
            continue;
          }
          summary.copied += 1;
          summary.restoredFromLegacy += 1;
          restored = true;
          touched = true;
          break;
        }
        if (!restored) {
          summary.missing += 1;
          continue;
        }
      }

      const metadataSaved = dryRun ? true : await record.update({ storageKey: targetKey, bytes: targetHead?.bytes ?? currentHead?.bytes ?? 0 });
      if (!metadataSaved) {
        continue;
      }
      summary.metadataUpdated += 1;
      touched = true;
    }

    if (deleteLegacy) {
      for (const cleanupKey of uniqueKeys([currentKey, ...legacyKeys])) {
        if (cleanupKey === targetKey) {
          continue;
        }
        const cleanupHead = await headObjectOrNull(cleanupKey);
        if (!cleanupHead) {
          continue;
        }
        if (!dryRun) {
          await getArtifactStorage().deleteObject(cleanupKey).catch(() => undefined);
        }
        summary.legacyDeleted += 1;
        touched = true;
      }
    }

    if (touched) {
      summary.updated += 1;
      markCategoryUpdated(summary, record.category);
    } else {
      summary.unchanged += 1;
    }
  }

  return summary;
}

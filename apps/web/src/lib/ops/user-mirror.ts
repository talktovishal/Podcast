import type { WikiManifest } from "@articlepod/core";
import {
  buildUserWikiBuildStateStorageKey,
  buildUserWikiManifestStorageKey
} from "@articlepod/core";
import type { DatabaseSnapshotModelConfig } from "./database-snapshot";
import { databaseSnapshotModelConfigs } from "./database-snapshot";

export type MirrorTableExportKey =
  | "users"
  | "sandboxBillingAccounts"
  | "sessions"
  | "feedTokens"
  | "digestFeedTokens"
  | "shareTokens"
  | "oauthIdentities"
  | "extensionConnectCodes"
  | "extensionTokens"
  | "items"
  | "snippets"
  | "itemArtifacts"
  | "episodes"
  | "jobs"
  | "chunkCaches"
  | "digestSettings"
  | "digestRuns"
  | "digestEpisodes"
  | "summaryRuns"
  | "summaryRunItems"
  | "summaryEpisodes"
  | "userDemographicSurveys"
  | "userFeedback"
  | "billingWebhookEvents";

export type MirrorSnapshot = {
  users: Array<Record<string, unknown>>;
  sandboxBillingAccounts: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  feedTokens: Array<Record<string, unknown>>;
  digestFeedTokens: Array<Record<string, unknown>>;
  shareTokens: Array<Record<string, unknown>>;
  oauthIdentities: Array<Record<string, unknown>>;
  extensionConnectCodes: Array<Record<string, unknown>>;
  extensionTokens: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  snippets: Array<Record<string, unknown>>;
  itemArtifacts: Array<Record<string, unknown>>;
  episodes: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  chunkCaches: Array<Record<string, unknown>>;
  digestSettings: Array<Record<string, unknown>>;
  digestRuns: Array<Record<string, unknown>>;
  digestEpisodes: Array<Record<string, unknown>>;
  summaryRuns: Array<Record<string, unknown>>;
  summaryRunItems: Array<Record<string, unknown>>;
  summaryEpisodes: Array<Record<string, unknown>>;
  userDemographicSurveys: Array<Record<string, unknown>>;
  userFeedback: Array<Record<string, unknown>>;
  billingWebhookEvents: Array<Record<string, unknown>>;
};

export const emptyMirrorSnapshot = (): MirrorSnapshot => ({
  users: [],
  sandboxBillingAccounts: [],
  sessions: [],
  feedTokens: [],
  digestFeedTokens: [],
  shareTokens: [],
  oauthIdentities: [],
  extensionConnectCodes: [],
  extensionTokens: [],
  items: [],
  snippets: [],
  itemArtifacts: [],
  episodes: [],
  jobs: [],
  chunkCaches: [],
  digestSettings: [],
  digestRuns: [],
  digestEpisodes: [],
  summaryRuns: [],
  summaryRunItems: [],
  summaryEpisodes: [],
  userDemographicSurveys: [],
  userFeedback: [],
  billingWebhookEvents: []
});

const allowedExportKeys = new Set<MirrorTableExportKey>([
  "users",
  "sandboxBillingAccounts",
  "sessions",
  "feedTokens",
  "digestFeedTokens",
  "shareTokens",
  "oauthIdentities",
  "extensionConnectCodes",
  "extensionTokens",
  "items",
  "snippets",
  "itemArtifacts",
  "episodes",
  "jobs",
  "chunkCaches",
  "digestSettings",
  "digestRuns",
  "digestEpisodes",
  "summaryRuns",
  "summaryRunItems",
  "summaryEpisodes",
  "userDemographicSurveys",
  "userFeedback",
  "billingWebhookEvents"
]);

const configByExportKey = databaseSnapshotModelConfigs.reduce((map, config) => {
  if (allowedExportKeys.has(config.exportKey as MirrorTableExportKey)) {
    map.set(config.exportKey as MirrorTableExportKey, config);
  }
  return map;
}, new Map<MirrorTableExportKey, DatabaseSnapshotModelConfig>());

function toDate(value: unknown): Date | null | undefined {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return new Date(value);
  }
  return undefined;
}

export function hydrateMirrorRows(
  exportKey: MirrorTableExportKey,
  rows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const config = configByExportKey.get(exportKey);
  if (!config) {
    return rows.map((row) => ({ ...row }));
  }

  return rows.map((row) => {
    const hydrated: Record<string, unknown> = { ...row };
    for (const field of config.dateFields) {
      if (Object.prototype.hasOwnProperty.call(hydrated, field)) {
        hydrated[field] = toDate(hydrated[field]);
      }
    }
    return hydrated;
  });
}

function sortMirrorRowsByPreference(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const score = (row: Record<string, unknown>): number => {
    let value = 0;
    if (row.active === true) {
      value += 50;
    }
    if (row.revokedAt === null || row.revokedAt === undefined) {
      value += 20;
    }
    if (row.rotatedAt === null || row.rotatedAt === undefined) {
      value += 10;
    }
    if (row.consumedAt === null || row.consumedAt === undefined) {
      value += 5;
    }
    return value;
  };

  const toTimestamp = (value: unknown): number => {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value === "string" && value.trim()) {
      return new Date(value).getTime();
    }
    return 0;
  };

  return [...rows].sort((left, right) => {
    const scoreDiff = score(right) - score(left);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const updatedDiff = toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }

    const createdDiff = toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    return String(right.id ?? "").localeCompare(String(left.id ?? ""));
  });
}

const uniqueKeyFields: Partial<Record<MirrorTableExportKey, Array<readonly string[]>>> = {
  users: [["id"], ["email"], ["billingCustomerId"], ["billingSubscriptionId"]],
  sandboxBillingAccounts: [["userId"], ["billingCustomerId"], ["billingSubscriptionId"]],
  sessions: [["id"], ["tokenHash"]],
  feedTokens: [["id"], ["tokenHash"], ["tokenValue"]],
  digestFeedTokens: [["id"], ["tokenHash"], ["tokenValue"]],
  shareTokens: [["id"], ["tokenHash"], ["tokenValue"]],
  oauthIdentities: [["id"], ["provider", "providerUserId"]],
  extensionConnectCodes: [["id"], ["codeHash"]],
  extensionTokens: [["id"], ["tokenHash"], ["tokenValue"]],
  items: [["id"]],
  snippets: [["id"]],
  itemArtifacts: [["id"], ["itemId", "kind"]],
  episodes: [["id"], ["itemId"], ["guid"]],
  jobs: [["id"]],
  chunkCaches: [["id"], ["hash"]],
  digestSettings: [["id"], ["userId"]],
  digestRuns: [["id"], ["userId", "cadence", "periodKey"]],
  digestEpisodes: [["id"], ["digestRunId"], ["guid"]],
  summaryRuns: [["id"]],
  summaryRunItems: [["id"], ["summaryRunId", "itemId"]],
  summaryEpisodes: [["id"], ["summaryRunId"], ["guid"]],
  userDemographicSurveys: [["id"], ["userId"]],
  userFeedback: [["id"]],
  billingWebhookEvents: [["id"], ["provider", "providerEventId"]]
};

export function dedupeMirrorRows(
  exportKey: MirrorTableExportKey,
  rows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const signatures = uniqueKeyFields[exportKey] ?? [["id"]];
  const seen = signatures.map(() => new Set<string>());
  const deduped: Array<Record<string, unknown>> = [];

  for (const row of sortMirrorRowsByPreference(rows)) {
    const keys = signatures.map((fields) => {
      const parts = fields.map((field) => row[field]).filter((value) => value !== null && value !== undefined && value !== "");
      if (parts.length !== fields.length) {
        return null;
      }
      return `${fields.join("+")}=${parts.map((part) => String(part)).join("::")}`;
    });

    if (keys.some((key, index) => key !== null && seen[index].has(key))) {
      continue;
    }

    keys.forEach((key, index) => {
      if (key !== null) {
        seen[index].add(key);
      }
    });
    deduped.push(row);
  }

  return deduped;
}

export function sanitizeMirrorRows(
  exportKey: MirrorTableExportKey,
  rows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const next = { ...row };
    if (exportKey === "jobs") {
      delete next.userId;
    }
    if (exportKey === "episodes") {
      delete next.userId;
    }
    return next;
  });
}

export function pruneMirrorSnapshot(snapshot: MirrorSnapshot): MirrorSnapshot {
  const itemIds = new Set(
    snapshot.items
      .map((row) => row.id)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );
  const digestRunIds = new Set(
    snapshot.digestRuns
      .map((row) => row.id)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );
  const summaryRunIds = new Set(
    snapshot.summaryRuns
      .map((row) => row.id)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );

  return {
    ...snapshot,
    itemArtifacts: snapshot.itemArtifacts.filter((row) => typeof row.itemId === "string" && itemIds.has(row.itemId)),
    episodes: snapshot.episodes.filter((row) => typeof row.itemId === "string" && itemIds.has(row.itemId)),
    jobs: snapshot.jobs.filter((row) => typeof row.itemId === "string" && itemIds.has(row.itemId)),
    chunkCaches: snapshot.chunkCaches.filter((row) => typeof row.itemId === "string" && itemIds.has(row.itemId)),
    digestEpisodes: snapshot.digestEpisodes.filter(
      (row) => typeof row.digestRunId === "string" && digestRunIds.has(row.digestRunId)
    ),
    summaryRunItems: snapshot.summaryRunItems.filter(
      (row) =>
        typeof row.summaryRunId === "string" &&
        summaryRunIds.has(row.summaryRunId) &&
        typeof row.itemId === "string" &&
        itemIds.has(row.itemId)
    ),
    summaryEpisodes: snapshot.summaryEpisodes.filter(
      (row) => typeof row.summaryRunId === "string" && summaryRunIds.has(row.summaryRunId)
    )
  };
}

function addStorageKey(target: Set<string>, value: unknown): void {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  target.add(trimmed.replace(/^\/+/, "").replace(/\\/g, "/"));
}

export function collectMirrorStorageKeys(snapshot: MirrorSnapshot, wikiManifest: WikiManifest | null): string[] {
  const keys = new Set<string>();

  for (const item of snapshot.items) {
    addStorageKey(keys, item.sourceFilePath);
  }
  for (const artifact of snapshot.itemArtifacts) {
    addStorageKey(keys, artifact.storageKey);
  }
  for (const chunkCache of snapshot.chunkCaches) {
    addStorageKey(keys, chunkCache.filePath);
  }
  for (const episode of snapshot.episodes) {
    addStorageKey(keys, episode.audioPath);
  }
  for (const run of snapshot.digestRuns) {
    addStorageKey(keys, run.summaryStorageKey);
    addStorageKey(keys, run.emailStorageKey);
  }
  for (const episode of snapshot.digestEpisodes) {
    addStorageKey(keys, episode.audioPath);
  }
  for (const run of snapshot.summaryRuns) {
    addStorageKey(keys, run.summaryStorageKey);
  }
  for (const episode of snapshot.summaryEpisodes) {
    addStorageKey(keys, episode.audioPath);
  }

  if (wikiManifest) {
    addStorageKey(keys, buildUserWikiManifestStorageKey(wikiManifest.userId));
    addStorageKey(keys, buildUserWikiBuildStateStorageKey(wikiManifest.userId, wikiManifest.buildRunId));
    for (const page of wikiManifest.pages) {
      addStorageKey(keys, page.storageKey);
    }
  }

  return [...keys].sort((left, right) => left.localeCompare(right));
}

export function buildMirrorCounts(snapshot: MirrorSnapshot): Record<string, number> {
  return Object.fromEntries(
    (Object.keys(snapshot) as Array<keyof MirrorSnapshot>).map((key) => [key, snapshot[key].length])
  );
}

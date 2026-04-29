import { join } from "node:path";
import { normalizeStorageKey } from "./types";

function normalizedJoin(...segments: string[]): string {
  return normalizeStorageKey(join(...segments));
}

export function buildLegacyItemMarkdownStorageKey(itemId: string): string {
  return normalizedJoin("items", itemId, "artifacts", "source.md");
}

export function buildLegacyDigestSummaryStorageKey(userId: string, cadence: string, periodKey: string): string {
  return normalizedJoin("digests", userId, cadence.toLowerCase(), periodKey, "summary.md");
}

export function buildLegacyDigestEmailStorageKey(userId: string, cadence: string, periodKey: string): string {
  return normalizedJoin("digests", userId, cadence.toLowerCase(), periodKey, "email.md");
}

export function buildLegacySummaryRunStorageKey(userId: string, summaryRunId: string): string {
  return normalizedJoin("summaries", userId, summaryRunId, "summary.md");
}

export function buildUserMarkdownRootStorageKey(userId: string): string {
  return normalizedJoin("users", userId, "markdown");
}

export function buildUserItemMarkdownStorageKey(userId: string, itemId: string): string {
  return normalizedJoin(buildUserMarkdownRootStorageKey(userId), "items", itemId, "canonical.md");
}

export function buildUserItemSummaryStorageKey(userId: string, itemId: string): string {
  return normalizedJoin(buildUserMarkdownRootStorageKey(userId), "items", itemId, "summary.md");
}

export function buildUserDigestSummaryStorageKey(userId: string, cadence: string, periodKey: string): string {
  return normalizedJoin(buildUserMarkdownRootStorageKey(userId), "digests", cadence.toLowerCase(), periodKey, "summary.md");
}

export function buildUserDigestEmailStorageKey(userId: string, cadence: string, periodKey: string): string {
  return normalizedJoin(buildUserMarkdownRootStorageKey(userId), "digests", cadence.toLowerCase(), periodKey, "email.md");
}

export function buildUserSummaryRunStorageKey(userId: string, summaryRunId: string): string {
  return normalizedJoin(buildUserMarkdownRootStorageKey(userId), "summaries", summaryRunId, "summary.md");
}

export function buildUserWikiRootStorageKey(userId: string): string {
  return normalizedJoin("users", userId, "wiki");
}

export function buildUserWikiManifestStorageKey(userId: string): string {
  return normalizedJoin(buildUserWikiRootStorageKey(userId), "manifest.json");
}

export function buildUserWikiPageStorageKey(userId: string, pagePath: string): string {
  return normalizedJoin(buildUserWikiRootStorageKey(userId), "pages", pagePath);
}

export function buildUserWikiBuildStateStorageKey(userId: string, runId: string): string {
  return normalizedJoin(buildUserWikiRootStorageKey(userId), "state", "builds", `${runId}.json`);
}

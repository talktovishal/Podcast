import { join } from "node:path";
import { analyzeMarkdownQuality, analyzeSummaryMarkdownQuality } from "../../../packages/core/src/extract/markdownCleanup.ts";
import { DIGESTS_ROOT, EXPORT_ROOT, ITEMS_ROOT, USERS_ROOT } from "./paths.js";
import { buildAuditSummary, writeAuditReports } from "./report.js";
import type { ArtifactAuditEntry } from "./types.js";
import { collectFiles, relativeToRepo, readText, timestampSlug } from "./utils.js";

function artifactKindForPath(path: string): ArtifactAuditEntry["kind"] {
  if (path.endsWith("/summary.md")) {
    return "summary";
  }
  if (path.endsWith("/email.md")) {
    return "email";
  }
  return "source";
}

function isLegacyItemMarkdownPath(path: string): boolean {
  return path.endsWith("/artifacts/source.md");
}

function isLegacyDigestMarkdownPath(path: string): boolean {
  return path.endsWith("/summary.md") || path.endsWith("/email.md");
}

function isUserItemMarkdownPath(path: string): boolean {
  return path.includes("/markdown/items/") && path.endsWith("/canonical.md");
}

function isUserDigestMarkdownPath(path: string): boolean {
  return path.includes("/markdown/digests/") && isLegacyDigestMarkdownPath(path);
}

export async function runArtifactAudit(): Promise<{ reportDir: string; results: ArtifactAuditEntry[] }> {
  const [legacyItemFiles, legacyDigestFiles, userMarkdownFiles] = await Promise.all([
    collectFiles(ITEMS_ROOT, isLegacyItemMarkdownPath),
    collectFiles(DIGESTS_ROOT, isLegacyDigestMarkdownPath),
    collectFiles(USERS_ROOT, (path) => isUserItemMarkdownPath(path) || isUserDigestMarkdownPath(path))
  ]);

  const reportDir = join(EXPORT_ROOT, timestampSlug(), "artifact-audit");
  const paths = [...new Set([...legacyItemFiles, ...legacyDigestFiles, ...userMarkdownFiles])];
  const results: ArtifactAuditEntry[] = [];

  for (const path of paths) {
    const markdown = await readText(path);
    const kind = artifactKindForPath(path);
    const analysis = kind === "source" ? analyzeMarkdownQuality(markdown) : analyzeSummaryMarkdownQuality(markdown);
    results.push({
      kind,
      path,
      relativePath: relativeToRepo(path),
      issueCounts: analysis.issueCounts,
      issues: analysis.issues,
      cleanedMarkdown: analysis.cleanedMarkdown,
      hasNarratableText: analysis.hasNarratableText
    });
  }

  await writeAuditReports(results, buildAuditSummary(results), reportDir);
  return {
    reportDir,
    results
  };
}

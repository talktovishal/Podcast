import { join } from "node:path";
import { analyzeMarkdownQuality } from "../../../packages/core/src/extract/markdownCleanup.ts";
import { DIGESTS_ROOT, EXPORT_ROOT, ITEMS_ROOT } from "./paths.js";
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

export async function runArtifactAudit(): Promise<{ reportDir: string; results: ArtifactAuditEntry[] }> {
  const [itemFiles, digestFiles] = await Promise.all([
    collectFiles(ITEMS_ROOT, (path) => path.endsWith("/artifacts/source.md")),
    collectFiles(DIGESTS_ROOT, (path) => path.endsWith("/summary.md") || path.endsWith("/email.md"))
  ]);

  const reportDir = join(EXPORT_ROOT, timestampSlug(), "artifact-audit");
  const paths = [...itemFiles, ...digestFiles];
  const results: ArtifactAuditEntry[] = [];

  for (const path of paths) {
    const markdown = await readText(path);
    const analysis = analyzeMarkdownQuality(markdown);
    results.push({
      kind: artifactKindForPath(path),
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

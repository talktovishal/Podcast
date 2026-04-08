import type { CorpusEntry, LocalHarnessConfig, PathRunResult } from "./types.js";
import {
  pollForTerminalItem,
  blockedOutcomeFromError,
  isDeferredDueToDailyLimit,
  isHarnessRuntimeFailure,
  runPodcastContract,
  submitUrl
} from "./local-app.js";
import { classifyPathFailure, matchLocalExpectation } from "./report.js";

export async function runUrlPath(entry: CorpusEntry, config: LocalHarnessConfig, runLabel: string): Promise<PathRunResult> {
  const startedAt = Date.now();
  const title = `[live-site:${runLabel}] ${entry.site}`;

  try {
    const submission = await submitUrl(config, entry.url, title);
    const item = await pollForTerminalItem(config, submission.itemId);
    if (!item) {
      const result: PathRunResult = {
        path: "url",
        expected: entry.expectedUrl,
        actual: "manual_review",
        matchedExpectation: matchLocalExpectation(entry.expectedUrl, "manual_review"),
        status: matchLocalExpectation(entry.expectedUrl, "manual_review") ? "passed" : "failed",
        itemId: submission.itemId,
        sourceUrl: entry.url,
        title,
        durationMs: Date.now() - startedAt,
        errorMessage: "Timed out waiting for the item to reach READY or FAILED.",
        requiresManual: entry.requiresManual,
        classification: "harness_issue",
        recommendation: "Increase the local wait window or inspect queue/worker progress, then rerun this URL target."
      };
      return result;
    }

    if (item.status === "READY") {
      const podcastContract = await runPodcastContract(config.feedUrl);
      const matchedExpectation = matchLocalExpectation(entry.expectedUrl, "ready");
      const result: PathRunResult = {
        path: "url",
        expected: entry.expectedUrl,
        actual: "ready",
        matchedExpectation,
        status: matchedExpectation && podcastContract.passed ? "passed" : "failed",
        itemId: item.id,
        sourceUrl: entry.url,
        title,
        durationMs: Date.now() - startedAt,
        timeToReadyMs: Date.now() - startedAt,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
        extensionHintPresent: false,
        requiresManual: entry.requiresManual,
        podcastContract
      };
      if (result.status === "failed") {
        result.classification = classifyPathFailure(result);
        result.recommendation =
          result.classification === "product_regression"
            ? "Investigate feed/media contract behavior and rerun this URL target."
            : "The site behavior likely changed; review corpus.md and quirks.md.";
      }
      return result;
    }

    if (isDeferredDueToDailyLimit(item)) {
      return {
        path: "url",
        expected: entry.expectedUrl,
        actual: "harness_issue",
        matchedExpectation: false,
        status: "failed",
        itemId: item.id,
        sourceUrl: entry.url,
        title,
        durationMs: Date.now() - startedAt,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
        requiresManual: entry.requiresManual,
        classification: "harness_issue",
        recommendation: "Clear earlier harness-created items or use a fresh reviewer account, then rerun this URL target."
      };
    }

    if (isHarnessRuntimeFailure(item.errorMessage)) {
      return {
        path: "url",
        expected: entry.expectedUrl,
        actual: "harness_issue",
        matchedExpectation: false,
        status: "failed",
        itemId: item.id,
        sourceUrl: entry.url,
        title,
        durationMs: Date.now() - startedAt,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
        requiresManual: entry.requiresManual,
        classification: "harness_issue",
        recommendation: "Fix the local runtime or parity sidecars, then rerun this URL target."
      };
    }

    const blocked = blockedOutcomeFromError(item.errorMessage);
    const result: PathRunResult = {
      path: "url",
      expected: entry.expectedUrl,
      actual: blocked.actual,
      matchedExpectation: matchLocalExpectation(entry.expectedUrl, blocked.actual),
      status: matchLocalExpectation(entry.expectedUrl, blocked.actual) ? "passed" : "failed",
      itemId: item.id,
      sourceUrl: entry.url,
      title,
      durationMs: Date.now() - startedAt,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      extensionHintPresent: blocked.extensionHintPresent,
      requiresManual: entry.requiresManual
    };
    if (result.status === "failed") {
      result.classification = classifyPathFailure(result);
      result.recommendation =
        result.classification === "product_regression"
          ? "Fix the blocked-site error mapping or extension-hint behavior, then rerun this URL target."
          : "The site likely changed or is more restricted than expected; review corpus.md or quirks.md.";
    }
    return result;
  } catch (error) {
    const result: PathRunResult = {
      path: "url",
      expected: entry.expectedUrl,
      actual: "harness_issue",
      matchedExpectation: false,
      status: "failed",
      sourceUrl: entry.url,
      title,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
      requiresManual: entry.requiresManual,
      classification: "harness_issue",
      recommendation: "Fix the harness or local runtime setup, then rerun this URL target."
    };
    return result;
  }
}

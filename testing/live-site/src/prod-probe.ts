import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PROBE_WORKFLOW_PATH, REPO_ROOT } from "./paths.js";
import type { CorpusEntry, ProdProbeResult } from "./types.js";
import { classifyProdProbeFailure, matchProdProbeExpectation } from "./report.js";
import { ensureDir, runCommand, sleep } from "./utils.js";

const PROBE_WORKFLOW_NAME = "Probe URL Extraction (VM)";

type GithubRun = {
  databaseId: number;
  createdAt: string;
  event: string;
  status: string;
  conclusion: string | null;
  url: string;
};

async function ensureGhAuth(): Promise<void> {
  const status = await runCommand("gh", ["auth", "status"], {
    cwd: REPO_ROOT,
    env: process.env,
    allowFailure: true
  });
  if (status.exitCode !== 0) {
    throw new Error("GitHub CLI authentication is required for prod probes. Run `gh auth status` and log in first.");
  }
}

async function waitForWorkflowRun(branch: string, dispatchedAt: number): Promise<GithubRun> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const result = await runCommand(
      "gh",
      ["run", "list", "--workflow", PROBE_WORKFLOW_NAME, "--branch", branch, "--limit", "20", "--json", "databaseId,createdAt,event,status,conclusion,url"],
      {
        cwd: REPO_ROOT,
        env: process.env
      }
    );
    const runs = JSON.parse(result.stdout) as GithubRun[];
    const match = runs.find((run) => run.event === "workflow_dispatch" && new Date(run.createdAt).getTime() >= dispatchedAt - 60_000);
    if (match) {
      return match;
    }
    await sleep(5_000);
  }
  throw new Error("Could not locate the dispatched probe workflow run in GitHub Actions.");
}

function outcomeFromProbeJson(payload: Record<string, unknown> | null): "ready" | "blocked_without_extension_hint" | "harness_issue" {
  if (!payload) {
    return "harness_issue";
  }
  if (payload.ok === true) {
    return "ready";
  }
  return "blocked_without_extension_hint";
}

function findProbeJsonPath(artifactRoot: string): string {
  return join(artifactRoot, "probe-url-extraction", "probe.json");
}

function extractProbeJsonFromLog(logText: string): Record<string, unknown> | null {
  const lines = logText.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.replace(/^[^\t]+\t[^\t]+\t[^\t]+\s*/, "") || "";
    if (!line.trim().startsWith("{")) {
      continue;
    }
    const candidateLines = lines
      .slice(index)
      .map((value) => value.replace(/^[^\t]+\t[^\t]+\t[^\t]+\s*/, ""));
    const candidate = candidateLines.join("\n").trim();
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      // continue scanning
    }
  }
  return null;
}

function summarizeLogFailure(logText: string): string {
  const interesting = logText
    .split("\n")
    .filter((line) => line.includes("Run VM URL probe") || line.includes("warning") || line.includes("error") || line.includes("tsx"))
    .slice(-8)
    .map((line) => line.replace(/^[^\t]+\t[^\t]+\t[^\t]+\s*/, "").trim())
    .filter(Boolean);

  return interesting.join(" | ") || "No structured probe artifact or JSON payload was available from the workflow run.";
}

export async function runProdProbe(entry: CorpusEntry, branch: string, reportDir: string): Promise<ProdProbeResult> {
  const startedAt = Date.now();
  try {
    await ensureGhAuth();

    await runCommand(
      "gh",
      ["workflow", "run", PROBE_WORKFLOW_PATH, "--ref", branch, "-f", `url=${entry.url}`, "-f", "fail_on_error=false"],
      {
        cwd: REPO_ROOT,
        env: process.env
      }
    );

    const run = await waitForWorkflowRun(branch, startedAt);
    await runCommand("gh", ["run", "watch", String(run.databaseId), "--interval", "10", "--exit-status"], {
      cwd: REPO_ROOT,
      env: process.env,
      allowFailure: true
    });

    const artifactDir = join(reportDir, "prod-probes", entry.id);
    await ensureDir(artifactDir);
    await runCommand("gh", ["run", "download", String(run.databaseId), "-D", artifactDir], {
      cwd: REPO_ROOT,
      env: process.env,
      allowFailure: true
    });

    const probeJsonPath = findProbeJsonPath(artifactDir);
    let probeJson: Record<string, unknown> | null = null;
    try {
      probeJson = JSON.parse(await readFile(probeJsonPath, "utf8")) as Record<string, unknown>;
    } catch {
      probeJson = null;
    }

    let logSummary: string | null = null;
    if (!probeJson) {
      const logResult = await runCommand("gh", ["run", "view", String(run.databaseId), "--log"], {
        cwd: REPO_ROOT,
        env: process.env,
        allowFailure: true
      });
      const combinedLog = `${logResult.stdout}\n${logResult.stderr}`.trim();
      probeJson = extractProbeJsonFromLog(combinedLog);
      if (!probeJson) {
        logSummary = summarizeLogFailure(combinedLog);
      }
    }

    const actual = outcomeFromProbeJson(probeJson);
    const matchedExpectation = matchProdProbeExpectation(entry.expectedUrl, actual);
    const result: ProdProbeResult = {
      expected: entry.expectedUrl,
      actual,
      matchedExpectation,
      status: matchedExpectation ? "passed" : "failed",
      durationMs: Date.now() - startedAt,
      runId: run.databaseId,
      workflowUrl: run.url,
      artifactDir,
      probeJsonPath,
      probeJson,
      errorMessage:
        actual === "ready" ? null : ((probeJson?.error as { user_message?: string } | undefined)?.user_message || logSummary || null)
    };
    if (result.status === "failed") {
      result.classification = classifyProdProbeFailure(result);
      result.recommendation =
        result.classification === "harness_issue"
          ? "Fix GitHub probe collection before trusting this result."
          : "Review whether the site behavior changed or the corpus expectation should be updated.";
    }
    return result;
  } catch (error) {
    return {
      expected: entry.expectedUrl,
      actual: "harness_issue",
      matchedExpectation: false,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
      classification: "harness_issue",
      recommendation: "Fix GitHub CLI/workflow access or probe artifact collection before rerunning."
    };
  }
}

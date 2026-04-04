import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCorpus, filterCorpus, shouldRunExtension, shouldRunUrl } from "./corpus.js";
import { runExtensionPath, runExtensionSmoke } from "./extension-runner.js";
import { createLocalHarness } from "./local-app.js";
import { formatHelp, parseCliOptions } from "./options.js";
import { EXPORT_ROOT, EXTENSION_MANIFEST_PATH, REPO_ROOT } from "./paths.js";
import { buildSummary, writeMarkdownReports } from "./report.js";
import { type EntryRunResult, type Provenance, type RunReport } from "./types.js";
import { ensureDir, runCommand, timestampSlug, writeJson } from "./utils.js";
import { runProdProbe } from "./prod-probe.js";
import { runUrlPath } from "./url-runner.js";

async function gitValue(args: string[]): Promise<string> {
  const result = await runCommand("git", args, {
    cwd: REPO_ROOT,
    env: process.env
  });
  return result.stdout.trim();
}

async function readExtensionVersion(): Promise<string> {
  const manifest = JSON.parse(await readFile(EXTENSION_MANIFEST_PATH, "utf8")) as { version?: string };
  return manifest.version || "unknown";
}

async function buildProvenance(
  appUrl: string,
  runnerMode: RunReport["provenance"]["runnerMode"],
  envMode: RunReport["provenance"]["envMode"],
  extensionBuild: RunReport["provenance"]["extensionBuild"]
): Promise<Provenance> {
  const [gitCommit, gitBranch, extensionVersion] = await Promise.all([
    gitValue(["rev-parse", "HEAD"]),
    gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    readExtensionVersion()
  ]);

  return {
    appUrl,
    envMode,
    runnerMode,
    extensionBuild,
    gitCommit,
    gitBranch,
    extensionVersion,
    startedAt: new Date().toISOString()
  };
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${formatHelp()}\n`);
    return;
  }

  const corpus = filterCorpus(await loadCorpus(), options);
  if (corpus.length === 0) {
    throw new Error("No corpus entries matched the supplied filters.");
  }

  const reportDir = join(EXPORT_ROOT, timestampSlug());
  await ensureDir(reportDir);
  await mkdir(join(reportDir, "screenshots"), { recursive: true });
  await mkdir(join(reportDir, "prod-probes"), { recursive: true });

  const runLabel = reportDir.split("/").at(-1) || timestampSlug();
  const results: EntryRunResult[] = corpus.map((entry) => ({ entry }));
  let smoke = null;

  let localHarness: Awaited<ReturnType<typeof createLocalHarness>> | null = null;
  try {
    if (options.env === "local" || options.env === "dual") {
      localHarness = await createLocalHarness(options.keepStack);
      const config = localHarness.config;

      for (const result of results) {
        if ((options.mode === "url" || options.mode === "dual") && shouldRunUrl(result.entry)) {
          result.urlResult = await runUrlPath(result.entry, config, runLabel);
        }
        if ((options.mode === "extension" || options.mode === "dual") && shouldRunExtension(result.entry)) {
          result.extensionResult = await runExtensionPath(result.entry, config, reportDir, runLabel);
        }
      }

      if ((options.mode === "extension" || options.mode === "dual")) {
        const smokeEntry = corpus.find((entry) => shouldRunExtension(entry) && !entry.requiresManual);
        if (smokeEntry) {
          smoke = await runExtensionSmoke(smokeEntry, config, reportDir, options.extensionBuild);
        }
      }
    }

    if ((options.env === "prod-probe" || options.env === "dual") && (options.mode === "url" || options.mode === "dual")) {
      const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"]);
      for (const result of results) {
        if (!shouldRunUrl(result.entry)) {
          continue;
        }
        result.prodProbeResult = await runProdProbe(result.entry, branch, reportDir);
      }
    }
  } finally {
    await localHarness?.shutdown();
  }

  const provenance = await buildProvenance(
    localHarness?.config.appUrl || process.env.APP_URL || "unknown",
    options.mode,
    options.env,
    options.extensionBuild
  );
  const report: RunReport = {
    provenance,
    options,
    summary: buildSummary(results),
    smoke,
    results
  };

  await writeJson(join(reportDir, "results.json"), report);
  await writeMarkdownReports(report, reportDir);

  const failed =
    report.summary.urlFailed + report.summary.extensionFailed + report.summary.prodProbeFailed + (smoke?.status === "failed" ? 1 : 0);
  process.stdout.write(`${JSON.stringify({ reportDir, failed }, null, 2)}\n`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});

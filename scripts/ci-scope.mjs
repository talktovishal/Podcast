#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const DOC_LIKE_PATTERNS = [
  /^docs\//,
  /^AGENTS\.md$/,
  /^README\.md$/,
  /\.md$/
];

const BROAD_PATTERNS = [
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^tsconfig\.base\.json$/,
  /^turbo\.json$/,
  /^config\//,
  /^\.github\/workflows\/ci\.yml$/,
  /^scripts\/check-env\.mjs$/,
  /^scripts\/prisma-profile\.mjs$/
];

const CORE_PATTERNS = [/^packages\/core\//];
const WEB_PATTERNS = [
  /^apps\/web\//,
  /^apps\/extension\//,
  /^scripts\/extension-/,
  /^scripts\/package-extension\.sh$/,
  /^scripts\/validate-extension\.mjs$/,
  /^scripts\/generate-extension-icons\.py$/
];
const WEB_RUNTIME_PATTERNS = [
  /^apps\/web\/src\/app\/api\//,
  /^apps\/web\/src\/lib\//,
  /^apps\/web\/src\/middleware\.ts$/,
  /^apps\/web\/src\/instrumentation\.ts$/,
  /^apps\/web\/prisma\//,
  /^apps\/web\/e2e\//,
  /^apps\/web\/scripts\/(bootstrap-db|export|seed-demo|ops-|backfill-|migrate-|cleanup-|purge-|metadata-|precompute-tts-previews)/,
  /^apps\/web\/next\.config\.mjs$/,
  /^scripts\/verify_podcast_contract\.sh$/
];
const WORKER_PATTERNS = [/^apps\/worker\//];
const TESTING_PATTERNS = [/^testing\//];
const OBSERVABILITY_PATTERNS = [
  /^scripts\/observability-verify\.mjs$/,
  /^packages\/core\/src\/logging\//,
  /^packages\/core\/tests\/logging\.test\.ts$/,
  /^apps\/worker\/tests\/queue-resilience\.test\.ts$/
];
const LICENSE_PATTERNS = [
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^apps\/.+\/package\.json$/,
  /^packages\/.+\/package\.json$/,
  /^testing\/.+\/package\.json$/,
  /^scripts\/license-check\.mjs$/
];
const PARITY_PATTERNS = [
  /^docker-compose\.parity\.yml$/,
  /^Dockerfile\.web$/,
  /^Dockerfile\.worker$/,
  /^services\/python-tts\//,
  /^infra\//,
  /^scripts\/azure\//,
  /^scripts\/parity-(up|down|smoke)\.sh$/,
  /^scripts\/test-python-tts-e2e\.sh$/,
  /^\.env\.parity(\.example)?$/,
  /^\.env\.azure(\.example)?$/
];

function runGit(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8"
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return "";
    }
    throw error;
  }
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function matchesAny(filePath, patterns) {
  return patterns.some((pattern) => pattern.test(filePath));
}

export function computeScope(changedFiles) {
  const files = uniqueSorted(changedFiles);
  const hasChanges = files.length > 0;
  const docsOnly = hasChanges && files.every((filePath) => matchesAny(filePath, DOC_LIKE_PATTERNS));
  const broadChange = files.some((filePath) => matchesAny(filePath, BROAD_PATTERNS));
  const coreChanged = broadChange || files.some((filePath) => matchesAny(filePath, CORE_PATTERNS));
  const webChanged = broadChange || coreChanged || files.some((filePath) => matchesAny(filePath, WEB_PATTERNS));
  const webRuntimeChanged = broadChange || coreChanged || files.some((filePath) => matchesAny(filePath, WEB_RUNTIME_PATTERNS));
  const workerChanged = broadChange || coreChanged || files.some((filePath) => matchesAny(filePath, WORKER_PATTERNS));
  const testingChanged = broadChange || coreChanged || files.some((filePath) => matchesAny(filePath, TESTING_PATTERNS));
  const parityInfraChanged = broadChange || files.some((filePath) => matchesAny(filePath, PARITY_PATTERNS));
  const observabilityChanged =
    coreChanged ||
    workerChanged ||
    webRuntimeChanged ||
    files.some((filePath) => matchesAny(filePath, OBSERVABILITY_PATTERNS));

  const runSimple = hasChanges && !docsOnly;
  const scope = {
    changed_files: files,
    changed_file_count: files.length,
    has_changes: hasChanges,
    docs_only: docsOnly,
    run_simple: runSimple,
    run_env_simple: runSimple,
    run_naming: runSimple,
    run_core: runSimple && coreChanged,
    run_web: runSimple && webChanged,
    run_worker: runSimple && workerChanged,
    run_testing: runSimple && testingChanged,
    run_observability: runSimple && observabilityChanged,
    run_export: runSimple && webRuntimeChanged,
    run_license: files.some((filePath) => matchesAny(filePath, LICENSE_PATTERNS)),
    run_parity: runSimple && (parityInfraChanged || coreChanged || workerChanged || webRuntimeChanged)
  };

  const summary = [];
  if (!hasChanges) {
    summary.push("No changed files detected.");
  } else if (docsOnly) {
    summary.push("Docs-only change.");
  } else {
    summary.push(`Changed files: ${files.length}`);
    if (scope.run_core) {
      summary.push("core");
    }
    if (scope.run_web) {
      summary.push("web");
    }
    if (scope.run_worker) {
      summary.push("worker");
    }
    if (scope.run_testing) {
      summary.push("testing");
    }
    if (scope.run_parity) {
      summary.push("parity");
    }
  }

  return { ...scope, summary: summary.join(" | ") };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    base: "",
    head: "",
    includeWorkingTree: false,
    format: "text"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--base") {
      options.base = args[index + 1] || "";
      index += 1;
    } else if (arg === "--head") {
      options.head = args[index + 1] || "";
      index += 1;
    } else if (arg === "--include-working-tree") {
      options.includeWorkingTree = true;
    } else if (arg === "--format") {
      options.format = args[index + 1] || options.format;
      index += 1;
    }
  }

  return options;
}

function determineRefs(options) {
  if (options.base || options.head) {
    return {
      base: options.base || "HEAD",
      head: options.head || "HEAD"
    };
  }

  const eventName = process.env.GITHUB_EVENT_NAME;
  const prBaseSha = process.env.PR_BASE_SHA;
  const prHeadSha = process.env.PR_HEAD_SHA;
  const pushBeforeSha = process.env.PUSH_BEFORE_SHA;
  const githubSha = process.env.GITHUB_SHA;

  if (eventName === "pull_request" && prBaseSha && prHeadSha) {
    return { base: prBaseSha, head: prHeadSha };
  }

  if (eventName === "push" && pushBeforeSha && githubSha && !/^0+$/.test(pushBeforeSha)) {
    return { base: pushBeforeSha, head: githubSha };
  }

  return { base: "HEAD~1", head: "HEAD" };
}

function resolveChangedFiles(options) {
  const { base, head } = determineRefs(options);
  const changedFiles = [];

  if (base && head) {
    changedFiles.push(...runGit(["diff", "--name-only", `${base}...${head}`], { allowFailure: true }).split("\n"));
  }

  if (options.includeWorkingTree) {
    changedFiles.push(...runGit(["diff", "--name-only", "HEAD"], { allowFailure: true }).split("\n"));
    changedFiles.push(...runGit(["ls-files", "--others", "--exclude-standard"], { allowFailure: true }).split("\n"));
  }

  return uniqueSorted(changedFiles);
}

function formatGithubOutput(scope) {
  return Object.entries(scope)
    .filter(([key]) => key !== "changed_files")
    .map(([key, value]) => `${key}=${typeof value === "boolean" ? String(value) : String(value).replace(/\n/g, " ")}`)
    .join("\n");
}

function formatText(scope) {
  const lines = [scope.summary];
  if (scope.changed_files.length > 0) {
    lines.push(`Files: ${scope.changed_files.join(", ")}`);
  }
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv);
  const scope = computeScope(resolveChangedFiles(options));

  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(scope, null, 2)}\n`);
    return;
  }

  if (options.format === "github-output") {
    process.stdout.write(`${formatGithubOutput(scope)}\n`);
    return;
  }

  process.stdout.write(`${formatText(scope)}\n`);
}

if (basename(process.argv[1] || "") === basename(__filename)) {
  main();
}

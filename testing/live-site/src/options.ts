import {
  cohortValues,
  extensionBuildValues,
  runnerEnvValues,
  runnerModeValues,
  type CliOptions,
  type Cohort,
  type RunnerEnv,
  type RunnerMode
} from "./types.js";

function isValue<T extends readonly string[]>(values: T, input: string): input is T[number] {
  return (values as readonly string[]).includes(input);
}

export function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    mode: "dual",
    env: "dual",
    extensionBuild: "source",
    siteIds: [],
    keepStack: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--keep-stack") {
      options.keepStack = true;
      continue;
    }

    const next = argv[index + 1];
    if (!next) {
      throw new Error(`Missing value for ${token}`);
    }

    if (token === "--site") {
      options.siteIds = next
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (token === "--cohort") {
      if (!isValue(cohortValues, next)) {
        throw new Error(`Invalid cohort '${next}'. Expected one of: ${cohortValues.join(", ")}`);
      }
      options.cohort = next as Cohort;
      index += 1;
      continue;
    }

    if (token === "--mode") {
      if (!isValue(runnerModeValues, next)) {
        throw new Error(`Invalid mode '${next}'. Expected one of: ${runnerModeValues.join(", ")}`);
      }
      options.mode = next as RunnerMode;
      index += 1;
      continue;
    }

    if (token === "--env") {
      if (!isValue(runnerEnvValues, next)) {
        throw new Error(`Invalid env '${next}'. Expected one of: ${runnerEnvValues.join(", ")}`);
      }
      options.env = next as RunnerEnv;
      index += 1;
      continue;
    }

    if (token === "--extension-build") {
      if (!isValue(extensionBuildValues, next)) {
        throw new Error(`Invalid extension build '${next}'. Expected one of: ${extensionBuildValues.join(", ")}`);
      }
      options.extensionBuild = next;
      index += 1;
      continue;
    }

    if (token === "--limit") {
      const parsed = Number.parseInt(next, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid limit '${next}'. Expected a positive integer.`);
      }
      options.limit = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument '${token}'`);
  }

  if (options.env === "prod-probe" && options.mode === "extension") {
    throw new Error("The prod-probe environment only supports URL mode.");
  }

  return options;
}

export function formatHelp(): string {
  return [
    "Usage: npm run live-sites:test -- [options]",
    "",
    "Options:",
    "  --site <id[,id]>           Run only the given corpus entry IDs",
    "  --cohort <news|social>     Run only one cohort",
    "  --mode <url|extension|dual>",
    "  --env <local|prod-probe|dual>",
    "  --extension-build <source|package>",
    "  --keep-stack               Keep parity stack running if this harness started it",
    "  --limit <n>                Limit the number of selected targets",
    "  --help                     Show this help"
  ].join("\n");
}

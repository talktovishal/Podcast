import { commandValues, compareModeValues, type CliOptions, type CommandMode, type CompareMode } from "./types.js";

function isValue<T extends readonly string[]>(values: T, input: string): input is T[number] {
  return (values as readonly string[]).includes(input);
}

function parsePositiveInt(input: string, label: string): number {
  const parsed = Number.parseInt(input, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label} '${input}'. Expected a positive integer.`);
  }
  return parsed;
}

export function parseCliOptions(argv: string[]): CliOptions {
  let command: CommandMode = "compare";
  let index = 0;
  if (argv[0] && !argv[0].startsWith("-")) {
    if (!isValue(commandValues, argv[0])) {
      throw new Error(`Unknown command '${argv[0]}'`);
    }
    command = argv[0] as CommandMode;
    index = 1;
  }

  const options: CliOptions = {
    command,
    mode: "dual",
    siteIds: [],
    days: 7,
    concurrencyUrl: 8,
    concurrencyExtension: 3,
    headed: false,
    help: false
  };

  for (; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (token === "--") {
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--headed") {
      options.headed = true;
      continue;
    }

    const next = argv[index + 1];
    if (!next) {
      throw new Error(`Missing value for ${token}`);
    }

    if (token === "--mode") {
      if (!isValue(compareModeValues, next)) {
        throw new Error(`Invalid mode '${next}'. Expected one of: ${compareModeValues.join(", ")}`);
      }
      options.mode = next as CompareMode;
      index += 1;
      continue;
    }

    if (token === "--input") {
      options.inputPath = next;
      index += 1;
      continue;
    }

    if (token === "--site") {
      options.siteIds = next
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (token === "--limit") {
      options.limit = parsePositiveInt(next, "limit");
      index += 1;
      continue;
    }

    if (token === "--days") {
      options.days = parsePositiveInt(next, "days");
      index += 1;
      continue;
    }

    if (token === "--resource-group") {
      options.resourceGroup = next;
      index += 1;
      continue;
    }

    if (token === "--table-prefix") {
      options.tablePrefix = next;
      index += 1;
      continue;
    }

    if (token === "--concurrency-url") {
      options.concurrencyUrl = parsePositiveInt(next, "concurrency-url");
      index += 1;
      continue;
    }

    if (token === "--concurrency-extension") {
      options.concurrencyExtension = parsePositiveInt(next, "concurrency-extension");
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument '${token}'`);
  }

  return options;
}

export function formatHelp(): string {
  return [
    "Usage:",
    "  npm run extraction-quality:audit -- [options]",
    "  npm run extraction-quality:audit:prod -- [options]",
    "  npm run extraction-quality:test -- [options]",
    "",
    "Commands:",
    "  audit                       Scan stored markdown artifacts under apps/web/.data/media",
    "  audit-prod                  Scan production-generated summary and episode text from Azure",
    "  compare                     Compare URL and extension extraction on a URL corpus (default)",
    "  compare-defuddle            Compare current HTML extraction against defuddle using shared fetched HTML",
    "",
    "Options:",
    "  --mode <url|extension|dual>",
    "  --days <n>                  Rolling lookback window for production audit (default: 7)",
    "  --resource-group <name>     Azure resource group for production audit (default: rg-articlepod-prod)",
    "  --table-prefix <prefix>     Azure Table prefix for production audit (default: articlepod)",
    "  --input <path>              Override the checked-in corpus with a Markdown table or .txt URL list",
    "  --site <id[,id]>            Run only the given corpus IDs",
    "  --limit <n>                 Limit selected targets",
    "  --concurrency-url <n>       URL extraction worker count (default: 8)",
    "  --concurrency-extension <n> Extension capture worker count (default: 3)",
    "  --headed                    Run Playwright in headed mode for extension debugging",
    "  --help                      Show this help"
  ].join("\n");
}

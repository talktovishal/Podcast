import { backfillCleanedMarkdownArtifacts } from "../src/lib/markdown-artifact-backfill";
import { prisma } from "../src/lib/prisma";

function parseArgs(argv: string[]): { dryRun: boolean; limit?: number; itemIds?: string[] } {
  let dryRun = false;
  let limit: number | undefined;
  const itemIds: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--limit") {
      const raw = argv[index + 1];
      if (!raw) {
        throw new Error("Missing value for --limit");
      }
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value: ${raw}`);
      }
      limit = parsed;
      index += 1;
      continue;
    }
    if (arg === "--item-id") {
      const raw = argv[index + 1];
      if (!raw) {
        throw new Error("Missing value for --item-id");
      }
      itemIds.push(raw);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dryRun, limit, itemIds: itemIds.length > 0 ? itemIds : undefined };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = await backfillCleanedMarkdownArtifacts(options);
  // eslint-disable-next-line no-console
  console.log("[artifacts:cleanup-markdown] complete");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[artifacts:cleanup-markdown] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

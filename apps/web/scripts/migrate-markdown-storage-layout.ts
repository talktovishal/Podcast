import { migrateMarkdownStorageLayout } from "../src/lib/markdown-storage-layout";
import { prisma } from "../src/lib/prisma";

function parseArgs(argv: string[]): {
  dryRun: boolean;
  deleteLegacy: boolean;
  userId?: string;
} {
  let dryRun = false;
  let deleteLegacy = false;
  let userId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--delete-legacy") {
      deleteLegacy = true;
      continue;
    }
    if (arg === "--user-id") {
      const raw = argv[index + 1];
      if (!raw) {
        throw new Error("Missing value for --user-id");
      }
      userId = raw;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    dryRun,
    deleteLegacy,
    userId
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = await migrateMarkdownStorageLayout(options);
  // eslint-disable-next-line no-console
  console.log("[artifacts:migrate-markdown-layout] complete");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[artifacts:migrate-markdown-layout] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

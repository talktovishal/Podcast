import { hasPrismaDatabase, prisma } from "../src/lib/prisma";
import {
  formatWikiLintResultsForCli,
  lintPreparedWikiRun,
  parseWikiRunCliArgs
} from "../src/lib/wiki";

async function main() {
  const options = parseWikiRunCliArgs(process.argv.slice(2));
  const results = await lintPreparedWikiRun(options);
  // eslint-disable-next-line no-console
  console.log(formatWikiLintResultsForCli(results));

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[wiki:lint] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (hasPrismaDatabase()) {
      await prisma.$disconnect();
    }
  });

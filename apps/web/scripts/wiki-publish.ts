import { hasPrismaDatabase, prisma } from "../src/lib/prisma";
import {
  formatWikiPublishResultsForCli,
  parseWikiRunCliArgs,
  publishPreparedWikiRun
} from "../src/lib/wiki";

async function main() {
  const options = parseWikiRunCliArgs(process.argv.slice(2));
  const results = await publishPreparedWikiRun(options);
  // eslint-disable-next-line no-console
  console.log(formatWikiPublishResultsForCli(results));
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[wiki:publish] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (hasPrismaDatabase()) {
      await prisma.$disconnect();
    }
  });

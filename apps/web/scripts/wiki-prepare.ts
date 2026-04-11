import { hasPrismaDatabase, prisma } from "../src/lib/prisma";
import {
  formatWikiPrepareRunForCli,
  parseWikiPrepareCliArgs,
  prepareUserWikiBuild
} from "../src/lib/wiki";

async function main() {
  const options = parseWikiPrepareCliArgs(process.argv.slice(2));
  const runState = await prepareUserWikiBuild(options);
  // eslint-disable-next-line no-console
  console.log(formatWikiPrepareRunForCli(runState));
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[wiki:prepare] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (hasPrismaDatabase()) {
      await prisma.$disconnect();
    }
  });

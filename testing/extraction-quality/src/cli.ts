import { formatHelp, parseCliOptions } from "./options.js";
import { runArtifactAudit } from "./audit.js";
import { runBulkComparison } from "./compare.js";
import { runDefuddleComparison } from "./compare-defuddle.js";
import { runProductionAudit } from "./prod-audit.js";

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${formatHelp()}\n`);
    return;
  }

  if (options.command === "audit") {
    const report = await runArtifactAudit();
    process.stdout.write(`${JSON.stringify({ reportDir: report.reportDir, files: report.results.length }, null, 2)}\n`);
    return;
  }

  if (options.command === "audit-prod") {
    const report = await runProductionAudit(options);
    process.stdout.write(
      `${JSON.stringify({ reportDir: report.reportDir, files: report.results.length, windowStart: report.windowStart.toISOString() }, null, 2)}\n`
    );
    return;
  }

  if (options.command === "compare-defuddle") {
    const report = await runDefuddleComparison(options);
    const flagged = report.results.filter((result) => result.rerunRecommended).length;
    process.stdout.write(`${JSON.stringify({ reportDir: report.reportDir, flagged }, null, 2)}\n`);
    if (flagged > 0) {
      process.exitCode = 1;
    }
    return;
  }

  const report = await runBulkComparison(options);
  const failed = report.results.filter((result) => result.rerunRecommended).length;
  process.stdout.write(`${JSON.stringify({ reportDir: report.reportDir, flagged: failed }, null, 2)}\n`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});

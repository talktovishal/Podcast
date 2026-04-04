import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createLocalHarness } from "../testing/live-site/src/local-app.js";
import { runExtensionSmoke } from "../testing/live-site/src/extension-runner.js";
import { EXPORT_ROOT } from "../testing/live-site/src/paths.js";
import { timestampSlug, writeJson } from "../testing/live-site/src/utils.js";

const reportDir = join(EXPORT_ROOT, `${timestampSlug()}-packaged-smoke`);

async function main() {
  await mkdir(join(reportDir, "screenshots"), { recursive: true });

  const harness = await createLocalHarness(false);
  try {
    const smokeUrl = `${harness.config.appUrl}/extension-smoke.html`;
    const smokeResult = await runExtensionSmoke(
      {
        id: "extension-packaged-smoke",
        cohort: "news",
        site: "Local extension smoke fixture",
        url: smokeUrl,
        pathMode: "extension_only",
        expectedUrl: "ready",
        expectedExtension: "ready",
        requiresManual: false,
        notes: "Stable local packaged-extension smoke target."
      },
      harness.config,
      reportDir,
      "package"
    );

    await writeJson(join(reportDir, "packaged-smoke.json"), {
      reportDir,
      smokeUrl,
      smokeResult
    });

    process.stdout.write(`${JSON.stringify({ reportDir, smokeUrl, smokeResult }, null, 2)}\n`);
    if (smokeResult.status !== "passed") {
      process.exitCode = 1;
    }
  } finally {
    await harness.shutdown();
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});

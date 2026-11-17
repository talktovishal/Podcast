import { backfillAudioRetention } from "../src/lib/audio-retention-backfill";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const summary = await backfillAudioRetention({ dryRun });
  console.log(
    `[audio:backfill-retention] dry_run=${summary.dryRun} scanned=${summary.scanned} updated=${summary.updated} unchanged=${summary.unchanged} item_updated=${summary.itemEpisodesUpdated} digest_updated=${summary.digestEpisodesUpdated} summary_updated=${summary.summaryEpisodesUpdated}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

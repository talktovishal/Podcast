import { precomputeKokoroVoicePreviews } from "../src/lib/tts";

async function main() {
  const result = await precomputeKokoroVoicePreviews();

  // eslint-disable-next-line no-console
  console.log(
    `[tts:precompute] Kokoro previews ready. created=${result.created} reused=${result.reused} failed=${result.failed.length}`
  );

  if (result.failed.length > 0) {
    for (const failure of result.failed) {
      // eslint-disable-next-line no-console
      console.warn(`[tts:precompute] ${failure.voice}: ${failure.error}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

import { prisma } from "../src/lib/prisma";
import { purgeExpiredItemArtifacts } from "../src/lib/audio-ownership";
import { purgeExpiredAudioEpisodes } from "../src/lib/audio-retention-purge";

async function main() {
  const now = new Date();

  const audioPurge = await purgeExpiredAudioEpisodes(now);
  const expiredArtifactCount = await purgeExpiredItemArtifacts(now);

  const connectCodePurge = await prisma.extensionConnectCode.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }]
    }
  });
  const extensionTokenPurge = await prisma.extensionToken.deleteMany({
    where: {
      OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: now } }]
    }
  });

  console.log(
    `[artifacts:purge] removed ${expiredArtifactCount} expired artifacts, ${audioPurge.itemEpisodesPurged} item episodes, ${audioPurge.digestEpisodesPurged} digest episodes, ${audioPurge.summaryEpisodesPurged} summary episodes, ${connectCodePurge.count} connect codes, ${extensionTokenPurge.count} extension tokens`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

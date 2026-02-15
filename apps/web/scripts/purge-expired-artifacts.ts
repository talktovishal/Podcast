import { prisma } from "../src/lib/prisma";
import { getArtifactStorage } from "../src/lib/storage";

async function main() {
  const now = new Date();
  const storage = getArtifactStorage();

  const expiredArtifacts = await prisma.itemArtifact.findMany({
    where: {
      expiresAt: {
        lt: now
      }
    },
    take: 1000
  });

  for (const artifact of expiredArtifacts) {
    await storage.deleteObject(artifact.storageKey).catch(() => undefined);
  }

  await prisma.itemArtifact.deleteMany({
    where: {
      id: {
        in: expiredArtifacts.map((artifact) => artifact.id)
      }
    }
  });

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
    `[artifacts:purge] removed ${expiredArtifacts.length} expired artifacts, ${connectCodePurge.count} connect codes, ${extensionTokenPurge.count} extension tokens`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


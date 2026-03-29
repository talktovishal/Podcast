import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BRAND_NAME, BRAND_SLUG, KokoroTtsProvider, createSecretToken } from "@articlepod/core";
import { ensureUserFeedTokenAccess, hashPassword } from "../src/lib/auth";
import { resolveDemoAudioStrategy } from "../src/lib/demo-seed";
import { env } from "../src/lib/env";
import { ensureDataDirs } from "../src/lib/fs";
import { createPrimaryUser, findPrimaryUserByEmail, updatePrimaryUser } from "../src/lib/metadata-primary-auth";
import { webPrimaryStore, webUsesAzureTablePrimary } from "../src/lib/metadata-primary-store";
import { prisma } from "../src/lib/prisma";
import { getArtifactStorage, normalizeStorageKey } from "../src/lib/storage";
import { ensureAdminUser } from "../src/lib/user-bootstrap";

const DEMO_EMAIL = env.demoEmail;

if (!env.demoPassword) {
  console.error(
    "Error: DEMO_PASSWORD environment variable is required but not set.\n" +
    "Add it to your .env file before running the seed script."
  );
  process.exit(1);
}
const DEMO_PASSWORD = env.demoPassword;
const DEMO_TEXT =
  `Welcome to ${BRAND_NAME}. This starter episode proves the feed works before any API keys are configured.`;

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${cmd} exited with code ${code}`));
      }
    });
  });
}

async function renderStarterAudioBuffer(): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), `${BRAND_SLUG}-seed-`));
  const mp3Path = join(tempDir, "starter.mp3");
  const aiffPath = join(tempDir, "starter.aiff");

  try {
    const renderSilentMp3Buffer = async () => {
      await run("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        "2",
        "-codec:a",
        "libmp3lame",
        mp3Path
      ]);
      return readFile(mp3Path);
    };

    const strategy = resolveDemoAudioStrategy();

    if (strategy === "fast") {
      return renderSilentMp3Buffer();
    }

    if (strategy === "native") {
      try {
        await run("say", ["-v", "Samantha", "-o", aiffPath, DEMO_TEXT]);
        await run("afconvert", [aiffPath, "-o", mp3Path, "-f", "MPG3", "-d", ".mp3"]);
        return readFile(mp3Path);
      } catch {
        // Fall through to python-tts provider path.
      }
    }

    try {
      const provider = new KokoroTtsProvider(env.pythonTtsUrl, env.pythonTtsTimeoutMs);
      await provider.synthesizeToFile({
        text: DEMO_TEXT,
        voice: "af_heart",
        format: "mp3",
        outPath: mp3Path
      });
      return readFile(mp3Path);
    } catch {
      // Final fallback for environments without an available native/provider voice path.
      return renderSilentMp3Buffer();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function ensureStarterAudioObject(relativePath: string): Promise<number> {
  const storage = getArtifactStorage();

  try {
    const existing = await storage.headObject(relativePath);
    if (existing.bytes > 0) {
      return existing.bytes;
    }
  } catch {
    // object does not exist yet
  }

  const audio = await renderStarterAudioBuffer();
  const stored = await storage.putObject(relativePath, audio, { contentType: "audio/mpeg" });
  return stored.bytes;
}

function logDemoSeedSummary(feedTokenPlain: string | null) {
  // eslint-disable-next-line no-console
  console.log("Demo seed complete");
  // eslint-disable-next-line no-console
  console.log(`Demo user: ${DEMO_EMAIL}`);
  // eslint-disable-next-line no-console
  console.log(`Demo password: ${DEMO_PASSWORD}`);
  if (feedTokenPlain) {
    // eslint-disable-next-line no-console
    console.log(`Feed URL: ${env.appUrl}/rss/${feedTokenPlain}.xml`);
  } else {
    // eslint-disable-next-line no-console
    console.log("Feed URL: existing active token preserved (private URL not displayable from seed path)");
  }
}

async function main() {
  await ensureDataDirs();
  await ensureAdminUser();

  const demoPasswordHash = await hashPassword(DEMO_PASSWORD);
  const usesAzureTablePrimary = webUsesAzureTablePrimary() && webPrimaryStore;
  let user = usesAzureTablePrimary
    ? await findPrimaryUserByEmail(DEMO_EMAIL)
    : await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    user = usesAzureTablePrimary
      ? await createPrimaryUser({
          email: DEMO_EMAIL,
          name: "Demo Listener",
          passwordHash: demoPasswordHash,
          role: "USER"
        })
      : await prisma.user.create({
          data: {
            email: DEMO_EMAIL,
            name: "Demo Listener",
            passwordHash: demoPasswordHash,
            role: "USER"
          }
        });
  } else if (usesAzureTablePrimary) {
    await updatePrimaryUser(user.id, { passwordHash: demoPasswordHash });
  } else {
    await prisma.user.update({ where: { email: DEMO_EMAIL }, data: { passwordHash: demoPasswordHash } });
  }

  const feedTokenPlain = usesAzureTablePrimary
    ? (await ensureUserFeedTokenAccess(user.id)).tokenValue ?? null
    : await (async () => {
        const activeFeed = await prisma.feedToken.findFirst({ where: { userId: user.id, active: true } });
        if (activeFeed?.tokenValue) {
          return activeFeed.tokenValue;
        }

        const token = createSecretToken();
        await prisma.feedToken.create({
          data: {
            userId: user.id,
            tokenValue: token.plain,
            tokenHash: token.hash,
            active: true
          }
        });
        return token.plain;
      })();

  const relativePath = normalizeStorageKey(join("items", "demo-starter", "episode.mp3"));
  const bytes = await ensureStarterAudioObject(relativePath);

  if (usesAzureTablePrimary) {
    const store = webPrimaryStore;
    if (!store) {
      throw new Error("Azure Table primary mode is enabled but the primary store is not configured.");
    }

    const existingStarter = await store.listItemsByUser(user.id, 20).then((items) => items.find((item) => item.title === `Welcome to ${BRAND_NAME}`) ?? null);

    if (!existingStarter) {
      const item = await store.createItem({
        id: randomUUID(),
        userId: user.id,
        title: `Welcome to ${BRAND_NAME}`,
        sourceType: "PDF",
        sourceFilePath: null,
        status: "READY"
      });
      await store.createJob({
        id: randomUUID(),
        itemId: item.id,
        userId: user.id,
        status: "SUCCEEDED",
        attempt: 1
      });
      await store.upsertEpisode({
        id: randomUUID(),
        itemId: item.id,
        userId: user.id,
        guid: `episode-${item.id}`,
        title: `Welcome to ${BRAND_NAME}`,
        description: DEMO_TEXT,
        audioPath: relativePath,
        audioBytes: bytes,
        mimeType: "audio/mpeg",
        publishedAt: new Date()
      });
      logDemoSeedSummary(feedTokenPlain);
      return;
    }

    const episode = await store.findEpisodeByItemId(existingStarter.id);
    await store.updateItem(existingStarter.id, {
      title: `Welcome to ${BRAND_NAME}`,
      status: "READY",
      errorCode: null,
      errorMessage: null
    });
    if (!episode || episode.audioPath !== relativePath || episode.audioBytes !== bytes || episode.mimeType !== "audio/mpeg") {
      await store.upsertEpisode({
        id: episode?.id ?? randomUUID(),
        itemId: existingStarter.id,
        userId: user.id,
        guid: episode?.guid ?? `episode-${existingStarter.id}`,
        title: `Welcome to ${BRAND_NAME}`,
        description: DEMO_TEXT,
        audioPath: relativePath,
        audioBytes: bytes,
        mimeType: "audio/mpeg",
        publishedAt: episode?.publishedAt ?? new Date()
      });
    }
    logDemoSeedSummary(feedTokenPlain);
    return;
  }

  const existingStarter = await prisma.item.findFirst({
    where: {
      userId: user.id,
      title: `Welcome to ${BRAND_NAME}`
    },
    include: {
      episode: true
    }
  });

  if (!existingStarter) {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: `Welcome to ${BRAND_NAME}`,
        sourceType: "PDF",
        sourceFilePath: null,
        status: "READY",
        jobs: {
          create: {
            status: "SUCCEEDED",
            attempt: 1
          }
        }
      }
    });

    await prisma.episode.create({
      data: {
        itemId: item.id,
        guid: `episode-${item.id}`,
        title: `Welcome to ${BRAND_NAME}`,
        description: DEMO_TEXT,
        audioPath: relativePath,
        audioBytes: bytes,
        mimeType: "audio/mpeg",
        publishedAt: new Date()
      }
    });

    const job = await prisma.job.findFirst({ where: { itemId: item.id }, orderBy: { createdAt: "desc" } });
    if (job) {
      await prisma.jobEvent.create({
        data: {
          jobId: job.id,
          itemId: item.id,
          stage: "seed",
          eventType: "success",
          payloadJson: {
            message: "Demo starter seeded"
          }
        }
      });
    }
    logDemoSeedSummary(feedTokenPlain);
    return;
  }

  if (existingStarter.episode && (existingStarter.episode.audioPath !== relativePath || existingStarter.episode.audioBytes !== bytes || existingStarter.episode.mimeType !== "audio/mpeg")) {
    await prisma.episode.update({
      where: { id: existingStarter.episode.id },
      data: {
        audioPath: relativePath,
        audioBytes: bytes,
        mimeType: "audio/mpeg"
      }
    });
  }

  logDemoSeedSummary(feedTokenPlain);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

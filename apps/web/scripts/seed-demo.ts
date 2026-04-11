import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BRAND_NAME, BRAND_SLUG, KokoroTtsProvider } from "@articlepod/core";
import { ensureUserFeedTokenAccess, hashPassword } from "../src/lib/auth";
import { setComplimentaryProAccess } from "../src/lib/billing";
import { getBundledDemoAudioBuffer, resolveDemoAudioStrategy } from "../src/lib/demo-seed";
import { env } from "../src/lib/env";
import { ensureDataDirs } from "../src/lib/fs";
import { createPrimaryUser, findPrimaryUserByEmail, updatePrimaryUser } from "../src/lib/metadata-primary-auth";
import { webPrimaryStore, webUsesAzureTablePrimary } from "../src/lib/metadata-primary-store";
import { hasPrismaDatabase, prisma } from "../src/lib/prisma";
import { getArtifactStorage, normalizeStorageKey } from "../src/lib/storage";
import { ensureAdminUser } from "../src/lib/user-bootstrap";

const DEMO_EMAIL = env.demoEmail;
const WEBSTORE_REVIEWER_EMAIL = env.webstoreReviewerEmail;
const WEBSTORE_REVIEWER_PASSWORD = env.webstoreReviewerPassword?.trim() || null;

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

type SeededUserInput = {
  email: string;
  password: string;
  name: string;
  complimentaryPro?: boolean;
};

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
    const strategy = resolveDemoAudioStrategy();

    if (strategy === "fast") {
      return getBundledDemoAudioBuffer();
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
      return getBundledDemoAudioBuffer();
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

async function ensureSeedUser(input: SeededUserInput) {
  const passwordHash = await hashPassword(input.password);
  const usesAzureTablePrimary = webUsesAzureTablePrimary() && webPrimaryStore;
  let user = usesAzureTablePrimary
    ? await findPrimaryUserByEmail(input.email)
    : await prisma.user.findUnique({ where: { email: input.email } });

  if (!user) {
    user = usesAzureTablePrimary
      ? await createPrimaryUser({
          email: input.email,
          name: input.name,
          passwordHash,
          role: "USER"
        })
      : await prisma.user.create({
          data: {
            email: input.email,
            name: input.name,
            passwordHash,
            role: "USER"
          }
        });
  } else if (usesAzureTablePrimary) {
    user = await updatePrimaryUser(user.id, {
      name: input.name,
      passwordHash
    });
  } else {
    user = await prisma.user.update({
      where: { email: input.email },
      data: {
        name: input.name,
        passwordHash
      }
    });
  }

  if (!user) {
    throw new Error(`Failed to create or update seeded user ${input.email}.`);
  }

  if (input.complimentaryPro !== undefined) {
    await setComplimentaryProAccess(user.id, input.complimentaryPro);
  }

  await ensureUserFeedTokenAccess(user.id);
  return user;
}

function logSeedSummary(options: { reviewerSeeded: boolean }) {
  // eslint-disable-next-line no-console
  console.log("Demo seed complete");
  // eslint-disable-next-line no-console
  console.log(`Demo user: ${DEMO_EMAIL} (password sourced from DEMO_PASSWORD env var)`);
  // eslint-disable-next-line no-console
  console.log("Demo feed access ensured without logging the private feed URL.");
  if (options.reviewerSeeded) {
    // eslint-disable-next-line no-console
    console.log(
      `Chrome Web Store reviewer: ${WEBSTORE_REVIEWER_EMAIL} (password sourced from WEBSTORE_REVIEWER_PASSWORD env var)`
    );
  } else {
    // eslint-disable-next-line no-console
    console.log("Chrome Web Store reviewer: not configured (set WEBSTORE_REVIEWER_PASSWORD to seed one).");
  }
}

async function main() {
  await ensureDataDirs();
  await ensureAdminUser();

  const user = await ensureSeedUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    name: "Demo Listener"
  });

  if (WEBSTORE_REVIEWER_PASSWORD) {
    await ensureSeedUser({
      email: WEBSTORE_REVIEWER_EMAIL,
      password: WEBSTORE_REVIEWER_PASSWORD,
      name: "Chrome Web Store Reviewer",
      complimentaryPro: true
    });
  }
  const usesAzureTablePrimary = webUsesAzureTablePrimary() && webPrimaryStore;

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
      logSeedSummary({ reviewerSeeded: Boolean(WEBSTORE_REVIEWER_PASSWORD) });
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
    logSeedSummary({ reviewerSeeded: Boolean(WEBSTORE_REVIEWER_PASSWORD) });
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
    logSeedSummary({ reviewerSeeded: Boolean(WEBSTORE_REVIEWER_PASSWORD) });
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

  logSeedSummary({ reviewerSeeded: Boolean(WEBSTORE_REVIEWER_PASSWORD) });
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    if (hasPrismaDatabase()) {
      await prisma.$disconnect();
    }
  });

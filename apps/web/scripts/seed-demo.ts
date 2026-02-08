import { mkdir, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { createSecretToken } from "@listenlater/core";
import { hashPassword } from "../src/lib/auth";
import { env } from "../src/lib/env";
import { ensureDataDirs } from "../src/lib/fs";
import { prisma } from "../src/lib/prisma";
import { ensureAdminUser } from "../src/lib/user-bootstrap";

const DEMO_EMAIL = env.demoEmail;
const DEMO_PASSWORD = "demo-password";
const DEMO_TEXT =
  "Welcome to ListenLater. This starter episode proves the feed works before any API keys are configured.";

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

async function ensureStarterAudio(path: string): Promise<number> {
  try {
    const existing = await stat(path);
    if (existing.size > 0) {
      return existing.size;
    }
  } catch {
    // continue
  }

  const aiffPath = path.replace(/\.m4a$/, ".aiff");
  await mkdir(dirname(path), { recursive: true });

  await run("say", ["-v", "Samantha", "-o", aiffPath, DEMO_TEXT]);
  await run("afconvert", [aiffPath, "-o", path, "-f", "m4af", "-d", "aac"]);

  const info = await stat(path);
  return info.size;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await ensureDataDirs();
  await ensureAdminUser();

  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        name: "Demo Listener",
        passwordHash: await hashPassword(DEMO_PASSWORD),
        role: "USER"
      }
    });
  }

  const activeFeed = await prisma.feedToken.findFirst({ where: { userId: user.id, active: true } });
  let feedTokenPlain = activeFeed?.tokenValue;
  if (!activeFeed) {
    const token = createSecretToken();
    await prisma.feedToken.create({
      data: {
        userId: user.id,
        tokenValue: token.plain,
        tokenHash: token.hash,
        active: true
      }
    });
    feedTokenPlain = token.plain;
  }

  const existingStarter = await prisma.item.findFirst({
    where: {
      userId: user.id,
      title: "Welcome to ListenLater"
    },
    include: {
      episode: true
    }
  });

  if (!existingStarter) {
    const relativePath = join("items", "demo-starter", "episode.m4a");
    const fullPath = join(env.mediaRoot, relativePath);
    const bytes = await ensureStarterAudio(fullPath);

    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: "Welcome to ListenLater",
        sourceType: "PDF",
        sourceFilePath: resolve(process.cwd(), "../../fixtures/pdf/text-based.pdf"),
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
        title: "Welcome to ListenLater",
        description: DEMO_TEXT,
        audioPath: relativePath,
        audioBytes: bytes,
        mimeType: "audio/mp4",
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
  }
  else if (existingStarter.episode) {
    const expectedRelativePath = join("items", "demo-starter", "episode.m4a");
    const expectedFullPath = join(env.mediaRoot, expectedRelativePath);
    const exists = await fileExists(expectedFullPath);

    if (!exists) {
      const bytes = await ensureStarterAudio(expectedFullPath);
      await prisma.episode.update({
        where: { id: existingStarter.episode.id },
        data: {
          audioPath: expectedRelativePath,
          audioBytes: bytes,
          mimeType: "audio/mp4"
        }
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log("Demo seed complete");
  // eslint-disable-next-line no-console
  console.log(`Demo user: ${DEMO_EMAIL}`);
  // eslint-disable-next-line no-console
  console.log(`Demo password: ${DEMO_PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log(`Feed URL: ${env.appUrl}/rss/${feedTokenPlain}.xml`);
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

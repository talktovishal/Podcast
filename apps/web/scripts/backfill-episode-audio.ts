import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { getArtifactStorage, normalizeStorageKey } from "../src/lib/storage";

type EpisodeRow = {
  id: string;
  itemId: string;
  audioPath: string;
  audioBytes: number;
  mimeType: string;
};

type BackfillSummary = {
  total: number;
  updated: number;
  transcoded: number;
  reusedExistingMp3: number;
  reconciledMissingPath: number;
  missingSource: number;
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

function inferMimeType(path: string, fallback?: string | null): string {
  if (fallback) {
    return fallback;
  }
  if (path.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (path.endsWith(".m4a")) {
    return "audio/mp4";
  }
  return "application/octet-stream";
}

function deriveAlternateAudioPath(path: string): string | null {
  if (path.endsWith(".mp3")) {
    return `${path.slice(0, -4)}.m4a`;
  }
  if (path.endsWith(".m4a")) {
    return `${path.slice(0, -4)}.mp3`;
  }
  return null;
}

function toMp3Path(path: string): string {
  if (path.endsWith(".mp3")) {
    return path;
  }
  if (path.endsWith(".m4a")) {
    return `${path.slice(0, -4)}.mp3`;
  }
  return `${path}.mp3`;
}

async function transcodeToMp3(input: Buffer, sourceKey: string): Promise<Buffer> {
  const extension = sourceKey.endsWith(".m4a") ? ".m4a" : sourceKey.endsWith(".mp3") ? ".mp3" : ".bin";
  const tempDir = await mkdtemp(join(tmpdir(), "articlepod-backfill-"));
  const inputPath = join(tempDir, `input${extension}`);
  const outputPath = join(tempDir, "output.mp3");

  try {
    await writeFile(inputPath, input);
    try {
      await run("ffmpeg", ["-y", "-i", inputPath, "-codec:a", "libmp3lame", outputPath]);
    } catch {
      await run("afconvert", [inputPath, "-o", outputPath, "-f", "MPG3", "-d", ".mp3"]);
    }
    return readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const storage = getArtifactStorage();
  const episodes = await prisma.episode.findMany({
    select: {
      id: true,
      itemId: true,
      audioPath: true,
      audioBytes: true,
      mimeType: true
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }]
  });

  const summary: BackfillSummary = {
    total: episodes.length,
    updated: 0,
    transcoded: 0,
    reusedExistingMp3: 0,
    reconciledMissingPath: 0,
    missingSource: 0
  };

  for (const episode of episodes) {
    let sourcePath = episode.audioPath;
    let sourceBytes = episode.audioBytes;
    let sourceMime = episode.mimeType;

    const sourceHead = await storage.headObject(sourcePath).catch(() => null);
    if (!sourceHead) {
      const alternatePath = deriveAlternateAudioPath(sourcePath);
      if (!alternatePath) {
        summary.missingSource += 1;
        continue;
      }

      const alternateHead = await storage.headObject(alternatePath).catch(() => null);
      if (!alternateHead || alternateHead.bytes <= 0) {
        summary.missingSource += 1;
        continue;
      }

      sourcePath = alternatePath;
      sourceBytes = alternateHead.bytes;
      sourceMime = inferMimeType(alternatePath, alternateHead.contentType);
      summary.reconciledMissingPath += 1;
    } else {
      sourceBytes = sourceHead.bytes;
      sourceMime = inferMimeType(sourcePath, sourceHead.contentType || sourceMime);
    }

    let targetPath = normalizeStorageKey(toMp3Path(sourcePath));
    let targetBytes = sourceBytes;
    let targetMime = sourceMime;

    if (targetPath !== sourcePath || sourceMime !== "audio/mpeg") {
      const existingTarget = await storage.headObject(targetPath).catch(() => null);
      if (existingTarget && existingTarget.bytes > 0) {
        targetBytes = existingTarget.bytes;
        targetMime = "audio/mpeg";
        summary.reusedExistingMp3 += 1;
      } else {
        const sourceObject = await storage.getObject(sourcePath);
        const transcoded = await transcodeToMp3(sourceObject, sourcePath);
        const stored = await storage.putObject(targetPath, transcoded, { contentType: "audio/mpeg" });
        targetPath = stored.key;
        targetBytes = stored.bytes;
        targetMime = "audio/mpeg";
        summary.transcoded += 1;
      }
    }

    const episodeNeedsUpdate =
      episode.audioPath !== targetPath || episode.audioBytes !== targetBytes || episode.mimeType !== targetMime;
    if (!episodeNeedsUpdate) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.episode.update({
        where: { id: episode.id },
        data: {
          audioPath: targetPath,
          audioBytes: targetBytes,
          mimeType: targetMime
        }
      });

      await tx.chunkCache.deleteMany({ where: { itemId: episode.itemId } });
      await tx.item.updateMany({
        where: {
          id: episode.itemId,
          status: {
            in: ["QUEUED", "FAILED"]
          }
        },
        data: {
          status: "READY",
          errorCode: null,
          errorMessage: null
        }
      });
      await tx.job.updateMany({
        where: {
          itemId: episode.itemId,
          status: {
            in: ["QUEUED", "PROCESSING"]
          }
        },
        data: {
          status: "SUCCEEDED",
          lockedAt: null,
          nextRetryAt: null,
          errorCode: null,
          errorMessage: "Recovered by audio backfill."
        }
      });
    });

    summary.updated += 1;
  }

  // eslint-disable-next-line no-console
  console.log("Episode audio backfill complete");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
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

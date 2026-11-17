import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { AppError, errorCodes, type TtsProvider, type TtsProviderId } from "@articlepod/core";
import { workerEnv } from "./env.js";
import { workerLogger, formatDiagnostic } from "./logger.js";
import { makeTtsProvider } from "./providers.js";
import { getArtifactStorage, normalizeStorageKey } from "./storage.js";

type SynthesizeEpisodeAudioOptions = {
  provider?: TtsProvider;
  maxSegmentAttempts?: number;
  segmentRetryBaseMs?: number;
};

const PUBLISHED_AUDIO_FORMAT = "mp3" as const;

export async function synthesizeEpisodeAudio(
  itemId: string,
  chunks: { text: string }[],
  selection: { providerId: TtsProviderId; voice: string },
  onProgress?: (current: number, total: number) => Promise<void> | void,
  outputKey?: string,
  outputFormat: "mp3" | "m4a" = PUBLISHED_AUDIO_FORMAT,
  options?: SynthesizeEpisodeAudioOptions
): Promise<{ relativePath: string; bytes: number; mimeType: string }> {
  const provider = options?.provider ?? makeTtsProvider({ providerId: selection.providerId });
  const extension = outputFormat === "mp3" ? "mp3" : "m4a";
  const mimeType = outputFormat === "mp3" ? "audio/mpeg" : "audio/mp4";
  const relativePath = normalizeStorageKey(outputKey || join("items", itemId, `episode.${extension}`));
  const tempDir = await mkdtemp(join(tmpdir(), "articlepod-worker-"));
  const tempOutputPath = join(tempDir, `episode.${extension}`);
  const maxSegmentAttempts = Math.max(1, options?.maxSegmentAttempts ?? workerEnv.ttsSegmentMaxAttempts);
  const segmentRetryBaseMs = Math.max(0, options?.segmentRetryBaseMs ?? workerEnv.ttsSegmentRetryBaseMs);

  const synthesizeSegment = async (input: {
    text: string;
    outPath: string;
    segmentIndex: number;
    totalSegments: number;
  }) => {
    for (let attempt = 1; attempt <= maxSegmentAttempts; attempt += 1) {
      try {
        await provider.synthesizeToFile({
          text: input.text,
          voice: selection.voice,
          format: outputFormat,
          outPath: input.outPath
        });
        return;
      } catch (error) {
        const canRetry = attempt < maxSegmentAttempts && isRetryableTtsSegmentError(error);
        if (!canRetry) {
          throw error;
        }
        const delayMs = ttsSegmentRetryDelayMs(attempt, segmentRetryBaseMs);
        await workerLogger.warn("TTS segment synthesis failed; retrying", {
          itemId,
          providerId: selection.providerId,
          voice: selection.voice,
          segmentIndex: input.segmentIndex,
          totalSegments: input.totalSegments,
          attempt,
          maxAttempts: maxSegmentAttempts,
          delayMs,
          error: formatDiagnostic(error)
        });
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }
  };

  try {
    if (chunks.length === 1) {
      await synthesizeSegment({
        text: chunks[0]?.text ?? "",
        outPath: tempOutputPath,
        segmentIndex: 0,
        totalSegments: 1
      });
      if (onProgress) {
        await onProgress(1, 1);
      }
    } else {
      const segmentPaths: string[] = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const segmentPath = join(tempDir, `segment-${index}.${extension}`);
        const segmentText = chunks[index]?.text ?? "";
        await synthesizeSegment({
          text: segmentText,
          outPath: segmentPath,
          segmentIndex: index,
          totalSegments: chunks.length
        });
        if (onProgress) {
          await onProgress(index + 1, chunks.length);
        }
        segmentPaths.push(segmentPath);
      }
      await concatenateAudioSegments(segmentPaths, tempOutputPath, outputFormat);
    }

    const bytes = await readFile(tempOutputPath);
    const stored = await getArtifactStorage().putObject(relativePath, bytes, {
      contentType: mimeType
    });

    return {
      relativePath,
      bytes: stored.bytes,
      mimeType: stored.contentType || mimeType
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function isRetryableTtsSegmentError(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }
  if (error.code !== errorCodes.TTS_FAILED) {
    return false;
  }

  const message = error.userMessage.toLowerCase();
  if (message.includes("timed out") || message.includes("finalizing the episode")) {
    return false;
  }
  return error.status >= 500;
}

function ttsSegmentRetryDelayMs(attempt: number, baseDelayMs: number): number {
  if (baseDelayMs <= 0) {
    return 0;
  }
  const exponential = Math.min(30_000, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.min(baseDelayMs, 1_000));
  return exponential + jitter;
}

function runBinary(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited with code ${code}`));
      }
    });
  });
}

async function concatenateAudioSegments(
  segmentPaths: string[],
  outPath: string,
  format: "mp3" | "m4a"
): Promise<void> {
  if (segmentPaths.length === 0) {
    throw new AppError(errorCodes.TTS_FAILED, "Audio generation produced no segments.", 500);
  }
  if (segmentPaths.length === 1) {
    const single = await readFile(segmentPaths[0]);
    await writeFile(outPath, single);
    return;
  }

  const concatManifestPath = join(tmpdir(), `articlepod-concat-${randomBytes(6).toString("hex")}.txt`);
  const escapePath = (value: string) => value.replace(/'/g, "'\\''");
  const manifest = segmentPaths.map((path) => `file '${escapePath(path)}'`).join("\n");
  await writeFile(concatManifestPath, `${manifest}\n`, "utf8");

  try {
    try {
      await runBinary("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatManifestPath, "-c", "copy", outPath]);
      return;
    } catch {
      if (format === "m4a") {
        await runBinary("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatManifestPath, "-c:a", "aac", outPath]);
      } else {
        await runBinary("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatManifestPath, "-codec:a", "libmp3lame", outPath]);
      }
    }
  } catch {
    throw new AppError(
      errorCodes.TTS_FAILED,
      "Audio processing failed while finalizing the episode. Please retry.",
      500
    );
  } finally {
    await rm(concatManifestPath, { force: true });
  }
}

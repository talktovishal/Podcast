import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { AppError, errorCodes } from "../errors/codes";
import { getLogContext } from "../logging/context";
import type { SynthesizeInput, TtsProvider, TtsProviderId } from "./types";

type PythonProviderId = Extract<TtsProviderId, "kokoro" | "melo">;

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

async function convertWavToTarget(inputWav: string, outPath: string, format: "mp3" | "m4a"): Promise<void> {
  if (format === "m4a") {
    try {
      await runBinary("afconvert", [inputWav, "-o", outPath, "-f", "m4af", "-d", "aac"]);
      return;
    } catch {
      await runBinary("ffmpeg", ["-y", "-i", inputWav, "-c:a", "aac", outPath]);
      return;
    }
  }

  try {
    await runBinary("afconvert", [inputWav, "-o", outPath, "-f", "MPG3", "-d", ".mp3"]);
    return;
  } catch {
    await runBinary("ffmpeg", ["-y", "-i", inputWav, "-codec:a", "libmp3lame", outPath]);
  }
}

export class PythonModelTtsProvider implements TtsProvider {
  readonly outputFormat = "m4a" as const;

  readonly providerId: PythonProviderId;

  private readonly baseUrl: string;

  private readonly timeoutMs: number;

  constructor(params: { providerId: PythonProviderId; baseUrl: string; timeoutMs?: number }) {
    this.providerId = params.providerId;
    this.baseUrl = params.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = params.timeoutMs ?? 120_000;
  }

  async synthesizeToFile({ text, voice, format, outPath, headers }: SynthesizeInput): Promise<void> {
    const workspace = await mkdtemp(join(tmpdir(), `listenlater-${this.providerId}-`));
    const wavPath = join(workspace, "speech.wav");
    const ctx = getLogContext();
    const requestHeaders: Record<string, string> = {
      "content-type": "application/json",
      ...(headers ?? {})
    };
    if (!requestHeaders["x-request-id"] && ctx.request_id) {
      requestHeaders["x-request-id"] = ctx.request_id;
    }
    if (!requestHeaders["x-job-id"] && ctx.job_id) {
      requestHeaders["x-job-id"] = ctx.job_id;
    }
    if (!requestHeaders["x-item-id"] && ctx.item_id) {
      requestHeaders["x-item-id"] = ctx.item_id;
    }
    if (!requestHeaders.traceparent && ctx.trace_id && ctx.span_id) {
      requestHeaders.traceparent = `00-${ctx.trace_id}-${ctx.span_id}-01`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/synthesize`, {
        method: "POST",
        headers: requestHeaders,
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          provider: this.providerId,
          voice,
          text
        })
      });

      if (!response.ok) {
        let detail = "";
        try {
          const parsed = (await response.json()) as { detail?: string };
          detail = parsed.detail || "";
        } catch {
          // fall through
        }
        throw new AppError(
          errorCodes.TTS_FAILED,
          detail || `Python ${this.providerId} provider failed (${response.status}).`,
          502
        );
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const buffer = Buffer.from(await response.arrayBuffer());

      if (contentType.includes("audio/wav") || contentType.includes("audio/x-wav")) {
        await writeFile(wavPath, buffer);
        await convertWavToTarget(wavPath, outPath, format);
        return;
      }

      await writeFile(outPath, buffer);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        errorCodes.TTS_FAILED,
        `Could not synthesize audio with ${this.providerId}. Ensure python-tts service is running.`,
        502
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
}

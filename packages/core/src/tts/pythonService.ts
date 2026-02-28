import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { AppError, errorCodes } from "../errors/codes";
import { getLogContext } from "../logging/context";
import type { SynthesizeInput, TtsProvider, TtsProviderId } from "./types";

type PythonProviderId = Extract<TtsProviderId, "kokoro" | "melo">;

// ---------------------------------------------------------------------------
// Simple in-memory circuit breaker for the Python TTS sidecar.
// Opens after CB_FAIL_THRESHOLD consecutive failures; stays open for
// CB_OPEN_DURATION_MS, then allows one probe (half-open) before closing.
// This prevents retry storms when the sidecar is down.
// ---------------------------------------------------------------------------
const CB_FAIL_THRESHOLD = 3;
const CB_OPEN_DURATION_MS = 30_000;

type CbState = "closed" | "open" | "half-open";

const _cb: { state: CbState; failCount: number; openedAt: number } = {
  state: "closed",
  failCount: 0,
  openedAt: 0
};

function _cbCheck(providerId: string): void {
  if (_cb.state === "closed") return;
  if (_cb.state === "open") {
    if (Date.now() - _cb.openedAt >= CB_OPEN_DURATION_MS) {
      _cb.state = "half-open";
      return;
    }
    throw new AppError(
      errorCodes.TTS_FAILED,
      `${providerId} TTS service is temporarily unavailable. Try again shortly.`,
      503
    );
  }
  // half-open: allow one probe through
}

function _cbSuccess(): void {
  _cb.state = "closed";
  _cb.failCount = 0;
}

function _cbFailure(): void {
  if (_cb.state === "half-open") {
    _cb.state = "open";
    _cb.openedAt = Date.now();
    return;
  }
  _cb.failCount++;
  if (_cb.failCount >= CB_FAIL_THRESHOLD) {
    _cb.state = "open";
    _cb.openedAt = Date.now();
  }
}

function sanitizeServiceDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    for (const entry of detail) {
      const normalized = sanitizeServiceDetail(entry);
      if (normalized) {
        return normalized;
      }
    }
    return "";
  }

  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    if (typeof record.msg === "string" && record.msg.trim()) {
      const location = Array.isArray(record.loc) ? record.loc.join(".") : "";
      const prefix = location ? `${location}: ` : "";
      return `${prefix}${record.msg.trim()}`;
    }
    if (typeof record.detail === "string" && record.detail.trim()) {
      return record.detail.trim();
    }
  }

  return "";
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
  readonly outputFormat = "mp3" as const;

  readonly providerId: PythonProviderId;

  private readonly baseUrl: string;

  private readonly timeoutMs: number;

  private readonly sidecarSecret: string | undefined;

  constructor(params: { providerId: PythonProviderId; baseUrl: string; timeoutMs?: number; sidecarSecret?: string }) {
    this.providerId = params.providerId;
    this.baseUrl = params.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = params.timeoutMs ?? 120_000;
    this.sidecarSecret = params.sidecarSecret;
  }

  async synthesizeToFile({ text, voice, format, outPath, headers }: SynthesizeInput): Promise<void> {
    // Fail fast if the sidecar has been continuously failing.
    _cbCheck(this.providerId);
    const workspace = await mkdtemp(join(tmpdir(), `articlepod-${this.providerId}-`));
    const wavPath = join(workspace, "speech.wav");
    const ctx = getLogContext();
    const requestHeaders: Record<string, string> = {
      "content-type": "application/json",
      ...(headers ?? {})
    };
    if (this.sidecarSecret) {
      requestHeaders["x-sidecar-secret"] = this.sidecarSecret;
    }
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
          const parsed = (await response.json()) as { detail?: unknown };
          detail = sanitizeServiceDetail(parsed.detail);
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
        _cbSuccess();
        return;
      }

      await writeFile(outPath, buffer);
      _cbSuccess();
    } catch (error) {
      if (error instanceof AppError) {
        // Don't trip the breaker for the breaker's own 503 rejection.
        if (error.status !== 503) {
          _cbFailure();
        }
        throw error;
      }
      _cbFailure();
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

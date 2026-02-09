import { appendFile, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { redactAttributes } from "./redaction";
import { getLogContext } from "./context";
import type { LogContext, LogEvent, LogLevel } from "./types";

type LoggerOptions = {
  service: string;
  env: string;
  logRoot: string;
  fileName?: string;
  maxBytes?: number;
  maxFiles?: number;
  retentionDays?: number;
};

const rotationState = new Map<string, Promise<void>>();

async function rotateIfNeeded(filePath: string, maxBytes: number, maxFiles: number, retentionDays: number): Promise<void> {
  let rotateRun = rotationState.get(filePath);
  if (rotateRun) {
    return rotateRun;
  }

  rotateRun = (async () => {
    const now = Date.now();
    const dir = dirname(filePath);
    const base = filePath.split("/").pop() || "app.log.jsonl";
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;

    try {
      const current = await stat(filePath);
      if (current.size > maxBytes) {
        const rotated = `${filePath}.${new Date(now).toISOString().replace(/[:.]/g, "-")}`;
        await rename(filePath, rotated);
        await appendFile(filePath, "", "utf8");
      }

      const contents = await readdir(dir);
      const candidates = contents
        .filter((entry) => entry.startsWith(`${base}.`))
        .map((entry) => join(dir, entry));
      const withStats = await Promise.all(
        candidates.map(async (candidate) => ({
          candidate,
          stats: await stat(candidate)
        }))
      );

      const expired = withStats.filter((entry) => entry.stats.mtimeMs < cutoff);
      for (const entry of expired) {
        await unlink(entry.candidate);
      }

      const sorted = withStats
        .filter((entry) => entry.stats.mtimeMs >= cutoff)
        .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
      for (const extra of sorted.slice(maxFiles)) {
        await unlink(extra.candidate);
      }
    } catch {
      // Best-effort rotation.
    }
  })().finally(() => {
    rotationState.delete(filePath);
  });

  rotationState.set(filePath, rotateRun);
  await rotateRun;
}

function formatEvent(
  base: Omit<LogEvent, "ts" | "level" | "service" | "env">,
  level: LogLevel,
  options: LoggerOptions
): LogEvent {
  const ctx = getLogContext();
  const supportId = base.support_id ?? (level === "ERROR" || level === "FATAL" ? randomUUID() : undefined);
  return {
    ts: new Date().toISOString(),
    level,
    service: options.service,
    env: options.env,
    msg: base.msg,
    error_code: base.error_code,
    trace_id: base.trace_id ?? ctx.trace_id,
    span_id: base.span_id ?? ctx.span_id,
    request_id: base.request_id ?? ctx.request_id,
    job_id: base.job_id ?? ctx.job_id,
    item_id: base.item_id ?? ctx.item_id,
    user_id_hash: base.user_id_hash ?? ctx.user_id_hash,
    support_id: supportId,
    attrs: redactAttributes(base.attrs)
  };
}

export type StructuredLogInput = {
  msg: string;
  error_code?: string;
  attrs?: Record<string, unknown>;
} & LogContext;

export type StructuredLogger = {
  debug: (msg: string, attrs?: Record<string, unknown>, ctx?: LogContext) => Promise<void>;
  info: (msg: string, attrs?: Record<string, unknown>, ctx?: LogContext) => Promise<void>;
  warn: (msg: string, attrs?: Record<string, unknown>, ctx?: LogContext) => Promise<void>;
  error: (msg: string, attrs?: Record<string, unknown>, ctx?: LogContext) => Promise<string>;
  errorWithCode: (input: StructuredLogInput) => Promise<string>;
  fatal: (msg: string, attrs?: Record<string, unknown>, ctx?: LogContext) => Promise<string>;
};

export function createStructuredLogger(options: LoggerOptions): StructuredLogger {
  const fileName = options.fileName ?? "app.log.jsonl";
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const maxFiles = options.maxFiles ?? 10;
  const retentionDays = options.retentionDays ?? 14;
  const filePath = join(options.logRoot, options.service, fileName);

  async function write(
    level: LogLevel,
    msg: string,
    attrs?: Record<string, unknown>,
    ctx?: LogContext,
    errorCode?: string
  ): Promise<string | undefined> {
    const event = formatEvent(
      {
        msg,
        attrs,
        error_code: errorCode,
        ...ctx
      },
      level,
      options
    );

    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
    await rotateIfNeeded(filePath, maxBytes, maxFiles, retentionDays);
    if (process.env.LISTENLATER_CONSOLE_LOGS === "1") {
      const printable = `${event.ts} ${event.level} ${event.service} ${event.msg}`;
      // eslint-disable-next-line no-console
      console.log(printable);
    }
    return event.support_id;
  }

  return {
    debug: (msg, attrs, ctx) => write("DEBUG", msg, attrs, ctx).then(() => undefined),
    info: (msg, attrs, ctx) => write("INFO", msg, attrs, ctx).then(() => undefined),
    warn: (msg, attrs, ctx) => write("WARN", msg, attrs, ctx).then(() => undefined),
    error: async (msg, attrs, ctx) => (await write("ERROR", msg, attrs, ctx)) ?? "",
    errorWithCode: async (input) =>
      (await write("ERROR", input.msg, input.attrs, {
        trace_id: input.trace_id,
        span_id: input.span_id,
        request_id: input.request_id,
        job_id: input.job_id,
        item_id: input.item_id,
        user_id_hash: input.user_id_hash
      }, input.error_code)) ?? "",
    fatal: async (msg, attrs, ctx) => (await write("FATAL", msg, attrs, ctx)) ?? ""
  };
}

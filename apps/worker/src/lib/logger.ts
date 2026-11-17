import { createStructuredLogger } from "@articlepod/core";
import { workerEnv } from "./env.js";

export function formatDiagnostic(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

export const workerLogger = createStructuredLogger({
  service: "worker",
  env: workerEnv.runtimeProfile,
  logRoot: workerEnv.logRoot,
  maxBytes: workerEnv.logMaxBytes,
  maxFiles: workerEnv.logMaxFiles,
  retentionDays: workerEnv.logRetentionDays,
  errorRetentionDays: workerEnv.logErrorRetentionDays
});

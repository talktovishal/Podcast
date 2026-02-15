import { createStructuredLogger } from "@articlepod/core";
import { workerEnv } from "./env.js";

export const workerLogger = createStructuredLogger({
  service: "worker",
  env: workerEnv.runtimeProfile,
  logRoot: workerEnv.logRoot,
  maxBytes: workerEnv.logMaxBytes,
  maxFiles: workerEnv.logMaxFiles,
  retentionDays: workerEnv.logRetentionDays
});

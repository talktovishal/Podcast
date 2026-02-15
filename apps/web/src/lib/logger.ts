import { createStructuredLogger } from "@articlepod/core";
import { env } from "@/lib/env";

export const logger = createStructuredLogger({
  service: "web",
  env: env.runtimeProfile,
  logRoot: env.logRoot,
  maxBytes: env.logMaxBytes,
  maxFiles: env.logMaxFiles,
  retentionDays: env.logRetentionDays
});

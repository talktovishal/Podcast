import { mkdir } from "node:fs/promises";
import { env } from "./env";

export async function ensureDataDirs(): Promise<void> {
  if (env.storageBackend !== "azure_blob") {
    await mkdir(env.storageRoot, { recursive: true });
  }
  await mkdir(env.mediaRoot, { recursive: true });
  await mkdir(env.uploadRoot, { recursive: true });
}

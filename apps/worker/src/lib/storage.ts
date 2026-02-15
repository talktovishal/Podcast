import { AzureBlobObjectStorage, LocalObjectStorage, type ObjectStorage } from "@articlepod/core";
import { workerEnv } from "./env.js";

let cachedStorage: ObjectStorage | null = null;

export function getArtifactStorage(): ObjectStorage {
  if (cachedStorage) {
    return cachedStorage;
  }

  cachedStorage =
    workerEnv.storageBackend === "azure_blob"
      ? new AzureBlobObjectStorage({
          container: workerEnv.storageContainer,
          connectionString: workerEnv.azureStorageConnectionString,
          accountUrl: workerEnv.azureStorageAccountUrl,
          sasToken: workerEnv.azureStorageSasToken,
          createContainerIfMissing: workerEnv.azureStorageCreateContainer
        })
      : new LocalObjectStorage(workerEnv.storageRoot);

  return cachedStorage;
}

export function normalizeStorageKey(key: string): string {
  return key.replace(/^\/+/, "").replace(/\\/g, "/");
}

export function isLikelyLegacyAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

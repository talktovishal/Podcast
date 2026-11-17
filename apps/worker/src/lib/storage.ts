import { AzureBlobObjectStorage, LocalObjectStorage, normalizeStorageKey, isLikelyLegacyAbsolutePath, type ObjectStorage } from "@articlepod/core";
import { workerEnv } from "./env.js";

export { normalizeStorageKey, isLikelyLegacyAbsolutePath };

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

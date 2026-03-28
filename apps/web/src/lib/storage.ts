import {
  AppError,
  AzureBlobObjectStorage,
  LocalObjectStorage,
  errorCodes,
  normalizeStorageKey,
  isLikelyLegacyAbsolutePath,
  type ObjectStorage
} from "@articlepod/core";
import { env } from "./env";

export { normalizeStorageKey, isLikelyLegacyAbsolutePath };

let cachedStorage: ObjectStorage | null = null;

function makeAzureStorage(): ObjectStorage {
  try {
    return new AzureBlobObjectStorage({
      container: env.storageContainer,
      connectionString: env.azureStorageConnectionString,
      accountUrl: env.azureStorageAccountUrl,
      sasToken: env.azureStorageSasToken,
      createContainerIfMissing: env.azureStorageCreateContainer
    });
  } catch (error) {
    throw new AppError(
      errorCodes.STORAGE_FAILED,
      error instanceof Error ? error.message : "Azure Blob storage is not configured correctly.",
      500
    );
  }
}

export function getArtifactStorage(): ObjectStorage {
  if (cachedStorage) {
    return cachedStorage;
  }

  cachedStorage = env.storageBackend === "azure_blob" ? makeAzureStorage() : new LocalObjectStorage(env.storageRoot);
  return cachedStorage;
}

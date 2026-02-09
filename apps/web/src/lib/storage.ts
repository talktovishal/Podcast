import {
  AppError,
  AzureBlobObjectStorage,
  LocalObjectStorage,
  errorCodes,
  type ObjectStorage
} from "@listenlater/core";
import { env } from "./env";

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

export function normalizeStorageKey(key: string): string {
  return key.replace(/^\/+/, "").replace(/\\/g, "/");
}

export function isLikelyLegacyAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

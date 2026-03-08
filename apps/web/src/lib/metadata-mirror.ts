import {
  AzureTableQueueMetadataMirror,
  NoopQueueMetadataMirror,
  type QueueMetadataMirror
} from "@articlepod/core";
import { env } from "./env";

function mirrorNeedsRemoteStore(forceEnabled = false): boolean {
  if (forceEnabled) {
    return env.metadataMirrorBackend === "azure_table";
  }
  return env.metadataMirrorBackend === "azure_table" && (env.metadataMirrorDualWrite || env.metadataCanaryCompare);
}

function createMetadataMirror(forceEnabled = false): QueueMetadataMirror {
  if (!mirrorNeedsRemoteStore(forceEnabled)) {
    return new NoopQueueMetadataMirror();
  }

  return new AzureTableQueueMetadataMirror({
    tablePrefix: env.azureTablePrefix,
    connectionString: env.azureTableConnectionString,
    accountUrl: env.azureTableAccountUrl,
    sasToken: env.azureTableSasToken,
    createTablesIfMissing: env.azureTableCreateTables
  });
}

export const webMetadataMirror = createMetadataMirror();
export const createWebMetadataMirror = createMetadataMirror;

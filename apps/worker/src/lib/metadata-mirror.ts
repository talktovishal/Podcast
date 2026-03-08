import {
  AzureTableQueueMetadataMirror,
  NoopQueueMetadataMirror,
  type QueueMetadataMirror
} from "@articlepod/core";
import { workerEnv } from "./env.js";

function mirrorNeedsRemoteStore(forceEnabled = false): boolean {
  if (forceEnabled) {
    return workerEnv.metadataMirrorBackend === "azure_table";
  }

  return (
    workerEnv.metadataMirrorBackend === "azure_table" &&
    (workerEnv.metadataMirrorDualWrite || workerEnv.metadataCanaryCompare || workerEnv.queuePressureSource === "mirror")
  );
}

function createMetadataMirror(forceEnabled = false): QueueMetadataMirror {
  if (!mirrorNeedsRemoteStore(forceEnabled)) {
    return new NoopQueueMetadataMirror();
  }

  return new AzureTableQueueMetadataMirror({
    tablePrefix: workerEnv.azureTablePrefix,
    connectionString: workerEnv.azureTableConnectionString,
    accountUrl: workerEnv.azureTableAccountUrl,
    sasToken: workerEnv.azureTableSasToken,
    createTablesIfMissing: workerEnv.azureTableCreateTables
  });
}

export const workerMetadataMirror = createMetadataMirror();
export const createWorkerMetadataMirror = createMetadataMirror;

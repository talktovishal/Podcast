import { AzureTablePrimaryStore } from "@articlepod/core";
import { workerEnv } from "./env.js";

export function workerUsesAzureTablePrimary(): boolean {
  return workerEnv.metadataPrimaryBackend === "azure_table";
}

function createPrimaryStore(): AzureTablePrimaryStore | null {
  if (!workerUsesAzureTablePrimary()) {
    return null;
  }

  return new AzureTablePrimaryStore({
    tablePrefix: workerEnv.azureTablePrefix,
    connectionString: workerEnv.azureTableConnectionString,
    accountUrl: workerEnv.azureTableAccountUrl,
    sasToken: workerEnv.azureTableSasToken,
    createTablesIfMissing: workerEnv.azureTableCreateTables
  });
}

export const workerPrimaryStore = createPrimaryStore();

import { AzureTablePrimaryStore } from "@articlepod/core";
import { env, isProductionBuild } from "./env";

export function webUsesAzureTablePrimary(): boolean {
  return env.metadataPrimaryBackend === "azure_table";
}

function createPrimaryStore(): AzureTablePrimaryStore | null {
  if (!webUsesAzureTablePrimary()) {
    return null;
  }

  return new AzureTablePrimaryStore({
    tablePrefix: env.azureTablePrefix,
    connectionString: env.azureTableConnectionString,
    accountUrl: env.azureTableAccountUrl,
    sasToken: env.azureTableSasToken,
    createTablesIfMissing: env.azureTableCreateTables,
    deferInitialization: isProductionBuild
  });
}

export const webPrimaryStore = createPrimaryStore();

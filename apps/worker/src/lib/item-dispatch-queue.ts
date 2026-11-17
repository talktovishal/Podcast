import { AzureStorageDispatchQueue, PrismaDispatchQueue, type DispatchQueueAdapter } from "@articlepod/core";
import { workerEnv } from "./env.js";
import { prisma } from "./prisma.js";

let azureQueue: AzureStorageDispatchQueue | null = null;

function createAzureQueue(): AzureStorageDispatchQueue {
  if (!azureQueue) {
    azureQueue = new AzureStorageDispatchQueue({
      queueName: workerEnv.itemDispatchQueueName,
      connectionString: workerEnv.azureStorageConnectionString,
      accountUrl: workerEnv.azureStorageAccountUrl,
      sasToken: workerEnv.azureStorageSasToken,
      createQueueIfMissing: workerEnv.itemDispatchCreateQueue
    });
  }
  return azureQueue;
}

export function createWorkerItemDispatchQueue(): DispatchQueueAdapter {
  if (workerEnv.itemDispatchBackend === "azure_queue") {
    return createAzureQueue();
  }
  return new PrismaDispatchQueue(prisma);
}

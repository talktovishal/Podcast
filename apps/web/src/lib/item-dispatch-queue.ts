import type { Prisma, PrismaClient } from "@prisma/client";
import {
  AzureStorageDispatchQueue,
  PrismaDispatchQueue,
  type DispatchQueueAdapter,
  type DispatchQueueMessage
} from "@articlepod/core";
import { env } from "./env";
import { prisma } from "./prisma";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

let azureQueue: AzureStorageDispatchQueue | null = null;

function createAzureQueue(): AzureStorageDispatchQueue {
  if (!azureQueue) {
    azureQueue = new AzureStorageDispatchQueue({
      queueName: env.itemDispatchQueueName,
      connectionString: env.azureStorageConnectionString,
      accountUrl: env.azureStorageAccountUrl,
      sasToken: env.azureStorageSasToken,
      createQueueIfMissing: env.itemDispatchCreateQueue
    });
  }
  return azureQueue;
}

export function createWebItemDispatchQueue(client?: PrismaLike): DispatchQueueAdapter {
  if (env.itemDispatchBackend === "azure_queue") {
    return createAzureQueue();
  }
  return new PrismaDispatchQueue(client ?? prisma);
}

export function webUsesPrismaDispatchQueue(): boolean {
  return env.itemDispatchBackend === "prisma";
}

export async function enqueueItemDispatchMessage(input: {
  jobId: string;
  visibleAt?: Date;
  client?: PrismaLike;
}): Promise<DispatchQueueMessage> {
  return createWebItemDispatchQueue(input.client).enqueue({
    jobId: input.jobId,
    kind: "ITEM",
    visibleAt: input.visibleAt
  });
}

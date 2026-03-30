import { QueueClient, QueueServiceClient } from "@azure/storage-queue";
import type { DispatchQueueAdapter, DispatchQueueJobKind, DispatchQueueMessage, ReservedDispatchQueueMessage } from "./types";

type QueuePayload = {
  jobId: string;
  kind: DispatchQueueJobKind;
};

function formatSasUrl(accountUrl: string, sasToken: string): string {
  const trimmedAccount = accountUrl.replace(/\/+$/, "");
  const trimmedToken = sasToken.replace(/^\?+/, "");
  return `${trimmedAccount}?${trimmedToken}`;
}

function deriveQueueAccountUrl(accountUrl: string): string {
  const normalized = accountUrl.replace(/\/+$/, "");
  if (normalized.includes(".queue.")) {
    return normalized;
  }
  if (normalized.includes(".blob.")) {
    return normalized.replace(".blob.", ".queue.");
  }
  return normalized;
}

function visibilityTimeoutSeconds(visibleAt: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((visibleAt.getTime() - now.getTime()) / 1000));
}

function parsePayload(messageText: string): QueuePayload {
  const parsed = JSON.parse(messageText) as Partial<QueuePayload>;
  if (!parsed.jobId || parsed.kind !== "ITEM") {
    throw new Error("Invalid dispatch queue payload.");
  }
  return { jobId: parsed.jobId, kind: parsed.kind };
}

function encodePayload(payload: QueuePayload): string {
  return JSON.stringify(payload);
}

export class AzureStorageDispatchQueue implements DispatchQueueAdapter {
  readonly backend = "azure_queue" as const;

  private readonly queueClient: QueueClient;
  private readonly ensureQueuePromise: Promise<void>;

  constructor(input: {
    queueName: string;
    connectionString?: string;
    accountUrl?: string;
    sasToken?: string;
    createQueueIfMissing?: boolean;
  }) {
    if (input.connectionString) {
      this.queueClient = QueueServiceClient.fromConnectionString(input.connectionString).getQueueClient(input.queueName);
    } else if (input.accountUrl && input.sasToken) {
      const queueAccountUrl = deriveQueueAccountUrl(input.accountUrl);
      this.queueClient = new QueueClient(`${formatSasUrl(queueAccountUrl, input.sasToken)}/${input.queueName}`);
    } else {
      throw new Error("Azure dispatch queue requires connection string or accountUrl + sasToken.");
    }

    const shouldCreate = input.createQueueIfMissing ?? true;
    this.ensureQueuePromise = shouldCreate ? this.queueClient.createIfNotExists().then(() => undefined) : Promise.resolve();
  }

  private async ready(): Promise<QueueClient> {
    await this.ensureQueuePromise;
    return this.queueClient;
  }

  async enqueue(input: { jobId: string; kind: DispatchQueueJobKind; visibleAt?: Date }): Promise<DispatchQueueMessage> {
    const queue = await this.ready();
    const visibleAt = input.visibleAt ?? new Date();
    const response = await queue.sendMessage(encodePayload({ jobId: input.jobId, kind: input.kind }), {
      visibilityTimeout: visibilityTimeoutSeconds(visibleAt)
    });
    return {
      messageId: response.messageId,
      jobId: input.jobId,
      kind: input.kind,
      visibleAt: response.nextVisibleOn ?? visibleAt,
      dequeueCount: 0
    };
  }

  async reserveNext(input: { visibilityTimeoutMs: number; reservedBy?: string; now?: Date }): Promise<ReservedDispatchQueueMessage | null> {
    const queue = await this.ready();
    const response = await queue.receiveMessages({
      numberOfMessages: 1,
      visibilityTimeout: Math.max(1, Math.ceil(input.visibilityTimeoutMs / 1000))
    });
    const message = response.receivedMessageItems[0];
    if (!message || !message.popReceipt) {
      return null;
    }
    const payload = parsePayload(message.messageText);
    return {
      messageId: message.messageId,
      receipt: message.popReceipt,
      jobId: payload.jobId,
      kind: payload.kind,
      visibleAt: message.nextVisibleOn ?? new Date(Date.now() + input.visibilityTimeoutMs),
      dequeueCount: message.dequeueCount ?? 0
    };
  }

  async renew(input: {
    messageId: string;
    receipt: string;
    jobId: string;
    kind: DispatchQueueJobKind;
    visibleAt: Date;
    reservedBy?: string;
  }): Promise<ReservedDispatchQueueMessage | null> {
    const queue = await this.ready();
    const response = await queue.updateMessage(
      input.messageId,
      input.receipt,
      encodePayload({ jobId: input.jobId, kind: input.kind }),
      visibilityTimeoutSeconds(input.visibleAt)
    );
    if (!response.popReceipt) {
      return null;
    }
    return {
      messageId: input.messageId,
      receipt: response.popReceipt,
      jobId: input.jobId,
      kind: input.kind,
      visibleAt: response.nextVisibleOn ?? input.visibleAt,
      dequeueCount: 0
    };
  }

  async release(input: {
    messageId: string;
    receipt: string;
    jobId: string;
    kind: DispatchQueueJobKind;
    visibleAt: Date;
    reservedBy?: string;
  }): Promise<ReservedDispatchQueueMessage | null> {
    return this.renew(input);
  }

  async delete(input: { messageId: string; receipt: string }): Promise<boolean> {
    const queue = await this.ready();
    try {
      await queue.deleteMessage(input.messageId, input.receipt);
      return true;
    } catch {
      return false;
    }
  }
}

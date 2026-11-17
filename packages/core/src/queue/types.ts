export type DispatchQueueBackendId = "azure_queue" | "prisma";
export type DispatchQueueJobKind = "ITEM";

export type DispatchQueueMessage = {
  messageId: string;
  jobId: string;
  kind: DispatchQueueJobKind;
  visibleAt: Date;
  dequeueCount: number;
};

export type ReservedDispatchQueueMessage = DispatchQueueMessage & {
  receipt: string;
};

export interface DispatchQueueAdapter {
  readonly backend: DispatchQueueBackendId;
  enqueue(input: { jobId: string; kind: DispatchQueueJobKind; visibleAt?: Date }): Promise<DispatchQueueMessage>;
  reserveNext(input: { visibilityTimeoutMs: number; reservedBy?: string; now?: Date }): Promise<ReservedDispatchQueueMessage | null>;
  renew(input: {
    messageId: string;
    receipt: string;
    jobId: string;
    kind: DispatchQueueJobKind;
    visibleAt: Date;
    reservedBy?: string;
  }): Promise<ReservedDispatchQueueMessage | null>;
  release(input: {
    messageId: string;
    receipt: string;
    jobId: string;
    kind: DispatchQueueJobKind;
    visibleAt: Date;
    reservedBy?: string;
  }): Promise<ReservedDispatchQueueMessage | null>;
  delete(input: { messageId: string; receipt: string }): Promise<boolean>;
}

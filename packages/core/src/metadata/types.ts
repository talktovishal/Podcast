export type MetadataMirrorBackendId = "none" | "azure_table";

export type ItemQueueProjection = {
  id: string;
  userId: string;
  sourceType: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type JobQueueProjection = {
  id: string;
  itemId: string;
  status: string;
  attempt: number;
  createdAt: Date;
  updatedAt: Date;
  lockedAt?: Date | null;
  nextRetryAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type DigestRunProjection = {
  id: string;
  userId: string;
  cadence: string;
  periodKey: string;
  status: string;
  attempt: number;
  createdAt: Date;
  updatedAt: Date;
  scheduledFor: Date;
  lockedAt?: Date | null;
  nextRetryAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type QueuePressureMirrorSnapshot = {
  capturedAt: Date;
  queuedJobs: number;
  retryableFailedJobs: number;
  processingJobs: number;
  eligibleJobs: number;
  oldestEligibleJobCreatedAt: Date | null;
  oldestEligibleJobAgeMs: number;
};

export interface QueueMetadataMirror {
  readonly backend: MetadataMirrorBackendId;
  readonly enabled: boolean;
  upsertItemProjection(input: ItemQueueProjection): Promise<void>;
  upsertJobProjection(input: JobQueueProjection): Promise<void>;
  upsertDigestRunProjection(input: DigestRunProjection): Promise<void>;
  deleteItemProjection(itemId: string): Promise<void>;
  deleteJobProjection(jobId: string): Promise<void>;
  deleteDigestRunProjection(digestRunId: string): Promise<void>;
  getQueuePressureSnapshot(input: { now: Date; maxRetryAttempts: number }): Promise<QueuePressureMirrorSnapshot | null>;
}

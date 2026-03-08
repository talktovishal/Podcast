import type {
  DigestRunProjection,
  ItemQueueProjection,
  JobQueueProjection,
  QueueMetadataMirror,
  QueuePressureMirrorSnapshot
} from "./types";

export class NoopQueueMetadataMirror implements QueueMetadataMirror {
  readonly backend = "none" as const;
  readonly enabled = false;

  async upsertItemProjection(_input: ItemQueueProjection): Promise<void> {}

  async upsertJobProjection(_input: JobQueueProjection): Promise<void> {}

  async upsertDigestRunProjection(_input: DigestRunProjection): Promise<void> {}

  async deleteItemProjection(_itemId: string): Promise<void> {}

  async deleteJobProjection(_jobId: string): Promise<void> {}

  async deleteDigestRunProjection(_digestRunId: string): Promise<void> {}

  async getQueuePressureSnapshot(_input: { now: Date; maxRetryAttempts: number }): Promise<QueuePressureMirrorSnapshot | null> {
    return null;
  }
}

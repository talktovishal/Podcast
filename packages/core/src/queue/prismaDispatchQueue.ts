import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { DispatchQueueAdapter, DispatchQueueJobKind, DispatchQueueMessage, ReservedDispatchQueueMessage } from "./types";

type PrismaLike = {
  dispatchQueueMessage: {
    findUnique(args: Prisma.DispatchQueueMessageFindUniqueArgs): Promise<DispatchQueueRow | null>;
    create(args: Prisma.DispatchQueueMessageCreateArgs): Promise<DispatchQueueRow>;
    findFirst(
      args: Prisma.DispatchQueueMessageFindFirstArgs
    ): Promise<(DispatchQueueRow & { updatedAt: Date }) | null>;
    updateMany(args: Prisma.DispatchQueueMessageUpdateManyArgs): Promise<{ count: number }>;
    deleteMany(args: Prisma.DispatchQueueMessageDeleteManyArgs): Promise<{ count: number }>;
  };
};

type DispatchQueueRow = {
  id: string;
  jobId: string;
  jobKind: string;
  visibleAt: Date;
  dequeueCount: number;
  reservationToken: string | null;
};

function toMessage(row: DispatchQueueRow): DispatchQueueMessage {
  return {
    messageId: row.id,
    jobId: row.jobId,
    kind: row.jobKind === "ITEM" ? "ITEM" : "ITEM",
    visibleAt: row.visibleAt,
    dequeueCount: row.dequeueCount
  };
}

export class PrismaDispatchQueue implements DispatchQueueAdapter {
  readonly backend = "prisma" as const;

  constructor(private readonly prisma: PrismaLike) {}

  private async findByJobId(jobId: string): Promise<DispatchQueueRow | null> {
    return this.prisma.dispatchQueueMessage.findUnique({
      where: { jobId },
      select: {
        id: true,
        jobId: true,
        jobKind: true,
        visibleAt: true,
        dequeueCount: true,
        reservationToken: true
      }
    });
  }

  async enqueue(input: { jobId: string; kind: DispatchQueueJobKind; visibleAt?: Date }): Promise<DispatchQueueMessage> {
    const existing = await this.findByJobId(input.jobId);
    if (existing) {
      return toMessage(existing);
    }

    try {
      const created = await this.prisma.dispatchQueueMessage.create({
        data: {
          jobId: input.jobId,
          jobKind: input.kind,
          visibleAt: input.visibleAt ?? new Date()
        },
        select: {
          id: true,
          jobId: true,
          jobKind: true,
          visibleAt: true,
          dequeueCount: true,
          reservationToken: true
        }
      });
      return toMessage(created);
    } catch {
      const retried = await this.findByJobId(input.jobId);
      if (!retried) {
        throw new Error(`Could not enqueue dispatch message for job ${input.jobId}.`);
      }
      return toMessage(retried);
    }
  }

  async reserveNext(input: { visibilityTimeoutMs: number; reservedBy?: string; now?: Date }): Promise<ReservedDispatchQueueMessage | null> {
    const now = input.now ?? new Date();
    const next = await this.prisma.dispatchQueueMessage.findFirst({
      where: {
        visibleAt: { lte: now }
      },
      orderBy: [{ visibleAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        jobId: true,
        jobKind: true,
        visibleAt: true,
        dequeueCount: true,
        reservationToken: true,
        updatedAt: true
      }
    });

    if (!next) {
      return null;
    }

    const receipt = randomUUID();
    const visibleAt = new Date(now.getTime() + input.visibilityTimeoutMs);
    const claimed = await this.prisma.dispatchQueueMessage.updateMany({
      where: {
        id: next.id,
        updatedAt: next.updatedAt
      },
      data: {
        visibleAt,
        dequeueCount: next.dequeueCount + 1,
        reservationToken: receipt,
        reservedBy: input.reservedBy ?? null,
        reservedAt: now
      }
    });

    if (claimed.count !== 1) {
      return null;
    }

    return {
      messageId: next.id,
      receipt,
      jobId: next.jobId,
      kind: next.jobKind === "ITEM" ? "ITEM" : "ITEM",
      visibleAt,
      dequeueCount: next.dequeueCount + 1
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
    const nextReceipt = randomUUID();
    const updated = await this.prisma.dispatchQueueMessage.updateMany({
      where: {
        id: input.messageId,
        reservationToken: input.receipt
      },
      data: {
        visibleAt: input.visibleAt,
        reservationToken: nextReceipt,
        reservedBy: input.reservedBy ?? null,
        reservedAt: new Date()
      }
    });
    if (updated.count !== 1) {
      return null;
    }
    const row = await this.prisma.dispatchQueueMessage.findUnique({
      where: { id: input.messageId },
      select: {
        id: true,
        jobId: true,
        jobKind: true,
        visibleAt: true,
        dequeueCount: true,
        reservationToken: true
      }
    });
    if (!row || !row.reservationToken) {
      return null;
    }
    return {
      messageId: row.id,
      receipt: row.reservationToken,
      jobId: row.jobId,
      kind: row.jobKind === "ITEM" ? "ITEM" : "ITEM",
      visibleAt: row.visibleAt,
      dequeueCount: row.dequeueCount
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
    const deleted = await this.prisma.dispatchQueueMessage.deleteMany({
      where: {
        id: input.messageId,
        reservationToken: input.receipt
      }
    });
    return deleted.count === 1;
  }
}

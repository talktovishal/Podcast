import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { findPrimaryUserById } from "./metadata-primary-auth";
import { prisma } from "./prisma";

export type FeedbackRecord = {
  id: string;
  userId: string;
  message: string;
  feedbackType: string | null;
  featureArea: string | null;
  allowEmailContact: boolean;
  status: string;
  sourcePath: string | null;
  mirrorStatus: string;
  mirrorIssueNumber: number | null;
  mirrorIssueUrl: string | null;
  mirrorAttemptedAt: Date | null;
  mirrorErrorCode: string | null;
  mirrorErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FeedbackAdminRow = FeedbackRecord & {
  userEmail: string | null;
};

export type FeedbackAdminQuery = {
  status?: string;
  feedbackType?: string;
  featureArea?: string;
  mirrorStatus?: string;
  q?: string;
  page: number;
  pageSize: number;
};

function mapPrismaFeedback(
  row: {
    id: string;
    userId: string;
    message: string;
    feedbackType: string | null;
    featureArea: string | null;
    allowEmailContact: boolean;
    status: string;
    sourcePath: string | null;
    mirrorStatus: string;
    mirrorIssueNumber: number | null;
    mirrorIssueUrl: string | null;
    mirrorAttemptedAt: Date | null;
    mirrorErrorCode: string | null;
    mirrorErrorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }
): FeedbackRecord {
  return {
    id: row.id,
    userId: row.userId,
    message: row.message,
    feedbackType: row.feedbackType,
    featureArea: row.featureArea,
    allowEmailContact: row.allowEmailContact,
    status: row.status,
    sourcePath: row.sourcePath,
    mirrorStatus: row.mirrorStatus,
    mirrorIssueNumber: row.mirrorIssueNumber,
    mirrorIssueUrl: row.mirrorIssueUrl,
    mirrorAttemptedAt: row.mirrorAttemptedAt,
    mirrorErrorCode: row.mirrorErrorCode,
    mirrorErrorMessage: row.mirrorErrorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function sortNewestFirst<T extends { createdAt: Date; updatedAt: Date; id: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() ||
      b.updatedAt.getTime() - a.updatedAt.getTime() ||
      a.id.localeCompare(b.id)
  );
}

function requireAzureFeedbackStore() {
  if (!webPrimaryStore) {
    throw new Error("Azure Table primary store is not configured.");
  }
  return webPrimaryStore;
}

export async function createFeedback(input: {
  userId: string;
  message: string;
  feedbackType?: string | null;
  featureArea?: string | null;
  allowEmailContact?: boolean;
  status?: string;
  sourcePath?: string | null;
  mirrorStatus?: string;
}): Promise<FeedbackRecord> {
  if (webUsesAzureTablePrimary()) {
    return requireAzureFeedbackStore().createFeedback({
      id: randomUUID(),
      userId: input.userId,
      message: input.message,
      feedbackType: input.feedbackType ?? null,
      featureArea: input.featureArea ?? null,
      allowEmailContact: input.allowEmailContact ?? true,
      status: input.status ?? "NEW",
      sourcePath: input.sourcePath ?? null,
      mirrorStatus: input.mirrorStatus ?? "PENDING"
    });
  }

  return mapPrismaFeedback(
    await prisma.userFeedback.create({
      data: {
        userId: input.userId,
        message: input.message,
        feedbackType: input.feedbackType ?? null,
        featureArea: input.featureArea ?? null,
        allowEmailContact: input.allowEmailContact ?? true,
        status: input.status ?? "NEW",
        sourcePath: input.sourcePath ?? null,
        mirrorStatus: input.mirrorStatus ?? "PENDING"
      }
    })
  );
}

export async function findFeedbackById(id: string): Promise<FeedbackRecord | null> {
  if (webUsesAzureTablePrimary()) {
    return requireAzureFeedbackStore().findFeedbackById(id);
  }

  const row = await prisma.userFeedback.findUnique({
    where: { id }
  });
  return row ? mapPrismaFeedback(row) : null;
}

export async function updateFeedback(
  id: string,
  input: Partial<{
    message: string;
    feedbackType: string | null;
    featureArea: string | null;
    allowEmailContact: boolean;
    status: string;
    sourcePath: string | null;
    mirrorStatus: string;
    mirrorIssueNumber: number | null;
    mirrorIssueUrl: string | null;
    mirrorAttemptedAt: Date | null;
    mirrorErrorCode: string | null;
    mirrorErrorMessage: string | null;
  }>
): Promise<FeedbackRecord | null> {
  if (webUsesAzureTablePrimary()) {
    return requireAzureFeedbackStore().updateFeedback(id, input);
  }

  const row = await prisma.userFeedback.update({
    where: { id },
    data: input
  });
  return mapPrismaFeedback(row);
}

export async function listFeedbackForAdmin(
  query: FeedbackAdminQuery
): Promise<{
  totalRows: number;
  totalPages: number;
  rows: FeedbackAdminRow[];
}> {
  if (!webUsesAzureTablePrimary()) {
    const where: Prisma.UserFeedbackWhereInput = {};
    if (query.status && query.status !== "ALL") {
      where.status = query.status;
    }
    if (query.feedbackType && query.feedbackType !== "ALL") {
      where.feedbackType = query.feedbackType;
    }
    if (query.featureArea && query.featureArea !== "ALL") {
      where.featureArea = query.featureArea;
    }
    if (query.mirrorStatus && query.mirrorStatus !== "ALL") {
      where.mirrorStatus = query.mirrorStatus;
    }
    if (query.q && query.q.trim()) {
      where.OR = [
        {
          message: {
            contains: query.q
          }
        },
        {
          user: {
            email: {
              contains: query.q
            }
          }
        }
      ];
    }

    const [totalRows, rows] = await Promise.all([
      prisma.userFeedback.count({ where }),
      prisma.userFeedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          user: {
            select: {
              email: true
            }
          }
        }
      })
    ]);

    return {
      totalRows,
      totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize)),
      rows: rows.map((row) => ({
        ...mapPrismaFeedback(row),
        userEmail: row.user.email
      }))
    };
  }

  const search = query.q?.trim().toLowerCase() ?? "";
  const feedbackRows = await requireAzureFeedbackStore().listFeedback(Number.MAX_SAFE_INTEGER);
  const userIds = Array.from(new Set(feedbackRows.map((row) => row.userId)));
  const users = await Promise.all(
    userIds.map(async (userId) => {
      const user = await findPrimaryUserById(userId);
      return [userId, user?.email ?? null] as const;
    })
  );
  const emailByUserId = new Map(users);

  const filteredRows = sortNewestFirst(
    feedbackRows
      .map((row) => ({
        ...row,
        userEmail: emailByUserId.get(row.userId) ?? null
      }))
      .filter((row) => !query.status || query.status === "ALL" || row.status === query.status)
      .filter((row) => !query.feedbackType || query.feedbackType === "ALL" || row.feedbackType === query.feedbackType)
      .filter((row) => !query.featureArea || query.featureArea === "ALL" || row.featureArea === query.featureArea)
      .filter((row) => !query.mirrorStatus || query.mirrorStatus === "ALL" || row.mirrorStatus === query.mirrorStatus)
      .filter((row) => {
        if (!search) {
          return true;
        }
        return row.message.toLowerCase().includes(search) || row.userEmail?.toLowerCase().includes(search) === true;
      })
  );

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / query.pageSize));
  const start = (query.page - 1) * query.pageSize;
  const rows = filteredRows.slice(start, start + query.pageSize);

  return {
    totalRows,
    totalPages,
    rows
  };
}

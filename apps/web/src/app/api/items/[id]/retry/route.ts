import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import {
  enqueueItemDispatchMessage,
  webUsesPrismaDispatchQueue,
} from "@/lib/item-dispatch-queue";
import { materializeSummaryMarkdown } from "@/lib/items";
import { logger } from "@/lib/logger";
import {
  webPrimaryStore,
  webUsesAzureTablePrimary,
} from "@/lib/metadata-primary-store";
import { prisma } from "@/lib/prisma";

function retryJobKindForItem(
  item: { processingMode?: string | null },
  jobs: Array<{ jobKind?: string | null }>,
): string {
  const latestJobKind = jobs[0]?.jobKind;
  if (latestJobKind === "REQUEST_TTS" || latestJobKind === "FULL_EPISODE") {
    return latestJobKind;
  }
  return "FULL_EPISODE";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" },
      { status: 401 },
    );
  }

  const item =
    webUsesAzureTablePrimary() && webPrimaryStore
      ? await (async () => {
          const [itemRow, jobs] = await Promise.all([
            webPrimaryStore.findItemById(id),
            webPrimaryStore.listJobsByItemId(id),
          ]);
          return itemRow
            ? {
                ...itemRow,
                jobs,
              }
            : null;
        })()
      : await prisma.item.findUnique({
          where: { id },
          include: {
            jobs: {
              select: {
                jobKind: true,
                createdAt: true,
              },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        });
  if (!item || (item.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json(
      { ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" },
      { status: 403 },
    );
  }

  if (item.processingMode === "SUMMARY_ONLY") {
    const materialized = await materializeSummaryMarkdown({
      itemId: item.id,
      userId: item.userId,
      title: item.title,
      sourceType: item.sourceType as "URL" | "PDF" | "HTML_SNAPSHOT",
      sourceUrl: item.sourceUrl,
      sourceFilePath: item.sourceFilePath,
      sourceHtml: item.sourceHtml,
    });
    if (!materialized.ok) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "EXTRACTION_FAILED",
          error_message: "Could not prepare markdown for this summary item.",
        },
        { status: 422 },
      );
    }

    if (webUsesAzureTablePrimary() && webPrimaryStore) {
      const existingTask = await webPrimaryStore.findArticleSummaryTaskByItemId(
        item.id,
      );
      if (existingTask) {
        await webPrimaryStore.updateArticleSummaryTask(existingTask.id, {
          status: "QUEUED",
          attempt: 0,
          scheduledFor: new Date(),
          nextRetryAt: null,
          lockedAt: null,
          leaseId: null,
          leaseOwner: null,
          errorCode: null,
          errorMessage: null,
        });
      } else {
        await webPrimaryStore.createArticleSummaryTask({
          id: randomUUID(),
          itemId: item.id,
          userId: item.userId,
          status: "QUEUED",
          scheduledFor: new Date(),
          nextRetryAt: null,
          errorCode: null,
          errorMessage: null,
        });
      }
    } else {
      await prisma.articleSummaryTask.upsert({
        where: { itemId: item.id },
        update: {
          status: "QUEUED",
          attempt: 0,
          scheduledFor: new Date(),
          nextRetryAt: null,
          lockedAt: null,
          leaseId: null,
          leaseOwner: null,
          errorCode: null,
          errorMessage: null,
        },
        create: {
          itemId: item.id,
          userId: item.userId,
          status: "QUEUED",
          scheduledFor: new Date(),
          nextRetryAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });
    }

    return NextResponse.json({ ok: true });
  }

  const jobKind = retryJobKindForItem(item, item.jobs);
  const retryItemPatch = {
    status: "QUEUED",
    errorCode: null,
    errorMessage: null,
  };

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    await webPrimaryStore.updateItem(item.id, retryItemPatch);
    const createdJob = await webPrimaryStore.createJob({
      id: randomUUID(),
      itemId: item.id,
      userId: item.userId,
      jobKind,
      status: "QUEUED",
    });
    try {
      const dispatchMessage = await enqueueItemDispatchMessage({
        jobId: createdJob.id,
      });
      await webPrimaryStore.updateJob(createdJob.id, {
        dispatchMessageId: dispatchMessage.messageId,
      });
    } catch (error) {
      await logger.warn(
        "Retry route dispatch enqueue failed; leaving job for reconciliation",
        {
          itemId: item.id,
          jobId: createdJob.id,
          error:
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : String(error),
        },
      );
    }
  } else {
    const createdJob = await prisma.$transaction(async (tx) => {
      await tx.item.update({ where: { id: item.id }, data: retryItemPatch });
      const job = await tx.job.create({
        data: { itemId: item.id, jobKind, status: "QUEUED" },
        select: {
          id: true,
        },
      });
      if (webUsesPrismaDispatchQueue()) {
        const dispatchMessage = await enqueueItemDispatchMessage({
          jobId: job.id,
          client: tx,
        });
        await tx.job.update({
          where: { id: job.id },
          data: {
            dispatchMessageId: dispatchMessage.messageId,
          },
        });
      }
      return job;
    });
    if (!webUsesPrismaDispatchQueue()) {
      try {
        const dispatchMessage = await enqueueItemDispatchMessage({
          jobId: createdJob.id,
        });
        await prisma.job.update({
          where: { id: createdJob.id },
          data: {
            dispatchMessageId: dispatchMessage.messageId,
          },
        });
      } catch (error) {
        await logger.warn(
          "Retry route dispatch enqueue failed after job creation; leaving job for reconciliation",
          {
            itemId: item.id,
            jobId: createdJob.id,
            error:
              error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error),
          },
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}

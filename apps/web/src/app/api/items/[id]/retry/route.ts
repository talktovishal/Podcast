import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { enqueueItemDispatchMessage, webUsesPrismaDispatchQueue } from "@/lib/item-dispatch-queue";
import { logger } from "@/lib/logger";
import { webPrimaryStore, webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const item =
    webUsesAzureTablePrimary() && webPrimaryStore
      ? await webPrimaryStore.findItemById(context.params.id)
      : await prisma.item.findUnique({ where: { id: context.params.id } });
  if (!item || (item.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    await webPrimaryStore.updateItem(item.id, {
      status: "QUEUED",
      errorCode: null,
      errorMessage: null
    });
    const createdJob = await webPrimaryStore.createJob({
      id: randomUUID(),
      itemId: item.id,
      userId: item.userId,
      status: "QUEUED"
    });
    try {
      const dispatchMessage = await enqueueItemDispatchMessage({
        jobId: createdJob.id
      });
      await webPrimaryStore.updateJob(createdJob.id, {
        dispatchMessageId: dispatchMessage.messageId
      });
    } catch (error) {
      await logger.warn("Retry route dispatch enqueue failed; leaving job for reconciliation", {
        itemId: item.id,
        jobId: createdJob.id,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      });
    }
  } else {
    const createdJob = await prisma.$transaction(async (tx) => {
      await tx.item.update({ where: { id: item.id }, data: { status: "QUEUED", errorCode: null, errorMessage: null } });
      const job = await tx.job.create({
        data: { itemId: item.id, status: "QUEUED" },
        select: {
          id: true
        }
      });
      if (webUsesPrismaDispatchQueue()) {
        const dispatchMessage = await enqueueItemDispatchMessage({
          jobId: job.id,
          client: tx
        });
        await tx.job.update({
          where: { id: job.id },
          data: {
            dispatchMessageId: dispatchMessage.messageId
          }
        });
      }
      return job;
    });
    if (!webUsesPrismaDispatchQueue()) {
      try {
        const dispatchMessage = await enqueueItemDispatchMessage({
          jobId: createdJob.id
        });
        await prisma.job.update({
          where: { id: createdJob.id },
          data: {
            dispatchMessageId: dispatchMessage.messageId
          }
        });
      } catch (error) {
        await logger.warn("Retry route dispatch enqueue failed after job creation; leaving job for reconciliation", {
          itemId: item.id,
          jobId: createdJob.id,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

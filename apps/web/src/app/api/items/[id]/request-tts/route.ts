import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { isAudioAvailable } from "@/lib/audio-retention";
import { fromError } from "@/lib/http";
import { enqueueItemDispatchMessage, webUsesPrismaDispatchQueue } from "@/lib/item-dispatch-queue";
import { logger } from "@/lib/logger";
import { syncQueueProjectionFromEnqueue } from "@/lib/metadata-projection";
import { webPrimaryStore, webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
import { prisma } from "@/lib/prisma";
import { consumeSubmissionCredit, PAID_SUBMISSION_DEFERRED_CODE } from "@/lib/submission-quota";

function isActiveAudioJob(job: { jobKind?: string | null; status: string }): boolean {
  return (
    (job.jobKind === "FULL_EPISODE" || job.jobKind === "REQUEST_TTS") &&
    (job.status === "QUEUED" || job.status === "PROCESSING")
  );
}

async function handleRequestTts(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const [item, episode, jobs] = await Promise.all([
      webPrimaryStore.findItemById(id),
      webPrimaryStore.findEpisodeByItemId(id),
      webPrimaryStore.listJobsByItemId(id)
    ]);

    if (!item || (item.userId !== user.id && user.role !== "ADMIN")) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
    }
    if (episode && isAudioAvailable(episode.expiresAt)) {
      return NextResponse.json({ ok: true, status: "ready", already_ready: true });
    }
    if (jobs.some(isActiveAudioJob)) {
      return NextResponse.json({ ok: true, status: "queued", already_queued: true });
    }
    if (item.status !== "READY" && item.summaryStatus !== "SUCCEEDED") {
      return NextResponse.json(
        {
          ok: false,
          error_code: "INVALID_STATE",
          error_message: "This item is not ready for TTS yet."
        },
        { status: 409 }
      );
    }

    const quotaOutcome = await consumeSubmissionCredit({
      userId: item.userId,
      jobKind: "REQUEST_TTS"
    });
    const deferredErrorCode = quotaOutcome.queueMode === "DEFERRED" ? PAID_SUBMISSION_DEFERRED_CODE : null;
    const updatedItem = await webPrimaryStore.updateItem(item.id, {
      status: "QUEUED",
      errorCode: deferredErrorCode,
      errorMessage: quotaOutcome.acceptedMessage
    });
    const createdJob = await webPrimaryStore.createJob({
      id: randomUUID(),
      itemId: item.id,
      userId: item.userId,
      jobKind: "REQUEST_TTS",
      status: "QUEUED",
      scheduledFor: quotaOutcome.scheduledFor,
      nextRetryAt: quotaOutcome.queueMode === "DEFERRED" ? quotaOutcome.scheduledFor : null,
      errorCode: deferredErrorCode,
      errorMessage: quotaOutcome.acceptedMessage
    });
    try {
      const dispatchMessage = await enqueueItemDispatchMessage({
        jobId: createdJob.id,
        visibleAt: quotaOutcome.scheduledFor
      });
      await webPrimaryStore.updateJob(createdJob.id, {
        dispatchMessageId: dispatchMessage.messageId
      });
      createdJob.dispatchMessageId = dispatchMessage.messageId;
    } catch (error) {
      await logger.warn("Request TTS dispatch enqueue failed; leaving job for reconciliation", {
        itemId: item.id,
        jobId: createdJob.id,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      });
    }

    await syncQueueProjectionFromEnqueue({
      item: {
        id: updatedItem?.id ?? item.id,
        userId: item.userId,
        sourceType: item.sourceType,
        status: updatedItem?.status ?? "QUEUED",
        createdAt: item.createdAt,
        updatedAt: updatedItem?.updatedAt ?? new Date(),
        errorCode: deferredErrorCode,
        errorMessage: quotaOutcome.acceptedMessage
      },
      job: createdJob
    });

    return NextResponse.json({
      ok: true,
      status: "queued",
      queue_mode: quotaOutcome.queueMode.toLowerCase(),
      accepted_message: quotaOutcome.acceptedMessage,
      scheduled_for: quotaOutcome.scheduledFor.toISOString(),
      submission_quota: quotaOutcome.snapshot
    });
  }

  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      episode: true,
      jobs: {
        select: {
          id: true,
          jobKind: true,
          status: true,
          createdAt: true
        },
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  if (!item || (item.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
  }
  if (item.episode && isAudioAvailable(item.episode.expiresAt)) {
    return NextResponse.json({ ok: true, status: "ready", already_ready: true });
  }
  if (item.jobs.some(isActiveAudioJob)) {
    return NextResponse.json({ ok: true, status: "queued", already_queued: true });
  }
  if (item.status !== "READY" && item.summaryStatus !== "SUCCEEDED") {
    return NextResponse.json(
      {
        ok: false,
        error_code: "INVALID_STATE",
        error_message: "This item is not ready for TTS yet."
      },
      { status: 409 }
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const quotaOutcome = await consumeSubmissionCredit({
      userId: item.userId,
      jobKind: "REQUEST_TTS",
      tx
    });
    const deferredErrorCode = quotaOutcome.queueMode === "DEFERRED" ? PAID_SUBMISSION_DEFERRED_CODE : null;
    const updatedItem = await tx.item.update({
      where: { id: item.id },
      data: {
        status: "QUEUED",
        errorCode: deferredErrorCode,
        errorMessage: quotaOutcome.acceptedMessage
      }
    });
    const createdJob = await tx.job.create({
      data: {
        itemId: item.id,
        jobKind: "REQUEST_TTS",
        status: "QUEUED",
        scheduledFor: quotaOutcome.scheduledFor,
        nextRetryAt: quotaOutcome.queueMode === "DEFERRED" ? quotaOutcome.scheduledFor : null,
        errorCode: deferredErrorCode,
        errorMessage: quotaOutcome.acceptedMessage
      },
      select: {
        id: true,
        itemId: true,
        jobKind: true,
        status: true,
        attempt: true,
        createdAt: true,
        updatedAt: true,
        lockedAt: true,
        leaseId: true,
        leaseOwner: true,
        leaseExpiresAt: true,
        lastHeartbeatAt: true,
        dispatchMessageId: true,
        scheduledFor: true,
        nextRetryAt: true,
        errorCode: true,
        errorMessage: true
      }
    });
    if (webUsesPrismaDispatchQueue()) {
      const dispatchMessage = await enqueueItemDispatchMessage({
        jobId: createdJob.id,
        visibleAt: quotaOutcome.scheduledFor,
        client: tx
      });
      await tx.job.update({
        where: { id: createdJob.id },
        data: {
          dispatchMessageId: dispatchMessage.messageId
        }
      });
      createdJob.dispatchMessageId = dispatchMessage.messageId;
    }
    return {
      updatedItem,
      createdJob,
      quotaOutcome
    };
  });

  if (!webUsesPrismaDispatchQueue() && !result.createdJob.dispatchMessageId) {
    try {
      const dispatchMessage = await enqueueItemDispatchMessage({
        jobId: result.createdJob.id,
        visibleAt: result.quotaOutcome.scheduledFor
      });
      await prisma.job.update({
        where: { id: result.createdJob.id },
        data: {
          dispatchMessageId: dispatchMessage.messageId
        }
      });
      result.createdJob.dispatchMessageId = dispatchMessage.messageId;
    } catch (error) {
      await logger.warn("Request TTS dispatch enqueue failed after job creation; leaving job for reconciliation", {
        itemId: item.id,
        jobId: result.createdJob.id,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      });
    }
  }

  await syncQueueProjectionFromEnqueue({
    item: {
      id: result.updatedItem.id,
      userId: result.updatedItem.userId,
      sourceType: result.updatedItem.sourceType,
      status: result.updatedItem.status,
      createdAt: result.updatedItem.createdAt,
      updatedAt: result.updatedItem.updatedAt,
      errorCode: result.updatedItem.errorCode,
      errorMessage: result.updatedItem.errorMessage
    },
    job: result.createdJob
  });

  return NextResponse.json({
    ok: true,
    status: "queued",
    queue_mode: result.quotaOutcome.queueMode.toLowerCase(),
    accepted_message: result.quotaOutcome.acceptedMessage,
    scheduled_for: result.quotaOutcome.scheduledFor.toISOString(),
    submission_quota: result.quotaOutcome.snapshot
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    return await handleRequestTts(request, context);
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/items/[id]/request-tts"
    });
  }
}

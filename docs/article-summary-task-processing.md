# Article Summary Task Processing

## Purpose

`ArticleSummaryTask` is the explicit pending-work queue for per-article summaries. It is separate from the podcast/audio `Job` queue so the worker can discover every article summary that needs to be generated across all users without scanning item jobs or triggering audio/RSS work.

Local development stores tasks in Prisma SQLite. Production metadata stores the same task contract in Azure Table through `AzureTablePrimaryStore`.

## Storage Contract

Local SQLite table: `ArticleSummaryTask`

Azure Table partition: `articleSummaryTask`

Fields:

- `id`: task id.
- `itemId`: source `Item` id. Local SQLite enforces one task per item.
- `userId`: owner id for quota, storage paths, and support lookup.
- `status`: `QUEUED`, `PROCESSING`, or `FAILED`.
- `attempt`: processing attempts made.
- `scheduledFor`: when queued work becomes eligible.
- `nextRetryAt`: when failed work becomes eligible again.
- `lockedAt`: when a processor claimed the task.
- `leaseId`: claim token written by the processor.
- `leaseOwner`: worker or batch instance id.
- `errorCode` / `errorMessage`: safe failure state for operators.
- `createdAt` / `updatedAt`: durable timestamps.

The UX does not read this table directly. User-visible state stays on `Item.summaryStatus`, `Item.summaryTitle`, `Item.summaryStorageKey`, `Item.summaryCompletedAt`, and summary error fields. The canonical article markdown is exposed through `/api/items/[id]/markdown` once the `MARKDOWN` artifact exists; the summary markdown API remains `/api/items/[id]/summary`.

## Pending Work Query

A batch processor should ask the active metadata backend for eligible tasks across all users:

- Local SQLite: query `ArticleSummaryTask` where `status = "QUEUED"` and `scheduledFor` is null or due, plus retryable `FAILED` rows whose `nextRetryAt` is due and `attempt` is below the configured max.
- Azure Table: call `listNextEligibleArticleSummaryTasks(now, maxRetryAttempts, limit)`.

Order by the effective due time first, then `createdAt`, so old pending work is handled before newer submissions.

## Claim Behavior

Before doing LLM work, claim the row atomically:

- Confirm the task is still eligible.
- Set `status = "PROCESSING"`.
- Increment `attempt`.
- Set `lockedAt`.
- Set a fresh `leaseId`.
- Set `leaseOwner` to the batch instance id.
- Clear stale `errorCode` and `errorMessage`.

The processor must only write success or failure if the current row still has the same `leaseId`. If the lease no longer matches, another processor owns the task and the current attempt must stop without touching item state.

## `processArticleSummaryTask(taskId)`

The processor performs these steps:

1. Load the task and associated `Item`.
2. If the task is missing, return `false`. If the item is missing, delete the task when possible because the source item was removed.
3. Atomically claim the task using the claim behavior above.
4. Load the existing `ItemArtifact` row with `kind = "MARKDOWN"`.
5. Read canonical markdown from `users/<userId>/markdown/items/<itemId>/canonical.md`.
6. If the artifact is missing, fail the task with a safe operator error; the task processor should not re-fetch or re-extract source content.
7. Call `makeSummaryProvider().summarize({ kind: "item_summary", ... })` with the cleaned markdown as the single source.
8. Store summary markdown at `users/<userId>/markdown/items/<itemId>/summary.md`.
9. Update the `Item`:
   - `status = "READY"`
   - `processingMode = "SUMMARY_ONLY"`
   - `summaryStatus = "SUCCEEDED"`
   - `summaryTitle`
   - `summaryStorageKey`
   - `summaryBytes`
   - provider/model/deployment/token metadata
   - `summaryCompletedAt`
   - clear item and summary error fields
10. Delete the `ArticleSummaryTask` row after the item update succeeds.
11. Return `true`.

## Failure Handling

For retryable failures:

- Keep the task row.
- Set `status = "FAILED"`.
- Set `nextRetryAt`.
- Clear claim fields or overwrite them on the next claim.
- Write safe `errorCode` and `errorMessage`.
- Update the item with `status = "FAILED"`, `summaryStatus = "FAILED"`, `summaryErrorCode`, and `summaryErrorMessage`.

For terminal failures:

- Keep the failed task row for operator inspection.
- Set `nextRetryAt = null`.
- Update the item with the same safe failure fields.

Never publish an episode, synthesize TTS, or touch RSS state from `processArticleSummaryTask`. A normal summary-only item becomes podcast audio only through the separate `Request TTS` flow. Internal `PODCAST_TRANSCRIPT` items are rejected by `Request TTS` and stay transcript summary items.

## Current Wiring

Summary-only submissions now run the shared pre-audio processing first: extract source content, clean markdown, resolve the title, store canonical markdown at `users/<userId>/markdown/items/<itemId>/canonical.md`, and upsert the `MARKDOWN` artifact. Only after that succeeds do they create an `ArticleSummaryTask`. They do not create a podcast `Job` or `DispatchQueueMessage`.

Podcast transcript imports follow the same task boundary after transcript resolution: they store normalized transcript markdown as canonical `MARKDOWN`, create `ArticleSummaryTask`, and never create audio/RSS work.

Manual retry for a failed summary-only item follows the same boundary: rebuild canonical markdown if needed, requeue or reset the `ArticleSummaryTask`, and still avoid the podcast/audio `Job` queue.

`apps/worker/src/index.ts` now runs the article summary task processor in the primary polling loop after manual summary runs and before digest scheduling/runs. This keeps item summary work in the worker without crossing into the episode `Job` queue.

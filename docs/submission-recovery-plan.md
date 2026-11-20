# One delivery plan for reliable submissions

Approved S4 design deliverable, 2026-11-20. **Not implemented or deployed.**
This combines the existing acceptance and allowance proposals and explains their
connection to publication. It does not authorize a new journal, schema, queue,
quota policy or runtime behavior.

S5's decision is to keep the current database and compatibility paths. Therefore
the plan must work with Azure Table and preserve SQL support; there is no
database migration project hidden inside it.

## 1. The problem in everyday terms

Imagine submitting an article summary. The website records the article and
starts preparing its text, but stops before it creates the worker's summary
task. A retry should not use another submission allowance, and a restart should
not make the unfinished request disappear.

We need a saved tracking record that answers three questions:

1. Was this particular request accepted?
2. Which allowance did it use, and was it counted only once?
3. What work is still needed?

That tracking record is a **submission operation**, not an email receipt or a
credit-card charge. Acceptance and allowance use the same record/protocol.
Publishing finished audio is a separate question: which worker's result is
allowed to become the episode? It must not be mixed into one giant account row.

Current code: [acceptance](../apps/web/src/lib/items.ts),
[allowance rules](../apps/web/src/lib/submission-quota.ts),
[summary task processing](../apps/worker/src/jobs/processArticleSummaryTask.ts),
[article publication](../apps/worker/src/jobs/processItemJob.ts).

## 2. Reuse these designs, do not create competing mechanisms

| Question | Existing authority to use | How it connects |
|---|---|---|
| Was the request admitted and capacity reserved once? | One account-scoped operation/capacity ledger from [proposal 4](architecture-followup-proposals.md#4-idempotent-quota-reservation-and-acceptance) | User + submission ID + immutable request hash; stable item/work references |
| Is accepted summary preparation discoverable after a restart? | Preparation state/owner epoch in that same operation, from [proposal 2](architecture-followup-proposals.md#2-durable-acceptance-before-summary-preparation) | Accepted operation owns the source reference and chosen markdown result |
| Which audio result is authoritative? | Separate item-generation publication aggregate from [proposal 3](architecture-followup-proposals.md#3-fenced-recoverable-episode-publication) | References the accepted operation and item/input generation; owns the publication claim and committed pointer |
| What does the subscriber see? | Existing episode identity and feed/media contracts, with authority-aware readers for new records | Episode/item/job rows become replayable views of the committed result, not competing authorities |
| Which paid policy applies? | Billing remains authoritative for entitlement; admission uses a synchronized policy epoch | Do not overwrite billing fields from a quota projection or treat two unrelated reads as atomic |

An operation ID identifies a request. A worker epoch identifies an attempt's
permission to work. A public episode GUID identifies the subscriber's episode.
They are not interchangeable. Keep public IDs, tokens, links and timestamps
stable through every retry and any later rollout.

## 3. One end-to-end sequence

```text
Validate input and retain recoverable source
                 |
Reserve capacity + save operation [RESERVED]
                 |
Ensure stable item/work references
                 |
Commit acceptance [ACCEPTED] --> response or same-key status lookup
                 |
       +---------+-------------------------+
       |                                   |
Summary-only                         Full audio / Request TTS
Claim preparation                    Existing job processing
Store chosen markdown                Prepare or reuse markdown
Ensure one prepared summary task     Synthesize/copy owned audio
Existing summary processor           Commit publication authority
       |                             Repair episode/item/job views
       +-------------> finished or durable terminal error

Before acceptance only:
RESERVED -- fenced compensation --> COMPENSATED
```

The diagram is a logical ordering, not a claim that Azure can transact across
its current item/job/episode tables. Notifications are wake-up hints; a bounded
scan of authoritative operations must find accepted work even if a hint or
secondary index is missing.

### Request and response rules

- Bind an idempotency key to the authenticated user and immutable mode/source/
  options hash. Same key and body resolves the same operation; changed content
  under the same key returns a conflict. An intentional new submission gets a
  new key. Retain compact deduplication tombstones after normal cleanup.
- Preserve `FULL_EPISODE`, `SUMMARY_ONLY` and `REQUEST_TTS` meaning. A new
  Request TTS is a separate podcast-capacity admission; retrying its accepted
  work is not. Do not route summary-only preparation into an audio job.
- Retain uploaded PDF/snapshot bytes before acceptance. A durable URL reference
  can still become unreadable later; persist an explicit terminal source error
  instead of inventing content, retrying forever or silently using more quota.
- Return the existing success shape/status only after the operation is accepted
  and its item exists. An additive operation ID and preparing state require
  route/client compatibility work. An uncertain commit is explicitly pending
  or retryable, never a false promise that nothing was counted.
- Moving summary preparation out of the web request changes when extraction
  errors and titles become visible. That UX change needs its own tested scope.
  Until then, keep the current [prepared-task contract](article-summary-task-processing.md).

### Admission and ownership rules

- **SQL:** serialize admission on the account revision and reserve within the
  same transaction as the operation/item/initial metadata work. On conflict,
  rerun the whole capacity decision. Do not put network or object uploads in
  the transaction.
- **Azure:** use one ledger table and one account partition for the conditional
  admission-revision update plus operation/slot changes. Other tables are
  resumable projections. An ETag failure restarts the entire capacity read and
  decision; bounded retries end in an explicit retryable failure.
- `RESERVED` holds capacity. `ACCEPTED` finalizes that same reservation; it is
  not a second increment. Compensation releases capacity exactly once, in the
  conditional state change that makes later acceptance impossible.
- Every new-protocol claimer, retry path and reconciler must check accepted
  state and cancellation generation. A projected job must not be executable
  merely because its row says QUEUED. Exclude old workers from a migrated
  cohort until they understand this gate; otherwise pre-acceptance work can
  escape the protocol.
- Preparation stores owned candidate artifacts, then conditionally selects a
  result under its operation epoch. Only the current accepted generation may
  create the deterministic prepared summary task. Do not turn unfinished
  preparation into a legacy task that expects markdown already to exist.
- Keep preparation under the existing article-summary category, alternating
  preparation and ready tasks when both exist. Preserve the four-category
  equal round-robin policy. Scans need continuation, backoff and partition
  fairness, not repeated first-page searches.
- Publication uses the separate item aggregate's current epoch/ETag, not a
  check of an unrelated job row followed by an unguarded write. Its conditional
  commit chooses the result; episode/item/job projections follow it.
- Cancellation/deletion must fence the applicable operation and publication
  generation before retry or projection can recreate work. Define and test
  this cross-authority sequence explicitly; do not assume two tables update
  atomically.

## 4. Policy decisions required before any activation

These are not reasons to ask for a decision now: the authorized deliverable is
the plan. They are gates on a later implementation/rollout.

1. **Completed-summary allowance.** Successful article-summary tasks are deleted
   today, and paid usage reads those tasks. Keeping accepted usage for the full
   window can tighten the observed limit. Decide explicitly whether to adopt
   that intended daily-window accounting, how to explain it, and how to handle
   unknown historical usage. Do not invent deleted history or silently charge
   users more under a refactor label.
2. **Policy/credit changes during admission.** Specify how billing updates and
   manual extra-credit changes advance the admission policy epoch. A snapshot
   read of billing followed by a write in another table is not sufficient.
   Keep existing accepted slots; apply the newly synchronized policy to new
   admissions. Finalize the writer-fence protocol before building this stage.
3. **Pending response and preparation UX.** Confirm the additive operation ID,
   pending/error response and preparing display with existing clients. Avoid
   changing failure timing without UI and extension tests.

Unless separately approved, preserve one-time trial plus granted tries, distinct
paid podcast/summary capacity, existing rolling-window/scheduled-start rules,
podcast deferral limit, rejection of summary overflow, and accepted-failure/
deletion accounting. Manual Summary Studio and digest quotas are not folded
into this ledger. No price or monetary refund change.

## 5. Staged implementation proposal

Each row is a future reviewable change, **not approved code work**.

| Stage | Deliverable and prerequisite | Required proof before continuing |
|---|---|---|
| 0. Freeze contracts | Resolve the three decisions above; specify protocol fields, state transitions, policy synchronization, deletion fencing and reader/claimer gates | Review one authority per invariant; reconcile every admission and admin-credit entry point; no new writer yet |
| 1. Add compatible readers | Add optional/versioned data and readers/reconcilers with writers disabled; inventory legacy partial work and preserve old reads | Existing records still read; unknown legacy states reported, not repaired by guesswork; old/new compatibility documented |
| 2. Add shared admission | Implement the single acceptance/capacity ledger, all cohort admission writers and accepted-state gates together | Independent-process contention, duplicate keys, lost replies and compensation races in both stores; shadow decisions without extra charges |
| 3. Enable durable preparation | Use accepted operation state to claim/read/prepare and create the existing prepared task; reuse current extraction adapters, including the worker-local helper where appropriate | Restart after every source/artifact/task boundary; no unprepared task, extra usage, accidental audio or starvation |
| 4. Add publication authority separately | Implement proposal 3's item-generation fence, immutable audio/snapshot and authority-aware readers; compatible claim/delete/retry flows first | Stale owners cannot publish; projection replay converges; GUIDs, links, retention, HEAD and range behavior unchanged |
| 5. Controlled rollout | Quiesce/fence a small cohort's old writers, establish verified usage baseline, enable new writers only with capable readers/workers | Reconciliation balances, no incompatible workers, bounded pending ages and an exercised rollback; separate release authorization |

Do not combine a database move, ledger activation and publication rewrite into
one release. Azure stays the selected production direction under S5; SQL
compatibility remains tested. A future database decision would require revisiting
storage mechanics, not discarding these logical correctness requirements.

## 6. Failure cases to prove, not just happy-path tests

| Stop or race | Required outcome |
|---|---|
| Uploaded bytes but no reservation | Not accepted; later reference-aware staging cleanup only |
| Two submissions compete for the last slot | Exactly one obtains it; the other recomputes and rejects or gets a valid deferred podcast slot |
| Same request submitted simultaneously | One reservation and stable IDs; both callers resolve the same outcome |
| Reserve succeeds, item creation fails | Journal exposes incomplete work; finish or fence/compensate once |
| Item/job exists but acceptance is incomplete | Claimer gate prevents execution; recovery chooses acceptance or compensation, never both |
| Acceptance succeeds but response/dispatch is lost | Same-key retry returns that acceptance; journal discovery repairs hints |
| Process stops during preparation | Resume from retained source under a new epoch without another admission |
| Artifact upload succeeds but selection/task save is lost | Verify/reuse the chosen owned artifact; ensure one prepared task, not duplicate output |
| Old preparer resumes after takeover/delete | Its conditional state update fails; it cannot select results or resurrect tasks |
| Old audio worker resumes after takeover | It cannot commit publication or overwrite a winning object's bytes |
| Publication committed but projections/ack fail | Replay from the committed snapshot; do not synthesize or use allowance again |
| Metadata/storage outage | Explicit pending/error; never interpret an outage as absence or compensation permission |
| Summary finishes, fails, is retried or deleted | Usage follows the explicitly approved accounting policy; accepted retries do not re-admit |
| Billing or extra credits change concurrently | Admission serializes against the agreed policy epoch; no mixed old-policy/new-usage decision |

Inject stops before **and after** writes, including lost acknowledgements.
Test real Azure conditional/batch semantics as well as mocks; PostgreSQL and
SQLite each need their own transaction/conflict proof. Include window edges,
deferred starts, batch/entity limits, duplicate notification and cleanup races.
No live-account fault injection is part of this approval.

## 7. Upgrade and safe rollback

Inventory first. Backfill only verified counters, identities and retained
sources. Report ambiguous partial items and missing historical usage for review.
Do not reset balances, rewrite feed identities, delete populated tables or
create fake historical admissions.

Enable readers/claim gates/reconciliation before writers. A missing secondary
index must be repairable from authoritative scans. Track pending age, held versus
accepted capacity, exhausted retries, missing projections and stale-owner
rejections without logging source text or secret URLs.

If rollout must stop:

1. Disable new admissions/claims for the new protocol.
2. Keep compatible readers and recovery workers running to finish or compensate
   RESERVED operations under their fences; retain ACCEPTED work and usage.
3. Finish committed publication projections without regenerating audio.
4. Resume legacy writers only after a verified compatibility projection and a
   safe handling plan for every outstanding new-protocol record. Simply
   installing an old binary is not a safe rollback.
5. Retain additive records and deduplication tombstones. Destructive cleanup
   requires a later, separately approved operation.

Completion of this document satisfies the approved planning work only.
Implementation requires a new scoped approval with the policy decisions,
forward migration, acceptance tests and rollback evidence above.

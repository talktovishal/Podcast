# Cost Optimization Rollout (B2s + Local-First TTS + Serverless Data)

## Scope and constraints
- Keep one always-on compute node for simplicity.
- Target compute SKU: `Standard_B2s`.
- Keep local TTS as primary (`TTS_WORKERS=1`).
- Enable external TTS only as overflow when queue pressure crosses thresholds.
- Migrate durable metadata from PostgreSQL to serverless Azure data plane.
- Durable artifacts remain on Blob storage.
- No scale-to-zero compute topology in this track.

## Success metrics
- Cost:
  - Window 1 baseline (`2026-02-20` to `2026-03-07`) was ~`$10.37/day`.
  - Track target after rollout: `<= $2.50/day` steady-state.
- Reliability:
  - `p95` queue wait under 5 minutes for normal traffic.
  - no sustained `PROCESSING` stuck jobs beyond stale-reclaim threshold.
- Quality:
  - no regression on podcast compatibility (`HEAD` + `206` range).
  - no regression in item success rate (`READY` vs `FAILED` ratio).

## Architecture target
- Web + worker + python-tts on one always-on `B2s` VM.
- Local lane:
  - Primary worker processes all jobs by default with local Kokoro.
- Overflow lane:
  - Overflow worker role processes jobs only when queue pressure policy is active.
  - Overflow TTS provider can point to external endpoint/provider.
- Data:
  - Metadata + queue state: serverless table store.
  - Artifacts/audio: blob store.

## Phase checklist (file-level)

### Phase 0 - Baseline and rollback readiness
- [ ] Capture baseline cost and queue metrics snapshots.
- [ ] Capture full DB backup and test restore.
- [ ] Create rollback runbook with cutover toggles.
- Files:
  - `docs/operations.md`
  - `docs/azure-cost-model.md`
  - `scripts/ops/*` (new snapshot helpers if needed)

### Phase 1 - Compute right-sizing + local TTS hardening
- [x] Set VM deployment target to `B2s`.
- [x] Lock local TTS process to `TTS_WORKERS=1`.
- [ ] Add memory/swap and OOM monitoring guidance.
- Files:
  - `infra/main.parameters.json`
  - `infra/systemd/articlepod-python-tts.service`
  - `docs/azure-deploy.md`
  - `docs/env.md`

### Phase 2 - Overflow policy scaffolding (start now)
- [x] Add worker role and overflow policy env controls.
- [x] Add queue pressure snapshot + hysteresis evaluator.
- [x] Add overflow role gating to keep local-first behavior.
- [x] Add structured logs for policy decisions.
- Files:
  - `apps/worker/src/lib/env.ts`
  - `apps/worker/src/lib/providers.ts`
  - `apps/worker/src/lib/overflowPolicy.ts` (new)
  - `apps/worker/src/jobs/queuePressure.ts` (new)
  - `apps/worker/src/index.ts`
  - `apps/worker/tests/overflow-policy.test.ts` (new)

### Phase 3 - Metadata/queue abstraction layer
- [x] Introduce adapter interfaces for queue + metadata operations.
- [ ] Keep Postgres adapter as current default.
- [ ] Add adapter-specific integration tests.
- Files:
  - `packages/core/src/storage/types.ts` (or new `packages/core/src/metadata/*`)
  - `apps/worker/src/jobs/processItemJob.ts`
  - `apps/web/src/lib/items.ts`
  - `apps/web/src/lib/dashboard.ts`
  - `apps/web/tests/*`

### Phase 4 - Serverless data adapters (Table + Blob refs)
- [x] Implement Azure Table adapter(s) for key metadata models.
- [ ] Implement queue semantics on serverless store (claim/retry/stale reclaim).
- [ ] Preserve idempotency and retry semantics.
- Files:
  - `packages/core/src/storage/*` (new table adapter modules)
  - `apps/worker/src/lib/*`
  - `apps/web/src/lib/*`
  - migration scripts under `scripts/`

### Phase 5 - Dual-write, backfill, consistency checker
- [x] Dual-write Postgres + Table.
- [x] Read from Postgres, shadow-read Table.
- [x] Consistency diff report with strict thresholds.
- Files:
  - `apps/web/src/lib/*`
  - `apps/worker/src/jobs/*`
  - `scripts/migrate-*`
  - `docs/operations.md`

### Phase 6 - Canary and full cutover
- [ ] Canary reads/writes on serverless store.
- [ ] Full cutover after stability window.
- [ ] Keep Postgres rollback window before decom.
- Files:
  - feature flags in `apps/web/src/lib/env.ts`, `apps/worker/src/lib/env.ts`
  - runbooks in `docs/operations.md`, `docs/documentation.md`

### Phase 7 - Guardrails and financial controls
- [x] Budget alerts on subscription/resource group.
- [ ] Overflow daily spend cap and concurrency cap.
- [ ] Queue-age and failure-rate alert thresholds.
- [ ] Incident playbook and rollback drills.
- Files:
  - `docs/operations.md`
  - `docs/implement.md`
  - `docs/env.md`
  - optional helper scripts in `scripts/azure/`

## Week-by-week execution schedule

### Week 1
- Phase 0 and Phase 1 complete.
- Start Phase 2 code scaffolding.
- Exit gates:
  - VM stable on `B2s` for 48h.
  - local TTS worker count locked to 1.

### Week 2
- Complete Phase 2 and Phase 3.
- Overflow lane policy in place and test-covered.
- Adapter interfaces merged with zero behavior drift.

### Week 3
- Complete Phase 4.
- Run integration tests for serverless adapters.
- Start dual-write and backfill dry-runs.

### Week 4
- Complete Phase 5 and canary start (Phase 6 partial).
- Validate consistency and rollback drills.

### Week 5
- Complete Phase 6 full cutover.
- Run burn-rate review and tune thresholds.

### Week 6
- Complete Phase 7 guardrails.
- Finalize runbooks and handoff.

## Required verification per phase
- Unit tests for policy and adapter logic.
- Worker integration tests for queue claim/retry/reclaim semantics.
- Podcast contract verification:
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`
- Environment checks:
  - `npm run check:env:azure`
- Build/lint/test:
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`

## Immediate next implementation items (now in progress)
- Add overflow env controls and policy evaluator.
- Add overflow worker role gate with local-first behavior.
- Add tests for hysteresis policy transitions.

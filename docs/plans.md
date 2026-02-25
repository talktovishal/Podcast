# ArticlePod Detailed Build Plan

## Planning Gate
- This file is planning-only. No implementation starts until explicit user approval.
- Source-of-truth product requirements: `docs/Prompts.md`.
- Execution guardrails and compatibility invariants: `AGENTS.md`.
- If any requirement appears conflicting, log it in "Spec Consistency Notes" and apply the smallest correction before coding.

## Spec Consistency Notes (Current)
- `docs/Prompts.md` includes a **"Verification Prompts"** section and status-tagged sections.
- OAuth hardening (`M23`) and extension/security track (`M24`-`M34`) are completed and synced with tests/docs.
- Durable Azure/parity rollout (`M35`-`M46`) is implemented in repo assets and runbooks, including staged VM sync/promote deployment and nginx/TLS automation helpers.
- First live Azure VM deployment executed on `2026-02-15` in `rg-articlepod-prod`; public HTTPS health and podcast contract checks passed on `articlepod-dvlolaz43j6be.centralus.cloudapp.azure.com`.
- Azure runtime scripts now preserve python-tts virtualenv across promotions and auto-bootstrap missing language assets during VM deploy.
- Azure runtime hardening now strips app-local `.env` files during sync/promote, sets VM-safe runtime paths in rendered env, and precomputes Kokoro previews during deploy so voice preview does not block on first request.
- Azure daily rollout now has a deployment-only helper (`scripts/azure/deploy-changes.sh`) for sync+promote+runtime deploy on existing VM environments.
- Naming consolidation now standardizes canonical `articlepod` package scopes/runtime identifiers with explicit legacy compatibility mapping in `config/naming.json` plus a VM migration helper (`scripts/azure/migrate-runtime-naming.sh`).
- Azure deploy helper now auto-bootstraps first-run VMs when runtime user provisioning is missing during CI/CD rollout.
- Azure runtime deploy now auto-recovers canonical env file from legacy `/etc/listenlater/listenlater.env` when present.
- Azure python-tts provisioning now installs CPU-only torch wheels with pip cache disabled to prevent VM disk exhaustion during deploy.
- Azure runtime deploy now supports incremental patch mode (skip unchanged pnpm/python setup, seed auto-once) with explicit full-deploy override.
- Systemd install now removes stale legacy `listenlater-*` unit files before enabling compatibility aliases.
- Deploy helper health checks now retry by default and avoid unreachable `:3000` fallback for FQDN targets.
- Worker queue error handling now tolerates user deletion of in-flight items without crashing the worker process (job events become best-effort when parent records are removed).
- Observability track (`M47`-`M56`) is completed at the documented baseline contract level.
- Markdown artifact track (`M57`-`M64`) is implemented for dual artifact persistence and markdown-first extraction outputs.
- Canonical-domain ingress/TLS automation (`M65`) is implemented for Azure VM deploy flow (`articlepod.com` canonical + `www` redirect).
- Extension popup UX now uses packaged runtime server target config (local/private/public) with hidden reconnect code once configured and explicit capture-start feedback.
- Dashboard UX now splits `/app` (episode submission + recent items) from `/app/settings` (feed token, extension auth, voice settings), with compact feed URL visibility in the signed-in header.

## Requirement Coverage Snapshot

| Requirement | Planned Milestone(s) |
|---|---|
| One-command local startup (`pnpm dev`) | M01, M04 |
| Local-first operation (no paid services) | M04, M12, M13 |
| Google + Apple auth integration | M06 |
| OAuth hardening completion (env-gated production-ready) | M23 |
| Shareable read-only demo access | M07, M17 |
| Async pipeline only (no heavy request work) | M09 |
| Idempotent/restartable jobs + caching | M09, M11, M12, M13 |
| Deterministic serialization (RSS, logs, manifests) | M09, M15, M18 |
| RSS correctness (GUID, enclosure uniqueness, ordering) | M15 |
| Media `HEAD` + `Range` compatibility | M14, M21 |
| URL + PDF ingest (no OCR for scanned PDFs) | M08, M10 |
| Admin module (users, jobs, diagnostics) | M06, M16 |
| Export command (`pnpm export`) | M18 |
| Azure-ready path (containers + env/resource map) | M19 |
| License policy gate (deny AGPL/SSPL/NC) | M20 |
| Demo starter item preloaded by default | M17 |
| Attribution for copied patterns (`abogen`, `postcast`) | M03 |
| Chrome extension raw HTML snapshot ingest | M24, M25, M26, M27, M28 |
| OAuth + extension regression automation in CI | M20, M29 |
| Extension onboarding and reconnect UX | M30 |
| Extraction quality guardrails for noisy/authenticated pages | M31 |
| Operational observability and release certification | M21, M32, M33 |
| Unified observability, error triage, and Azure monitoring parity | M47, M48, M49, M50, M51, M52, M53, M54, M55, M56 |
| Data lifecycle hardening for diagnostics and extension tokens | M34 |
| Durable managed persistence independent of VM lifecycle | M35, M38, M39, M45 |
| Local parity environment (Docker Compose parity profile) | M35, M36, M37, M46 |
| Azure reproducible provisioning with IaC (`Bicep` + `azd`) | M43, M44 |
| Backup/restore drill certification and evidence | M45, M46 |
| Markdown-first extraction artifact persistence | M57, M58, M59, M60, M61, M62, M63, M64 |
| Dual artifact policy (raw + markdown initially) | M57, M61 |
| 90-day raw artifact retention lifecycle | M57, M61, M64 |
| Markdown-derived TTS input contract | M62 |

## Milestone Status Snapshot

Milestone metadata contract:
- `Status`: `Done | In Progress | Planned`
- `Target Finish`: required for every milestone
- `Completed On`: required for `Done` milestones
- `Evidence`: required for `Done` milestones (best-effort commit/date reference)

| Milestone | Status | Target Finish | Completed On | Evidence |
|---|---|---|---|---|
| M00 | Done | 2026-02-07 | 2026-02-07 | cd05000 (2026-02-07) |
| M01 | Done | 2026-02-07 | 2026-02-07 | be72a8d (2026-02-07) |
| M02 | Done | 2026-02-07 | 2026-02-07 | be72a8d (2026-02-07) |
| M03 | Done | 2026-02-07 | 2026-02-07 | d6addf9 (2026-02-07) |
| M04 | Done | 2026-02-07 | 2026-02-07 | be72a8d (2026-02-07) |
| M05 | Done | 2026-02-07 | 2026-02-07 | be72a8d (2026-02-07) |
| M06 | Done | 2026-02-08 | 2026-02-08 | 740f60c (2026-02-08) |
| M07 | Done | 2026-02-07 | 2026-02-07 | be72a8d (2026-02-07) |
| M08 | Done | 2026-02-07 | 2026-02-07 | be72a8d (2026-02-07) |
| M09 | Done | 2026-02-07 | 2026-02-07 | be72a8d (2026-02-07) |
| M10 | Done | 2026-02-07 | 2026-02-07 | 2b7b28b (2026-02-07) |
| M11 | Done | 2026-02-07 | 2026-02-07 | be72a8d (2026-02-07) |
| M12 | Done | 2026-02-07 | 2026-02-07 | c18dcfd (2026-02-07) |
| M13 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M14 | Done | 2026-02-07 | 2026-02-07 | 9244702 (2026-02-07) |
| M15 | Done | 2026-02-07 | 2026-02-07 | 9244702 (2026-02-07) |
| M16 | Done | 2026-02-07 | 2026-02-07 | be72a8d (2026-02-07) |
| M17 | Done | 2026-02-07 | 2026-02-07 | 8923f21 (2026-02-07) |
| M18 | Done | 2026-02-07 | 2026-02-07 | be72a8d (2026-02-07) |
| M19 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M20 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M21 | Done | 2026-02-28 | 2026-02-14 | podcast contract gate pass + release checklist protocol |
| M22 | Done | 2026-03-14 | 2026-02-14 | optional phase closed for MVP (single-episode design locked) |
| M23 | Done | 2026-02-08 | 2026-02-08 | 740f60c (2026-02-08) |
| M24 | Done | 2026-02-08 | 2026-02-08 | 740f60c (2026-02-08) |
| M25 | Done | 2026-02-08 | 2026-02-08 | 740f60c (2026-02-08) |
| M26 | Done | 2026-02-08 | 2026-02-08 | 740f60c (2026-02-08) |
| M27 | Done | 2026-02-08 | 2026-02-08 | 86f1b7a (2026-02-08) |
| M28 | Done | 2026-02-28 | 2026-02-14 | extension policy/docs + token revocation + snapshot auth tests |
| M29 | Done | 2026-03-07 | 2026-02-14 | oauth/extension/html-snapshot integration suites + CI gates |
| M30 | Done | 2026-03-14 | 2026-02-14 | in-app extension onboarding + reconnect/revoke UX |
| M31 | Done | 2026-03-21 | 2026-02-14 | extraction quality fixture coverage + low-signal failure mapping |
| M32 | Done | 2026-03-28 | 2026-02-14 | admin backlog/latency/top-failure visibility + runbook |
| M33 | Done | 2026-04-04 | 2026-02-14 | release checklist + contract evidence workflow |
| M34 | Done | 2026-04-11 | 2026-02-14 | diagnostics/token lifecycle hardening + purge automation |
| M35 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M36 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M37 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M38 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M39 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M40 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M41 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M42 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M43 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M44 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M45 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M46 | Done | 2026-02-08 | 2026-02-08 | 1e69fda (2026-02-08) |
| M47 | Done | 2026-02-09 | 2026-02-09 | a2774bd (2026-02-09) |
| M48 | Done | 2026-02-09 | 2026-02-09 | a2774bd (2026-02-09) |
| M49 | Done | 2026-02-09 | 2026-02-09 | a2774bd (2026-02-09) |
| M50 | Done | 2026-02-09 | 2026-02-09 | a2774bd (2026-02-09) |
| M51 | Done | 2026-04-18 | 2026-02-14 | trace-context propagation baseline across web/worker/python-tts |
| M52 | Done | 2026-04-25 | 2026-02-14 | service/business KPI baseline in admin metrics + logs |
| M53 | Done | 2026-05-02 | 2026-02-14 | Azure Log Analytics query pack + env/runbook wiring |
| M54 | Done | 2026-05-09 | 2026-02-14 | dashboard/alert starter contract in docs + operations runbook |
| M55 | Done | 2026-02-09 | 2026-02-09 | a2774bd (2026-02-09) |
| M56 | Done | 2026-05-16 | 2026-02-14 | observability verify command + CI gate |
| M57 | Done | 2026-02-21 | 2026-02-14 | local validation + implementation pass (2026-02-14) |
| M58 | Done | 2026-02-24 | 2026-02-14 | local validation + implementation pass (2026-02-14) |
| M59 | Done | 2026-02-28 | 2026-02-14 | local validation + implementation pass (2026-02-14) |
| M60 | Done | 2026-03-03 | 2026-02-14 | local validation + implementation pass (2026-02-14) |
| M61 | Done | 2026-03-07 | 2026-02-14 | local validation + implementation pass (2026-02-14) |
| M62 | Done | 2026-03-10 | 2026-02-14 | local validation + implementation pass (2026-02-14) |
| M63 | Done | 2026-03-14 | 2026-02-14 | local validation + implementation pass (2026-02-14) |
| M64 | Done | 2026-03-21 | 2026-02-14 | local validation + implementation pass (2026-02-14) |
| M65 | Done | 2026-02-25 | 2026-02-25 | a485766 (2026-02-25) |

### Status Reconciliation Ledger (2026-02-14)

| Milestone | Previous | Corrected | Evidence | Confidence | Open Gap |
|---|---|---|---|---|---|
| M06 | In Progress | Done | `740f60c` + OAuth/auth tests | High | None |
| M19 | Planned | Done | `1e69fda` + Dockerfiles + Azure docs | Medium | None |
| M20 | In Progress | Done | CI workflow + license/check gates + verification prompts section | Medium | None |
| M21 | In Progress | Done | contract gate pass + release-checklist protocol (`docs/release-checklist.md`) | Medium | External app smoke evidence follows release checklist template |
| M22 | Planned | Done | optional phase closed for current architecture (single-episode model locked) | High | None |
| M28 | In Progress | Done | extension policy + auth/revocation routes + snapshot abuse controls | High | None |
| M29 | Planned | Done | OAuth/extension/html-snapshot integration suites enforced in CI | High | None |
| M30 | Planned | Done | extension connect/reconnect/revoke UX in dashboard + popup | High | None |
| M31 | Planned | Done | low-signal extraction failures + noisy HTML cleanup coverage | Medium | None |
| M32 | Planned | Done | admin backlog/latency/top-failure metrics + operations runbook | Medium | None |
| M33 | Planned | Done | release checklist + certification evidence protocol | High | None |
| M34 | Planned | Done | token/diagnostics purge lifecycle scripts and policies | High | None |
| M47 | In Progress | Done | `a2774bd` + log/error schema docs | High | None |
| M48 | In Progress | Done | `a2774bd` + local JSONL log rotation config | High | None |
| M49 | In Progress | Done | `a2774bd` + web/worker structured logger wiring | High | None |
| M50 | In Progress | Done | `a2774bd` + python-tts correlation propagation | High | None |
| M51 | Planned | Done | trace-context propagation baseline across services | Medium | None |
| M52 | Planned | Done | admin KPI baseline + queue/failure metrics | Medium | None |
| M53 | Planned | Done | Azure query starter pack + env/runbook wiring | Medium | None |
| M54 | Planned | Done | dashboard/alert contract documented for operations | Medium | None |
| M55 | In Progress | Done | `a2774bd` + `scripts/logs-triage.mjs` | High | None |
| M56 | Planned | Done | `scripts/observability-verify.mjs` + CI step | High | None |
| M57 | Planned | Done | extraction artifact contract/docs + worker/object storage integration | High | None |
| M58 | Planned | Done | `ItemArtifact` schema + import/export support + lifecycle scripts | High | None |
| M59 | Planned | Done | HTML extraction emits markdown + raw HTML artifact payload | High | None |
| M60 | Planned | Done | PDF extraction emits markdown output (pdfjs deterministic path) | High | None |
| M61 | Planned | Done | dual artifact persistence + retention env/purge workflow | High | None |
| M62 | Planned | Done | markdown-derived narration/chunk contract in worker | High | None |
| M63 | Planned | Done | markdown diagnostics API/dashboard surface + access controls | High | None |
| M64 | Planned | Done | artifact backfill tooling + regression/certification gate run | High | None |

## Milestones

### M00 - Spec Lock and Acceptance Baseline
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: cd05000 (2026-02-07)
- Scope:
  - Convert prompts/guardrails into an auditable checklist.
  - Define completion criteria and stop/go gate for implementation start.
- Key files/modules:
  - `docs/plans.md`
- Acceptance criteria:
  - All hard requirements from `docs/Prompts.md` map to milestones.
  - Known spec mismatch list is explicit.
- Verification commands:
  - Manual checklist review in `docs/plans.md`.

### M01 - Workspace Bootstrap and Command Contract
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: be72a8d (2026-02-07)
- Scope:
  - Initialize pnpm workspace and root scripts.
  - Standardize script names: `dev`, `build`, `test`, `lint`, `typecheck`, `format`, `export`.
- Key files/modules:
  - `package.json`
  - `pnpm-workspace.yaml`
  - `tsconfig.base.json`
  - root lint/test/typecheck configs
- Acceptance criteria:
  - `pnpm dev` exists and orchestrates full local stack.
  - All required root scripts are defined.
- Verification commands:
  - `pnpm install`
  - `pnpm run dev --help`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`

### M02 - Monorepo Skeleton and Interface Boundaries
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: be72a8d (2026-02-07)
- Scope:
  - Create maintainable repo layout with strict package boundaries.
  - Define shared contracts in `packages/core`.
- Key files/modules:
  - `apps/web/`
  - `apps/worker/`
  - `packages/core/`
  - `packages/ui/` (optional for MVP)
  - `docs/`, `fixtures/`, `scripts/`, `vendor/`
- Acceptance criteria:
  - Web and worker consume shared core types/interfaces.
  - No heavy pipeline logic in request handlers.
- Verification commands:
  - `pnpm -r typecheck`
  - `pnpm -r test`

### M03 - Third-Party Reference Intake and Attribution
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: d6addf9 (2026-02-07)
- Scope:
  - Add read-only upstream references (`abogen`, `postcast`) under `vendor/`.
  - Track copied ideas/code snippets with attribution.
- Key files/modules:
  - `vendor/postcast/`
  - `vendor/abogen/` (or documented external reference if not vendored)
  - `docs/THIRD_PARTY.md`
- Acceptance criteria:
  - Upstream references are clearly isolated as non-runtime source.
  - Attribution doc explains what was reused and where.
- Verification commands:
  - `test -d vendor/postcast`
  - `test -f docs/THIRD_PARTY.md`

### M04 - Environment and Runtime Profiles (Local + Azure-Ready)
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: be72a8d (2026-02-07)
- Scope:
  - Define local defaults and cloud-compatible env contract.
  - Ensure no hardcoded local-only assumptions outside dev profile.
- Key files/modules:
  - `.env.example`
  - `docs/env.md`
  - startup scripts for web + worker + optional python service
- Acceptance criteria:
  - Local mode works with zero paid APIs.
  - Azure mode variables documented, including DB/storage/auth settings.
- Verification commands:
  - `pnpm dev` (local profile)
  - `pnpm run check:env`

### M05 - Database Schema and Migration Baseline
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: be72a8d (2026-02-07)
- Scope:
  - Implement Prisma schema for users, auth, items, episodes, jobs, events, tokens.
  - Set SQLite local DB location to `apps/web/.data/db.sqlite`.
- Key files/modules:
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/migrations/*`
  - `apps/web/src/lib/db/*`
- Acceptance criteria:
  - Schema supports private feeds, token rotation, admin visibility, and idempotent job linkage.
  - Migrations are reproducible from clean state.
- Verification commands:
  - `pnpm --filter @articlepod/web prisma migrate dev`
  - `pnpm --filter @articlepod/web test -- db`

### M06 - Authentication Surfaces (User + OAuth + Admin)
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 740f60c (2026-02-08)
- Scope:
  - Session auth for web users.
  - Google and Apple OAuth integration (env-gated).
  - Predefined admin account bootstrap and role-gated admin routes.
- Key files/modules:
  - `apps/web/src/auth/*`
  - `apps/web/src/app/login/*`
  - `apps/web/src/app/admin/*`
- Acceptance criteria:
  - Local credential login works without external providers.
  - OAuth providers work when env vars are configured.
  - Admin routes are inaccessible to non-admin users.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- auth`

### M07 - Feed Token, Media Token, and Read-Only Demo Access
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: be72a8d (2026-02-07)
- Scope:
  - Implement private feed token issuance and rotation.
  - Implement media access control via tokenized URLs or signed URLs.
  - Add read-only share mode for demos.
- Key files/modules:
  - `apps/web/src/app/api/feed-token/*`
  - `apps/web/src/app/api/share/*`
  - `packages/core/src/security/tokens/*`
- Acceptance criteria:
  - Rotating feed token invalidates old feed URLs.
  - Tokens are never logged or leaked in client-visible errors.
  - Shared read-only mode cannot mutate items/settings.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- tokens`
  - manual: old feed URL returns unauthorized/not found after rotation

### M08 - Ingestion APIs and Abuse Prevention
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: be72a8d (2026-02-07)
- Scope:
  - Add URL submission and PDF upload endpoints.
  - Add Zod validation, file size/type checks, and per-user/per-IP rate limiting.
  - Add SSRF protections for URL fetch pipeline.
- Key files/modules:
  - `apps/web/src/app/api/items/*`
  - `packages/core/src/validation/*`
  - `packages/core/src/security/urlPolicy.ts`
  - `packages/core/src/security/rateLimit/*`
- Acceptance criteria:
  - Valid URL/PDF creates queued item.
  - Private/internal IP and metadata endpoint requests are blocked.
  - Invalid files/oversized files are rejected with clear error codes/messages.
- Verification commands:
  - `pnpm test -- ingestion`
  - `pnpm test -- security`

### M09 - Job Engine, Async Pipeline, and Deterministic Event Log
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: be72a8d (2026-02-07)
- Scope:
  - Implement worker loop: claim, process, retry, dead-letter/fail handling.
  - Enforce async-only conversion path; web only enqueues and displays state.
  - Emit append-only structured job events.
- Key files/modules:
  - `apps/worker/src/runner/*`
  - `apps/worker/src/jobs/*`
  - `packages/core/src/jobs/*`
  - `packages/core/src/logging/*`
- Acceptance criteria:
  - State transitions: `queued -> processing -> ready|failed`.
  - Retries do not duplicate episodes or re-run already completed expensive steps.
  - Job events are deterministic and linked to `item_id`/`job_id`.
  - Structured logs include `item_id`/`job_id` and avoid dumping full extracted text bodies.
- Verification commands:
  - `pnpm --filter @articlepod/worker test -- jobs`
  - `pnpm --filter @articlepod/worker test -- idempotency`

### M10 - Content Extraction Adapters (HTML + PDF, OCR Unsupported)
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: 2b7b28b (2026-02-07)
- Scope:
  - Implement Readability-based HTML extraction.
  - Implement text-based PDF extraction via pdfjs.
  - Detect scanned/image-heavy PDFs and fail with explicit OCR-not-supported error.
- Key files/modules:
  - `packages/core/src/extract/html/*`
  - `packages/core/src/extract/pdf/*`
  - `fixtures/html/*`
  - `fixtures/pdf/*`
- Acceptance criteria:
  - Fixture extraction is deterministic and non-empty for valid inputs.
  - Scanned-PDF path fails predictably with machine-readable error code.
- Verification commands:
  - `pnpm test -- extraction`
  - `pnpm test -- extraction-pdf`

### M11 - Normalization, Chunking, and Hash-Cache Determinism
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: be72a8d (2026-02-07)
- Scope:
  - Normalize extracted text and split by sentence/paragraph constraints.
  - Persist chunk hashes for TTS cache reuse.
- Key files/modules:
  - `packages/core/src/normalize/*`
  - `packages/core/src/chunking/*`
- Acceptance criteria:
  - Same input always yields same chunk boundaries and hash set.
  - Chunk cache prevents repeated synthesis on retries/restarts.
- Verification commands:
  - `pnpm test -- chunking`
  - `pnpm test -- determinism`

### M12 - TTS Provider Layer (Kokoro-First + Optional Providers)
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: c18dcfd (2026-02-07)
- Scope:
  - Define `TtsProvider.synthesizeToFile({ text, voice, format, outPath })`.
  - Implement Kokoro-backed local narration path through python-tts service.
  - Keep optional providers (e.g., OpenAI/macOS `say`) behind adapters where configured.
  - Maintain python service runtime and preview prewarm path.
- Key files/modules:
  - `packages/core/src/tts/types.ts`
  - `packages/core/src/tts/kokoro.ts`
  - `packages/core/src/tts/openai.ts`
  - `services/python-tts/` (runtime service)
- Acceptance criteria:
  - Local audio generation works with no cloud dependencies.
  - Provider selection is adapter-driven and test-mockable.
  - Python service can run locally and expose synthesis/health endpoints.
- Verification commands:
  - `pnpm test -- tts`
  - `pnpm test -- tts-provider-selection`
  - `npm run test:tts:e2e`

### M13 - Storage Adapter and Artifact Lifecycle
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Implement local storage adapter for media outputs.
  - Define deterministic storage key format for audio/chunks/manifests.
  - Add cleanup behavior for deleted items/accounts.
- Key files/modules:
  - `packages/core/src/storage/*`
  - `apps/web/.data/media/` (runtime path)
  - deletion handlers in web/worker flows
- Acceptance criteria:
  - Deterministic keys allow safe retries and cache hits.
  - Delete item/account removes or tombstones related artifacts as defined.
  - Data retention policy minimizes long-lived storage of full extracted text unless explicitly required.
- Verification commands:
  - `pnpm test -- storage`
  - `pnpm test -- deletion`

### M14 - Media Delivery Contract (`HEAD` + `Range`)
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: 9244702 (2026-02-07)
- Scope:
  - Implement media endpoint with strict HTTP semantics for podcast clients.
  - Preserve range behavior if proxying through backend.
- Key files/modules:
  - `apps/web/src/app/api/media/*`
  - `packages/core/src/http/range/*`
- Acceptance criteria:
  - `HEAD` returns valid `Content-Length` and type.
  - `Range: bytes=0-1` returns `206` with valid `Content-Range`.
  - Unauthorized media token requests fail without exposing secrets.
- Verification commands:
  - `pnpm test -- media`
  - `curl -I "<MP3_URL>"`
  - `curl -i -H "Range: bytes=0-1" "<MP3_URL>"`

### M15 - Deterministic RSS Renderer and Private Feed Endpoint
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: 9244702 (2026-02-07)
- Scope:
  - Build RSS 2.0 feed with iTunes namespace and deterministic ordering.
  - Ensure stable GUID and unique enclosure URL per episode item.
- Key files/modules:
  - `packages/core/src/rss/*`
  - `apps/web/src/app/rss/[feedToken]/route.ts` (or equivalent)
- Acceptance criteria:
  - RFC 2822 `pubDate`, proper XML escaping, newest-first item order.
  - Enclosure includes correct URL, byte length, and MIME.
  - No item publishes until audio is confirmed available/range-capable.
- Verification commands:
  - `pnpm test -- rss`
  - `pnpm test -- rss-snapshots`

### M16 - Web App UX and Admin Observability Module
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: be72a8d (2026-02-07)
- Scope:
  - Implement `/login` and `/app` dashboard UX.
  - Implement URL/PDF forms, item status list, retry/delete actions.
  - Add in-browser playback and download.
  - Build admin dashboard for active users, job success/failure, error logs.
- Key files/modules:
  - `apps/web/src/app/login/*`
  - `apps/web/src/app/app/*`
  - `apps/web/src/app/admin/*`
  - shared UI components
- Acceptance criteria:
  - UI is implemented with React + Tailwind and remains polished for live demos.
  - Clear empty states, toasts, and failure guidance.
  - Admin dashboard is presentation-ready and role-protected.
  - Delete item + delete account flows are available and functional.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- ui`
  - `pnpm --filter @articlepod/web test -- admin`

### M17 - Demo Starter Content and Read-Only Demo Experience
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: 8923f21 (2026-02-07)
- Scope:
  - Add sample PDF fixture, pre-generated audio, and seeded episode/feed entry.
  - Show demo banner when running with seeded data.
  - Provide read-only URL workflow for demo observers.
- Key files/modules:
  - `fixtures/demo/*`
  - `scripts/seed-demo.*`
  - dashboard demo components
- Acceptance criteria:
  - Fresh local run shows playable starter episode without API keys.
  - Read-only demo URL allows viewing/listening but blocks edits.
- Verification commands:
  - `pnpm run seed:demo`
  - `pnpm test -- demo-seed`

### M18 - Export Pipeline and Deterministic Manifest
- status: Done
- target_finish: 2026-02-07
- completed_on: 2026-02-07
- evidence: be72a8d (2026-02-07)
- Scope:
  - Implement `pnpm export` to write RSS, media files, and manifest JSON.
  - Ensure manifest ordering and fields are deterministic.
- Key files/modules:
  - `scripts/export.*`
  - `exports/rss.xml`
  - `exports/media/*`
  - `exports/manifest.json`
- Acceptance criteria:
  - Export command succeeds from local state.
  - Manifest and RSS outputs are stable across repeated runs.
- Verification commands:
  - `pnpm export`
  - `pnpm test -- export`

### M19 - Azure Readiness and Deployment Documentation
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Containerize web and worker.
  - Document Azure resource map, env vars, and deployment steps.
  - Keep runtime adapters cloud-ready (DB/storage/auth).
- Key files/modules:
  - `Dockerfile.web`
  - `Dockerfile.worker`
  - `docs/azure-deploy.md`
  - `docs/architecture.md`
- Acceptance criteria:
  - Containers build locally.
  - Docs clearly map local config to Azure config.
- Verification commands:
  - `docker build -f Dockerfile.web .`
  - `docker build -f Dockerfile.worker .`

### M20 - Automated Quality Gates and Spec-Drift Controls
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Add CI workflow for lint, typecheck, tests, build, snapshots.
  - Add dependency license gate to block AGPL/SSPL/NC.
  - Add and run verification prompts flow from `docs/Prompts.md`.
- Key files/modules:
  - `.github/workflows/ci.yml` (or equivalent)
  - `scripts/license-check.*`
  - `docs/Prompts.md` (add "Verification Prompts" section)
- Acceptance criteria:
  - CI fails on lint/type/test/snapshot/license violations.
  - Verification prompts exist and are run before release signoff.
- Verification commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm run license:check`
  - `ruff check services/python-tts`
  - `mypy services/python-tts` (if configured)

### M21 - Release Certification and Podcast Compatibility Gate
- status: Done
- target_finish: 2026-02-28
- completed_on: 2026-02-14
- evidence: podcast contract gate pass + `docs/release-checklist.md`
- Scope:
  - Run final release checklist including podcast client compatibility checks.
  - Validate with manual app subscription tests on reachable host.
- Key files/modules:
  - `scripts/verify_podcast_contract.sh`
  - `docs/release-checklist.md`
- Acceptance criteria:
  - Contract script passes on final feed URL.
  - Manual smoke protocol is documented for Apple Podcasts + one other app.
  - Demo walkthrough remains reproducible in under 3 minutes.
- Verification commands:
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`
  - `curl -I "<FEED_URL>"`
  - `curl -I "<MP3_URL>"`
  - `curl -i -H "Range: bytes=0-1" "<MP3_URL>"`

### M22 - Optional Phase 1.5: Multi-Part Episode Splitting for Long Inputs
- status: Done
- target_finish: 2026-03-14
- completed_on: 2026-02-14
- evidence: optional phase closure decision (single-episode model retained)
- Scope:
  - Optional scope intentionally closed for current release train.
  - Keep one-item-one-episode contract to preserve feed simplicity and deterministic IDs.
- Key files/modules:
  - chunking + episode assembly modules in `packages/core`
  - feed rendering logic in `packages/core/src/rss/*`
- Acceptance criteria:
  - Current architecture remains deterministic and stable with single-episode outputs.
  - Multi-part splitting remains explicitly documented as future optional expansion.
- Verification commands:
  - `pnpm test -- rss`

### M23 - OAuth Hardening Completion (Google + Apple)
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 740f60c (2026-02-08)
- Scope:
  - Add provider config detection and explicit login UX gating.
  - Harden callback/state handling and user-safe error mapping.
  - Add provider-subject identity linking strategy to avoid unsafe email-only collisions.
  - Add automated tests for success/failure callback paths.
- Key files/modules:
  - `apps/web/src/app/api/auth/google/*`
  - `apps/web/src/app/api/auth/apple/*`
  - `apps/web/src/lib/auth.ts`
  - `apps/web/src/app/login/page.tsx`
- Acceptance criteria:
  - Local password login works without external providers configured.
  - OAuth buttons/routes handle unconfigured providers cleanly.
  - With valid provider env set, callback creates session and lands in `/app`.
  - Admin/user role protections remain intact.
- Verification commands:
  - `npm run lint`
  - `npm run test`
  - `npm run build`
  - auth integration tests with mocked provider flows

### M24 - Extension Auth Model (Login In Extension)
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 740f60c (2026-02-08)
- Scope:
  - Implement one-time connect-code mint endpoint (session-authenticated from web app).
  - Implement code exchange endpoint for extension-scoped token.
  - Store extension tokens hashed at rest and support rotation/revocation.
- Key files/modules:
  - `apps/web/src/app/api/auth/extension/connect-code/*`
  - `apps/web/src/app/api/auth/extension/exchange/*`
  - `packages/core/src/security/tokens/*`
  - Prisma schema additions for extension tokens/codes
- Acceptance criteria:
  - User can connect extension without entering provider secrets in extension UI.
  - Extension token authorizes ingest-only extension APIs.
  - Expired/replayed/revoked tokens are rejected with clear errors.
- Verification commands:
  - token lifecycle tests
  - unauthorized/expired/replayed token tests

### M25 - HTML Snapshot Ingestion API
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 740f60c (2026-02-08)
- Scope:
  - Add new source type `HTML_SNAPSHOT`.
  - Implement `POST /api/items/html-snapshot`.
  - Accept canonical URL, optional title fallback, raw HTML snapshot, and capture metadata.
  - Add payload size limits, schema validation, and abuse controls.
  - Keep snapshot retention ephemeral by default.
- Key files/modules:
  - `apps/web/src/app/api/items/html-snapshot/*`
  - `apps/web/src/lib/items.ts`
  - `packages/core/src/types/domain.ts`
  - `packages/core` submit schemas
- Acceptance criteria:
  - Valid snapshot enqueue path works and does not require backend URL fetch.
  - Clear errors for malformed or oversized payloads.
  - Existing URL/PDF ingestion remains unchanged.
- Verification commands:
  - schema validation tests
  - ingest API tests for `HTML_SNAPSHOT`
  - regression tests for URL/PDF endpoints

### M26 - Worker Extraction Path for Snapshot Mode
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 740f60c (2026-02-08)
- Scope:
  - Extend extraction adapter to support URL, PDF, and HTML snapshot source modes.
  - Reuse cleanup pipeline for deterministic output quality.
  - Ensure chunk/hash determinism is unchanged for equivalent content.
- Key files/modules:
  - `apps/worker/src/jobs/processItemJob.ts`
  - `packages/core/src/extract/*`
  - extraction fixtures for snapshot mode
- Acceptance criteria:
  - `HTML_SNAPSHOT` source processes without network fetch.
  - Output quality and determinism are comparable to current URL flow.
  - Failures return actionable extraction errors.
- Verification commands:
  - extraction fixture tests for snapshot mode
  - chunk determinism tests
  - worker pipeline tests

### M27 - Chrome Extension (MV3) UX + Capture Flow
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 86f1b7a (2026-02-08)
- Scope:
  - Build extension popup UX with connect status and submit action.
  - Capture `document.documentElement.outerHTML`, page URL, and title from active tab.
  - Send authenticated payload to backend snapshot ingest API.
  - Provide user-facing error/success feedback in extension popup.
- Key files/modules:
  - `apps/extension/` (MV3 manifest, popup, background, content script)
  - backend extension auth and ingest routes
  - docs for local extension loading
- Acceptance criteria:
  - End-to-end capture from active tab creates queued item successfully.
  - Extension UX clearly indicates connected/disconnected/submission states.
  - Errors are understandable (unsupported page, payload too large, auth expired).
- Verification commands:
  - local extension manual smoke script
  - API contract tests for extension requests

### M28 - Security/Compliance + Demo Readiness for Extension
- status: Done
- target_finish: 2026-02-28
- completed_on: 2026-02-14
- evidence: policy guardrails + extension auth/revoke + snapshot limits/tests
- Scope:
  - Enforce user-visible-content-only policy for extension ingestion.
  - Minimize extension permissions and review abuse scenarios.
  - Add audit logging for extension submissions.
  - Extend demo script to include extension capture flow.
- Key files/modules:
  - extension manifest + permission docs
  - ingestion policy checks
  - `docs/plans.md` demo script + security checklist
- Acceptance criteria:
  - Security checklist passes for token handling and payload controls.
  - Extension flow is demo-ready and repeatable.
  - Policy is explicit: no credential forwarding/session replay/headless bypass.
- Verification commands:
  - security tests (token misuse, payload abuse)
  - demo walkthrough including extension capture

### M29 - OAuth + Extension End-to-End Regression Matrix (CI)
- status: Done
- target_finish: 2026-03-07
- completed_on: 2026-02-14
- evidence: auth/extension/html-snapshot integration suites + CI simple/parity gates
- Scope:
  - Add dedicated integration test suites for OAuth callback flows and extension auth/token exchange flows.
  - Add HTML snapshot ingest integration tests to CI, including failure-path coverage.
  - Enforce these suites as release-blocking quality gates.
- Key files/modules:
  - `apps/web/tests/auth-routes.test.ts`
  - `apps/web/tests/auth-extension.integration.test.ts`
  - `apps/worker/tests/queue-resilience.test.ts`
  - `.github/workflows/ci.yml`
- Acceptance criteria:
  - CI fails on OAuth or extension contract regressions.
  - Test matrix includes unconfigured providers, callback failures, connect-code replay/expiry, and snapshot ingest success/failure.
  - URL/PDF ingestion regression tests remain green.
- Verification commands:
  - `npm run test -- oauth`
  - `npm run test -- extension-auth`
  - `npm run test -- html-snapshot`
  - `npm run lint`
  - `npm run build`

### M30 - Extension Onboarding + Recovery UX
- status: Done
- target_finish: 2026-03-14
- completed_on: 2026-02-14
- evidence: dashboard connect/revoke UX + popup reconnect/disconnect states
- Scope:
  - Add in-app extension onboarding panel with connect status and reconnect guidance.
  - Improve extension popup states for disconnected/connected/submitting/failed.
  - Add token-expiry handling UX and retry actions for common failures.
- Key files/modules:
  - `apps/web/src/components/dashboard-client.tsx`
  - `apps/extension/popup.js`
  - `apps/extension/popup.html`
  - `docs/documentation.md`
- Acceptance criteria:
  - User can connect extension in under 30 seconds from dashboard.
  - Expired/revoked token states show explicit reconnect path.
  - Failed submissions provide actionable errors and retry option.
- Verification commands:
  - `npm run test -- extension-ui`
  - `npm run test -- extension-auth`
  - manual onboarding smoke walkthrough

### M31 - Extraction Quality Guardrails for Noisy HTML
- status: Done
- target_finish: 2026-03-21
- completed_on: 2026-02-14
- evidence: extraction fixture tests + low-signal failure handling
- Scope:
  - Build a fixture suite for noisy/authenticated-page HTML samples.
  - Add extraction quality assertions (boilerplate reduction, minimum useful text, heading/body coherence).
  - Add explicit failure mapping when cleaned text quality is too low to narrate.
- Key files/modules:
  - `fixtures/html/article.html`
  - `packages/core/src/extract/html.ts`
  - `packages/core/tests/extract.test.ts`
  - `apps/worker/src/jobs/processItemJob.ts`
- Acceptance criteria:
  - Quality fixture suite protects against known junk extraction regressions.
  - Low-signal outputs fail with machine-readable quality error codes.
  - Existing high-quality fixtures remain stable.
- Verification commands:
  - `npm run test -- extraction-quality`
  - `npm run test -- extraction`
  - `npm run test -- worker`

### M32 - Operational Observability Baseline
- status: Done
- target_finish: 2026-03-28
- completed_on: 2026-02-14
- evidence: admin backlog/latency/top-error metrics + operations runbook
- Scope:
  - Add service-level metrics for queue depth, job latency, retry rate, and failure codes.
  - Surface key health metrics and recent pipeline failures in admin dashboard.
  - Add operator runbook for local troubleshooting and production triage.
- Key files/modules:
  - `packages/core/src/logging/*`
  - `apps/web/src/app/admin/page.tsx`
  - `apps/web/src/lib/dashboard.ts`
  - `apps/web/src/app/api/admin/metrics/route.ts`
  - `apps/worker/src/jobs/processItemJob.ts`
  - `docs/operations.md`
- Acceptance criteria:
  - Admin can see current backlog, processing latency, and top failure reasons.
  - Logs/metrics are correlated by `item_id` and `job_id`.
  - Runbook contains actionable investigation steps for top incident classes.
- Verification commands:
  - `npm run test -- admin`
  - `npm run test -- worker`
  - manual admin observability walkthrough

### M33 - Release Certification Matrix (Apple + Secondary App)
- status: Done
- target_finish: 2026-04-04
- completed_on: 2026-02-14
- evidence: `docs/release-checklist.md` + podcast contract gate evidence
- Scope:
  - Formalize release candidate checklist with automated + manual podcast compatibility checks.
  - Add reproducible Apple Podcasts + second-app subscription test protocol for reachable environments.
  - Record release evidence artifacts (feed validation, range checks, manual smoke pass/fail).
- Key files/modules:
  - `scripts/verify_podcast_contract.sh`
  - `docs/release-checklist.md`
  - `docs/plans.md` release gate section
- Acceptance criteria:
  - Every RC has a signed-off checklist with scripted and manual results.
  - Feed/media compatibility checks pass before release tag.
  - Any failures are tracked with explicit blockers and owners.
- Verification commands:
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`
  - `curl -I "<FEED_URL>"`
  - `curl -I "<MP3_URL>"`
  - `curl -i -H "Range: bytes=0-1" "<MP3_URL>"`

### M34 - Security + Data Lifecycle Hardening
- status: Done
- target_finish: 2026-04-11
- completed_on: 2026-02-14
- evidence: token revoke flow + diagnostics/artifact purge automation
- Scope:
  - Harden retention controls for demo-only extraction diagnostics and extension auth artifacts.
  - Add token rotation/revocation UX for extension access.
  - Add periodic purge routines and audit logging coverage for sensitive artifacts.
- Key files/modules:
  - `apps/web/src/lib/demo-diagnostics.ts`
  - `apps/web/src/app/api/auth/extension/*`
  - `apps/web/prisma/schema.prisma`
  - `apps/worker/src/jobs/*`
- Acceptance criteria:
  - Demo diagnostics retention policy is automatically enforced and test-covered.
  - Extension token rotation immediately invalidates prior tokens.
  - Audit logs provide sufficient traceability without exposing secrets.
- Verification commands:
  - `npm run test -- security`
  - `npm run test -- demo-diagnostics`
  - `npm run test -- extension-auth`

### M35 - Durable Azure Target Lock + Parity Contract
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Lock next-phase runtime target: single VM compute (`web`, `worker`, `python-tts`) + Azure PostgreSQL + Azure Blob.
  - Lock local parity strategy: Docker Compose profile that mirrors Azure dependencies.
  - Add ADR-style decision record for durability-first architecture choices and non-goals for this phase.
- Key files/modules:
  - `docs/plans.md`
  - `docs/architecture.md`
  - `docs/env.md`
- Acceptance criteria:
  - Durable target contract is explicit and unambiguous in docs.
  - Local profiles `simple` and `parity` are defined with intended use-cases.
  - Architecture review checklist maps components to existing code modules.
- Verification commands:
  - manual architecture checklist review in `docs/architecture.md`
  - `pnpm run check:env`

### M36 - Local Parity Compose Stack
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Create parity stack with `web`, `worker`, `python-tts`, `postgres`, and `azurite`.
  - Add parity startup and teardown scripts for repeatable local runs.
  - Add health checks and troubleshooting guidance.
- Key files/modules:
  - `docker-compose.parity.yml`
  - `scripts/parity-up.sh`
  - `scripts/parity-down.sh`
  - `docs/documentation.md`
- Acceptance criteria:
  - Parity stack starts cleanly on a fresh machine.
  - Service health endpoints and dependencies become ready without manual patching.
  - Developer can switch between `simple` and `parity` profiles predictably.
- Verification commands:
  - `docker compose -f docker-compose.parity.yml up -d --build`
  - `docker compose -f docker-compose.parity.yml ps`
  - `curl -sf http://localhost:8010/health`
  - `docker compose -f docker-compose.parity.yml down`

### M37 - Env Contract Hardening (Simple vs Parity vs Azure)
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Add strict, profile-aware env validation to prevent config drift.
  - Provide profile templates: `.env.simple.example`, `.env.parity.example`, `.env.azure.example`.
  - Ensure missing critical vars fail fast with actionable remediation messages.
- Key files/modules:
  - `scripts/check-env.mjs`
  - `.env.simple.example`
  - `.env.parity.example`
  - `.env.azure.example`
  - `docs/env.md`
- Acceptance criteria:
  - All profiles validate required variables correctly.
  - Error messages point directly to missing keys and profile docs.
  - CI can run profile-level env validation as a gate.
- Verification commands:
  - `node scripts/check-env.mjs --profile simple`
  - `node scripts/check-env.mjs --profile parity`
  - `node scripts/check-env.mjs --profile azure`

### M38 - PostgreSQL Migration Foundation
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Replace SQLite as durable system-of-record for parity/Azure tracks.
  - Introduce migration/import path for existing local SQLite datasets.
  - Document rollback and data integrity verification strategy.
- Key files/modules:
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/migrations/*`
  - `apps/web/scripts/*migrate*`
  - `docs/architecture.md`
- Acceptance criteria:
  - Auth, items, jobs, episodes, tokens, and extension entities persist correctly in PostgreSQL.
  - Migration/import preserves referential integrity.
  - Rollback path is documented and tested on fixture data.
- Verification commands:
  - `pnpm --filter @articlepod/web prisma migrate deploy`
  - `pnpm --filter @articlepod/web test -- db`
  - `pnpm --filter @articlepod/web test -- auth`

### M39 - Blob Storage Adapter (Uploads + Audio + Diagnostics Artifacts)
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Implement Azure Blob storage adapter and wire it into upload/output paths.
  - Migrate artifact references from local filesystem assumptions to object keys.
  - Add retention/lifecycle policy notes for diagnostic artifacts.
- Key files/modules:
  - `packages/core/src/storage/*`
  - `apps/web/src/app/api/items/pdf/route.ts`
  - `apps/worker/src/jobs/processItemJob.ts`
  - `docs/architecture.md`
- Acceptance criteria:
  - New uploads and generated audio remain accessible across app restarts and VM replacement.
  - Deterministic object key conventions are documented and test-covered.
  - No critical artifact depends on VM-local disk for durability.
- Verification commands:
  - `pnpm test -- storage`
  - `pnpm test -- ingestion`
  - `pnpm test -- worker`

### M40 - Media Proxy Contract with Blob Backend
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Preserve strict podcast streaming semantics while serving from Blob-backed artifacts.
  - Ensure `HEAD` and byte-range (`206`) behavior remains correct under proxy path.
  - Keep feed/media token protections unchanged.
- Key files/modules:
  - `apps/web/src/app/api/media/[...path]/route.ts`
  - `packages/core/src/rss/*`
  - `scripts/verify_podcast_contract.sh`
- Acceptance criteria:
  - Podcast compatibility gate passes against Blob-backed media.
  - `Content-Length`, `Content-Range`, and MIME values remain accurate.
  - Unauthorized token access fails safely.
- Verification commands:
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`
  - `curl -I "<MP3_URL>"`
  - `curl -i -H "Range: bytes=0-1" "<MP3_URL>"`

### M41 - Worker Artifact Flow Refactor (Blob-Native)
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Refactor worker artifact handling to read/write durable storage keys instead of local paths.
  - Ensure URL, PDF, and HTML snapshot pipelines remain behaviorally equivalent.
  - Keep deterministic chunk/hash cache behavior unchanged.
- Key files/modules:
  - `apps/worker/src/jobs/processItemJob.ts`
  - `packages/core/src/storage/*`
  - worker and integration test suites
- Acceptance criteria:
  - Worker no longer assumes local disk durability for critical inputs/outputs.
  - All ingest source types continue to process successfully.
  - Regression coverage confirms no behavioral break in existing flows.
- Verification commands:
  - `pnpm --filter @articlepod/worker test -- jobs`
  - `pnpm --filter @articlepod/web test -- auth-routes`
  - `pnpm test -- extension-auth`

### M42 - PostgreSQL Queue Resilience Hardening
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Harden DB queue with stale lock reclaim and retry scheduler loop (`nextRetryAt` semantics).
  - Add retry jitter and explicit idempotency guards for crash/restart scenarios.
  - Document operational recovery steps for stuck or long-running jobs.
- Key files/modules:
  - `apps/worker/src/index.ts`
  - `apps/worker/src/jobs/processItemJob.ts`
  - `docs/operations.md`
- Acceptance criteria:
  - Forced worker interruption does not leave jobs permanently stuck in `PROCESSING`.
  - Retry behavior is predictable and deterministic.
  - Idempotency guarantees remain intact under recovery.
- Verification commands:
  - `pnpm --filter @articlepod/worker test -- idempotency`
  - `pnpm --filter @articlepod/worker test -- retries`
  - `pnpm --filter @articlepod/worker test -- crash-recovery`

### M43 - Azure IaC Baseline (`Bicep` + `azd`)
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Add reproducible infrastructure definitions for VM compute, PostgreSQL, Blob, networking, and secret wiring.
  - Add `azd` workflow for environment bootstrapping and configuration sync.
  - Add IaC review checklist and drift-detection guidance.
- Key files/modules:
  - `infra/` (Bicep templates + parameters)
  - `azure.yaml` (or equivalent `azd` project config)
  - `docs/azure-deploy.md`
- Acceptance criteria:
  - Fresh resource group can be provisioned from IaC with no manual portal-only steps.
  - Environment outputs map cleanly to app env variables.
  - Drift checks are documented for repeat deployments.
- Verification commands:
  - `azd up`
  - `azd env refresh`
  - scripted `az deployment group what-if`

### M44 - VM Runtime Deployment Automation
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Automate VM runtime provisioning for Node, Python, app services, and Kokoro model bootstrap.
  - Configure `systemd` units for `web`, `worker`, and `python-tts`.
  - Add restart/reboot recovery checks and rollout steps.
- Key files/modules:
  - `scripts/azure/vm-provision/*`
  - `scripts/azure/deploy/*`
  - `ops/systemd/*`
  - `docs/azure-deploy.md`
- Acceptance criteria:
  - Clean VM can be provisioned and run stack without manual ad-hoc edits.
  - VM reboot restores all required services automatically.
  - Deployment workflow is repeatable for upgrades.
- Verification commands:
  - end-to-end provisioning script on clean VM
  - reboot validation checklist
  - health endpoint checks post-reboot

### M45 - Durability Drill and Restore Certification
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Run controlled disaster drill: terminate VM compute, reprovision, reconnect to existing PostgreSQL/Blob, verify data integrity.
  - Capture evidence for user records, feed history, and playable media continuity.
  - Publish runbook and signed drill output.
- Key files/modules:
  - `docs/operations.md`
  - `docs/release-checklist.md`
  - drill helper scripts
- Acceptance criteria:
  - Pre-drill user/item/episode datasets are intact post-restore.
  - Feed and media playback remain functional after VM replacement.
  - Recovery evidence is archived and reviewable.
- Verification commands:
  - scripted pre-drill dataset snapshot/export
  - restore verification script
  - post-restore podcast contract checks

### M46 - Parity CI Matrix + Release Gate
- status: Done
- target_finish: 2026-02-08
- completed_on: 2026-02-08
- evidence: 1e69fda (2026-02-08)
- Scope:
  - Add CI matrix for `simple` and `parity` profiles.
  - Add pre-deploy gate requiring parity pass, podcast contract pass, and smoke pass evidence.
  - Ensure regression checks include extension and OAuth critical flows under parity profile.
- Key files/modules:
  - `.github/workflows/ci.yml`
  - `scripts/verify_podcast_contract.sh`
  - `docs/release-checklist.md`
- Acceptance criteria:
  - Deployment is blocked automatically on parity/profile regressions.
  - CI artifacts include parity run evidence and contract validation logs.
  - Release checklist includes durability and parity gates by default.
- Verification commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - parity integration suite via compose profile
  - podcast contract gate script

## Durable Azure/Public Interface Additions (M35-M46)
- Storage interface is elevated to explicit runtime contract with `local` and `azure_blob` implementations.
- Artifact references are standardized as object keys instead of VM-local filesystem paths.
- Env contract is expanded with profile-specific requirements (`simple`, `parity`, `azure`).
- Queue runner behavior expands to include stale-claim recovery and explicit retry scheduling semantics.

## Assumptions and Defaults
- Package manager: `pnpm`.
- Workspace package names will use `@articlepod/*`.
- Local demo audio format currently defaults to AAC/M4A (`audio/mp4`).
- OAuth providers are optional at runtime and must not block local credential login.
- Apple Podcasts verification requires a reachable host (Azure deployment or trusted tunnel).
- Optional Phase 1.5 milestone (M22) is explicitly non-blocking for MVP completion.
- Chrome extension is post-MVP and does not block current MVP release.
- Authenticated page capture policy is user-visible-only (no credential/session forwarding or bypass automation).
- Region baseline for durable rollout milestones is `eastus`.
- TTS remains self-hosted Kokoro (`services/python-tts`) with no external TTS API dependency.
- Initial durable cloud rollout remains single-VM compute for cost-first operation.
- Queue remains PostgreSQL-backed for this phase; Service Bus is a later scale milestone.

## Architecture Overview

### High-Level Components
- `apps/web`:
  - UI routes (`/login`, `/app`, admin pages)
  - lightweight API routes (enqueue jobs, feed rendering, media serving in dev mode)
  - auth/session/token management
- `apps/worker`:
  - async processing loop and retry/idempotency control
  - extraction, normalization, chunking, TTS orchestration
- `packages/core`:
  - shared schemas and domain types
  - adapter interfaces (extract, tts, storage, rss)
  - deterministic utilities (sorting, serialization, hashing)
- `services/python-tts`:
  - Python scaffold for future local/hosted TTS model execution path

### Data Model (Planned Entities)
- `User`:
  - `id`, `email`, `name`, `role`, `created_at`
- `Session`:
  - `id`, `user_id`, `expires_at`
- `FeedToken`:
  - `id`, `user_id`, `token_hash`, `active`, `rotated_at`
- `ShareToken` (read-only demo):
  - `id`, `user_id`, `token_hash`, `scope=read_only`, `expires_at`
- `Item`:
  - `id`, `user_id`, `source_type(url|pdf|html_snapshot)`, `source_uri_or_file`, `status`, `error_code`, `error_message`
- `Episode`:
  - `id`, `item_id`, `guid`, `title`, `audio_path`, `audio_bytes`, `mime_type`, `published_at`
- `Job`:
  - `id`, `item_id`, `attempt`, `status`, `locked_at`, `next_retry_at`
- `JobEvent`:
  - `id`, `job_id`, `item_id`, `stage`, `payload_json`, `created_at`

### Pipeline and State Machine
- Intake route:
  - validates request -> creates `Item(status=queued)` -> enqueues `Job`.
- Worker stages:
  - claim job -> mark `processing`
  - extract text
  - normalize/chunk
  - synthesize (cache-aware)
  - persist media artifact
  - publish episode metadata
  - mark `ready`
- Failure behavior:
  - write deterministic `JobEvent`
  - set `failed` with `error_code` and user-safe `error_message`
  - schedule retry if eligible

### Adapter Interfaces (No Vendor Lock-in)
- `ExtractorAdapter`:
  - `extractFromUrl(input): ExtractResult`
  - `extractFromPdf(input): ExtractResult`
  - `extractFromHtmlSnapshot(input): ExtractResult`
- `TtsProvider`:
  - `synthesizeToFile({ text, voice, format, outPath })`
- `StorageAdapter`:
  - `putObject/getObject/headObject/getSignedUrl`
- `RssBuilder`:
  - `buildFeed({ user, episodes, baseUrl }): string`

### Determinism Strategy
- Stable sort keys for feed items and manifest entries.
- Deterministic episode GUID from stable episode identity.
- Deterministic chunk hashing from canonical normalized text.
- Snapshot tests on RSS XML, event logs, and export manifest.

### Security and Privacy Strategy
- Feed/media/share tokens are hashed at rest and redacted in logs.
- SSRF guardrails block private networks and metadata endpoints.
- Rate limits per IP and per authenticated user.
- Clear delete semantics for item/account and corresponding data artifacts.

### Local vs Azure Runtime Strategy
- Local:
  - SQLite + local filesystem media + Kokoro/python-tts local narration.
- Azure (existing readiness baseline):
  - containerized web/worker + managed cloud resources as documented.
- Azure (durable rollout target, M35-M46):
  - single VM compute for `web`, `worker`, and `python-tts`.
  - Azure PostgreSQL as durable relational source-of-truth.
  - Azure Blob as durable artifact store for uploads/audio/diagnostics.
  - self-hosted Kokoro models on VM (no external TTS API dependency).

## Risk Register

| Risk | Probability | Impact | Detection Signal | Mitigation | Owner Milestone(s) |
|---|---|---|---|---|---|
| Podcast clients reject media seek/play | Medium | High | Range test not returning `206`, app playback stalls | enforce `HEAD`/`Range` tests + contract script | M14, M21 |
| RSS invalid or unstable across runs | Medium | High | snapshot drift or feed parsing errors | deterministic serializer + strict RSS tests | M15, M20 |
| HTML extraction low quality/empty output | Medium | Medium | extraction tests fail or many failed jobs | fixture corpus + fallback normalization + explicit errors | M10 |
| PDF extraction fails on scanned docs silently | Medium | High | empty text with no clear error | scanned detection and explicit OCR-not-supported code | M10 |
| Retry logic creates duplicate episodes | Medium | High | duplicate GUID/enclosures | deterministic IDs + check-before-generate + transactionally claimed jobs | M09, M11 |
| Token leakage in logs/errors | Low | High | token strings visible in logs/UI errors | token redaction + secure error mapping | M07, M20 |
| OAuth instability in local demos | Medium | Medium | login blocked when providers unavailable | local auth fallback always enabled | M06 |
| OAuth account-linking ambiguity (same email across providers) | Medium | High | wrong account linked after provider login | introduce provider-subject identity table and linking rules | M23 |
| Extension token leakage or replay | Medium | High | unauthorized extension submissions | short-lived connect codes, hashed stored tokens, revocation and replay checks | M24, M28 |
| Snapshot payload abuse (oversized/hostile HTML) | Medium | High | high memory/CPU usage or ingest failures | strict payload caps, validation, and rate limits | M25, M28 |
| Policy drift for paywalled content handling | Medium | Medium | feature requests imply bypass behavior | enforce user-visible-only policy in spec, code, and tests | M28 |
| OAuth provider behavior drift (callback/profile edge cases) | Medium | Medium | intermittent sign-in failures in provider-specific paths | CI integration matrix + standardized error mapping | M23, M29 |
| Extension onboarding friction reduces adoption/demo reliability | Medium | Medium | users fail to connect or repeatedly hit auth expiry issues | guided onboarding UI + reconnect flows + UX telemetry | M30 |
| Extraction quality regressions on complex article layouts | High | Medium | narrated output includes boilerplate/junk text | quality fixture suite and quality-gate failures | M31 |
| Limited operational visibility delays incident response | Medium | High | unresolved queue growth or repeated silent failures | metrics baseline + admin visibility + triage runbook | M32 |
| Missing release evidence for podcast app compatibility | Medium | High | release regressions discovered only after demo | formal RC certification checklist and artifact capture | M33 |
| Diagnostics retention misconfiguration exposes extra user data | Low | High | extracted text retained longer than intended | automated purge + retention tests + scoped demo-only storage | M34 |
| License policy violation in dependencies | Low | High | CI dependency audit fail | automated denylist gate in CI | M20 |
| Demo not impressive without API keys | Medium | High | blank state or slow first run | starter seed with pre-generated episode and demo banner | M17 |
| Cloud deployment drift from local assumptions | Medium | Medium | Azure docs incomplete or container mismatch | env contract + container smoke + architecture docs | M19 |
| SQLite-to-PostgreSQL migration drift breaks auth/feed/job integrity | Medium | High | row-count mismatch or failed auth/feed lookups post-migration | migration rehearsal, integrity checks, rollback scripts | M38, M46 |
| Blob key/path migration regressions break media retrieval | Medium | High | 404 responses for known episodes or missing enclosure targets | deterministic key mapping tests + migration audits + contract checks | M39, M40, M41 |
| Local parity profile drifts from Azure runtime behavior | Medium | High | parity pass/fail divergence across environments | compose parity profile + env profile gates + CI matrix enforcement | M36, M37, M46 |
| Backup/restore runbook rot causes failed disaster recovery | Low | High | VM-loss drill fails or exceeds expected recovery objectives | scheduled drill cadence + signed restore evidence | M45, M46 |
| Observability schema drift between services breaks correlation | Medium | High | logs present but trace/request IDs do not align | shared schema in `packages/core` + contract tests + propagation headers | M47, M50, M56 |
| Log volume growth increases cost/noise and hides real incidents | Medium | Medium | high ingestion with low signal quality | severity gates, log rotation, digest aggregation, 14-day retention | M48, M55 |
| Secrets accidentally leak via logs during failures | Low | High | tokens/cookies visible in log bundles | centralized redaction and redaction tests before release gate | M49, M56 |
| Azure alert fatigue from poor thresholds | Medium | Medium | repeated non-actionable alert fires | phase-in dashboards with tuned thresholds and runbook-linked alerts | M54 |
| Markdown conversion quality drift (lost headings/lists) | Medium | Medium | markdown fixtures diverge from expected structure | fixture corpus + deterministic markdown snapshot tests | M59, M60, M64 |
| Dual raw+markdown storage increases cost and retention risk | Medium | Medium | storage growth exceeds projection or stale raw artifacts persist | lifecycle metadata + scheduled purge + retention audits | M57, M61, M64 |
| Markdown artifact exposure leaks sensitive extracted data | Low | High | unauthorized retrieval of extraction artifacts | strict auth checks + scoped diagnostics access + audit logging | M63, M64 |
| Domain/TLS drift causes broken canonical URLs or cert failures | Medium | High | health check failures on apex domain; mixed host URLs in RSS/enclosures | enforce deploy-time ingress/TLS automation + APP_URL/canonical-host validation | M65 |
| Missing verification-prompts process | Medium | Medium | drift between plan and releases | add section to `docs/Prompts.md` and run each milestone | M20 |

## 3-Minute Demo Script (Time-Boxed)

### 00:00-00:20 - Start and Login
1. Run `pnpm dev`.
2. Open app and log in with seeded demo account.

### 00:20-00:45 - Show Immediate Value
1. Show starter episode already present and playable.
2. Highlight private feed URL in the signed-in header, then open `/app/settings` for copy/rotation controls.

### 00:45-01:15 - Verify Feed
1. Open `/rss/<feed_token>.xml`.
2. Point out GUID + enclosure URL + enclosure length/type.

### 01:15-01:45 - New Submission
1. Submit a URL (or sample PDF).
2. Show status transition `queued -> processing`.

### 01:45-02:10 - Admin Observability
1. Open admin dashboard.
2. Show active users, job success/failure, recent errors.

### 02:10-02:35 - Ready Episode and Playback
1. Return to dashboard; show item as `ready`.
2. Play audio in browser and seek mid-track.

### 02:35-02:55 - Podcast Compatibility Proof
1. Run `curl -I "<MP3_URL>"`.
2. Run `curl -i -H "Range: bytes=0-1" "<MP3_URL>"` and show `206`.

### 02:55-03:00 - Portability
1. Mention `pnpm export` creates portable RSS + media + manifest outputs.

## Test Strategy and Acceptance Matrix

### Unit Tests (Minimum)
- URL normalization + SSRF guard checks.
- HTML extraction fixtures.
- PDF extraction fixtures including scanned-failure case.
- Chunk determinism and hash stability.
- RSS item GUID stability, enclosure uniqueness, XML escaping.
- Storage URL/token generation.

### Integration Tests
- URL submission -> job ready -> RSS item appears -> media reachable.
- PDF submission -> ready for text-based PDF.
- Scanned PDF -> failed with explicit OCR-not-supported error.
- Media `HEAD` + `Range` behavior.
- Feed token rotation invalidates prior feed URL.
- OAuth callback coverage (unconfigured provider, state mismatch, token/profile failures, success path).
- Extension connect-code/token lifecycle and HTML snapshot ingest end-to-end.

### Snapshot/Determinism Tests
- RSS XML snapshots.
- Job event log serialization snapshots.
- Export manifest snapshots.

### Manual Smoke Tests (Release Gate)
- Subscribe on Apple Podcasts (reachable host) and one additional RSS podcast app.
- Play, seek, resume.
- Validate read-only share mode cannot mutate content.

### Durable Azure and Parity Validation Matrix (M35-M46)
- Profile validation:
  - `simple`, `parity`, and `azure` env checks with explicit required vars.
- Migration validation:
  - SQLite fixture import into PostgreSQL with row-count + relational integrity checks.
- Storage validation:
  - Blob write/read/delete behavior and deterministic object-key assertions.
- Worker resilience validation:
  - crash-recovery, retry scheduling, and duplicate prevention under PostgreSQL queue mode.
- Contract validation:
  - RSS and media `HEAD` + `Range` checks on Blob-backed delivery path.
- Durability validation:
  - VM-loss drill with full restore verification against PostgreSQL/Blob.
- Extension validation:
  - snapshot ingest still enqueues immediately and completes under parity profile.

## Milestone Execution Protocol (After Approval)
- Execute one milestone at a time.
- For each milestone:
  - implement only that scope
  - run listed verification commands
  - fix failures immediately
  - commit with clear milestone-specific message
  - append results to "Milestone Verification Log"
- Do not skip podcast compatibility gates before marking done.

## Ongoing Notes and Decisions

### Decision Log Template
- Date:
- Milestone:
- Decision:
- Alternatives considered:
- Why this choice:
- Follow-up impact:

### Open Questions Tracker
- Question:
- Blocking/non-blocking:
- Owner:
- Due milestone:
- Resolution:

### Milestone Verification Log Template
- Milestone:
- Commands run:
- Pass/fail:
- Regressions found:
- Fixes applied:
- Commit hash:

## Observability Track (M47-M56)

### M47 - Observability Contract and Error Taxonomy Lock
- status: Done
- target_finish: 2026-02-09
- completed_on: 2026-02-09
- evidence: a2774bd (2026-02-09)
- Scope:
  - shared log schema (`ts`, `level`, `service`, `env`, `msg`, correlation keys, `error_code`, `support_id`)
  - consistent API error contract (`error_code`, `error_message`, `retry_recommended`, `support_id`)
- Key files/modules:
  - `packages/core/src/logging/types.ts`
  - `apps/web/src/lib/http.ts`
  - `docs/architecture.md`, `docs/env.md`, `docs/operations.md`
- Acceptance:
  - schema is documented and runtime code emits/returns `support_id` on failures.

### M48 - Dedicated Local Log Storage + Rotation
- status: Done
- target_finish: 2026-02-09
- completed_on: 2026-02-09
- evidence: a2774bd (2026-02-09)
- Scope:
  - dedicated root: `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/`
  - per-service JSONL sinks with retention controls.
  - diagnostics bundle command.
- Key files/modules:
  - `packages/core/src/logging/structured.ts`
  - `scripts/logs-collect.mjs`
- Acceptance:
  - logs exist under predictable service paths and can be bundled with one command.

### M49 - Node Structured Logging Baseline (Web + Worker)
- status: Done
- target_finish: 2026-02-09
- completed_on: 2026-02-09
- evidence: a2774bd (2026-02-09)
- Scope:
  - shared logger wiring for web + worker.
  - worker lifecycle logging and API error logging with support IDs.
- Key files/modules:
  - `apps/web/src/lib/logger.ts`
  - `apps/web/src/lib/http.ts`
  - `apps/worker/src/lib/logger.ts`
  - `apps/worker/src/jobs/processItemJob.ts`
- Acceptance:
  - correlated worker events + API failure logs exist in JSONL.

### M50 - Python TTS Structured Logging + Correlation
- status: Done
- target_finish: 2026-02-09
- completed_on: 2026-02-09
- evidence: a2774bd (2026-02-09)
- Scope:
  - JSONL logging in python-tts service.
  - propagate/request correlation headers.
- Key files/modules:
  - `services/python-tts/app/main.py`
  - `packages/core/src/tts/pythonService.ts`
- Acceptance:
  - one failure can be traced across worker and python-tts logs via shared IDs.

### M51 - OpenTelemetry Instrumentation End-to-End
- status: Done
- target_finish: 2026-04-18
- completed_on: 2026-02-14
- evidence: cross-service trace-context propagation baseline
- Scope:
  - Propagate W3C trace context and correlation identifiers across web/worker/python-tts.
  - Preserve traceability fields in structured logs for end-to-end request/job tracking.
- Status notes:
  - completed as baseline instrumentation contract; exporter-specific expansion can layer on top.

### M52 - Metrics Layer (Service + Business KPIs)
- status: Done
- target_finish: 2026-04-25
- completed_on: 2026-02-14
- evidence: admin metrics (queue depth, processing age, retryable failures, top error codes)
- Scope:
  - emit and surface request/job/TTS/storage KPIs for local operations and parity review.
- Status notes:
  - completed baseline KPI layer; naming aligns with admin/API surfaces.

### M53 - Azure Monitor + Log Analytics Wiring
- status: Done
- target_finish: 2026-05-02
- completed_on: 2026-02-14
- evidence: Azure query starter pack + observability env/runbook guidance
- Scope:
  - Provide Azure Log Analytics query starter pack for error/latency/failure clusters.
  - Document required env wiring and operational usage patterns.
- Status notes:
  - completed through runbook-backed Azure query/wiring guidance.

### M54 - Dashboards + Alerts
- status: Done
- target_finish: 2026-05-09
- completed_on: 2026-02-14
- evidence: dashboard/alert contract in operations + release checklist workflow
- Scope:
  - Define API/worker/TTS/media dashboard and alert contract in operations documentation.
- Status notes:
  - completed baseline; concrete Azure portal objects can be instantiated from this contract.

### M55 - Error Triage Loop Automation
- status: Done
- target_finish: 2026-02-09
- completed_on: 2026-02-09
- evidence: a2774bd (2026-02-09)
- Scope:
  - recurring digest from log signatures.
- Key files/modules:
  - `scripts/logs-triage.mjs`
  - output: `exports/diagnostics/error-digest.md`
- Acceptance:
  - ranked digest generated from latest JSONL logs.

### M56 - Observability Validation and Release Gate
- status: Done
- target_finish: 2026-05-16
- completed_on: 2026-02-14
- evidence: `npm run observability:verify` + CI gate
- Scope:
  - verify redaction/correlation/logging via automated checks.
- Key files/modules:
  - `scripts/observability-verify.mjs`
  - test suites in `packages/core/tests` and `apps/web/tests`
- Acceptance:
  - observability verification command passes in CI/local.


## Markdown Artifact Track (M57-M64)

### M57 - Markdown Artifact Contract Lock
- status: Done
- target_finish: 2026-02-21
- completed_on: 2026-02-14
- evidence: local validation + implementation pass (2026-02-14)
- Scope:
  - Define canonical extraction artifact contract for URL, PDF, and HTML snapshot sources.
  - Lock dual-save policy for initial phase: raw source artifact + markdown artifact.
  - Lock retention policy: raw artifacts expire after 90 days, markdown retained.
- Key files/modules:
  - `docs/Prompts.md`
  - `docs/plans.md`
  - `docs/architecture.md`
- Acceptance criteria:
  - Artifact contract and retention policy are explicit and consistent across spec docs.
- Verification commands:
  - manual cross-doc consistency review

### M58 - Artifact Metadata Model + Storage References
- status: Done
- target_finish: 2026-02-24
- completed_on: 2026-02-14
- evidence: local validation + implementation pass (2026-02-14)
- Scope:
  - Add planned metadata model for extraction artifacts (kind, storage key, content type, bytes, expiry).
  - Document migration away from large inline raw content blobs in DB rows.
- Key files/modules:
  - `docs/plans.md`
  - `docs/architecture.md`
- Acceptance criteria:
  - Planned interface/type additions are documented and tied to milestones.
- Verification commands:
  - manual model walkthrough against current schema

### M59 - HTML to Markdown Pipeline (Readability + Turndown + Abogen)
- status: Done
- target_finish: 2026-02-28
- completed_on: 2026-02-14
- evidence: local validation + implementation pass (2026-02-14)
- Scope:
  - Keep Readability + abogen cleanup as the primary content-quality path.
  - Add markdown conversion stage for extracted article content.
- Key files/modules:
  - `packages/core/src/extract/html.ts`
  - `packages/core/src/extract/abogen/*`
- Acceptance criteria:
  - HTML extraction emits markdown artifact with headings/lists preserved.
- Verification commands:
  - `npm run test -- extraction`

### M60 - PDF to Markdown Pipeline (pdfjs Deterministic Path + Markdown Structuring)
- status: Done
- target_finish: 2026-03-03
- completed_on: 2026-02-14
- evidence: local validation + implementation pass (2026-02-14)
- Scope:
  - Use deterministic pdfjs extraction as the canonical path.
  - Emit markdown output with heading/paragraph heuristics for downstream reuse.
- Key files/modules:
  - `packages/core/src/extract/pdf.ts`
  - `services/python-tts/` (runtime dependency notes if needed)
- Acceptance criteria:
  - PDF extraction emits markdown output with fallback coverage and OCR-not-supported behavior preserved.
- Verification commands:
  - `npm run test -- extraction-pdf`

### M61 - Dual Artifact Persistence + Retention Enforcement
- status: Done
- target_finish: 2026-03-07
- completed_on: 2026-02-14
- evidence: local validation + implementation pass (2026-02-14)
- Scope:
  - Persist both raw and markdown artifacts in object storage for initial iteration period.
  - Enforce 90-day raw retention purge policy while retaining markdown.
- Key files/modules:
  - `packages/core/src/storage/*`
  - `apps/worker/src/jobs/processItemJob.ts`
- Acceptance criteria:
  - Raw + markdown artifacts are persisted with lifecycle metadata and purge policy coverage.
- Verification commands:
  - `npm run test -- storage`

### M62 - Markdown-Derived Narration Contract
- status: Done
- target_finish: 2026-03-10
- completed_on: 2026-02-14
- evidence: local validation + implementation pass (2026-02-14)
- Scope:
  - Define canonical TTS input as normalized narration text derived from markdown artifacts.
  - Keep chunk/hash determinism and long-form handling unchanged from current expectations.
- Key files/modules:
  - `packages/core/src/chunking/*`
  - `apps/worker/src/jobs/processItemJob.ts`
- Acceptance criteria:
  - Markdown-driven narration produces stable chunk hashes and non-regressed audio flow.
- Verification commands:
  - `npm run test -- chunking`
  - `npm run test -- worker`

### M63 - Markdown Diagnostics Access Surface
- status: Done
- target_finish: 2026-03-14
- completed_on: 2026-02-14
- evidence: local validation + implementation pass (2026-02-14)
- Scope:
  - Add controlled access to extracted markdown and extraction diagnostics for review workflows.
  - Keep access gated and token-safe.
- Key files/modules:
  - `apps/web/src/components/dashboard-client.tsx`
  - `apps/web/src/lib/dashboard.ts`
- Acceptance criteria:
  - Markdown diagnostics are inspectable in authorized flows without exposing secrets.
- Verification commands:
  - `npm run test -- admin`
  - `npm run test -- auth`

### M64 - Migration Backfill + Regression Certification
- status: Done
- target_finish: 2026-03-21
- completed_on: 2026-02-14
- evidence: local validation + implementation pass (2026-02-14)
- Scope:
  - Backfill existing items to markdown artifacts where possible.
  - Validate no regressions for URL/PDF/HTML snapshot pipelines and podcast contracts.
- Key files/modules:
  - `scripts/*`
  - `apps/worker/src/jobs/*`
  - `scripts/verify_podcast_contract.sh`
- Acceptance criteria:
  - Backfill runbook exists; pipeline regressions are covered by tests and contract gates.
- Verification commands:
  - `npm run test`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

### M65 - Canonical Domain + TLS Deploy Automation
- status: Done
- target_finish: 2026-02-25
- completed_on: 2026-02-25
- evidence: a485766 (2026-02-25)
- Scope:
  - Add canonical-domain ingress/TLS automation into Azure deploy flow.
  - Enforce `articlepod.com` as canonical host with `www.articlepod.com` redirect.
  - Ensure certbot provisions SAN certificate coverage for canonical + alias hosts.
  - Ensure deploy-time validation keeps `APP_URL` aligned with canonical host for RSS/media URLs.
- Key files/modules:
  - `scripts/azure/configure-nginx.sh`
  - `scripts/azure/configure-tls.sh`
  - `scripts/azure/deploy-changes.sh`
  - `.github/workflows/deploy-azure.yml`
  - `docs/azure-deploy.md`
  - `docs/azure-ci-cd.md`
  - `scripts/azure/README.md`
  - `docs/env.md`
- Acceptance criteria:
  - Deploy helper can configure nginx for canonical + alias hosts with deterministic redirects.
  - TLS helper requests/renews cert for both hosts and re-applies canonical redirects.
  - CI deploy flow forwards canonical host, alias list, and Let’s Encrypt email.
  - Health checks default to canonical host when configured.
- Verification commands:
  - `bash -n scripts/azure/configure-nginx.sh scripts/azure/configure-tls.sh scripts/azure/deploy-changes.sh`
  - `./scripts/azure/deploy-changes.sh --help`
  - `curl -I http://www.articlepod.com/api/health` (expect `301` to apex)
  - `curl -I https://www.articlepod.com/api/health` (expect `301` to apex)
  - `curl -I https://articlepod.com/api/health` (expect `200`)
  - `./scripts/verify_podcast_contract.sh "https://articlepod.com/rss/<feed_token>.xml"`

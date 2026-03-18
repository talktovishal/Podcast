# Testing and Verification

## Main test runners
- Root validation is driven by `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` from the root `package.json`.
- `apps/web`, `apps/worker`, and `packages/core` all use `tsx --test` with Node's built-in test runner rather than Jest or Vitest.
- Browser end-to-end testing is available through Playwright in `apps/web/package.json`.
- Python-side verification uses `pytest` in `services/python-tts/tests/test_e2e.py`.

## Test locations by area
- Web tests: `apps/web/tests/`
- Worker tests: `apps/worker/tests/`
- Shared logic tests: `packages/core/tests/`
- Python service tests: `services/python-tts/tests/`
- Input fixtures: `fixtures/html/` and `fixtures/pdf/`

## Coverage themes already present
- RSS contract and determinism are covered in `packages/core/tests/rss.test.ts`.
- Extraction, chunking, storage, title cleanup, description shaping, and security helpers are covered under `packages/core/tests/`.
- Media route compatibility, middleware auth, auth flows, billing, digest routes, analytics, demographics, and dashboard behavior are covered under `apps/web/tests/`.
- Queue reclaim, retry rules, digest jobs, and overflow policy behavior are covered under `apps/worker/tests/`.
- Python sidecar request/response behavior is covered by `services/python-tts/tests/test_e2e.py`.

## Common testing patterns
- Database-backed tests usually target a local SQLite file and bootstrap schema/data before assertions.
- Many tests use `ARTICLEPOD_TEST_DB_READY=1` or a helper that runs `db:bootstrap` only once per process.
- Route-level tests construct `NextRequest` objects directly, which keeps HTTP semantics testable without a full server boot.
- Worker tests seed realistic HTML and cache state so retry and idempotency behavior can be exercised without live network fetches.
- Shared package tests emphasize deterministic text and XML output, which fits the product's RSS-first contract.

## Contract and smoke checks
- Podcast feed compatibility is enforced by `scripts/verify_podcast_contract.sh`.
- That script validates feed HEAD, XML structure, GUID and enclosure uniqueness, artwork presence, media HEAD, and `Range: bytes=0-1` returning `206`.
- License policy checks live in `scripts/license-check.mjs`.
- Additional operational gates include `scripts/parity-smoke.sh`, `scripts/test-python-tts-e2e.sh`, and `scripts/observability-verify.mjs`.

## Runtime-specific verification helpers
- `scripts/dev.mjs` pre-generates Prisma clients, bootstraps the DB, and seeds demo data before running the local stack.
- `run.sh` is the practical entry point for `simple`, `parity`, and `azure` profile setup.
- Export and backfill scripts in `apps/web/scripts/` provide secondary verification paths for metadata, artifacts, analytics, and restore behavior.

## Testing posture
- The repo already has meaningful contract coverage for the podcast-specific failure modes that matter most: RSS validity, HEAD support, and range requests.
- The test suite also leans into integration-style validation instead of only isolated unit tests, especially for auth, media, and job processing.
- Manual app-level podcast client checks are still documented in project docs, so automated coverage is strong but not the only release gate.

## Useful starting files for future contributors
- `packages/core/tests/security.test.ts`
- `packages/core/tests/extract.test.ts`
- `apps/web/tests/media-route.test.ts`
- `apps/web/tests/middleware-auth.test.ts`
- `apps/worker/tests/queue-resilience.test.ts`
- `services/python-tts/tests/test_e2e.py`

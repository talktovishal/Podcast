# External Integrations

## Authentication providers
- Google OAuth is configured through environment variables consumed by `apps/web/src/lib/env.ts` and handled inside `apps/web/src/lib/auth.ts`.
- Apple Sign-In is also wired through `apps/web/src/lib/auth.ts`, which verifies Apple `id_token` values against the live JWKS endpoint using `jose`.
- Session auth for the web UI is cookie-based and enforced centrally by `apps/web/src/middleware.ts`.
- Feed and media access use token or signed-URL patterns through `packages/core/src/security/tokens.ts` and `packages/core/src/security/signedUrl.ts`.

## Storage and metadata services
- Azure Blob Storage is supported via `packages/core/src/storage/azureBlobStorage.ts` and selected by `apps/web/src/lib/storage.ts` or `apps/worker/src/lib/storage.ts`.
- Local filesystem object storage remains the simple-profile fallback through `packages/core/src/storage/localObjectStorage.ts`.
- Azure Table can act as the primary operational metadata backend through `packages/core/src/metadata/azureTablePrimaryStore.ts`.
- Web and worker each have a thin primary-store adapter in `apps/web/src/lib/metadata-primary-store.ts` and `apps/worker/src/lib/metadata-primary-store.ts`.
- Azurite and PostgreSQL are part of the parity profile described in `docker-compose.parity.yml` and `README.md`.

## Billing and payment
- Stripe is integrated in the web app via the `stripe` dependency listed in `apps/web/package.json`.
- Billing environment settings live in `apps/web/src/lib/env.ts`.
- Billing state and idempotent webhook rows are modeled in Prisma schemas under `apps/web/prisma/`.
- Billing-related behavior is supported by `apps/web/src/lib/billing.ts` and the billing API routes under `apps/web/src/app/api/billing/`.

## AI and narration services
- The worker talks to the Python sidecar over HTTP using `packages/core/src/tts/pythonService.ts`.
- The Python sidecar exposes `POST /v1/synthesize` and health endpoints from `services/python-tts/app/main.py`.
- Sidecar auth uses the `X-Sidecar-Secret` header when configured.
- Digest summary generation is adapter-based and can call a proxy endpoint through `apps/worker/src/lib/summary.ts`.
- OpenAI credentials are already part of the environment surface in both `apps/web/src/lib/env.ts` and `apps/worker/src/lib/env.ts`, even though the current worker narration path is Kokoro-only.

## Content ingestion and fetch integrations
- URL ingestion performs validated outbound HTTP fetches after SSRF checks from `packages/core/src/security/urlPolicy.ts`.
- HTML extraction borrows patterns from the read-only upstream references in `vendor/abogen` and `vendor/postcast`, but the active code lives under `packages/core/src/extract/`.
- PDF ingestion stores uploads to object storage first, then processes them asynchronously in the worker.
- Chrome extension ingestion uses the local extension app in `apps/extension` plus the snapshot API route in `apps/web/src/app/api/items/html-snapshot/route.ts`.

## Ops and deployment integrations
- Azure infrastructure definitions are kept in `infra/main.bicep` and `infra/main.parameters.json`.
- VM deployment, runtime sync, TLS, nginx, and systemd orchestration live under `scripts/azure/` and `infra/systemd/`.
- Observability can forward to Azure Monitor through environment settings parsed in `apps/web/src/lib/env.ts` and `apps/worker/src/lib/env.ts`.
- GitHub issue mirroring for user feedback is env-gated in `apps/web/src/lib/env.ts` and implemented in `apps/web/src/lib/feedback-mirror.ts`.

## Browser and platform integrations
- The user-facing browser integration is a Chrome extension in `apps/extension` with packaging helpers in `scripts/package-extension.sh` and `scripts/validate-extension.mjs`.
- Podcast client compatibility is treated as an external integration concern and verified by `scripts/verify_podcast_contract.sh`.
- Brand artwork and feed image delivery are part of the RSS contract through `apps/web/src/lib/brand-assets.ts` and `packages/core/src/rss/buildFeed.ts`.

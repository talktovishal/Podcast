# Engineering Conventions

## Workspace and import conventions
- Runtime code is split by responsibility: web-only code in `apps/web`, worker-only code in `apps/worker`, reusable logic in `packages/core`.
- Workspace packages use the `@articlepod/*` naming pattern from `package.json`.
- The web app uses the `@/` alias for local imports under `apps/web/src/`.
- Worker and shared packages favor ESM imports, often with explicit `.js` suffixes in internal imports to match runtime output behavior.
- A few modules import directly from core source subpaths such as `@articlepod/core/src/config/naming`, so the repo is comfortable with source-level workspace imports, not only top-level package exports.

## Configuration style
- Each runtime parses environment variables once and exports a typed config object from `apps/web/src/lib/env.ts` or `apps/worker/src/lib/env.ts`.
- Environment helpers normalize file-based `DATABASE_URL` values so scripts can be run from different working directories.
- Runtime profiles are first-class and shape storage, metadata, and security behavior.
- Operational defaults are kept close to runtime code rather than in a single central config package.

## Error handling and API contract style
- Shared domain errors use `AppError` and `errorCodes` from `packages/core/src/errors/codes.ts`.
- API handlers typically return JSON with `ok`, `error_code`, and `error_message` when something fails.
- Route handlers commonly wrap failures through `apps/web/src/lib/http.ts` to keep response formatting consistent.
- Worker failures are recorded with machine-readable codes plus a friendlier message for surfaced UI state.

## Security conventions
- Incoming secrets are generally hashed before lookup, for example feed and session token handling in `apps/web/src/lib/auth.ts`.
- URL ingestion always passes through SSRF validation in `packages/core/src/security/urlPolicy.ts` before enqueueing a fetchable URL.
- Public unauthenticated routes are centralized in `apps/web/src/middleware.ts`, which is the main web auth allowlist.
- Media URLs are signed per request through `packages/core/src/security/signedUrl.ts` and attached at RSS render time in `apps/web/src/app/rss/[token]/route.ts`.
- Storage keys are normalized and treated as object keys, not trusted filesystem paths, in both web and worker storage helpers.

## Persistence and abstraction conventions
- External backends are wrapped behind adapters instead of being called inline from feature code.
- Web auth and token persistence are abstracted behind `apps/web/src/lib/metadata-primary-auth.ts`.
- Storage selection is abstracted behind `getArtifactStorage()` in both runtimes.
- TTS selection is centralized in `apps/worker/src/lib/providers.ts`, which returns shared provider implementations from `packages/core`.
- RSS rendering is pure and deterministic inside `packages/core/src/rss/buildFeed.ts`.

## Logging and observability conventions
- Structured logging is the default style across runtimes, with shared helpers under `packages/core/src/logging/`.
- Web and worker log helpers add contextual ids such as `item_id`, `job_id`, and request metadata instead of dumping large content bodies.
- The podcast-specific routes add safe playback diagnostics through `apps/web/src/lib/podcast-request-log.ts`.
- The Python sidecar writes JSONL logs with request correlation fields in `services/python-tts/app/main.py`.

## Testing conventions that influence implementation
- Deterministic behavior is treated as a design goal, visible in chunk hashing, stable RSS ordering, and snapshot-friendly route tests.
- Route tests often instantiate `NextRequest` directly rather than spinning up a full server.
- Database-backed tests commonly reuse the bootstrap pattern in `apps/web/scripts/bootstrap-db.ts` and the `ARTICLEPOD_TEST_DB_READY` shortcut.
- Fixtures are preferred over ad hoc inline samples for extraction-heavy behavior, especially in `fixtures/`.

## Code style signals
- Comments are used sparingly and mostly explain non-obvious behavior, such as security rationale or platform-specific fallbacks.
- Business logic tends to live in helper modules rather than directly in React components or route handlers.
- Large features are usually decomposed into focused `lib/` modules before they are exposed through route files or pages.
- The repo favors explicit naming over dense abstractions, even when it results in longer helper names like `findPrimarySessionWithUserByTokenHash`.

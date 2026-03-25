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
- Stuck-job watchdog hardening (`M95`) is implemented: pinned-IP extraction socket failures no longer crash the worker, long TTS runs heartbeat their job lock, and stale jobs now fail cleanly after bounded retries instead of starving the queue indefinitely.
- Azure stuck-job follow-up hardening now defaults pinned fetches to IPv4-only candidates on the current VM profile, avoiding Node 22 crashes on IPv6 egress attempts before request-level recovery can run.
- URL ingestion now performs a short safe redirect-canonicalization pass before enqueue/extraction so redirecting share/login-style URLs can normalize to their public destination when discoverable.
- Chrome extension smart capture now uses a popup-triggered bounded reveal pass plus safe inert-node cleanup before HTML snapshot upload, while keeping the worker extraction path HTML-first.
- Azure runtime hardening now strips app-local `.env` files during sync/promote, sets VM-safe runtime paths in rendered env, and precomputes Kokoro previews during deploy so voice preview does not block on first request.
- Azure daily rollout now has a deployment-only helper (`scripts/azure/deploy-changes.sh`) for sync+promote+runtime deploy on existing VM environments.
- Naming consolidation now standardizes canonical `articlepod` package scopes/runtime identifiers with explicit legacy compatibility mapping in `config/naming.json` plus a VM migration helper (`scripts/azure/migrate-runtime-naming.sh`).
- Azure deploy helper now auto-bootstraps first-run VMs when runtime user provisioning is missing during CI/CD rollout.
- Azure runtime deploy now auto-recovers canonical env file from legacy `/etc/listenlater/listenlater.env` when present.
- Azure python-tts provisioning now installs CPU-only torch wheels with pip cache disabled to prevent VM disk exhaustion during deploy.
- Azure runtime deploy now supports incremental patch mode (skip unchanged pnpm/python setup, seed auto-once) with explicit full-deploy override.
- Systemd install now removes stale legacy `listenlater-*` unit files before enabling compatibility aliases.
- Deploy helper health checks now retry by default, tolerate transient HTTP error responses during ingress/TLS handoff, and avoid unreachable `:3000` fallback for FQDN targets.
- Worker queue error handling now tolerates user deletion of in-flight items without crashing the worker process (job events become best-effort when parent records are removed).
- Observability track (`M47`-`M56`) is completed at the documented baseline contract level.
- Markdown artifact track (`M57`-`M64`) is implemented for dual artifact persistence and markdown-first extraction outputs.
- Extracted markdown cleanup rollout (`M98`) now persists cleaned canonical `MARKDOWN` artifacts, uses cleaned narration text for hashes/descriptions, and adds an in-place backfill/regeneration command for existing items.
- Capture metadata track (`M100`) is implemented:
  - URL, PDF, and Chrome extension capture now use user-facing `Importance` plus normalized item tags.
  - `/app` keeps `Title` / `Importance` / `Tags` inside a lighter optional-details panel that starts collapsed and remembers the user’s last expanded/collapsed state.
  - The extension popup now includes a small footer `articlepod.com` hyperlink so users can jump back to the web app without guessing.
  - `/app` Recent items now renders capture metadata and supports lightweight client-side filtering by importance and tag.
- Canonical-domain ingress/TLS automation (`M65`) is implemented for Azure VM deploy flow (`articlepod.com` canonical + `www` redirect).
- M65 follow-up hardening is complete: nginx server-name hash fallback is now idempotent in `/etc/nginx/nginx.conf` and verified against certbot reload behavior in GitHub Actions run `22389243416` on `2026-02-25`.
- Extension popup UX now uses packaged runtime server target config with hidden reconnect code once configured and explicit capture-start feedback.
- The packaged extension intentionally keeps broad HTTP/HTTPS host permissions so Chrome does not require a separate per-site access grant before capture; runtime config still defaults server communication to `https://articlepod.com`.
- `/app` episodes workspace is now a focused create-and-review surface for `Add New Episode` and `Recent items`, with a tighter desktop nav that omits the current page shortcut and wraps cleanly on smaller screens.
- `/app` episodes workspace refresh now uses hybrid polling (fast while processing, slower when idle) plus immediate focus/visibility refresh to pick up extension captures without manual reload.
- Dashboard UX now splits `/app` (episode submission + recent items) from `/app/podcast-apps`, `/app/chrome-extension`, and `/app/settings` (digest controls, billing, demographic profile, voice settings).
- `/app/podcast-apps` and `/app/chrome-extension` now lead with the live setup controls, with quick-start and walkthrough content kept below as secondary guidance.
- `/app/settings` now starts with voice settings, then digest settings, then billing, with demographic/profile history below and no duplicate podcast/extension link cards.
- Signed-in navigation labels now use `Episodes`, `Podcast Apps`, `Chrome Extension`, `Summaries`, `Feedback`, and `Settings` for clarity.
- `/login` now uses a social-first auth layout with configured Google/Facebook/Apple providers first and local email login/signup as a fallback.
- Admin analytics track (`M66`-`M70`) is implemented:
  - analytics event/rollup/coverage schema
  - instrumentation for signup/login/submit/ready/fail/playback
  - role-gated analytics APIs + CSV exports
  - tabbed investor+ops admin dashboard with masked-by-default user table
  - analytics backfill command (`npm run analytics:backfill`) and coverage metadata
  - Azure Table primary deployments now derive admin dashboard signup/session/item/job metrics from live primary-store data so the dashboard does not fall back to an empty auxiliary SQLite view.
- Admin safety hardening: admin login redirects to `/admin`, and admin account deletion is blocked in API/UI.
- Submission monetization controls (`M71`) are implemented:
  - free-tier ingest quota defaults to 2 submissions per user (`FREE_TRIAL_SUBMISSION_LIMIT`)
  - non-paid over-quota submissions fail with `USAGE_LIMIT_EXCEEDED`
  - admin dashboard can mark paid users and grant extra submission credits per user
- Digest automation controls (`M72`-`M79`) are implemented:
  - per-user digest settings for daily/weekly email + podcast with timezone scheduling.
  - separate private digest RSS token/route and digest media range/HEAD delivery path.
  - worker-side digest scheduler + idempotent run processing (summary artifacts + optional podcast + stub email).
  - bearer-protected internal tick endpoint for external cron orchestration.
- Brand surface consistency track (`M80`) is implemented:
  - unified brain icon assets generated from one deterministic script for extension + web.
  - feed and digest RSS now publish explicit artwork tags (`itunes:image` + channel `image`).
  - podcast contract checks now validate artwork presence and artwork URL availability.
- Podcast playback diagnostics are now emitted from RSS/media routes in web structured logs (token-safe request metadata + range/status/bytes/latency) to debug client-specific playback failures.
- Podcast compatibility hardening (`M81`) now defaults published item/digest audio to MP3 (`audio/mpeg`) and normalizes episode descriptions for cleaner client display.
- Feed resilience hardening (`M82`) now auto-recovers missing media episodes (RSS skip + regeneration queue) and reduces stale delete visibility with no-store RSS caching.
- M82 repair flow now also reconciles MP3/M4A path drift in-place (serve immediately when sibling object exists), prevents endless requeues for non-regenerable items, and adds a bulk MP3 backfill command.
- URL extraction reliability hardening now retries across validated DNS candidate IPs (IPv4-preferred), retries the next pinned candidate on `403` / `429` / `5xx`, and falls back once to the validated hostname fetch path when pinned fetches or pinned-only HTML extraction diverge from direct hostname behavior.
- Pinned-lookup callback compatibility remains in place for both single-address and all-address (happy-eyeballs) DNS modes in Dockerized runtimes.
- URL extraction error semantics now normalize invalid pinned-address failures to explicit connection guidance (instead of generic fetch-failed wording) for clearer user retry behavior and operator triage.
- The extraction bot user-agent now points to the canonical `https://articlepod.com` domain.
- Only confirmed server-blocked URL failures now surface Chrome extension capture guidance and suppress retry affordances; broader extraction failures still use the standard retry messaging.
- Production URL extraction diagnostics now include a manual GitHub Actions VM probe workflow (`Probe URL Extraction (VM)`) that executes DNS/HEAD/core extraction checks from the VM network path without exposing public debug endpoints.
- Geo + demographics profile track (`M83`) is implemented:
  - successful auth now records coarse first-seen/last-seen geo snapshots (`country`, `region`, `city` when available) from trusted proxy headers.
  - optional demographic survey APIs and settings UX support save/skip/edit/delete lifecycle.
  - admin user analytics and CSV exports now include coarse geo and PII-gated demographic fields.
- Dashboard feed shortcut + markdown access track (`M84`) is implemented:
  - `/app` header now includes copy-first private feed shortcuts for Apple Podcasts and YouTube Music with mobile-smart open behavior.
  - private feed URL and extension connect code boxes now copy directly on tap/click with inline confirmation feedback for desktop and mobile users.
  - workspace banner copy is simplified by removing the `Demo mode ready` card.
  - markdown preview controls and markdown API access are now admin-only.
- Feedback suggestions track (`M85`) is implemented:
  - authenticated message-first feedback page at `/app/feedback` with optional type/feature area and default contact opt-in.
  - admin feedback inbox with status workflow and mirror retry controls is available in `/admin`.
  - private GitHub mirror support is env-gated and excludes submitter email from mirrored issue bodies.
- Summary Studio and Azure OpenAI track (`M86`-`M91`) is implemented:
  - manual `/app/summary` workflow supports explicit article selection, default last-7-days preselection, length presets, and optional podcast creation.
  - summary runs persist markdown/audio artifacts separately from scheduled digest runs while reusing the existing digest feed/media surface.
  - Azure OpenAI is now a first-class summary provider in deploy/runtime automation with nano-first routing and mini fallback.
- Feed stability + extension lifetime UX track (`M92`) is implemented:
  - item and digest RSS now emit stable episode-scoped enclosure URLs until feed-token rotation instead of per-request signature churn.
  - RSS `HEAD` mirrors `GET` content headers, and RSS channel output now includes deterministic `pubDate` and `lastBuildDate`.
  - dashboard audio controls preload metadata for visible duration.
  - extension connect codes default to 24 hours, and installed extension tokens now stay valid until revoked.
- Smart extension capture hardening (`M97`) now keeps snapshot block/interstitial classification on the server extraction path, so readable article pages are still captureable even when sites inject hidden background challenge frames.
- Azure deploy env rendering now guarantees non-simple startup secrets by forwarding explicit `APP_DIGEST_SCHEDULER_SECRET` / `APP_MEDIA_SIGNING_KEY` when configured and deriving deterministic SHA-256 fallbacks otherwise.
- Azure worker stability hotfix (`M94`) is implemented:
  - Azure Table primary digest scheduler and extension-token paths now avoid unsupported null-equality filters.
  - python-tts timeout handling now scales to chunk length, and Azure env rendering defaults Kokoro requests to 5 minutes on B2s-class hosts.
- Security hardening track (`S01`-`S18`) is **planned** (2026-02-28 review):
  - Full audit findings, options, and accepted approaches documented per milestone below.
  - Implementation gated on per-milestone user sign-off.
- Cost optimization track (`C01`-`C07`) is now active:
  - keep one always-on VM (`B2s`) with local-first TTS (`TTS_WORKERS=1`).
  - add queue-pressure overflow lane with hysteresis before external TTS usage.
  - migrate metadata/queue state toward serverless table/blob adapters with guarded cutover.
  - keep verbose diagnostics out of Table-primary scope; prefer local logs and optional Blob archive.

## Requirement Coverage Snapshot

| Requirement | Planned Milestone(s) |
|---|---|
| One-command local startup (`pnpm dev`) | M01, M04 |
| Local-first operation (no paid services) | M04, M12, M13 |
| Google + Facebook + Apple auth integration | M06, M93 |
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
| Rule-based cleanup of extracted markdown before TTS/backfill | M98 |
| Reusable live-site regression harness and prod-probe runner | M99 |
| Capture importance + tags metadata with Recent items filters | M100 |
| Investor + operations admin analytics dashboard (KPI/retention/users/export) | M66, M67, M68, M69, M70 |
| Free-trial ingest gating + admin quota overrides | M71 |
| Daily/weekly digest summaries (settings + scheduler + digest RSS/media + stub email) | M72, M73, M74, M75, M76, M77, M78, M79 |
| Unified branding icons + podcast artwork consistency | M80 |
| Podcast compatibility + description quality hardening (MP3 defaults + cleaned summaries) | M81 |
| Missing media auto-repair + RSS delete consistency hardening | M82 |
| Global geo snapshots + optional demographic profile capture | M83 |
| Smart feed shortcuts + admin-only markdown controls | M84 |
| Message-first feedback inbox + admin triage + private GitHub mirror | M85 |
| Manual Summary Studio + Azure OpenAI nano/mini summary generation | M86, M87, M88, M89, M90, M91 |
| 50x cost reduction track (always-on B2s + local-first TTS + serverless data migration) | C01, C02, C03, C04, C05, C06, C07 |
| Queue-pressure-triggered overflow TTS lane with hysteresis and role gating | C02 |
| PostgreSQL to serverless metadata/queue abstraction and cutover | C03, C04, C05, C06 |
| Budget and burn-rate operational guardrails | C07 |
| Stripe-hosted Pro billing, portal management, and webhook entitlement sync | B01, B02, B03, B04, B05, B06 |
| Apple Sign-In JWT cryptographic verification | S01 |
| Drop plaintext token storage from DB (FeedToken, DigestFeedToken, ShareToken, ExtensionToken) | S02 |
| Brute-force rate limiting on login + timing oracle fix | S03 |
| Move admin bootstrap out of request path | S04 |
| ChunkCache cross-user audio privacy and reliability | S05 |
| digestSchedulerSecret startup assertion | S06 |
| Python TTS sidecar authentication + non-root Docker | S07 |
| SSRF DNS rebinding TOCTOU fix | S08 |
| HTTP security headers (CSP, X-Frame, X-Content-Type, Referrer) | S09 |
| Global auth middleware (centralized enforcement for all routes) | S10 |
| Shared-state rate limiter (multi-instance correctness) | S11 |
| Worker process health probe | S12 |
| PDF magic-byte validation before storage write | S13 |
| Username enumeration normalization (login/signup response parity) | S14 |
| Stale-job reclaim atomic fix | S15 |
| Feed token signed-URL pattern (tokens out of enclosure URLs) | S16 |
| DB role field hardened to enum constraint | S17 |
| Session cookie `secure` flag tied to runtime profile, not NODE_ENV | S18 |

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
| M65 | Done | 2026-02-25 | 2026-02-25 | a485766 + 2aa2722 + workflow 22389243416 (2026-02-25) |
| M66 | Done | 2026-02-27 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M67 | Done | 2026-02-27 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M68 | Done | 2026-02-27 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M69 | Done | 2026-02-27 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M70 | Done | 2026-02-27 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M71 | Done | 2026-02-27 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M72 | Done | 2026-03-02 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M73 | Done | 2026-03-03 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M74 | Done | 2026-03-04 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M75 | Done | 2026-03-05 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M76 | Done | 2026-03-06 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M77 | Done | 2026-03-07 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M78 | Done | 2026-03-08 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M79 | Done | 2026-03-09 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M80 | Done | 2026-03-10 | 2026-02-27 | local validation + implementation pass (2026-02-27) |
| M81 | Done | 2026-02-28 | 2026-02-28 | local validation + implementation pass (2026-02-28) |
| M82 | Done | 2026-02-28 | 2026-02-28 | local validation + implementation pass (2026-02-28) |
| M83 | Done | 2026-02-28 | 2026-02-28 | local validation + implementation pass (2026-02-28) |
| M84 | Done | 2026-02-28 | 2026-02-28 | local validation + implementation pass (2026-02-28) |
| M85 | Done | 2026-03-01 | 2026-03-01 | local validation + implementation pass (2026-03-01) |
| M86 | Done | 2026-03-21 | 2026-03-21 | local validation + implementation pass (2026-03-21) |
| M87 | Done | 2026-03-21 | 2026-03-21 | local validation + implementation pass (2026-03-21) |
| M88 | Done | 2026-03-21 | 2026-03-21 | local validation + implementation pass (2026-03-21) |
| M89 | Done | 2026-03-21 | 2026-03-21 | local validation + implementation pass (2026-03-21) |
| M90 | Done | 2026-03-21 | 2026-03-21 | local validation + Azure provisioning pass (2026-03-21) |
| M91 | Done | 2026-03-21 | 2026-03-21 | local validation + implementation pass (2026-03-21) |
| M92 | Done | 2026-03-22 | 2026-03-22 | local validation + implementation pass (2026-03-22) |
| M93 | Done | 2026-03-23 | 2026-03-23 | local validation + social-first auth + Facebook OAuth pass (2026-03-23) |
| M94 | Done | 2026-03-24 | 2026-03-24 | local validation + production Azure worker/TTS hotfix pass (2026-03-24) |
| M95 | Done | 2026-03-24 | 2026-03-24 | local validation + production stuck-job watchdog pass (2026-03-24) |
| M96 | Done | 2026-03-25 | 2026-03-25 | local validation + production redirect canonicalization hardening pass (2026-03-25) |
| M97 | Done | 2026-03-26 | 2026-03-24 | local validation + smart extension capture pass (2026-03-24) |
| M98 | Done | 2026-03-27 | 2026-03-24 | local validation + markdown cleanup/backfill rollout pass (2026-03-24) |
| M99 | Done | 2026-03-28 | 2026-03-24 | local validation + reusable live-site regression harness pass (2026-03-24) |
| M100 | Done | 2026-03-31 | 2026-03-25 | local validation + importance/tags capture metadata pass (2026-03-25) |
| S01 | Planned | 2026-03-07 | — | — |
| S02 | Planned | 2026-03-07 | — | — |
| S03 | Planned | 2026-03-07 | — | — |
| S04 | Planned | 2026-03-07 | — | — |
| S05 | Planned | 2026-03-14 | — | — |
| S06 | Planned | 2026-03-07 | — | — |
| S07 | Planned | 2026-03-07 | — | — |
| S08 | Planned | 2026-03-14 | — | — |
| S09 | Planned | 2026-03-07 | — | — |
| S10 | Planned | 2026-03-14 | — | — |
| S11 | Planned | 2026-03-21 | — | — |
| S12 | Planned | 2026-03-14 | — | — |
| S13 | Planned | 2026-03-07 | — | — |
| S14 | Planned | 2026-03-07 | — | — |
| S15 | Planned | 2026-03-14 | — | — |
| S16 | Planned | 2026-03-28 | — | — |
| S17 | Planned | 2026-03-28 | — | — |
| S18 | Planned | 2026-03-07 | — | — |
| C01 | Done | 2026-03-10 | 2026-03-07 | local validation + implementation pass (2026-03-07) |
| C02 | Done | 2026-03-14 | 2026-03-07 | local validation + implementation pass (2026-03-07) |
| C03 | Done | 2026-03-21 | 2026-03-07 | local validation + implementation pass (2026-03-07) |
| C04 | Done | 2026-03-28 | 2026-03-07 | local validation + implementation pass (2026-03-07) |
| C05 | Done | 2026-04-04 | 2026-03-07 | local validation + implementation pass (2026-03-07) |
| C06 | Done | 2026-04-11 | 2026-03-17 | live Azure fresh-start cutover to Azure Table primary + PostgreSQL stopped + podcast contract pass |
| C07 | Done | 2026-04-18 | 2026-03-07 | local validation + implementation pass (2026-03-07) |
| B01 | In Progress | 2026-04-18 | — | — |
| B02 | Planned | 2026-04-25 | — | — |
| B03 | Planned | 2026-05-02 | — | — |
| B04 | Planned | 2026-05-09 | — | — |
| B05 | Planned | 2026-05-16 | — | — |
| B06 | Planned | 2026-05-23 | — | — |

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
  - `apps/extension/` (MV3 manifest, popup, runtime config, popup-triggered capture logic)
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
- Local demo audio format currently defaults to MP3 (`audio/mpeg`).
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
| Analytics KPI trust issues from missing historical playback data | Medium | Medium | investor metrics appear inconsistent across time windows | hybrid backfill with explicit coverage labels + forward-only playback notation | M67, M68, M69 |
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
2. Highlight the focused `/app` workspace, then open `/app/podcast-apps` for copy/rotation controls.

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
- evidence: a485766 + 2aa2722 + workflow 22389243416 (2026-02-25)
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
  - Health checks default to canonical host when configured and retry through transient post-ingress HTTP errors instead of failing on the first `curl -f`-style response.
  - nginx hash-size fallback remains certbot-compatible on repeat deploys (no duplicate directive failure).
- Verification commands:
  - `bash -n scripts/azure/configure-nginx.sh scripts/azure/configure-tls.sh scripts/azure/deploy-changes.sh`
  - `./scripts/azure/deploy-changes.sh --help`
  - `curl -I http://www.articlepod.com/api/health` (expect `301` to apex)
  - `curl -I https://www.articlepod.com/api/health` (expect `301` to apex)
  - `curl -I https://articlepod.com/api/health` (expect `200`)
  - `echo | openssl s_client -servername articlepod.com -connect articlepod.com:443 2>/dev/null | openssl x509 -noout -ext subjectAltName`
  - `./scripts/verify_podcast_contract.sh "https://articlepod.com/rss/<feed_token>.xml"`

### M66 - Analytics Event Foundation
- status: Done
- target_finish: 2026-02-27
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Add analytics persistence models and shared event contracts.
  - Add event instrumentation for auth, ingestion, worker outcomes, and playback starts.
- Key files/modules:
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/schema.postgres.prisma`
  - `apps/web/src/lib/admin-analytics/events.ts`
  - `apps/web/src/lib/auth.ts`
  - `apps/web/src/lib/items.ts`
  - `apps/web/src/app/api/media/[...path]/route.ts`
  - `apps/worker/src/lib/analytics.ts`
  - `apps/worker/src/jobs/processItemJob.ts`
- Acceptance criteria:
  - Analytics events are persisted with dedupe keys and role/auth/source dimensions.
  - Daily rollups update on write.
  - Playback starts are deduped per user/media/day.
- Verification commands:
  - `npm run typecheck`
  - `npm run test -- admin-analytics`

### M67 - Analytics Backfill + Coverage Labels
- status: Done
- target_finish: 2026-02-27
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Add idempotent analytics backfill script for signups/logins/submissions/ready/failed.
  - Track metric coverage metadata and mark playback as forward-only.
- Key files/modules:
  - `apps/web/scripts/backfill-admin-analytics.ts`
  - `apps/web/package.json`
  - `package.json`
- Acceptance criteria:
  - Backfill is rerunnable and dedupe-safe.
  - Coverage metadata is queryable by analytics APIs.
- Verification commands:
  - `npm run analytics:backfill`
  - `npm run test -- admin-analytics`

### M68 - Admin Analytics APIs + CSV Exports
- status: Done
- target_finish: 2026-02-27
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Add role-gated summary/timeseries/retention/users analytics APIs.
  - Add CSV export endpoint for summary, timeseries, and users datasets.
- Key files/modules:
  - `apps/web/src/app/api/admin/analytics/summary/route.ts`
  - `apps/web/src/app/api/admin/analytics/timeseries/route.ts`
  - `apps/web/src/app/api/admin/analytics/retention/route.ts`
  - `apps/web/src/app/api/admin/analytics/users/route.ts`
  - `apps/web/src/app/api/admin/analytics/export/route.ts`
  - `apps/web/src/lib/admin-analytics/service.ts`
  - `apps/web/src/lib/admin-analytics/csv.ts`
- Acceptance criteria:
  - APIs enforce admin-only access and filter/pagination behavior.
  - CSV downloads return deterministic headers and values.
- Verification commands:
  - `npm run test -- admin-analytics`
  - `npm run lint`

### M69 - Tabbed Admin Dashboard UI
- status: Done
- target_finish: 2026-02-27
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Replace single-view admin page with tabbed analytics UX.
  - Add global filters, CSV export action, and users table with PII masking toggle.
- Key files/modules:
  - `apps/web/src/app/admin/page.tsx`
  - `apps/web/src/components/admin-analytics-dashboard.tsx`
- Acceptance criteria:
  - Admin sees investor + growth + engagement + reliability + users tabs.
  - Default window is last 30 days.
  - PII is masked by default and reveal is explicit.
- Verification commands:
  - `npm run test -- admin-dashboard-layout`
  - `npm run build`

### M70 - KPI Validation + Docs/Runbook Sync
- status: Done
- target_finish: 2026-02-27
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Add analytics API/instrumentation tests and keep docs synced with new contracts.
  - Refresh prompts/plans/architecture/documentation/operations text for analytics track.
- Key files/modules:
  - `apps/web/tests/admin-analytics.test.ts`
  - `apps/web/tests/admin-dashboard-layout.test.ts`
  - `docs/Prompts.md`
  - `docs/plans.md`
  - `docs/architecture.md`
  - `docs/documentation.md`
  - `docs/operations.md`
- Acceptance criteria:
  - Tests cover route authorization, dedupe semantics, masked users, CSV export.
  - Docs describe analytics data model, runbook commands, and dashboard behavior.
- Verification commands:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run build`

### M71 - Free Trial Quota + Admin Overrides
- status: Done
- target_finish: 2026-02-27
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Enforce default ingest quota of 2 free submissions for non-paid users.
  - Block over-quota submissions with explicit machine-readable error.
  - Add admin controls to mark selected users as paid and grant extra submission credits.
- Key files/modules:
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/schema.postgres.prisma`
  - `apps/web/src/lib/submission-quota.ts`
  - `apps/web/src/lib/items.ts`
  - `apps/web/src/app/api/admin/users/quota/route.ts`
  - `apps/web/src/components/admin-quota-manager.tsx`
  - `apps/web/src/components/dashboard-client.tsx`
  - `apps/web/tests/submission-quota.test.ts`
- Acceptance criteria:
  - Non-paid users can submit up to configured free quota and are blocked afterwards.
  - Ingest APIs return `USAGE_LIMIT_EXCEEDED` for exhausted quota.
  - Admin can search users and update `paid` status or extra credits from dashboard.
  - Granted extra credits immediately allow additional submissions.
- Verification commands:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run build`
  - `corepack pnpm --filter @articlepod/web run export`
  - `npm run license:check`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

### M72 - Digest Data Model + Core Contracts
- status: Done
- target_finish: 2026-03-02
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Add digest entities (`UserDigestSettings`, `DigestFeedToken`, `DigestRun`, `DigestEpisode`, `DigestSchedulerTick`) to SQLite + PostgreSQL Prisma schemas.
  - Add shared digest schemas/types (`DigestCadence`, length buckets, digest settings update schema, scheduler tick schema).
  - Add digest core utilities (target-word mapping, schedule helpers, summary/email provider interfaces).
- Key files/modules:
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/schema.postgres.prisma`
  - `packages/core/src/types/domain.ts`
  - `packages/core/src/digest/*`
- Acceptance criteria:
  - DB bootstrap succeeds with new digest models.
  - Digest schedule + summary contracts are importable in web and worker.
- Verification commands:
  - `npm run typecheck`
  - `npm run test --workspace @articlepod/core`

### M73 - Digest Settings APIs + Digest Feed Token Controls
- status: Done
- target_finish: 2026-03-03
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Add digest settings read/write APIs.
  - Add digest feed token rotation API and auth helpers.
  - Add digest run history API.
- Key files/modules:
  - `apps/web/src/lib/auth.ts`
  - `apps/web/src/app/api/digest/settings/route.ts`
  - `apps/web/src/app/api/digest/runs/route.ts`
  - `apps/web/src/app/api/digest-feed-token/rotate/route.ts`
- Acceptance criteria:
  - Authenticated users can persist timezone/cadence/length settings.
  - Digest feed token rotation invalidates old token and returns new digest feed URL.
- Verification commands:
  - `npm run test --workspace @articlepod/web -- digest-routes`

### M74 - Digest Scheduler Pass + External Tick Signal
- status: Done
- target_finish: 2026-03-04
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Add worker digest scheduler pass for due daily/weekly windows.
  - Enforce latest-window-only catch-up behavior.
  - Add bearer-protected internal tick API to signal scheduler runs from external cron.
- Key files/modules:
  - `apps/worker/src/jobs/scheduleDigestRuns.ts`
  - `apps/worker/src/index.ts`
  - `apps/web/src/app/api/internal/digests/tick/route.ts`
- Acceptance criteria:
  - Due digest runs are enqueued idempotently per `(userId,cadence,periodKey)`.
  - Unauthorized tick calls are rejected.
- Verification commands:
  - `npm run test --workspace @articlepod/worker -- digest-jobs`
  - `npm run test --workspace @articlepod/web -- digest-routes`

### M75 - Digest Run Processor (Summary + Stub Email + Optional Podcast)
- status: Done
- target_finish: 2026-03-05
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Process digest runs asynchronously: collect markdown artifacts, summarize, persist summary/email artifacts, and optionally synthesize digest audio.
  - Add summary provider factory (stub/proxy-ready) and digest email sender stub.
- Key files/modules:
  - `apps/worker/src/jobs/processDigestRunJob.ts`
  - `apps/worker/src/lib/summary.ts`
  - `apps/worker/src/lib/digest-email.ts`
- Acceptance criteria:
  - No-source windows become `SKIPPED`.
  - Success path stores summary + stub email status.
  - Failures mark run `FAILED` with retry scheduling.
- Verification commands:
  - `npm run test --workspace @articlepod/worker -- digest-jobs`

### M76 - Separate Digest RSS + Digest Media Route Contract
- status: Done
- target_finish: 2026-03-06
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Add separate digest feed route (`/rss/digest/[token]`).
  - Add digest media route with token auth + `HEAD` + byte-range `206`.
- Key files/modules:
  - `apps/web/src/app/rss/digest/[token]/route.ts`
  - `apps/web/src/app/api/digest-media/[...path]/route.ts`
- Acceptance criteria:
  - Digest feed renders valid RSS 2.0 with iTunes namespace.
  - Digest media responses satisfy podcast client range semantics.
- Verification commands:
  - `./scripts/verify_podcast_contract.sh "<DIGEST_FEED_URL>"`

### M77 - Settings UX for Digest Controls + Run History
- status: Done
- target_finish: 2026-03-07
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Add digest feed copy/rotate controls in settings.
  - Add daily/weekly digest settings form (timezone, cadence toggles, schedule, length).
  - Add recent digest run history panel in settings.
- Key files/modules:
  - `apps/web/src/app/app/settings/page.tsx`
  - `apps/web/src/components/dashboard-client.tsx`
- Acceptance criteria:
  - Users can update digest settings and view digest run status from `/app/settings`.
  - `/app` workspace stays focused on source submission items.
- Verification commands:
  - `npm run build`
  - `npm run test --workspace @articlepod/web -- app-dashboard-layout`

### M78 - Digest Test Expansion + Contract Gates
- status: Done
- target_finish: 2026-03-08
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Add core/web/worker digest tests (scheduling, API auth, run processing, RSS/media range checks).
  - Run contract gates for both main and digest feeds.
- Key files/modules:
  - `packages/core/tests/digest.test.ts`
  - `apps/web/tests/digest-routes.test.ts`
  - `apps/worker/tests/digest-jobs.test.ts`
- Acceptance criteria:
  - Digest test suites pass in local CI profile.
  - Main and digest podcast contract scripts both pass.
- Verification commands:
  - `npm run test`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`
  - `./scripts/verify_podcast_contract.sh "<DIGEST_FEED_URL>"`

### M79 - Docs Sync for Digest Track
- status: Done
- target_finish: 2026-03-09
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Sync prompts/plans/architecture/documentation/env/operations/implement docs to digest implementation.
- Key files/modules:
  - `docs/Prompts.md`
  - `docs/plans.md`
  - `docs/architecture.md`
  - `docs/documentation.md`
  - `docs/env.md`
  - `docs/operations.md`
  - `docs/implement.md`
- Acceptance criteria:
  - Docs reflect digest data model, scheduler contract, feed/media endpoints, env vars, and runbook commands.
- Verification commands:
  - Manual cross-doc consistency pass.

### M80 - Brain Icon Consistency Pass (Web + Extension + RSS)
- status: Done
- target_finish: 2026-03-10
- completed_on: 2026-02-27
- evidence: local validation + implementation pass (2026-02-27)
- Scope:
  - Replace mixed icon surfaces with one deterministic brain-brand asset family.
  - Wire branded artwork into web metadata, app manifest, and both main/digest RSS feeds.
  - Extend podcast contract verification to enforce artwork tags and reachable artwork URL.
- Key files/modules:
  - `scripts/generate-extension-icons.py`
  - `apps/extension/manifest.json`
  - `apps/web/src/app/layout.tsx`
  - `apps/web/src/app/manifest.ts`
  - `apps/web/src/lib/brand-assets.ts`
  - `apps/web/src/components/brand-logo.tsx`
  - `apps/web/src/app/rss/[token]/route.ts`
  - `apps/web/src/app/rss/digest/[token]/route.ts`
  - `apps/web/scripts/export.ts`
  - `packages/core/src/rss/buildFeed.ts`
  - `scripts/verify_podcast_contract.sh`
- Acceptance criteria:
  - Browser/favicon, web app logo, extension icons, and RSS artwork all use the same brain mark family.
  - RSS output emits both `<itunes:image>` and `<image><url|title|link>` when feed artwork is configured.
  - Podcast contract gate fails if artwork tags are missing or artwork URL is unreachable.
- Verification commands:
  - `corepack pnpm run extension:icons`
  - `corepack pnpm run extension:validate`
  - `corepack pnpm run lint`
  - `corepack pnpm run test`
  - `corepack pnpm run build`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`
  - `./scripts/verify_podcast_contract.sh "<DIGEST_FEED_URL>"`

### M81 - Podcast Playback Compatibility + Description Quality Hardening
- status: Done
- target_finish: 2026-02-28
- completed_on: 2026-02-28
- evidence: local validation + implementation pass (2026-02-28)
- Scope:
  - Default published item and digest episodes to MP3 (`audio/mpeg`) for broader third-party podcast client compatibility.
  - Improve episode description quality by generating cleaned sentence-based summaries instead of raw text slicing.
  - Expand tests to lock MP3 defaults and description formatting behavior.
- Key files/modules:
  - `apps/worker/src/jobs/processItemJob.ts`
  - `apps/worker/src/jobs/processDigestRunJob.ts`
  - `packages/core/src/utils/description.ts`
  - `packages/core/src/tts/pythonService.ts`
  - `apps/web/scripts/seed-demo.ts`
  - `apps/web/tests/digest-routes.test.ts`
  - `apps/web/tests/auth-extension.integration.test.ts`
  - `apps/worker/tests/queue-resilience.test.ts`
  - `packages/core/tests/description.test.ts`
- Acceptance criteria:
  - New and regenerated episodes publish with `.mp3` enclosures and `audio/mpeg` MIME type.
  - Digest podcast episodes also publish as MP3 and remain range-compatible.
  - Episode descriptions in RSS are free of markdown/link noise and limited to concise sentence summaries.
  - Regression tests fail if defaults drift away from MP3 or description formatter behavior regresses.
- Verification commands:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run build`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

### M82 - Missing Media Auto-Repair + RSS Delete Consistency
- status: Done
- target_finish: 2026-02-28
- completed_on: 2026-02-28
- evidence: local validation + implementation pass (2026-02-28)
- Scope:
  - Add server-side media self-heal so missing episode objects trigger regeneration queueing instead of repeated client failures.
  - Reconcile MP3/M4A key drift in-place when alternate sibling media exists.
  - Guard regeneration queueing for non-regenerable items to prevent stuck requeue loops.
  - Exclude episodes with missing media from RSS output until repair completes.
  - Ensure delete behavior reflects in RSS output with stricter cache policy.
- Key files/modules:
  - `apps/web/src/lib/media-repair.ts`
  - `apps/web/src/app/api/media/[...path]/route.ts`
  - `apps/web/src/app/rss/[token]/route.ts`
  - `apps/web/src/app/rss/digest/[token]/route.ts`
  - `apps/web/scripts/backfill-episode-audio.ts`
  - `apps/web/tests/media-route.test.ts`
  - `apps/web/tests/rss-delete-route.test.ts`
- Acceptance criteria:
  - When expected media key is missing but sibling `.mp3`/`.m4a` exists, feed/media responses recover immediately and episode metadata is updated.
  - Missing media requests emit 404 and enqueue regeneration jobs when an episode/item can be safely identified.
  - Missing media requests do not enqueue regeneration when item source data is not available for rebuild.
  - RSS feed does not include episodes whose backing media object is unavailable.
  - Deleting an item removes its episode from subsequent RSS responses.
- Verification commands:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run build`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

### M83 - Global Geo Snapshot + Optional Demographic Survey
- status: Done
- target_finish: 2026-02-28
- completed_on: 2026-02-28
- evidence: local validation + implementation pass (2026-02-28)
- Scope:
  - Store coarse first-seen and last-seen geo snapshots on users from trusted proxy headers.
  - Add optional self-reported demographic survey with skip/edit/delete lifecycle.
  - Extend admin users analytics + CSV export with coarse geo and PII-gated demographic dimensions.
- Key files/modules:
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/schema.postgres.prisma`
  - `apps/web/src/lib/geo.ts`
  - `apps/web/src/lib/auth.ts`
  - `apps/web/src/app/api/account/demographics/route.ts`
  - `apps/web/src/components/dashboard-client.tsx`
  - `apps/web/src/lib/admin-analytics/service.ts`
  - `apps/web/src/lib/admin-analytics/types.ts`
  - `apps/web/src/lib/admin-analytics/csv.ts`
  - `apps/web/tests/geo.test.ts`
  - `apps/web/tests/auth-geo.test.ts`
  - `apps/web/tests/account-demographics.test.ts`
  - `apps/web/tests/admin-analytics.test.ts`
- Acceptance criteria:
  - Successful auth updates `User.firstSeen*` (set once) and `User.lastSeen*` (updated when new geo is available) without persisting raw IP.
  - `GET/POST/DELETE /api/account/demographics` supports default pending state and save/skip/edit/delete flows.
  - Settings page surfaces optional demographic form controls with clear non-blocking UX.
  - Admin users dataset and CSV include country/region for all modes and city/demographics only when `pii=1`.
- Verification commands:
  - `pnpm --filter @articlepod/web run lint`
  - `pnpm --filter @articlepod/web test`
  - `pnpm --filter @articlepod/web run build`
  - `pnpm --filter @articlepod/worker test`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

### M84 - Smart Feed Shortcuts + Admin-Only Markdown Controls
- status: Done
- target_finish: 2026-02-28
- completed_on: 2026-02-28
- evidence: local validation + implementation pass (2026-02-28)
- Scope:
  - Improve `/app` signed-in feed UX with copy icon and shortcut actions for Apple Podcasts and YouTube Music.
  - Use mobile-smart behavior (copy first, attempt app open where available, fallback to web) with inline status guidance.
  - Remove the `Demo mode ready` card from `/app`.
  - Restrict markdown preview actions to admins in dashboard UI and markdown API route.
- Key files/modules:
  - `apps/web/src/components/feed-url-actions.tsx`
  - `apps/web/src/app/app/page.tsx`
  - `apps/web/src/components/dashboard-client.tsx`
  - `apps/web/src/app/app/settings/page.tsx`
  - `apps/web/src/app/share/page.tsx`
  - `apps/web/src/app/api/items/[id]/markdown/route.ts`
  - `apps/web/tests/app-dashboard-layout.test.ts`
  - `apps/web/tests/auth-routes.test.ts`
  - `docs/Prompts.md`
  - `AGENTS.md`
- Acceptance criteria:
  - `/app` header exposes copy-first private feed shortcuts with clear copy/open status feedback.
  - `Demo mode ready` copy no longer appears in the workspace UI.
  - Non-admin users cannot view markdown controls in dashboard and receive `403` from markdown API.
  - Admin users retain markdown preview access in UI/API.
- Verification commands:
  - `pnpm --filter @articlepod/web run lint`
  - `pnpm --filter @articlepod/web test`
  - `pnpm --filter @articlepod/web run build`
  - `pnpm run lint`
  - `pnpm run test`
  - `pnpm run build`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

### M85 - Message-First Feedback Suggestions + Admin Triage Inbox
- status: Done
- target_finish: 2026-03-01
- completed_on: 2026-03-01
- evidence: local validation + implementation pass (2026-03-01)
- Scope:
  - Add an authenticated `/app/feedback` page with message-first input and optional type/feature metadata.
  - Add admin feedback inbox in `/admin` with status workflow and mirror retry actions.
  - Add env-gated private GitHub issue mirror with best-effort semantics and no submitter email in mirror payload.
- Key files/modules:
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/schema.postgres.prisma`
  - `apps/web/src/lib/feedback.ts`
  - `apps/web/src/lib/feedback-mirror.ts`
  - `apps/web/src/app/api/feedback/route.ts`
  - `apps/web/src/app/api/admin/feedback/route.ts`
  - `apps/web/src/app/api/admin/feedback/[id]/status/route.ts`
  - `apps/web/src/app/api/admin/feedback/[id]/mirror/route.ts`
  - `apps/web/src/components/feedback-form.tsx`
  - `apps/web/src/app/app/feedback/page.tsx`
  - `apps/web/src/components/admin-feedback-inbox.tsx`
  - `apps/web/src/app/admin/page.tsx`
  - `apps/web/tests/feedback-api.test.ts`
- Acceptance criteria:
  - `/app/feedback` renders feedback message as the first and required field.
  - Feedback `type` and `feature area` are optional and persist as `null` when omitted.
  - Contact checkbox defaults to checked and persists user opt-out when unchecked.
  - Admin inbox supports filtering, status updates, and mirror retry for failed/pending mirror states.
  - Mirror failures never block successful feedback submission.
- Verification commands:
  - `pnpm --filter @articlepod/web run lint`
  - `pnpm --filter @articlepod/web test`
  - `pnpm --filter @articlepod/web run build`
  - `pnpm --filter @articlepod/worker test`
  - `pnpm run lint`
  - `pnpm run test`
  - `pnpm run build`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

### M86 - Summary Studio Data Models and Contracts
- status: Done
- target_finish: 2026-03-21
- completed_on: 2026-03-21
- evidence: local validation + implementation pass (2026-03-21)
- Scope:
  - Add manual summary entities separate from scheduled digest runs.
  - Extend shared summary contracts to support manual summary generation metadata and structured outputs.
  - Persist provider/model/deployment/token metadata for scheduled digests and manual summaries.
- Key files/modules:
  - `packages/core/src/types/domain.ts`
  - `packages/core/src/digest/summary.ts`
  - `packages/core/src/metadata/azureTablePrimaryStore.ts`
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/schema.postgres.prisma`
- Acceptance criteria:
  - Manual summary runs, selected items, and published episodes are represented independently of scheduled digests.
  - Shared summary request/response types support Azure OpenAI metadata and markdown/plain-text outputs.
  - Azure Table and Prisma stores can persist the new summary entities and digest summary metadata.
- Verification commands:
  - `npx pnpm --filter @articlepod/core run typecheck`
  - `npx pnpm --filter @articlepod/web run typecheck`
  - `npx pnpm --filter @articlepod/worker run typecheck`

### M87 - Summary Studio APIs and Manual UX
- status: Done
- target_finish: 2026-03-21
- completed_on: 2026-03-21
- evidence: local validation + implementation pass (2026-03-21)
- Scope:
  - Add signed-in Summary Studio UI at `/app/summary`.
  - Add APIs for selectable items, run creation/history, and generated markdown retrieval.
  - Enforce default last-7-days selection, ready-item filtering, and a 30-item cap.
- Key files/modules:
  - `apps/web/src/app/app/summary/page.tsx`
  - `apps/web/src/components/summary-studio-client.tsx`
  - `apps/web/src/lib/summaries.ts`
  - `apps/web/src/app/api/summary/items/route.ts`
  - `apps/web/src/app/api/summary/runs/route.ts`
  - `apps/web/src/app/api/summary/runs/[id]/markdown/route.ts`
  - `apps/web/tests/summary-routes.test.ts`
- Acceptance criteria:
  - `/app/summary` supports explicit summary creation, custom title, `5 / 15 / 30` presets, and optional podcast generation.
  - Default item selection is limited to READY items from the last 7 days and can be manually refined.
  - Summary Studio APIs are authenticated and restricted to the current user’s items/runs.
- Verification commands:
  - `npx pnpm --filter @articlepod/web run test -- summary-routes`
  - `npx pnpm --filter @articlepod/web run build`

### M88 - Azure OpenAI Summary Provider and Worker Routing
- status: Done
- target_finish: 2026-03-21
- completed_on: 2026-03-21
- evidence: local validation + implementation pass (2026-03-21)
- Scope:
  - Add direct Azure OpenAI summary provider support in the worker.
  - Route `5` and `15` minute summaries to nano, `30` minute summaries to mini, with nano retry on mini for invalid/empty/timeout failures.
  - Process manual summary runs asynchronously and persist markdown/audio artifacts with observability metadata.
- Key files/modules:
  - `apps/worker/src/lib/env.ts`
  - `apps/worker/src/lib/summary.ts`
  - `apps/worker/src/jobs/processDigestRunJob.ts`
  - `apps/worker/src/jobs/processSummaryRunJob.ts`
  - `apps/worker/src/index.ts`
  - `apps/worker/tests/summary-provider.test.ts`
  - `apps/worker/tests/summary-jobs.test.ts`
- Acceptance criteria:
  - Worker can generate summary markdown/plain-text through Azure OpenAI with deterministic source clipping and structured output parsing.
  - Manual summary runs are claimed/retried like other worker work and store audio only when requested.
  - Nano fallback behavior is covered by tests and provider/model/deployment/token usage is persisted.
- Verification commands:
  - `npx pnpm --filter @articlepod/worker run test -- summary-provider`
  - `npx pnpm --filter @articlepod/worker run test -- summary-jobs`
  - `npx pnpm --filter @articlepod/worker run typecheck`

### M89 - Digest Feed and Media Integration for Manual Summaries
- status: Done
- target_finish: 2026-03-21
- completed_on: 2026-03-21
- evidence: local validation + implementation pass (2026-03-21)
- Scope:
  - Publish manual summary episodes into the existing private digest feed.
  - Extend digest media authorization and range handling to summary episodes.
  - Ensure account deletion and operational backfill paths include manual summary records/artifacts.
- Key files/modules:
  - `apps/web/src/app/rss/digest/[token]/route.ts`
  - `apps/web/src/app/api/digest-media/[...path]/route.ts`
  - `apps/web/src/app/api/account/delete/route.ts`
  - `apps/web/src/lib/ops/database-snapshot.ts`
  - `apps/web/src/lib/ops/azure-table-primary-backfill.ts`
  - `apps/web/tests/digest-routes.test.ts`
  - `apps/web/tests/storage-cutover-config.test.ts`
- Acceptance criteria:
  - Digest RSS includes scheduled digest episodes and manual summary episodes in newest-first order with unique enclosure URLs.
  - Digest media route serves manual summary episodes with the same `HEAD` and byte-range `206` contract.
  - Summary records are included in lifecycle cleanup and metadata backfill coverage.
- Verification commands:
  - `npx pnpm --filter @articlepod/web run test -- digest-routes`
  - `npx pnpm --filter @articlepod/web run test -- storage-cutover-config`

### M90 - Azure OpenAI Provisioning and Deploy Automation
- status: Done
- target_finish: 2026-03-21
- completed_on: 2026-03-21
- evidence: local validation + Azure provisioning pass (2026-03-21)
- Scope:
  - Add Azure OpenAI account provisioning to IaC-adjacent deploy automation.
  - Provision nano and mini summary deployments with model-version fallback.
  - Teach env rendering and deploy helpers to auto-discover or provision Azure OpenAI configuration.
- Key files/modules:
  - `infra/main.bicep`
  - `scripts/azure/provision-openai.sh`
  - `scripts/azure/discover-resources.sh`
  - `scripts/azure/render-env.sh`
  - `scripts/azure/deploy-changes.sh`
  - `scripts/check-env.mjs`
- Acceptance criteria:
  - Azure OpenAI account can be created or reused in the production resource group with deployments for both nano and mini summary lanes.
  - Azure env rendering fails clearly when Azure OpenAI vars are required but missing.
  - Daily deploy helper can provision/discover Azure OpenAI settings when rendering VM env.
- Verification commands:
  - `npm run check:env:azure`
  - `./scripts/azure/provision-openai.sh --resource-group rg-articlepod-prod`

### M91 - Summary Studio Validation and Docs Sync
- status: Done
- target_finish: 2026-03-21
- completed_on: 2026-03-21
- evidence: local validation + implementation pass (2026-03-21)
- Scope:
  - Add regression coverage for Summary Studio routes, feed/media integration, and worker provider routing.
  - Sync prompts/plans/architecture/documentation/env/deploy guides and env examples to the new summary flow and Azure OpenAI runtime contract.
  - Record verification evidence and user prompt context for the new milestone track.
- Key files/modules:
  - `apps/web/tests/summary-routes.test.ts`
  - `apps/web/tests/digest-routes.test.ts`
  - `apps/worker/tests/summary-provider.test.ts`
  - `apps/worker/tests/summary-jobs.test.ts`
  - `docs/Prompts.md`
  - `docs/plans.md`
  - `docs/architecture.md`
  - `docs/documentation.md`
  - `docs/env.md`
  - `docs/azure-deploy.md`
  - `docs/implement.md`
  - `docs/chat_log.md`
- Acceptance criteria:
  - Repo docs describe Summary Studio, Azure OpenAI provisioning, env vars, and digest-feed integration without drift.
  - Verification evidence covers lint, typecheck, test, build, and updated route surfaces.
  - Change history includes a concise summary of the user request and exact prompts.
- Verification commands:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

### M92 - Feed Stability + Extension Lifetime UX
- status: Done
- target_finish: 2026-03-22
- completed_on: 2026-03-22
- evidence: local validation + implementation pass (2026-03-22)
- Scope:
  - Replace per-request RSS enclosure signing with stable episode-scoped media tokens that stay valid until feed-token rotation.
  - Make RSS `HEAD` mirror feed headers and add deterministic channel `pubDate` + `lastBuildDate`.
  - Preload dashboard audio metadata so durations render before playback starts.
  - Extend extension auth defaults to 24-hour connect codes and long-lived installed tokens, and sync docs/env examples.
- Key files/modules:
  - `packages/core/src/security/signedUrl.ts`
  - `packages/core/src/rss/buildFeed.ts`
  - `apps/web/src/app/rss/[token]/route.ts`
  - `apps/web/src/app/rss/digest/[token]/route.ts`
  - `apps/web/src/app/api/media/[...path]/route.ts`
  - `apps/web/src/app/api/digest-media/[...path]/route.ts`
  - `apps/web/src/components/dashboard-client.tsx`
  - `apps/web/src/lib/auth.ts`
  - `docs/Prompts.md`
  - `docs/plans.md`
  - `docs/architecture.md`
  - `docs/documentation.md`
  - `docs/env.md`
  - `apps/extension/README.md`
  - `.env.example`
  - `.env.simple.example`
  - `.env.parity.example`
- Acceptance criteria:
  - Repeated RSS fetches for the same unchanged episode emit the same enclosure URL.
  - Item and digest media routes still honor `HEAD` + byte-range `206`, while supporting stable episode-scoped media tokens and legacy expiring tokens during rollout.
  - RSS `HEAD` returns the same feed headers as `GET`.
  - Legacy feed URLs keep working when an active feed-token row still has the correct plaintext token but its persisted hash drifted during storage cutover; the feed request repairs the hash and serves the same URL.
  - Dashboard audio players show duration without requiring the user to press play first.
  - Extension connect codes default to 24 hours, and installed extension tokens remain valid until explicitly revoked.
- Verification commands:
  - `pnpm --filter @articlepod/core test`
  - `pnpm --filter @articlepod/web test`
  - `pnpm lint`
  - `pnpm build`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

### M93 - Social-First Auth UX + Facebook OAuth
- status: Done
- target_finish: 2026-03-23
- completed_on: 2026-03-23
- evidence: local validation + social-first auth + Facebook OAuth pass (2026-03-23)
- Scope:
  - Redesign `/login` so configured social providers appear first and local email auth becomes a secondary fallback.
  - Add Facebook OAuth start/callback routes and env-gated provider detection alongside Google and Apple.
  - Extend auth analytics/admin filters/docs so Facebook-authenticated users are tracked consistently.
- Key files/modules:
  - `apps/web/src/app/login/page.tsx`
  - `apps/web/src/app/api/auth/facebook/*`
  - `apps/web/src/app/api/auth/providers/route.ts`
  - `apps/web/src/lib/auth.ts`
  - `apps/web/src/lib/oauth-providers.ts`
  - `apps/web/src/lib/admin-analytics/*`
  - `packages/core/src/analytics/types.ts`
  - `docs/Prompts.md`
  - `docs/plans.md`
  - `docs/oauth-setup.md`
  - `docs/env.md`
- Acceptance criteria:
  - `/login` presents configured social providers in Google, Facebook, Apple order and hides unconfigured providers.
  - First-time Facebook sign-in creates an account automatically, repeat sign-in reuses the same identity, and same-email local/OAuth accounts link safely.
  - Admin analytics filters and derived auth profiles include `FACEBOOK`.
- Verification commands:
  - `pnpm --filter @articlepod/web lint`
  - `pnpm --filter @articlepod/web test`
  - `pnpm --filter @articlepod/web build`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`

### M94 - Azure Worker Stability Hotfix
- status: Done
- target_finish: 2026-03-24
- completed_on: 2026-03-24
- evidence: local validation + production Azure worker/TTS hotfix pass (2026-03-24)
- Scope:
  - Stop Azure Table primary worker loops from crashing on unsupported null-equality filters.
  - Prevent false Kokoro worker failures on slower Azure B2s hosts by extending timeout handling for long chunk synthesis.
  - Document Azure runtime timeout defaults so future deploys keep the fix.
- Key files/modules:
  - `packages/core/src/metadata/azureTablePrimaryStore.ts`
  - `packages/core/src/tts/pythonService.ts`
  - `apps/worker/src/jobs/processItemJob.ts`
  - `scripts/azure/render-env.sh`
  - `.env.azure.example`
  - `docs/Prompts.md`
  - `docs/plans.md`
  - `docs/env.md`
  - `docs/azure-deploy.md`
- Acceptance criteria:
  - Azure Table primary digest scheduler polling and extension-token revocation do not emit invalid `eq null` OData filters.
  - Long Kokoro chunk requests on Azure no longer fail at the old fixed 120-second client timeout.
  - If a python-tts timeout does happen, the worker surfaces actionable guidance instead of claiming the sidecar is down.
- Verification commands:
  - `pnpm --filter @articlepod/core test`
  - `pnpm --filter @articlepod/worker test`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`

### M95 - Stuck Job Watchdog Hardening
- status: Done
- target_finish: 2026-03-24
- completed_on: 2026-03-24
- evidence: local validation + production stuck-job watchdog pass (2026-03-24)
- Scope:
  - Prevent pinned-IP extraction socket failures from crashing the worker process.
  - Default Azure pinned fetches to IPv4-only candidates on the current single-stack VM profile.
  - Heartbeat long-running TTS jobs so stale-lock detection means "no progress" rather than "processing took a while".
  - Mark repeatedly stalled jobs as `PROCESSING_TIMEOUT` instead of reclaiming them forever and starving the queue.
- Key files/modules:
  - `packages/core/src/extract/html.ts`
  - `packages/core/src/errors/codes.ts`
  - `packages/core/tests/extract.test.ts`
  - `apps/worker/src/jobs/processItemJob.ts`
  - `apps/worker/src/lib/env.ts`
  - `apps/worker/tests/queue-resilience.test.ts`
  - `apps/worker/tests/retry-policy.test.ts`
  - `.env.azure.example`
  - `scripts/azure/render-env.sh`
  - `docs/Prompts.md`
  - `docs/plans.md`
  - `docs/env.md`
  - `docs/azure-deploy.md`
- Acceptance criteria:
  - IPv4/IPv6 pinned-IP connect failures do not crash the worker process and instead fall through to the existing retry/fallback logic.
  - Long TTS jobs refresh their job lock while chunks are completing, so legitimate multi-minute audio work is not reclaimed as stale.
  - A stalled job gets at most one automatic reclaim, then moves to `PROCESSING_TIMEOUT` with no further auto-retries.
  - Reclaimed stale jobs no longer prevent newer queued work from being processed first.
- Verification commands:
  - `pnpm --filter @articlepod/core test`
  - `pnpm --filter @articlepod/worker test`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`

### M96 - Redirect Canonicalization Hardening
- status: Done
- target_finish: 2026-03-25
- completed_on: 2026-03-25
- evidence: local validation + production redirect canonicalization hardening pass (2026-03-25)
- Scope:
  - Canonicalize redirecting/share/login-style URLs before enqueue/extraction when the final public URL is safely discoverable.
  - Keep canonicalization fail-open so transient redirect discovery failures do not block submission.
  - Preserve SSRF protections across every redirect hop.
- Key files/modules:
  - `packages/core/src/security/urlPolicy.ts`
  - `packages/core/tests/security.test.ts`
  - `apps/web/src/app/api/items/url/route.ts`
  - `apps/worker/src/jobs/processItemJob.ts`
  - `docs/Prompts.md`
  - `docs/plans.md`
- Acceptance criteria:
  - Safe public redirects are followed and stored as the canonical source URL for new submissions.
  - Redirect discovery failure falls back to the original validated URL rather than breaking submission.
  - Redirect chains to blocked/private hosts are still rejected.
  - Existing queued items still benefit because the worker canonicalizes URL sources before extraction.
- Verification commands:
  - `pnpm --filter @articlepod/core test`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`

### M97 - Smart Extension Capture
- status: Done
- target_finish: 2026-03-26
- completed_on: 2026-03-24
- evidence: local validation + smart extension capture pass (2026-03-24)
- Scope:
  - Add popup-triggered smart capture that can reveal likely article continuations before upload using bounded safe clicks and limited scroll passes.
  - Keep extension snapshots HTML-first and compatible with the existing `HTML_SNAPSHOT` worker extraction path.
  - Remove only inert nodes from the serialized clone, keep the single hard byte limit on the route, and fail early in the popup when safe cleanup still exceeds the budget.
- Key files/modules:
  - `apps/extension/capture-page.mjs`
  - `apps/extension/popup.js`
  - `apps/extension/popup.html`
  - `apps/web/src/app/api/items/html-snapshot/route.ts`
  - `packages/core/src/types/domain.ts`
  - `packages/core/tests/extension-capture.test.ts`
  - `apps/web/tests/auth-routes.test.ts`
  - `docs/Prompts.md`
  - `docs/plans.md`
  - `docs/architecture.md`
  - `apps/extension/README.md`
- Acceptance criteria:
  - Likely article content can be revealed via bounded smart capture without switching to a second extraction pipeline in the extension.
  - Feed/thread-style hosts remain conservative and do not aggressively expand replies or surrounding discussion.
  - Safe cleanup removes inert nodes/comments while preserving document structure that the server extractor relies on.
  - The shared schema no longer enforces a separate character cap; the route enforces the single hard byte limit.
  - Oversized cleaned snapshots fail clearly in the popup and on the route.
  - The popup stays focused on capture + cleanup, while the server extractor classifies explicit challenge/block snapshots and returns clear guidance.
- Verification commands:
  - `pnpm --filter @articlepod/core test`
  - `pnpm --filter @articlepod/web test`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm extension:validate`

### M98 - Extracted Markdown Cleanup Rollout
- status: Done
- target_finish: 2026-03-27
- completed_on: 2026-03-24
- evidence: local validation + markdown cleanup/backfill rollout pass (2026-03-24)
- Scope:
  - Add shared rule-based cleanup for extracted source markdown before canonical `MARKDOWN` persistence and before TTS narration derivation.
  - Strip transport noise such as image/link scaffolding, leading metadata, caption credits, and footer/legal/navigation chrome while preserving meaningful prose.
  - Add idempotent backfill tooling that rewrites existing stored `source.md` artifacts, queues regeneration when narration hashes change, and preserves already-published low-signal episodes for feed stability.
- Key files/modules:
  - `packages/core/src/extract/markdownCleanup.ts`
  - `packages/core/src/extract/html.ts`
  - `apps/worker/src/jobs/processItemJob.ts`
  - `apps/web/src/lib/markdown-artifact-backfill.ts`
  - `apps/web/scripts/cleanup-markdown-artifacts.ts`
  - `docs/Prompts.md`
  - `docs/plans.md`
  - `docs/architecture.md`
  - `docs/documentation.md`
- Acceptance criteria:
  - New items persist cleaned extracted markdown as the canonical `MARKDOWN` artifact while leaving `RAW_HTML` and `RAW_PDF` untouched.
  - Cleaned markdown drives narration text, chunk hashes, cache keys, and episode descriptions.
  - Chrome-only or low-signal pages fail with a clearer `EXTRACTION_EMPTY` message after cleanup.
  - Existing items can be cleaned in place with regeneration queued only when the cleaned narration hash changes.
  - Already-published low-signal items are reported and skipped rather than auto-deleted.
- Verification commands:
  - `pnpm --filter @articlepod/core test`
  - `pnpm --filter @articlepod/worker exec tsx --test --test-concurrency=1 tests/queue-resilience.test.ts`
  - `pnpm --filter @articlepod/web exec tsx --test tests/markdown-artifact-backfill.test.ts`
  - `pnpm --filter @articlepod/worker typecheck`
  - `pnpm --filter @articlepod/web typecheck`

### M99 - Reusable Live-Site Regression Harness
- status: Done
- target_finish: 2026-03-28
- completed_on: 2026-03-24
- evidence: local validation + reusable live-site regression harness pass (2026-03-24)
- Scope:
  - Add a top-level `testing/live-site/` workspace with an editable Markdown corpus, quirks ledger, TypeScript runners, and lightweight unit tests.
  - Run checked-out local code for URL and browser-capture validation, plus dispatch GitHub Actions VM probes for URL-path production checks.
  - Write timestamped reports with provenance, structured results, failure grouping, and rerun-friendly site filters.
  - Add an extension popup target-tab test hook so the unpacked-extension smoke path can target a known page without depending on the Chrome Web Store build.
- Key files/modules:
  - `testing/live-site/*`
  - `apps/extension/popup.js`
  - `apps/extension/target-tab.mjs`
  - `.github/workflows/probe-url-extraction.yml`
  - `docs/Prompts.md`
  - `docs/release-checklist.md`
  - `scripts/README.md`
- Acceptance criteria:
  - One root command runs the default corpus against local latest code and production URL probes.
  - `corpus.md` is the only file operators edit to manage the default target list.
  - Local successful runs exercise RSS/media contract verification for ready items.
  - Failures are grouped into product regression, expected site block, site behavior changed, and harness issue.
  - The unpacked-extension smoke path uses checked-in extension code with runtime config redirected to the local app URL plus a matching temporary host-permission override in the manifest.
- Verification commands:
  - `pnpm --filter @articlepod/live-site test`
  - `pnpm --filter @articlepod/live-site typecheck`
  - `npm run live-sites:test -- --env local --limit 1`

### M100 - Importance + Tags for Captures
- status: Done
- target_finish: 2026-03-31
- completed_on: 2026-03-25
- evidence: local validation + importance/tags capture metadata pass + optional-details/queued-confirmation UX pass (2026-03-25)
- Scope:
  - Replace user-facing `Priority` copy with `Importance` while keeping the existing `LOW` / `MEDIUM` / `HIGH` backing contract.
  - Add optional freeform comma-separated item tags for URL, PDF, and Chrome extension capture, stored in normalized lowercase form.
  - Surface importance and tags in `/app` Recent items, with lightweight client-side filters for importance and tag.
  - Make optional metadata visibly secondary in both the web submit flow and Chrome extension popup.
  - Reduce double-submit confusion after extension capture with persistent popup success state and same-page button lockout while queued.
  - Keep route compatibility by accepting both canonical `importance` and legacy `priority` payloads during rollout.
- Key files/modules:
  - `packages/core/src/types/domain.ts`
  - `packages/core/src/metadata/azureTablePrimaryStore.ts`
  - `apps/web/src/lib/items.ts`
  - `apps/web/src/lib/dashboard.ts`
  - `apps/web/src/components/dashboard-client.tsx`
  - `apps/web/src/app/api/items/*`
  - `apps/extension/popup.html`
  - `apps/extension/popup.js`
  - `docs/Prompts.md`
  - `docs/documentation.md`
  - `apps/extension/README.md`
- Acceptance criteria:
  - URL, PDF, and HTML snapshot ingest routes accept `importance`, legacy `priority`, and tags, then persist canonical importance and normalized tags.
  - Existing items keep their current priority-backed value and default to empty tags without backfill or destructive reset.
  - `/app` shows saved importance/tag metadata and lets users filter recent items without breaking polling or media playback token stability.
  - Web and extension capture UIs make `Title` / `Importance` / `Tags` clearly optional via compact secondary grouping, without redundant helper copy in the extension popup.
  - Chrome extension capture exposes the same metadata fields as the web submit flow and clearly confirms queued captures without inviting a second click.
  - The extension popup disables the queued button for the already-captured page and re-enables capture when the target page changes.
- Verification commands:
  - `pnpm --filter @articlepod/core test`
  - `pnpm --filter @articlepod/core typecheck`
  - `pnpm --filter @articlepod/web exec tsx --test tests/auth-routes.test.ts tests/auth-extension.integration.test.ts`
  - `pnpm --filter @articlepod/web exec tsx --test tests/app-dashboard-layout.test.ts tests/dashboard-polling.test.ts`
  - `pnpm --filter @articlepod/web typecheck`

---

## Security Hardening Track (S01–S18)

> Audit date: 2026-02-28. All milestones are **Planned** pending per-issue user sign-off.
> Priority order: P0 (critical/do-now) → P1 (high/pre-launch) → P2 (medium/pre-scale) → P3 (medium-long/polish).

---

### S01 — Apple Sign-In JWT Cryptographic Verification
- status: Planned
- priority: P0 (Critical)
- target_finish: 2026-03-07
- Audit finding:
  - `apps/web/src/app/api/auth/apple/callback/route.ts` decodes the Apple `id_token` payload with
    plain base64 but never verifies the RS256/ES256 signature against Apple's published JWKS.
  - An attacker can craft a JWT with any `sub` (Apple user ID) and log in as any existing Apple-linked account.
- Options considered:
  - **Option A (chosen):** Use `jose` library to verify the `id_token` against Apple's JWKS endpoint
    (`https://appleid.apple.com/auth/keys`). Validate `iss`, `aud`, `exp` claims before trusting `sub`/`email`.
    This is the Apple-recommended approach and the `jose` library is MIT-licensed.
  - **Option B:** Replace Apple Sign-In with Apple's server-to-server token validation API.
    Heavier implementation, same security outcome, but more moving parts.
  - **Option C:** Disable Apple Sign-In until fixed (emergency stop-gap only).
- Accepted approach: Option A.
- Scope:
  - Add `jose` as a dependency in `apps/web`.
  - Replace `parseJwtPayload()` with a `verifyAppleIdToken(idToken, clientId)` helper that fetches JWKS,
    validates signature, and returns verified claims.
  - Add unit test with a fixture JWT + mock JWKS endpoint.
- Key files/modules:
  - `apps/web/src/app/api/auth/apple/callback/route.ts`
  - `apps/web/src/lib/auth.ts` (new `verifyAppleIdToken` helper)
  - `apps/web/tests/auth-apple.test.ts`
- Acceptance criteria:
  - A JWT with a tampered payload or invalid signature is rejected with `apple_token` error.
  - A valid Apple token (mocked JWKS in tests) proceeds to `findOrCreateOAuthUser`.
  - `iss === "https://appleid.apple.com"` and `aud === clientId` are both asserted.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- auth-apple`
  - `pnpm --filter @articlepod/web run lint`
  - `pnpm --filter @articlepod/web run typecheck`

---

### S02 — Drop Plaintext Token Storage from Database
- status: Planned
- priority: P0 (Critical)
- target_finish: 2026-03-07
- Compatibility hold (2026-03-23):
  - Newly created and rotated feed/digest tokens still persist `tokenValue` because `/app/settings` currently re-displays the private RSS URL.
  - Legacy hash-only feed/digest rows must remain active until the user explicitly rotates them.
  - A partial hash-only rollout caused surprise feed-token churn for active subscribers, so plaintext feed-token persistence remains in place until the replacement UX and migration plan are implemented.
- Audit finding:
  - `FeedToken.tokenValue`, `DigestFeedToken.tokenValue`, `ShareToken.tokenValue`, and
    `ExtensionToken.tokenValue` all store plaintext tokens alongside their SHA-256 hash.
  - A database dump exposes every active RSS feed URL, share link, and extension token immediately.
  - `Session` already uses hash-only storage — the other models do not follow the same pattern.
- Options considered:
  - **Option A (chosen):** Remove `tokenValue` columns from all four models in a Prisma migration.
    All lookups already use `tokenHash`. Return plaintext token to the caller once at creation time only
    (already the pattern in `createSecretToken()`). Force a one-time token rotation for all existing users.
  - **Option B:** Encrypt `tokenValue` at-rest using AES-GCM with a `TOKEN_ENCRYPTION_KEY` env secret.
    More complex, and if the key is on the same VM as the DB, provides limited additional protection.
  - **Option C:** Keep as-is but add a DB-level encryption layer (e.g., Transparent Data Encryption on Azure).
    Doesn't protect against a SQL injection or application-layer dump.
- Accepted approach: Option A.
- Scope:
  - Drop `tokenValue` from `FeedToken`, `DigestFeedToken`, `ShareToken`, `ExtensionToken` in both
    `schema.prisma` and `schema.postgres.prisma`.
  - Update `auth.ts`: `ensureUserFeedToken`, `ensureUserDigestFeedToken`, `createShareToken`,
    `createExtensionToken` — return plaintext only at creation, never read back.
  - Update `dashboard.ts`: `getActiveFeedTokenForUser()` returns `null` instead of plaintext;
    the dashboard page flow derives feed URL from the token returned at rotation time.
  - Write migration. For existing rows: invalidate by setting `active=false` and emit a one-time
    rotation event so the next user session triggers new token issuance.
- Key files/modules:
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/schema.postgres.prisma`
  - `apps/web/src/lib/auth.ts`
  - `apps/web/src/lib/dashboard.ts`
  - `apps/web/src/app/api/feed-token/rotate/route.ts`
  - `apps/web/src/app/rss/[token]/route.ts`
- Acceptance criteria:
  - No `tokenValue` column exists in any token model.
  - Feed URL is derived from the plaintext token returned at the time of creation/rotation.
  - Hash-only lookup works end-to-end: RSS route resolves token → user → episodes.
  - All existing tests pass; add a test asserting `tokenValue` is absent on any created token row.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- tokens`
  - `pnpm --filter @articlepod/web test -- rss`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

---

### S03 — Login Brute-Force Rate Limiting + Timing Oracle Fix
- status: Planned
- priority: P0 (Critical)
- target_finish: 2026-03-07
- Audit finding:
  - `POST /api/auth/login` has no rate limiting. An attacker can brute-force passwords at bcrypt cost
    with no throttling.
  - When an email is not found, the handler short-circuits before `bcrypt.compare()`, creating a
    timing difference that confirms whether an email is registered.
- Options considered:
  - **Option A (chosen):** Add `enforceRateLimit` per IP (10 attempts / 15 min) and per email
    (5 attempts / 15 min) at the top of the handler before any DB work. When user lookup fails,
    run `bcrypt.compare(body.password, DUMMY_HASH)` before returning 401 to normalize timing.
  - **Option B:** Implement exponential backoff with a `LoginAttempt` table (persistent across restarts).
    Heavier, but survives process restarts. Can be added in S11 (shared-state rate limiter).
  - **Option C:** Add a CAPTCHA after N failures. Better UX than hard blocks but requires a third-party
    service (adds a dependency); defer to P3.
- Accepted approach: Option A now; revisit with shared-state rate limiter in S11.
- Scope:
  - Add per-IP and per-email `enforceRateLimit` calls at handler entry.
  - Define `DUMMY_HASH` (a static bcrypt hash) in `auth.ts` and run a compare when user not found.
  - Move `ensureAdminUser()` call out of the login handler (see S04).
- Key files/modules:
  - `apps/web/src/app/api/auth/login/route.ts`
  - `apps/web/src/lib/auth.ts` (DUMMY_HASH constant)
  - `apps/web/tests/auth-login.test.ts`
- Acceptance criteria:
  - 11th login attempt from same IP within 15 min returns 429.
  - 6th attempt with same email within 15 min returns 429.
  - Timing difference between "user not found" and "wrong password" is ≤ 5ms on average in tests.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- auth-login`
  - `pnpm --filter @articlepod/web run lint`

---

### S04 — Move Admin Bootstrap Out of Request Path
- status: Planned
- priority: P1 (High)
- target_finish: 2026-03-07
- Audit finding:
  - Every `POST /api/auth/login` call invokes `ensureAdminUser()`, which unconditionally runs
    `bcrypt.hash(ADMIN_PASSWORD, 12)` (~100–300ms CPU per unauthenticated request).
  - This is both a CPU amplifier (DoS) and a startup-concern leaking into a hot path.
- Options considered:
  - **Option A (chosen):** Move `ensureAdminUser()` to server startup. Add an in-process boolean
    flag (`adminBootstrapped`) so it only runs once per process lifetime, not per request.
    If `ADMIN_PASSWORD` is unset, throw at startup so the app fails fast rather than breaking login for everyone.
  - **Option B:** Keep in the request path but add a module-level `let bootstrapped = false` guard.
    Still runs once per process restart, avoids the per-request bcrypt cost. Simpler but less clean.
  - **Option C:** Remove admin bootstrap entirely; use a separate `npm run create-admin` CLI script.
    Cleanest design but breaks zero-config local startup.
- Accepted approach: Option A (startup init with flag guard).
- Scope:
  - Add `initAdminUser()` call in the Next.js server startup path (instrumentation hook or
    `apps/web/src/app/layout.tsx` server-side init block with a module-level guard).
  - Remove `ensureAdminUser()` from `apps/web/src/app/api/auth/login/route.ts`.
  - Assert `ADMIN_PASSWORD` non-empty at startup; throw `Error("ADMIN_PASSWORD must be set")`.
- Key files/modules:
  - `apps/web/src/lib/user-bootstrap.ts`
  - `apps/web/src/app/api/auth/login/route.ts`
  - `apps/web/src/app/layout.tsx` (or equivalent startup hook)
- Acceptance criteria:
  - `POST /api/auth/login` no longer calls any bcrypt hash operation outside of `verifyPassword`.
  - Server startup logs "admin user bootstrapped" once per process.
  - App fails to start (exits non-zero) when `ADMIN_PASSWORD` is unset in production profile.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- auth-login`
  - `pnpm --filter @articlepod/web run build`

---

### S05 — ChunkCache Cross-User Audio Privacy and Reliability
- status: Planned
- priority: P1 (High)
- target_finish: 2026-03-14
- Audit finding:
  - The chunk cache key is `sha256(provider|voice|chunkHashes)` with no user component.
  - When two users submit the same article with the same TTS settings, User B's episode references
    User A's audio file path. If User A deletes their item, User B's episode silently breaks.
  - Privacy concern: User B's RSS feed serves audio stored under User A's item path.
- Options considered:
  - **Option A:** Scope cache key to `userId` so each user always gets their own audio file.
    Simplest fix; eliminates sharing entirely. Slightly less efficient (no cross-user dedup),
    but correctness and privacy are worth it.
  - **Option B (chosen):** Move cached audio to a content-addressed shared path
    (`shared/audio/{contentHash}.mp3`) independent of any item. Track reference counts in a new
    `SharedAudioAsset` table. Delete the shared asset only when `refcount` drops to 0.
    Best efficiency and privacy; no user's files live in another user's path.
  - **Option C:** Scope cache key to `userId` (Option A) as a quick fix now; design Option B as a
    follow-on optimization under a separate milestone.
- Accepted approach: Option C (Option A now for correctness; Option B deferred as optimization).
- Scope:
  - Modify `processItemJob.ts`: include `userId` in the chunk cache key derivation.
  - Ensure `ChunkCache.itemId` still points to the item that produced the cache entry, but
    the audio path is user-scoped.
  - Add a test: two users submit identical content → each gets their own audio file path.
- Key files/modules:
  - `apps/worker/src/jobs/processItemJob.ts`
  - `packages/core/src/chunking/chunkText.ts` (if cache key is built here)
  - `apps/web/tests/chunk-cache.test.ts`
- Acceptance criteria:
  - Two users submitting identical content produce separate audio files in separate paths.
  - Deleting User A's item does not affect User B's episode.
- Verification commands:
  - `pnpm --filter @articlepod/worker test -- chunk-cache`
  - `pnpm --filter @articlepod/web test`

---

### S06 — digestSchedulerSecret Startup Assertion
- status: Planned
- priority: P1 (High)
- target_finish: 2026-03-07
- Audit finding:
  - `DIGEST_SCHEDULER_SECRET` defaults to `""` if unset. The tick endpoint returns 503 for empty
    secrets, but a deployment that forgets this env var has no startup warning — it silently
    allows the digest feature to appear healthy while being unauthenticated.
- Options considered:
  - **Option A (chosen):** Assert `digestSchedulerSecret.length >= 32` at startup in `user-bootstrap.ts`
    (or the env validation layer). Throw if unset and `RUNTIME_PROFILE !== "simple"` (local dev
    can omit it). This mirrors the existing `SESSION_SECRET` minimum-length pattern.
  - **Option B:** Log a `WARN` on startup without throwing. Weaker, but doesn't break local dev.
  - **Option C:** Auto-generate a random secret at startup if unset and write it to the env file.
    Risky: the generated secret won't match the cron caller's config.
- Accepted approach: Option A.
- Scope:
  - Update `apps/web/src/lib/env.ts`: add minimum-length assertion for `digestSchedulerSecret`
    when `runtimeProfile !== "simple"`.
  - Same check in `apps/worker/src/lib/env.ts`.
- Key files/modules:
  - `apps/web/src/lib/env.ts`
  - `apps/worker/src/lib/env.ts`
- Acceptance criteria:
  - Non-simple profile startup throws a clear error when `DIGEST_SCHEDULER_SECRET` is unset or < 32 chars.
  - Simple profile (local dev) starts without the var.
- Verification commands:
  - `pnpm --filter @articlepod/web run build`
  - `pnpm --filter @articlepod/worker run build`

---

### S07 — Python TTS Sidecar Authentication + Non-Root Docker
- status: Planned
- priority: P1 (High)
- target_finish: 2026-03-07
- Audit finding:
  - `POST /v1/synthesize` on the python-tts service has no authentication.
  - The Dockerfile has no `USER` directive — the service runs as root.
  - If port 8010 is reachable outside the VM/pod network, any caller can synthesize arbitrary text.
- Options considered:
  - **Option A (chosen):** Add a `SIDECAR_SHARED_SECRET` env var. Python-tts FastAPI middleware checks
    `X-Sidecar-Secret` header on every `/v1/synthesize` call. Node.js caller (`tts/pythonService.ts`)
    injects the header. Add `USER app` to Dockerfile. Bind uvicorn to `127.0.0.1` by default.
  - **Option B:** Use mTLS between Node caller and Python sidecar. Most secure but heavy for an
    intra-VM communication channel.
  - **Option C:** Rely entirely on network isolation (private VNET / no external port binding).
    Operational safeguard only; doesn't defend against tenant-level escapes or config mistakes.
- Accepted approach: Option A.
- Scope:
  - `services/python-tts/app/main.py`: add FastAPI middleware for `X-Sidecar-Secret` on `/v1/synthesize`.
  - `services/python-tts/Dockerfile`: add `USER app` and change bind to `127.0.0.1`.
  - `packages/core/src/tts/pythonService.ts`: inject `X-Sidecar-Secret` header from env.
  - `apps/web/src/lib/env.ts`, `apps/worker/src/lib/env.ts`: add `ttsSidecarSecret` field.
  - Update `.env.example` and `docs/env.md`.
- Key files/modules:
  - `services/python-tts/app/main.py`
  - `services/python-tts/Dockerfile`
  - `packages/core/src/tts/pythonService.ts`
- Acceptance criteria:
  - Request to `/v1/synthesize` without `X-Sidecar-Secret` returns 401.
  - Node TTS client includes the header and synthesis works end-to-end.
  - `docker inspect` shows process user is not root.
- Verification commands:
  - `curl -X POST http://127.0.0.1:8010/v1/synthesize` (expect 401)
  - `pnpm --filter @articlepod/worker test -- tts`
  - End-to-end job completion test

---

### S08 — SSRF DNS Rebinding TOCTOU Fix
- status: Planned
- priority: P1 (High)
- target_finish: 2026-03-14
- Audit finding:
  - `validateFetchableUrl()` resolves DNS at validation time; `extractHtmlFromUrl()` re-resolves
    via `fetch(url)` potentially seconds later. An attacker-controlled domain can serve a public IP
    at validation and rebind to `169.254.169.254` (metadata) at fetch time.
- Options considered:
  - **Option A (chosen):** After `lookup()` in `validateFetchableUrl`, return the resolved IP address.
    In `extractHtmlFromUrl`, use `fetch()` with the IP directly in the URL and set the `Host` header
    to the original hostname. This forces a single DNS resolution that cannot be rebounded.
  - **Option B:** Run all outbound fetches through an HTTP proxy that enforces IP-layer blocking
    (e.g., a local Squid or dante proxy). More operationally complex.
  - **Option C:** Accept the TOCTOU window and rely on Azure VM network policies to block metadata
    endpoints. Defense-in-depth only; not a code fix.
- Accepted approach: Option A.
- Scope:
  - `packages/core/src/security/urlPolicy.ts`: return resolved IP from `validateFetchableUrl`.
  - `packages/core/src/extract/html.ts`: accept resolved IP, construct fetch target with IP,
    set `Host` header explicitly.
  - Update callers in `processItemJob.ts` to pass resolved IP through.
- Key files/modules:
  - `packages/core/src/security/urlPolicy.ts`
  - `packages/core/src/extract/html.ts`
  - `apps/worker/src/jobs/processItemJob.ts`
  - `packages/core/tests/urlPolicy.test.ts`
- Acceptance criteria:
  - A URL whose DNS changes between validation and fetch is still blocked (test with mocked resolver).
  - Normal URL fetching still works end-to-end.
- Verification commands:
  - `pnpm --filter @articlepod/core test -- urlPolicy`
  - `pnpm --filter @articlepod/worker test -- processItemJob`

---

### S09 — HTTP Security Headers
- status: Planned
- priority: P2 (Medium)
- target_finish: 2026-03-07
- Audit finding:
  - `next.config.mjs` has no `headers()` export. Missing `X-Frame-Options`, `X-Content-Type-Options`,
    `Referrer-Policy`, `Permissions-Policy`, and `Content-Security-Policy`.
  - Without CSP, any XSS has full access to the page including the rendered feed token.
- Options considered:
  - **Option A (chosen):** Add a `headers()` export in `next.config.mjs` with the five headers above.
    Start with a permissive CSP (`default-src 'self' 'unsafe-inline'`) that can be tightened
    incrementally as inline styles/scripts are audited.
  - **Option B:** Use a Next.js middleware (`middleware.ts`) to inject headers. Flexible but more
    boilerplate and runs on every request.
  - **Option C:** Set headers at the nginx level only. Doesn't cover local dev or direct access.
- Accepted approach: Option A.
- Scope:
  - `apps/web/next.config.mjs`: add `headers()` with recommended values for all routes.
- Key files/modules:
  - `apps/web/next.config.mjs`
- Acceptance criteria:
  - `curl -I https://articlepod.com/` response includes all five headers.
  - `X-Frame-Options: SAMEORIGIN`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- Verification commands:
  - `curl -I http://localhost:3000/`
  - `pnpm --filter @articlepod/web run build`

---

### S10 — Global Auth Middleware
- status: Planned
- priority: P2 (Medium)
- target_finish: 2026-03-14
- Audit finding:
  - There is no `middleware.ts`. Every API route individually checks auth. A new route that forgets
    `requireAuthUser()` is silently public.
- Options considered:
  - **Option A (chosen):** Add `apps/web/src/middleware.ts` that enforces session authentication
    for all paths under `/app` and `/api/` (except an explicit `PUBLIC_ROUTES` set:
    `/api/health`, `/api/auth/*`, `/api/feed`, `/rss/`, public share routes).
    Returns 401/redirect for unauthenticated access.
  - **Option B:** Keep per-route enforcement but add a lint rule that flags any route file missing
    an auth call. Fragile and hard to maintain.
  - **Option C:** Use a higher-order function wrapper `withAuth(handler)` for all protected routes.
    Better than nothing but doesn't catch forgetting to wrap.
- Accepted approach: Option A.
- Scope:
  - `apps/web/src/middleware.ts`: new file with matcher and auth check.
  - Audit all existing routes to confirm none break under the new middleware.
- Key files/modules:
  - `apps/web/src/middleware.ts`
- Acceptance criteria:
  - `GET /app/settings` without session cookie returns redirect to `/login`.
  - `POST /api/items/url` without session returns 401.
  - `GET /api/health` without session returns 200 (public route).
  - All existing auth tests still pass.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- middleware`
  - `pnpm --filter @articlepod/web test`

---

### S11 — Shared-State Rate Limiter (Multi-Instance Correctness)
- status: Planned
- priority: P2 (Medium)
- target_finish: 2026-03-21
- Audit finding:
  - `enforceRateLimit` uses a module-level `Map` — per process, resets on restart.
  - With multiple web pods, each has independent counters; an attacker distributes requests across pods.
- Options considered:
  - **Option A:** Replace `Map` with a Redis-backed sliding window using atomic `INCR` + `EXPIRE`.
    Best correctness; requires Redis as a new infra dependency.
  - **Option B (chosen for MVP):** Replace `Map` with a Postgres row (`RateLimitBucket` table) using
    an atomic `UPDATE ... SET count = count + 1 WHERE reset_at > now()`. No new infra; works on
    existing DB. Slightly higher latency than Redis but acceptable for rate-limiting.
  - **Option C:** Keep in-memory but add a sticky-session load balancer. Operationally fragile; not suitable.
- Accepted approach: Option B (Postgres-backed). Redis path documented as a future upgrade.
- Scope:
  - Add `RateLimitBucket` model to Prisma schema.
  - Rewrite `packages/core/src/security/rateLimit.ts` to be an async function backed by Prisma.
  - Update all callers to `await enforceRateLimit(...)`.
  - Prune expired buckets via a lightweight cron or cleanup-on-read strategy.
- Key files/modules:
  - `packages/core/src/security/rateLimit.ts`
  - `apps/web/prisma/schema.prisma`
  - All API routes calling `enforceRateLimit`
- Acceptance criteria:
  - Two concurrent processes sharing the same DB enforce a combined request limit.
  - Rate limit state survives a process restart.
- Verification commands:
  - `pnpm --filter @articlepod/core test -- rateLimit`
  - `pnpm --filter @articlepod/web test`

---

### S12 — Worker Process Health Probe
- status: Planned
- priority: P2 (Medium)
- target_finish: 2026-03-14
- Audit finding:
  - The worker has no HTTP server, health endpoint, or readiness probe. A silent crash goes undetected
    until items remain stuck in `PROCESSING` past the stale-job timeout.
- Options considered:
  - **Option A (chosen):** Add a minimal HTTP server in `apps/worker/src/index.ts` on a configurable
    port (default 3001). Expose `GET /health` returning `{ ok: true, lastPollAt, stuckJobCount }`.
    Wire it to the systemd `WatchdogSec` or a container readiness probe.
  - **Option B:** Use a file-based heartbeat (write a timestamp to a temp file; a sidecar script
    checks mtime). Works without an HTTP port but is less standard.
  - **Option C:** Rely on systemd `Restart=on-failure` and email alerting from ops runbook.
    Detects crashes but not silent hangs.
- Accepted approach: Option A.
- Scope:
  - `apps/worker/src/index.ts`: start a lightweight HTTP server alongside the poll loop.
  - Expose `lastPollAt` and count of jobs in `PROCESSING` older than the stale timeout.
  - Update systemd unit to add `WatchdogSec=60` or equivalent.
- Key files/modules:
  - `apps/worker/src/index.ts`
  - `infra/systemd/articlepod-worker.service`
- Acceptance criteria:
  - `curl http://localhost:3001/health` returns `{ ok: true }` when worker is running normally.
  - Systemd unit file includes a restart/watchdog directive.
- Verification commands:
  - Start worker; `curl http://localhost:3001/health`
  - `pnpm --filter @articlepod/worker run build`

---

### S13 — PDF Magic-Byte Validation Before Storage Write
- status: Planned
- priority: P2 (Medium)
- target_finish: 2026-03-07
- Audit finding:
  - The PDF upload route checks `file.type !== "application/pdf"` — a client-supplied MIME type
    that is trivially forged. A malicious file with a crafted `Content-Type` bypasses this and
    is written to object storage before pdf.js validates actual content.
- Options considered:
  - **Option A (chosen):** Read the first 5 bytes of the upload buffer and assert the `%PDF-`
    magic signature before writing to storage. Reject with `INVALID_FILE_TYPE` error code if absent.
    3-line addition with no new dependencies.
  - **Option B:** Use a library like `file-type` (MIT) for broad magic-byte coverage across file types.
    Overkill for a PDF-only upload endpoint; adds a dependency.
  - **Option C:** Run pdf.js eagerly on the raw upload before storing. Works but costs more CPU on
    the web server request path.
- Accepted approach: Option A.
- Scope:
  - `apps/web/src/app/api/items/pdf/route.ts`: read first 5 bytes, check for `%PDF-`.
- Key files/modules:
  - `apps/web/src/app/api/items/pdf/route.ts`
- Acceptance criteria:
  - A file with `Content-Type: application/pdf` but no `%PDF-` header returns 400 `INVALID_FILE_TYPE`.
  - A valid PDF proceeds normally.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- pdf-upload`

---

### S14 — Username Enumeration Normalization
- status: Planned
- priority: P2 (Medium)
- target_finish: 2026-03-07
- Audit finding:
  - Signup returns `"An account with this email already exists."` when the email is taken.
  - This allows an attacker to enumerate registered email addresses at the signup endpoint.
- Options considered:
  - **Option A (chosen):** Change the signup-conflict response to `"Check your email to continue."`
    (a generic message that doesn't confirm whether the email is registered). For login, the existing
    `"Invalid email or password."` message is already correct.
  - **Option B:** Implement a "check email" flow where signup always sends a verification email,
    hiding whether the account existed. Better UX for email-based products but requires email infra
    (currently stubbed).
  - **Option C:** Accept the enumeration risk at MVP since the product requires account creation
    with a valid email. Defer to P3.
- Accepted approach: Option A.
- Scope:
  - `apps/web/src/app/api/auth/login/route.ts`: change signup-conflict error message.
- Key files/modules:
  - `apps/web/src/app/api/auth/login/route.ts`
- Acceptance criteria:
  - Signup with an existing email returns a message that does not confirm the email is registered.
  - Existing signup-success path is unchanged.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- auth-login`

---

### S15 — Stale-Job Reclaim Atomic Fix
- status: Planned
- priority: P2 (Medium)
- target_finish: 2026-03-14
- Audit finding:
  - Worker stale-job reclaim does `findMany` then `updateMany` as separate unprotected operations.
  - A job that completes between the two calls gets reset to `QUEUED` and re-processed.
  - TTS synthesis survives (chunk cache), but episode upserts and analytics events are duplicated.
- Options considered:
  - **Option A (chosen):** Add `status: "PROCESSING"` to the `updateMany` where clause so only
    still-processing jobs are affected. Wrap both operations in a `$transaction`. Minimal change,
    eliminates the race.
  - **Option B:** Use `SELECT ... FOR UPDATE` (PostgreSQL) to lock rows before updating.
    Correct but SQLite doesn't support this; incompatible with the dev profile.
  - **Option C:** Add a `version` integer to `Job` and use optimistic concurrency (compare-and-swap).
    More complex than needed for this use case.
- Accepted approach: Option A.
- Scope:
  - `apps/worker/src/jobs/processItemJob.ts` and `processDigestRunJob.ts`: add `status: "PROCESSING"`
    filter to the `updateMany` clause in stale-job reclaim.
- Key files/modules:
  - `apps/worker/src/jobs/processItemJob.ts`
  - `apps/worker/src/jobs/processDigestRunJob.ts`
- Acceptance criteria:
  - A job that transitions to `SUCCEEDED` between `findMany` and `updateMany` is NOT reset to `QUEUED`.
  - Test: mock a job that "finishes" mid-reclaim; assert it stays `SUCCEEDED`.
- Verification commands:
  - `pnpm --filter @articlepod/worker test -- stale-jobs`

---

### S16 — Feed Token Signed-URL Pattern (Tokens Out of Enclosure URLs)
- status: Done
- priority: P3 (Medium-Long)
- target_finish: 2026-03-28
- completed_on: 2026-03-22
- evidence: implemented via M92 stable episode-scoped media token rollout + validation pass (2026-03-22)
- Audit finding:
  - Every `<enclosure>` URL embeds `?feed_token=TOKEN` — a long-lived secret exposed in server logs,
    CDN logs, podcast app request logs, and browser history.
  - Nginx/CDN log redaction does not cover this because redaction only applies to structured app logs.
- Options considered:
  - **Option A:** Keep tokens in URL query params but configure nginx to mask query strings in
    access logs. Quick, operational fix only — tokens still appear elsewhere.
  - **Option B (chosen):** At RSS serve time, generate stable episode-scoped signed media URLs:
    `HMAC-SHA256` of `{tokenHash}:{episodeId}:{storagePath}` with a server-side `MEDIA_SIGNING_KEY`.
    Enclosure URL becomes `/api/media/{path}?mt=v2.<signedToken>&eid=<episodeId>` (digest URLs use
    `deid`/`seid`). Long-lived feed tokens stay off the wire, enclosure URLs remain stable across
    repeated feed fetches, and rotating the feed token invalidates prior media URLs.
  - **Option C:** Move the feed token into the URL path segment instead of a query param
    (e.g., `/api/media/{feedToken}/{path}`). Simpler than HMAC but token still appears in logs.
- Accepted approach: Option B.
- Scope:
  - `packages/core/src/security/signedUrl.ts`: add stable token signing/verification alongside legacy expiring-token validation for rollout compatibility.
  - `apps/web/src/app/rss/[token]/route.ts` and `apps/web/src/app/rss/digest/[token]/route.ts`: emit stable episode-scoped media tokens keyed to the active feed token hash.
  - `apps/web/src/app/api/media/[...path]/route.ts` and `apps/web/src/app/api/digest-media/[...path]/route.ts`: verify stable tokens first, then legacy expiring tokens during rollout.
  - Add `MEDIA_SIGNING_KEY` env var (min 32 bytes).
- Key files/modules:
  - `packages/core/src/security/signedUrl.ts` (new)
  - `packages/core/src/rss/buildFeed.ts`
  - `apps/web/src/app/rss/[token]/route.ts`
  - `apps/web/src/app/rss/digest/[token]/route.ts`
  - `apps/web/src/app/api/media/[...path]/route.ts`
  - `apps/web/src/app/api/digest-media/[...path]/route.ts`
- Acceptance criteria:
  - Enclosure URLs in RSS XML contain no `feed_token` query parameter.
  - A valid signed URL plays audio successfully.
  - Rotating a feed token invalidates previously issued stable media URLs for that feed kind.
  - Tampered signed URLs return 401.
  - Existing podcast contract tests pass.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- media`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

---

### S17 — DB Role Field Hardened to Enum Constraint
- status: Planned
- priority: P3 (Medium-Long)
- target_finish: 2026-03-28
- Audit finding:
  - `User.role` is stored as `String` in Prisma. SQLite enforces no allowed values.
  - Any direct DB write (migration script, admin tooling, ORM bypass) can insert an unexpected role
    string that silently passes or fails the `role === "ADMIN"` check unpredictably.
- Options considered:
  - **Option A (chosen):** When migrating to PostgreSQL (parity/azure profile), define `role` as a
    Postgres `ENUM` type via a raw migration. Add a `@@check(fields: [role], expression: "role IN ('USER','ADMIN')")` 
    to the Prisma schema (Prisma 5+ supported). For the SQLite dev profile, add a Zod enum validation
    in `normalizeRole()` that throws on unrecognized values instead of silently defaulting.
  - **Option B:** Add a check constraint only in the application layer (`normalizeRole` throwing).
    No DB enforcement; weaker.
  - **Option C:** Use Prisma's `enum` type when it becomes supported for SQLite. Not yet available.
- Accepted approach: Option A.
- Scope:
  - `apps/web/src/lib/auth.ts`: `normalizeRole()` throws `AppError(INVALID_INPUT)` on unrecognized roles.
  - `apps/web/prisma/schema.postgres.prisma`: add check constraint or enum type for `role`.
- Key files/modules:
  - `apps/web/src/lib/auth.ts`
  - `apps/web/prisma/schema.postgres.prisma`
- Acceptance criteria:
  - `normalizeRole("SUPERADMIN")` throws rather than silently returning `"USER"`.
  - PostgreSQL schema rejects an INSERT with `role = 'SUPERADMIN'` at the DB level.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- auth`
  - `pnpm --filter @articlepod/web prisma validate`

---

### S18 — Session Cookie `secure` Flag Tied to Runtime Profile
- status: Planned
- priority: P1 (High)
- target_finish: 2026-03-07
- Audit finding:
  - `secure: process.env.NODE_ENV === "production"` in `auth.ts` means a `parity` Docker Compose
    run with `NODE_ENV=development` sends session cookies without the `Secure` flag, allowing
    transmission over HTTP.
- Options considered:
  - **Option A (chosen):** Replace `NODE_ENV === "production"` with `env.runtimeProfile !== "simple"`.
    The `simple` profile is local dev only; `parity` and `azure` profiles should always set `Secure`.
  - **Option B:** Add an explicit `SECURE_COOKIES=true` env var. More explicit but one more config
    variable to remember in parity/azure environments.
  - **Option C:** Always set `Secure: true` and require HTTPS even in local dev. Requires local TLS
    setup, breaking zero-config local startup.
- Accepted approach: Option A.
- Scope:
  - `apps/web/src/lib/auth.ts`: change the `secure` cookie flag condition.
- Key files/modules:
  - `apps/web/src/lib/auth.ts`
- Acceptance criteria:
  - In `simple` profile: `secure: false` (allows HTTP local dev).
  - In `parity` or `azure` profile: `secure: true`.
- Verification commands:
  - `pnpm --filter @articlepod/web test -- auth`
  - `pnpm --filter @articlepod/web run lint`

---

## Cost Optimization Track (C01-C07)

### C01 - Cost Baseline, B2s Right-Sizing, and Rollback Guardrails
- status: Done
- target_finish: 2026-03-10
- completed_on: 2026-03-07
- evidence: local validation + implementation pass (2026-03-07)
- Scope:
  - Capture repeatable cost/queue baseline snapshots and rollback toggles.
  - Move default VM sizing guidance to always-on `Standard_B2s`.
  - Lock python-tts guidance to `TTS_WORKERS=1` for steady-state local-first execution.
- Key files/modules:
  - `docs/cost-optimization-rollout.md`
  - `docs/azure-cost-model.md`
  - `docs/operations.md`
  - `infra/main.parameters.json`
  - `infra/systemd/articlepod-python-tts.service`
- Acceptance criteria:
  - Documented baseline and rollback checklist is available.
  - Deployment docs and infra defaults no longer assume `D4as_v5` for this track.
  - Worker/TTS runtime guidance explicitly documents one local TTS worker baseline.
- Verification commands:
  - `npm run check:env:azure`
  - `npm run costs:build`

### B01 - Billing Track Kickoff and Contract Sync
- status: In Progress
- target_finish: 2026-04-18
- Scope:
  - Add billing milestones, env contract, dependency attribution, and cross-doc product language for Stripe-hosted Pro billing.
  - Keep cost optimization `C06` visible as an active track while billing work begins in parallel.
- Key files/modules:
  - `docs/Prompts.md`
  - `docs/plans.md`
  - `docs/architecture.md`
  - `docs/documentation.md`
  - `docs/env.md`
  - `docs/THIRD_PARTY.md`
- Acceptance criteria:
  - Billing terminology is consistent across prompts, plans, architecture, and operator docs.
  - New billing env vars and dependency attribution are documented before the feature is marked done.
- Verification commands:
  - Manual cross-doc review

### B02 - Billing Data Model and Metadata Backend Parity
- status: Planned
- target_finish: 2026-04-25
- Scope:
  - Extend `User` with Stripe customer/subscription state, complimentary Pro override, and effective paid-access cache.
  - Add `BillingWebhookEvent` idempotency storage in both Prisma and Azure Table primary metadata paths.
- Key files/modules:
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/schema.postgres.prisma`
  - `apps/web/src/lib/metadata-primary-auth.ts`
  - `packages/core/src/metadata/azureTablePrimaryStore.ts`
- Acceptance criteria:
  - Both Prisma and Azure Table runtimes can persist equivalent billing state.
  - Existing quota logic continues to read effective paid access from local metadata without direct Stripe calls.
- Verification commands:
  - `npx pnpm --filter @articlepod/web run typecheck`
  - `npx pnpm --filter @articlepod/web run test -- billing`

### B03 - Stripe Checkout for Pro Upgrade
- status: Planned
- target_finish: 2026-05-02
- Scope:
  - Create authenticated checkout-session route for `PRO_MONTHLY`.
  - Reuse or create Stripe customers keyed to local users.
  - Wire `/pricing` to start checkout when billing is configured.
- Key files/modules:
  - `apps/web/src/lib/billing.ts`
  - `apps/web/src/app/api/billing/checkout/route.ts`
  - `apps/web/src/app/pricing/page.tsx`
- Acceptance criteria:
  - Signed-in users can start Stripe-hosted checkout from `/pricing`.
  - Billing-unconfigured environments fail with a clear user-facing message instead of crashing.
- Verification commands:
  - `npx pnpm --filter @articlepod/web run test -- billing`
  - `npx pnpm --filter @articlepod/web run typecheck`

### B04 - Webhook-Driven Billing State and Portal Access
- status: Planned
- target_finish: 2026-05-09
- Scope:
  - Verify Stripe webhook signatures, dedupe event ids, and sync subscription state into local metadata.
  - Add `/app/settings` billing card and Stripe Customer Portal launch.
- Key files/modules:
  - `apps/web/src/app/api/billing/webhook/route.ts`
  - `apps/web/src/app/api/billing/portal/route.ts`
  - `apps/web/src/app/app/settings/page.tsx`
  - `apps/web/src/lib/billing.ts`
- Acceptance criteria:
  - Webhook replays do not double-apply state changes.
  - Settings page shows current plan/status and can launch the portal for Stripe-managed subscriptions.
- Verification commands:
  - `npx pnpm --filter @articlepod/web run test -- billing`
  - `npx pnpm --filter @articlepod/web run typecheck`

### B05 - Admin Complimentary Access and Quota Integration
- status: Planned
- target_finish: 2026-05-16
- Scope:
  - Replace the raw admin `paid` toggle with a complimentary Pro override.
  - Keep extra submission credits for free-tier support scenarios.
  - Expose billing state in admin quota management to reduce support confusion.
- Key files/modules:
  - `apps/web/src/app/api/admin/users/quota/route.ts`
  - `apps/web/src/components/admin-quota-manager.tsx`
  - `apps/web/src/lib/submission-quota.ts`
- Acceptance criteria:
  - Admin overrides do not clobber Stripe-managed billing state.
  - Complimentary access still unlocks unlimited submissions through the existing quota gate.
- Verification commands:
  - `npx pnpm --filter @articlepod/web run test -- submission-quota`
  - `npx pnpm --filter @articlepod/web run typecheck`

### B06 - Billing Validation, Release Notes, and Operator Readiness
- status: Planned
- target_finish: 2026-05-23
- Scope:
  - Finish billing regression coverage, env examples, operations/runbook notes, and release-verification evidence.
  - Run full repo verification prompts after the billing track lands.
- Key files/modules:
  - `docs/operations.md`
  - `.env.example`
  - `.env.simple.example`
  - `.env.parity.example`
  - `.env.azure.example`
- Acceptance criteria:
  - Billing setup and webhook troubleshooting are documented for local and Azure environments.
  - Billing changes pass workspace, license, and podcast contract gates before sign-off.
- Verification commands:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run build`
  - `npm run license:check`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

### C02 - Queue-Pressure Overflow Lane Scaffolding (Local-First Default)
- status: Done
- target_finish: 2026-03-14
- completed_on: 2026-03-07
- evidence: local validation + implementation pass (2026-03-07)
- Scope:
  - Add worker role/env controls for `primary` and `overflow`.
  - Add queue pressure snapshotting + hysteresis policy evaluator.
  - Ensure overflow workers only process jobs when policy is active.
  - Route overflow workers to external python-tts endpoint when configured.
- Key files/modules:
  - `apps/worker/src/lib/env.ts`
  - `apps/worker/src/lib/providers.ts`
  - `apps/worker/src/lib/overflowPolicy.ts`
  - `apps/worker/src/jobs/queuePressure.ts`
  - `apps/worker/src/index.ts`
  - `apps/worker/tests/overflow-policy.test.ts`
- Acceptance criteria:
  - `primary` worker stays local-first and always processes queue jobs.
  - `overflow` worker idles unless queue pressure crosses activation thresholds.
  - Policy transitions are test-covered and produce structured logs.
- Verification commands:
  - `npx pnpm --filter @articlepod/worker run lint`
  - `npx pnpm --filter @articlepod/worker run test`

### C03 - Metadata and Queue Adapter Interfaces (Postgres Default)
- status: Done
- target_finish: 2026-03-21
- completed_on: 2026-03-07
- evidence: local validation + implementation pass (2026-03-07)
- Scope:
  - Introduce adapter interfaces for queue claims/retries and metadata CRUD.
  - Keep PostgreSQL/Prisma adapter as default behavior with no drift.
  - Add adapter contract tests before introducing serverless implementations.
  - Keep diagnostics (`JobEvent`, demo traces, analytics firehose) outside the Table-primary operational store.
- Key files/modules:
  - `packages/core/src/storage/types.ts` (or new metadata adapter module)
  - `apps/worker/src/jobs/processItemJob.ts`
  - `apps/web/src/lib/items.ts`
  - `apps/web/src/lib/dashboard.ts`
- Acceptance criteria:
  - Business logic consumes adapter contracts, not direct storage assumptions.
  - Existing queue/retry/idempotency behavior remains unchanged.
- Verification commands:
  - `npx pnpm --filter @articlepod/worker run test`
  - `npx pnpm --filter @articlepod/web run test`

### C04 - Serverless Table/Blob Metadata Adapter Implementation
- status: Done
- target_finish: 2026-03-28
- completed_on: 2026-03-07
- evidence: local validation + implementation pass (2026-03-07)
- Scope:
  - Implement Azure Table-backed metadata + queue primitives behind adapters.
  - Preserve claim/retry/stale-reclaim semantics and deterministic identifiers.
  - Keep Blob as artifact store with existing podcast media contract behavior.
- Key files/modules:
  - `packages/core/src/storage/*`
  - `apps/worker/src/lib/*`
  - `apps/web/src/lib/*`
  - migration helpers in `scripts/`
- Acceptance criteria:
  - Serverless adapter passes queue/retry/idempotency integration suite.
  - Podcast feed/media behavior remains contract-compatible.
- Verification commands:
  - `npx pnpm --filter @articlepod/worker run test`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

### C05 - Dual-Write, Backfill, and Consistency Certification
- status: Done
- target_finish: 2026-04-04
- completed_on: 2026-03-07
- evidence: local validation + implementation pass (2026-03-07)
- Scope:
  - Dual-write Postgres + Table with shadow-read consistency checks.
  - Add backfill scripts and diff reporting for mismatch thresholds.
  - Define fail-safe rollback triggers.
- Key files/modules:
  - `apps/web/src/lib/*`
  - `apps/worker/src/jobs/*`
  - `scripts/migrate-*`
  - `docs/operations.md`
- Acceptance criteria:
  - Consistency diff runs clean across representative production snapshots.
  - Rollback path is documented and drillable.
- Verification commands:
  - `npx pnpm --filter @articlepod/worker run test`
  - `npx pnpm --filter @articlepod/web run test`

### C06 - Canary and Full Serverless Metadata Cutover
- status: Done
- target_finish: 2026-04-11
- completed_on: 2026-03-17
- evidence: live Azure fresh-start cutover to Azure Table primary + PostgreSQL stopped + podcast contract pass (2026-03-17)
- Scope:
  - Roll out canary reads/writes, then full traffic cutover.
  - Keep bounded rollback window before PostgreSQL decom.
  - Validate latency and failure rates stay within defined limits.
- Key files/modules:
  - feature flag env wiring in `apps/web/src/lib/env.ts`, `apps/worker/src/lib/env.ts`
  - `docs/operations.md`
  - `docs/documentation.md`
- Acceptance criteria:
  - Serverless metadata path runs stable through full cutover window.
  - PostgreSQL dependency can be disabled without user-facing regressions.
  - Fresh-start Azure deployment uses Azure Table primary metadata + Azure Blob artifacts + local auxiliary SQLite.
  - Live Azure feed/media contract passed after PostgreSQL was stopped, and exploratory PostgreSQL data was intentionally left behind.
- Verification commands:
  - `npx pnpm --filter @articlepod/web run test`
  - `npx pnpm --filter @articlepod/worker run test`
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

### C07 - Financial Guardrails and Incident Controls
- status: Done
- target_finish: 2026-04-18
- completed_on: 2026-03-07
- evidence: local validation + implementation pass (2026-03-07)
- Scope:
  - Add budget alerts, overflow spend caps, and queue/failure SLO alerts.
  - Define incident playbook for burst traffic and cost anomalies.
  - Add recurring cost trend reporting to operations docs.
  - Add explicit low-cost env defaults for diagnostics persistence so Azure Table usage stays bounded.
- Key files/modules:
  - `docs/operations.md`
  - `docs/implement.md`
  - `docs/env.md`
  - optional helpers in `scripts/azure/`
- Acceptance criteria:
  - Budget and anomaly alerts are documented with action thresholds.
  - Operators can execute a known rollback path within one runbook cycle.
- Verification commands:
  - `npm run check:env:azure`
  - `npm run costs:build`

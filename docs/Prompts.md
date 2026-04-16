# prompts.md — Codex spec for ArticlePod (RSS-first)

You are **Codex** acting as a **senior staff engineer and tech lead**. Build a polished, locally runnable **ArticlePod** web app from scratch.

## Spec Status (as of 2026-04-11)

### Implemented (as of 2026-04-11)

- Async URL/PDF -> extract -> chunk -> TTS -> episode -> RSS worker pipeline is in place.
- Private feed tokens, rotation, workspace demo share links, and public episode share links are implemented.
- RSS/media compatibility gates are implemented (`HEAD` + byte-range `206`).
- URL/PDF extraction pipeline includes abogen-derived cleanup with explicit error handling.
- Voice settings are Kokoro-focused in UI, with preview caching and python-tts integration.
- Kokoro narration on the python-tts sidecar now streams WAV assembly segment-by-segment instead of concatenating the full response in memory first, reducing peak RAM pressure on the production B2s VM.
- Python TTS now self-recycles after requests when RSS stays above a configured threshold, waiting for an idle window before exiting so systemd can restart it without interrupting active chunk chains.
- Azure production env rendering now lowers `WORKER_TTS_CHUNK_MAX_CHARS` to `1200` by default and installs python-tts systemd memory guardrails (`MemoryHigh`/`MemoryMax`) for B2s-class hosts.
- User-facing TTS failures now surface as generic `Audio processing...` messages instead of exposing provider-specific python-tts/Kokoro wording.
- Demo-only extraction diagnostics (last 10 runs) and source attribution in recent items are implemented.
- OAuth provider gating + callback hardening with provider-subject identity linking is implemented, including social-first login UX plus Google/Facebook/Apple provider support.
- Chrome extension baseline is implemented:
  - one-time connect code -> extension token exchange
  - connect codes now default to 24 hours, and exchanged extension tokens do not expire automatically after pairing.
  - raw HTML snapshot ingest endpoint
  - worker extraction path for `HTML_SNAPSHOT`
  - standalone MV3 extension package under `apps/extension`.
  - popup now uses packaged runtime server configuration (no user-entered server URL) with connected/capture state cues.
  - popup-triggered smart capture now performs bounded article-focused auto-reveal before upload, with conservative handling for feed/thread-style hosts.
  - snapshot block/interstitial classification now happens on the server extraction path so the popup can stay thin and mostly focused on DOM capture + cleanup.
  - server-side snapshot classification now also catches lightweight challenge pages (for example Cloudflare `Verifying...` shells) so extension failures stay explicit instead of degrading into generic extraction errors.
  - snapshot challenge detection now tolerates real readable article pages that also include visible reCAPTCHA/paywall/newsletter widgets, instead of failing early on that chrome alone.
  - captured snapshot cleanup removes inert scripts, styles, templates, noscript blocks, and HTML comments while preserving document structure for the server extraction path.
  - snapshot size enforcement is byte-based on the server, and the popup now fails early when safe cleanup still exceeds the upload budget.
  - the packaged extension manifest intentionally keeps broad HTTP/HTTPS host permissions so Chrome does not require an extra per-site access grant before capture.
  - runtime config still defaults extension connections to `https://articlepod.com`, and local debugging against another ArticlePod origin only requires a temporary `apps/extension/runtime-config.js` override.
  - `/app/settings` includes extension install/connect/revoke controls, with a top-level “Add to Chrome” CTA that links to the Chrome Web Store listing.
  - public `/resources` now reuses the same Chrome extension setup cards as `/app/chrome-extension`; logged-out visitors can see the walkthrough but cannot reveal or copy the one-time connect code.
  - release tooling now verifies packaged popup module dependencies before upload, and the live-site smoke harness can target the packaged artifact from `dist/extension/package` for release-candidate testing.
  - production deploys can now seed a dedicated Chrome Web Store reviewer account from env secrets, but reviewer pairing still uses the normal one-time 24-hour connect code generated after login instead of a permanent shared code.
  - the extension now also supports right-click selection capture into a dedicated `Snippets` workspace, with both instant-save and save-with-comment flows backed by the same long-lived paired extension token.
  - saved snippets persist in a first-class `Snippet` record separate from episode `Item`s, so selection capture does not enqueue podcast jobs or alter RSS/feed behavior.
  - snippet capture now stores a richer, Obsidian-inspired bundle by default: selected text plus sanitized selection HTML, derived selection/context markdown, normalized page metadata, and a reusable structured markdown template for later review or summarization.
- Per-user LLM wiki browsing is implemented as an operator-run local workflow:
  - `pnpm wiki:prepare --users <id-or-email[,id-or-email...]>` prepares a per-user workspace under `.runtime/wiki-builds/<runId>/<userId>/` with the exact copied Karpathy prompt in `KARPATHY_LLM_WIKI.md`, a minimal wrapper `AGENTS.md`, runtime guidance in `WIKI_RUNTIME.md`, a local `WIKI_CONVENTIONS.md` schema companion for page shape, downloaded item markdown, normalized snippet markdown, and the current persistent `wiki/` tree restored for incremental runs.
  - `pnpm wiki:lint --run <runId>`, `pnpm wiki:verify --run <runId>`, and `pnpm wiki:publish --run <runId>` validate and publish the wiki back into blob storage under `users/<userId>/wiki/...`.
  - the current corpus is `items + snippets` only, and the durable wiki contract stays blob-only for v1 (`manifest.json`, `pages/...`, and one current `state/builds/<runId>.json` blob per user).
  - concept pages are now explicitly long-form: `WIKI_CONVENTIONS.md` asks for a 5-bullet `## Executive summary` followed by a `## Working synthesis` that targets 1500-3000 words and reads well as standalone, podcast-worthy material.
  - signed-in users can browse the published wiki at `/app/wiki`, with a denser one-card page rail, markdown cleanup that hides internal source/file plumbing, synthesis-first article rendering with visually emphasized `Executive summary` and `Working synthesis` section headers, a lighter first-load path that opens on `overview` when present and disables automatic wiki-internal prefetching, and a compact inline `Sources` list that shows the first five references by default with a `Show all` control for the rest.
  - the `Wiki` nav item now stays visible for `Pro annual` members even before the first publish. If no published wiki manifest exists yet, `/app/wiki` renders an annual-only placeholder that explains the wiki appears once enough saved articles/snippets accumulate and the next wiki processing pass runs; non-annual users still redirect back to `/app`.
  - public marketing is now wiki-first: the homepage and product pages directly credit Andrej Karpathy's April 4, 2026 `LLM Wiki` gist as the inspiration anchor, and use a shared compact wiki snapshot to show the browse surface.
- Durable Azure/parity implementation assets are in place:
  - profile-aware env validation (`simple`, `parity`, `azure`)
  - the local launcher is consolidated in `./run.sh`, with `--web`, `--fast`, `--skip-bootstrap`, and `--clean` modes for faster repeat testing while `run-web.sh` stays as a compatibility wrapper.
  - Docker Compose parity stack (PostgreSQL + Azurite + python-tts + web + worker)
  - object storage abstraction (`local`, `azure_blob`) wired into uploads/audio/media
  - SQLite export/import migration scripts for PostgreSQL transition
  - Bicep + azd infra baseline and VM deployment automation scripts.
  - VM rollout runbook/scripts include staging sync -> runtime promotion and nginx/TLS automation.
  - GitHub Actions keeps CI automatic, while the production `Deploy to Azure` workflow is an explicit manual dispatch instead of auto-running after every successful `main` CI pass.
  - CI is now split into quick pull-request checks plus a nightly full validation run: docs-only changes short-circuit, narrow web/worker changes skip unrelated checks, superseded runs cancel automatically, and a shared `pnpm preflight` command mirrors the same scope logic locally.
  - Deploy helper auto-runs VM bootstrap on first deploy when runtime user is missing.
  - VM runtime deploy auto-recovers legacy env path (`/etc/listenlater/listenlater.env`) into canonical `/etc/articlepod/articlepod.env`.
  - VM python-tts provisioning enforces CPU-only torch wheels with no pip cache to avoid disk exhaustion on standard VM sizes.
  - VM runtime deploy now uses incremental patch defaults (dependency/python setup only when tracked inputs change) with a manual full-deploy override.
  - VM swap baseline checks now tolerate the one-page `SwapTotal` rounding gap from `/proc/meminfo`, avoiding unnecessary swapfile rebuilds during repeat full deploys on the B2s host.
  - systemd installer now reconciles stale `listenlater-*` unit files before enabling compatibility aliases.
  - Deploy helper health checks now retry by default, tolerate transient HTTP error responses during ingress/TLS handoff, and only use `:3000` fallback for direct IP targets.
  - Deploy helper now supports automated canonical-domain ingress/TLS reconciliation (`CANONICAL_HOST` + `HOST_ALIASES` + `LETSENCRYPT_EMAIL`) on each deploy.
  - Deploy sync/runtime now share one exclusion list, so local exports/worktrees/test artifacts are never copied onto the VM staging/runtime paths.
  - Deploy helper now enforces remote disk headroom before sync and before promote/build, with automatic safe cleanup plus a clear failure before the VM reaches zero free space.
  - Azure VM bootstrap/runtime now install journald size/retention caps and a recurring maintenance timer that vacuums system logs, prunes staging artifacts, pressure-cleans caches when free space gets tight, and removes stale legacy `listenlater` runtime trees once they are no longer referenced.
  - nginx/TLS automation now enforces canonical-domain redirects (`www` -> apex) and SAN certificates for both hosts.
  - nginx ingress automation now applies idempotent `server_names_hash_*` fallback tuning in `nginx.conf` only when needed, preventing certbot duplicate-directive failures on reruns.
  - Canonical-domain GitHub deploy validation passed end-to-end on `2026-02-25` (`Deploy to Azure` run `22389243416`), including apex health, `www` redirects, TLS SAN coverage, and podcast contract checks.
- Observability baseline milestones are implemented:
  - shared error/log schema and support IDs
  - local structured JSONL logs with rotation
  - local severity-split sinks so routine activity logs and `ERROR`/`FATAL` logs retain independently on disk
  - worker/python-tts correlation propagation
  - log triage and diagnostics collection scripts.
  - Azure VM defaults now keep structured logs on local disk for 7 days, cap systemd journal size/time, and run recurring disk maintenance instead of relying on ad hoc manual cleanup.
- Markdown artifact milestones (`M57`-`M64`) are implemented:
  - HTML/PDF extraction emits markdown outputs alongside narration text.
  - Worker persists dual artifacts (`RAW_HTML`/`RAW_PDF` + cleaned extracted `MARKDOWN`) with lifecycle metadata.
  - Stored source markdown now uses a conservative artifact-safe cleanup pass: it removes obvious wrapper junk, nav/share/footer chrome, and short taxonomy noise while preserving useful source context such as links, raw URLs, bylines, dates, captions, and table structure.
  - Narration preparation is now the aggressive cleanup boundary: it strips raw HTML/tag remnants, raw URLs, image wrappers/assets, leading metadata, caption/credit-only lines, and citation/source tails before TTS, chunking, and episode-description derivation.
  - Manual summary and scheduled digest markdown remain stored as authored outputs for reuse, while their podcast narration and episode descriptions now re-normalize from stored markdown and strip trailing `Sources` / `References` appendices plus other narration-only residue before TTS.
  - HTML-to-markdown conversion still flattens extraction-side table-heavy page shells into readable markdown, while narration normalization also flattens legacy stored HTML/markdown table markup into speakable text.
  - Cleanup still unescapes leaked markdown punctuation so backslashes from escaped headings, emphasis, numbering, and punctuation are not spoken aloud.
  - Cleanup now also strips ISO/display timestamp lines, read-time pills, Business Insider-style subscriber promos, and short trailing tag-list blocks while preserving normal article prose that merely mentions words like `privacy`.
  - Narration cleanup now also strips inline image-wrapper residue such as Smithsonian-style `:focal(...)` fragments before episode-description derivation, while extraction-quality audits no longer treat normal host-like company names in prose as raw-URL cleanup failures.
  - Narration input, episode descriptions, and `textHash` are derived from cleaned markdown normalization with deterministic chunking preserved.
  - Markdown diagnostics/review surfaces are available in dashboard and API.
  - Backfill + cleanup + purge scripts enforce dual-save transition, canonical markdown cleanup, and raw artifact retention policy.
- Audio retention lifecycle (`M105`) is implemented:
  - generated item, digest, and summary MP3 episodes now carry a 60-day expiry timestamp by default.
  - expired episode audio is hidden from feeds, dashboard/share playback, and media routes before purge deletes the underlying blob/object.
  - bulk backfill and purge commands keep existing stored audio aligned with the retention policy.
- Item dispatch queue hardening is implemented:
  - item episode jobs now dual-write durable `Job` state plus a tiny dispatch message (`jobId`, `kind`) so workers reserve work from a queue instead of scanning durable metadata.
  - durable item jobs now carry lease metadata (`leaseId`, `leaseOwner`, `leaseExpiresAt`, `lastHeartbeatAt`, `dispatchMessageId`) so one worker can finish safely today while future trusted first-party workers can scale out on other machines later.
  - single-worker runtime remains the default shape; extra workers stay opt-in and cost-neutral until operators explicitly add more compute.
  - long TTS runs renew both the queue reservation and durable lease, while stale reclaimed work still yields to newer queued items before retrying.
- Docs governance baseline is implemented:
  - milestone snapshot tracks `target_finish`, `completed_on`, and evidence references
  - status reconciliation ledger captures corrections with confidence notes.
- Admin analytics track (`M66`-`M70`) is implemented:
  - role-gated tabbed admin dashboard (`Investor Summary`, `Growth & Activation`, `Engagement & Retention`, `Reliability`, `Users`).
  - analytics event + daily rollup storage (`AnalyticsEvent`, `AnalyticsDailyRollup`, `AnalyticsCoverage`).
  - event instrumentation for signup/login/submit/ready/fail/playback.
  - KPI/retention/users APIs and CSV export endpoints.
  - hybrid analytics backfill script with coverage metadata (`npm run analytics:backfill`).
  - in Azure Table primary mode, admin analytics now derives live signup/session/item/job metrics from the primary store so dashboards remain populated even when auxiliary analytics event storage is disabled for cost control.
- Submission monetization baseline is implemented:
  - free users are limited to a default of 2 submissions (`FREE_TRIAL_SUBMISSION_LIMIT`)
  - once free quota is exhausted, ingest APIs return `USAGE_LIMIT_EXCEEDED`
  - paid access now uses plan-specific guardrails by default: `Pro monthly` includes 12 new podcast episodes per 24 hours and 5 manual summaries per 7 days, while `Pro annual` includes 15 new podcast episodes per 24 hours and 10 manual summaries per 7 days
  - once paid users fill the 24-hour episode-start window, new submissions are still accepted into a capped deferred queue and start automatically in the next available Pro window
  - paid over-limit submissions only return `USAGE_LIMIT_EXCEEDED` after the deferred backlog reaches its cap (default: 30 queued items)
  - admin dashboard includes user-level quota controls (`complimentaryPro` override + extra submission credits)
  - Stripe-hosted Checkout, Customer Portal, billing status route, and webhook-driven recurring billing state are implemented for the Pro plan
  - billing now persists Stripe customer/subscription/price metadata, payment state, entitlement state, latest invoice id, and webhook audit watermarks across both Prisma and Azure Table primary metadata backends
  - access is granted or extended only from webhook-confirmed billing events; `/app` and `/app/settings` now show pending activation, renewal, cancel-at-period-end, and payment-issue states instead of trusting the Checkout redirect alone
  - admin quota tools now expose read-only Stripe identifiers, last invoice/payment status, and Stripe Dashboard deep links for support workflows
  - the public pricing page now shows `Starter` plus self-serve `Pro monthly` (`$15/mo`) and `Pro annual` (`$130/yr`) choices, with upfront cancel-at-period-end billing policy copy and annual positioning that emphasizes both “save nearly 30%” and the higher 15-episode daily capacity
  - login now preserves pricing/billing return intent so “sign in to upgrade” comes back to the hosted checkout path instead of dropping users into the generic workspace
  - production can now carry both live Stripe and sandbox Stripe in the same deploy: live billing stays default, while admins and allowlisted tester emails can switch billing mode in `/app/settings` and exercise sandbox checkout, portal, and webhooks without changing live entitlements or quotas
  - the repo carries a checked-in internal sandbox tester allowlist for the core founder/demo/admin accounts, while `BILLING_SANDBOX_ALLOWLIST_EMAILS` can extend that list per environment
- Digest automation track (`M72`-`M79`) is implemented:
  - per-user digest settings for daily/weekly email + podcast with timezone-aware schedules.
  - separate private digest feed token + digest RSS route (`/rss/digest/<token>.xml`).
  - worker digest scheduler + run processor with markdown-source aggregation and idempotent period keys.
  - digest summary provider abstraction (stub + proxy-ready call shape) and stub email sender contract.
  - digest media route enforces `HEAD` + byte-range `206` semantics for podcast app compatibility.
  - settings UI keeps cadence/length controls available on demand, while recent digest run history lives with episodes instead of being duplicated in settings.
  - internal scheduler tick endpoint is bearer-secret protected for Azure/GCP cron triggers.
- Branding surface consistency track (`M80`) is implemented:
  - deterministic brain icon generator now produces extension icons, web favicon/apple icon, and shared brand artwork.
  - web metadata + web manifest now use explicit branded icon assets.
  - main and digest RSS feeds now include both `<itunes:image>` and channel `<image>` blocks for podcast app artwork.
  - podcast contract checker now validates artwork tags and artwork URL reachability.
- Podcast playback diagnostics are implemented in web structured logs:
  - RSS and media routes now emit token-safe request traces (method, user-agent, range header, response status, bytes, content-range, and latency) to aid podcast app playback debugging.
- URL extraction reliability hardening is implemented:
  - URL fetch now safely retries across validated DNS candidate IPs (IPv4-preferred), retries the next candidate on `403` / `429` / `5xx`, and performs one hostname-based fallback when the pinned path is blocked or yields unreadable HTML while the validated hostname path can still succeed.
  - Node lookup callback variants (single-address and all-address/happy-eyeballs modes) remain supported in Docker/runtime environments.
  - Invalid-address network failures in pinned lookup paths are now mapped to actionable connection guidance instead of generic fetch-failed messaging.
  - The bot user-agent now advertises the canonical `articlepod.com` domain instead of a local-only hostname.
  - Only confirmed server-blocked URL failures (for example pinned and hostname fetches both `403`) now steer users toward Chrome extension capture; generic extraction failures keep the normal retry path.
- Production URL extraction diagnostics automation is implemented:
  - manual GitHub Actions workflow `Probe URL Extraction (VM)` runs DNS/HEAD/extraction probes for an arbitrary URL from the production VM path using existing SSH secrets (no new public debug endpoint).
- Podcast compatibility and feed quality hardening are implemented:
  - published item and digest episodes default to MP3 (`audio/mpeg`) enclosures for broader client compatibility.
  - episode descriptions are normalized to sentence-based summaries to avoid raw markdown/noise in podcast app episode cards.
  - RSS-generated media enclosure URLs are now stable per episode until the corresponding feed token is rotated, preventing enclosure churn between feed refreshes.
  - RSS item and digest channel output now includes deterministic channel `pubDate` and `lastBuildDate`, and RSS `HEAD` returns the same feed headers as `GET`.
  - dashboard audio controls now preload metadata so durations render without requiring playback first.
- Feed resilience and deletion consistency hardening are implemented:
  - RSS feed generation now skips episodes whose media object is missing and auto-queues regeneration.
  - media 404 paths now auto-queue item regeneration after clearing stale chunk cache metadata.
  - when an episode key drifts between `.mp3` and `.m4a`, feed/media routes reconcile to the existing sibling object and keep serving without waiting for regeneration.
  - regeneration queueing is now guarded by source availability (non-regenerable items are not requeued endlessly).
  - RSS cache policy is now `private, no-store` to reduce stale-feed behavior after item deletion.
  - operational backfill command `npm run audio:backfill-mp3` can normalize existing episode assets to MP3 metadata in bulk.
- Geo + demographics profile track (`M83`) is implemented:
  - successful auth writes coarse first-seen/last-seen geo snapshots on `User` from trusted proxy headers (country/region/city when available).
  - optional demographic survey API (`GET/POST/DELETE /api/account/demographics`) supports save, skip, edit, and delete lifecycle.
  - settings UI includes optional demographic profile controls.
  - admin users analytics and CSV exports include coarse geo and (PII-gated) demographic fields.
- Dashboard feed shortcut and markdown access track (`M84`) is implemented:
  - `/app` is now a focused workspace for `Add New Episode` and `Recent items`, with a tighter one-line action nav on desktop.
  - `Podcast Apps` and `Chrome Extension` now have dedicated setup pages at `/app/podcast-apps` and `/app/chrome-extension`.
  - `/app/snippets` is now a dedicated review workspace for extension-saved text selections and comment edits.
  - the `Snippets` nav entry only appears after a user has at least one saved snippet; users without snippets do not see that workspace in navigation yet.
  - signed-in nav labels are now `Episodes`, `Podcast Apps`, `Chrome Extension`, conditional `Snippets`, conditional `Wiki`, `Feedback`, and `Settings`.
  - `/app/settings` is now reserved for account, billing, digest cadence, demographic profile, and voice settings.
  - private feed URL and extension connect code boxes now use direct tap/click copy interactions with inline confirmation feedback across desktop and mobile layouts.
  - signed-in `/app/chrome-extension` now prepares a fresh connect code on page load, and the Chrome Web Store CTA also attempts to copy the current code so pairing takes fewer clicks.
  - `Demo mode ready` banner is removed from the `/app` workspace.
  - markdown preview controls and markdown API access are now admin-only.
- Action hierarchy refresh (`M106`) is implemented:
  - signed-in navigation is now neutral-first, with `Feedback` kept only as a softer secondary hint instead of a primary-strength highlight.
  - `/app` groups source mode selection, the active URL/PDF input, and the submit button into one accent-backed action zone so the input field reads as the next step immediately, removes duplicate explanatory copy inside `Add New Episode`, and keeps non-blocking quota/capacity copy below the submit control with quieter treatment.
  - `/app/podcast-apps` now makes the private feed URL copy box the dominant above-the-fold control, with app launch shortcuts grouped as a clear second step and walkthrough guidance visually reduced below.
  - `/app/chrome-extension` now emphasizes install/connect controls ahead of the longer setup guidance.
  - `/app/summary` is no longer a surfaced workspace: it redirects to `/app/wiki` when a wiki exists or the user is eligible for the annual wiki placeholder, or back to `/app` otherwise.
  - keyboard-first submit affordances now map `Enter` to the obvious primary action across email auth, episode submission, settings saves, and admin search/save flows.
- Feedback suggestions track (`M85`) is implemented:
  - authenticated users can submit message-first feedback from `/app/feedback` with optional type/feature metadata.
  - contact preference defaults to opt-in and can be disabled per submission.
  - `/admin` includes feedback inbox controls for filtering, status triage, and GitHub mirror retry actions.
  - private GitHub issue mirroring is best-effort and excludes submitter email from mirrored payloads.
- Episodes workspace refresh behavior now uses a hybrid strategy:
  - fast polling while jobs are actively processing
  - slower visible-tab polling while idle
  - immediate refresh on tab focus/visibility return for external captures (for example Chrome extension submits)
- Capture metadata track (`M100`) is implemented:
  - URL, PDF, and Chrome extension capture now accept user-facing `Importance` (`Low`, `Medium`, `High`) instead of `Priority`.
  - Capture forms support optional freeform comma-separated tags, normalized and stored per item.
  - The web submit flow now keeps `Title`, `Importance`, and `Tags` inside a lighter `Optional details` panel that starts collapsed, can be expanded on demand, and remembers the user’s last open/closed choice on `/app`.
  - The extension popup keeps metadata inside a compact bordered optional block that starts collapsed, remembers the user's last expanded/collapsed choice in that Chrome profile, relies on the green queued button instead of duplicate success copy, disables repeat capture clicks for the same page while queued, and includes a small footer `articlepod.com` hyperlink back to the web app.
  - `/app` Recent items now renders saved importance plus tag chips, while saved snippets and published wiki pages remain the surfaced synthesis path.
- Summary Studio and Azure OpenAI track (`M86`-`M91`) remains implemented behind the scenes:
  - manual summary infrastructure, APIs, markdown storage, and optional podcast publication remain in the codebase, but the user-facing synthesis destination is now `/app/wiki` rather than `/app/summary`.
  - manual summary runs persist polished markdown artifacts under the user-centric `users/<userId>/markdown/summaries/...` namespace plus optional podcast audio, with provider/model/deployment/token metadata captured for observability.
  - Azure OpenAI summary provider is implemented with `nano`-first routing, `mini` fallback, and deterministic structured markdown/text output.
  - podcast-enabled manual summaries now publish into the main private RSS/media feed alongside regular episodes instead of a separate summary-only feed surface.
  - Azure deploy helpers can provision Azure OpenAI resources and render runtime env without requiring manual portal setup.
- Public episode sharing (`M104`) is implemented:
  - owners can create one stable, revocable public share link per ready item episode from `/app`.
  - item action rows now keep download, share/copy, revoke, and delete together with consistent button treatment, while share actions still create/copy existing links immediately with inline confirmation feedback, revoke confirms in place, and delete now uses a brief transient toast plus `Deleting...` button state so removal is visually obvious after the row disappears.
  - the existing workspace share flow remains separate from the podcast-app setup surface.
  - public episode links render a branded, `noindex` landing page with browser playback, direct download, optional source attribution, concise trust copy about the owner's private feed staying private, and CTA links to `/` and `/pricing`.
  - public playback and download use a dedicated share-media route that preserves `HEAD` and byte-range `206` behavior without changing private RSS/media auth.
  - raw analytics coverage now includes `SHARE_LINK_CREATED`, `SHARE_PAGE_VIEWED`, `SHARE_PLAYBACK_STARTED`, and `SHARE_CTA_CLICKED`.
- Public marketing SEO hardening (`M107`) is implemented:
  - `/` is now the canonical public homepage and primary auth landing page for signed-out visitors, preserving the polished social-first login + marketing experience while making the root URL indexable.
  - `/login` is now a compatibility redirect back to `/`, so there is one maintained public auth/marketing surface instead of two competing versions.
  - public `/product`, `/pricing`, `/resources`, `/about`, and `/faq` pages now ship route-specific metadata, schema, and shared header/CTA internal-link support without repeating the site nav in a bottom footer.
  - `robots.txt` and `sitemap.xml` now prioritize the marketing routes and keep private/auth/share surfaces out of search discovery.
- Public marketing shared chrome persistence (`M109`) is implemented:
  - `/`, `/product`, `/pricing`, `/resources`, `/faq`, and `/about` now share one route-group marketing layout so the public-site header and footer CTA cannot drift page by page.
  - the persistent header always shows the logo, `ArticlePod`, and the main menu entries `Product`, `Pricing`, `Resources`, `FAQ`, and `About`, while staying visible as page content scrolls.
  - on mobile, that public nav stays on one compact horizontal row instead of wrapping to multiple lines.
  - the persistent footer always shows `Start your knowledge feed` and `See pricing`, linking to `/` and `/pricing` on every public marketing page, while staying visible as page content scrolls.
  - on mobile, those two CTA actions stay side by side on one row so the reading area starts sooner.
  - the public marketing shell now keeps one shared page structure across the public routes while leaving room for later UX refinements.
  - secondary marketing pages no longer repeat a pill-style page label inside the hero, so the shared header navigation is the only tab-like active indicator.
  - `/about` now leads with a founder-led hero anchored by `Listen to your reading list and finally catch up on what matters`, plus founder intro copy and portrait.
  - `/about` keeps the original proof sections while continuing beneath the hero into personal story sections about why the product was built, how it changed the founder's routine, and what matters most as the product grows.
  - `/about` now expands that founder-story block with Smita Busar's founder intro, a branded portrait placeholder, a highlighted mission line inside `Why I care?`, and a three-tile proof row of `Live today`, `Why private RSS feed`, and `Who ArticlePod is for`.
- Public marketing FAQ structure refresh (`M111`) is implemented:
  - `/faq` now adds a compact `Quick answers` band above the main question list for faster scanning.
  - FAQ content is grouped into `Getting started`, `Inputs & capture`, `Privacy & feed`, `Podcast apps`, and `Account & access`.
  - quick-answer links deep-link to those section anchors while preserving the same underlying FAQ question/answer content and structured data coverage.
- Public marketing FAQ conversion/discovery refresh (`M112`) is implemented:
  - `/faq` now uses higher-conversion question framing, friendlier answer tone, and richer answer blocks with bullets and contextual links.
  - question-level deep links help visitors jump straight to pricing, privacy, PDF, Chrome, digest, and podcast-app questions without changing the richer shared content model.
  - question-level deep links auto-open the matching answer while FAQ JSON-LD stays flattened from the same shared content model.
- Public marketing FAQ control-density trim (`M114`) is implemented:
  - `/faq` keeps compact four-card `Quick answers`, with each card showing a small section label above the main summary line so the actual answers stay closer to the fold.
  - the separate FAQ search box is removed for now, relying on grouped sections, quick-answer anchors, and question permalinks to keep the page easy to scan.
- Public marketing FAQ navigation simplification (`M115`) is implemented:
  - `/faq` removes `Browse by topic` and the per-question `Link` button, keeping the page focused on the questions and richer in-answer links.
  - question hashes still auto-open matching answers, so direct `#question-*` links continue to work without adding extra visible UI chrome.
- Mobile header density pass (`M116`) is implemented:
  - public marketing pages now trim mobile header/footer padding so more reading content stays above the fold.
  - the signed-in mobile header now uses two compact rows: `Upgrade to Pro` plus `Feedback`, `Settings`, and `Logout` utilities on the first row, then `Episodes`, `Podcast Apps`, and conditional `Wiki` on the second row.
  - mobile signed-in nav hides `Chrome Extension` and `Snippets`, while desktop keeps the full workspace nav unchanged.
- Public marketing usability polish (`M117`) is implemented:
  - public marketing pages now use standard browser page scrolling with a sticky shared header instead of a nested main-content scroll pane.
  - unknown public URLs now render a branded `Page not found` screen instead of redirecting to `/`.
  - the root email auth form now shows validation feedback beside the relevant field and highlights invalid inputs for login/signup issues.
- Resources Chrome walkthrough balance pass (`M118`) is implemented:
  - `/resources` now keeps the Chrome extension section top-aligned on desktop so the copy does not float in the middle of a tall media block.
  - the extension GIF now sits in one cleaner presentation card with a slightly tighter max width, reducing the extra white space and double-box feel.
- Public marketing chrome persistence restore (`M119`) is implemented:
  - public marketing pages now keep the shared header pinned to the top of the viewport and the shared footer CTA pinned to the bottom again while preserving standard browser page scrolling.
  - the public shell now adds matching top and bottom content insets so the fixed chrome does not cover the page content.

### Next Milestones

- Current core milestone set (`M00`-`M120`, excluding reserved gaps) is complete per `docs/plans.md`.
- Cost optimization track (`C01`-`C08`) is implemented, and the next production cutover step is `C09`:
  - Azure Queue-backed item dispatch plus durable leases are live in the codebase.
  - local-first TTS remains the baseline (`TTS_WORKERS=1`) on the primary host.
  - overflow worker lane is implemented and now targets an eastus Azure Container Apps burst app with a colocated `python-tts` sidecar.
  - operational metadata now runs from Azure Table + Azure Blob, and the Azure production contract no longer requires a local SQLite file.
  - exploratory PostgreSQL data was intentionally not migrated during the fresh-start cutover.
  - the new eastus blue/green resource group does not provision PostgreSQL.
- Billing hardening track (`B01`-`B08`) is implemented in repo:
  - server-side plan catalog now supports `Starter` free plus `Pro monthly` and `Pro annual` self-serve cadences, with raw Stripe price ids never accepted from clients
  - webhook handling now covers checkout completion, subscription lifecycle events, `invoice.paid`, `invoice.payment_failed`, and `invoice.payment_action_required`, with duplicate and stale-event protection
  - `/app/settings` and `/admin` now surface billing activation, payment recovery, renewal, cancellation, and support visibility paths that match the Stripe-first MVP architecture
  - founder-owned Stripe setup, environment-secret requirements, Stripe CLI/Test Clock QA, and launch checklists are now documented in the billing and operations docs
  - the production deploy can now carry both live and sandbox Stripe credentials at once, with a persisted Settings toggle for admins and allowlisted tester accounts
- Billing release gate (`B09`) remains open until staging and launch evidence exists:
  - founder must finish Stripe Dashboard setup, retry/email settings, branding, and the Stripe Tax decision
  - staging must prove live checkout, sandbox checkout, portal flows, webhook sync, payment-failure handling, observability, and environment isolation before live keys are introduced broadly
  - `Team`, coupons, trials, seats, usage billing, and non-card methods remain later phases
- Cost optimization implementation is now in repo and deployed:
  - worker overflow policy + budget guardrail scripts
  - Azure Table primary operational metadata store
  - Azure Queue-backed item dispatch path with single-worker default and future multi-node worker compatibility
  - Azure deploy/runtime helpers that allow Azure Table primary mode to run without a production `DATABASE_URL`
  - mirror dual-write/backfill/check tooling for rollback certification
- Azure worker stability hotfix is implemented:
  - Azure Table primary digest scheduler and extension-token paths no longer issue unsupported `eq null` queries.
  - python-tts client timeouts now scale with chunk size, and Azure env rendering defaults Kokoro requests to a 5-minute timeout on B2s-class hosts.
- Stuck-job watchdog hardening is implemented:
  - pinned-IP HTML fetches now handle socket-level `ENETUNREACH`/connect failures without crashing the worker process.
  - Azure runtime defaults pinned fetches to IPv4-only candidates unless explicitly overridden, avoiding Node 22 crashes on single-stack VM egress.
  - URL submissions now attempt a short safe redirect canonicalization pass before storing/extracting, reducing avoidable failures from share/login/shortener-style URLs when the final public URL is discoverable.
  - worker chunk progress heartbeats refresh stale-lock timestamps during long TTS runs.
  - stalled jobs get one bounded automatic retry and are then marked `PROCESSING_TIMEOUT` instead of looping forever and starving the queue.
- Reusable live-site regression tooling is implemented:
  - top-level `testing/live-site/` workspace with editable Markdown corpus + quirks ledger
  - local latest-code URL + browser-capture runners
  - GitHub Actions-backed production VM probe runner
  - timestamped report bundles under `exports/live-site-validation/`
- Extraction-quality audit tooling is implemented:
  - top-level `testing/extraction-quality/` workspace with a checked-in sample corpus plus `--input` override support for large URL lists
  - artifact audit command for stored item markdown plus digest markdown under `apps/web/.data/media/`, covering both legacy item keys and the user-centric markdown layout during migration
  - extraction-only URL vs. extension comparison runner that stores raw + cleaned markdown outputs without generating audio
  - normalized-diff reporting, rerun ID lists, and timestamped bundles under `exports/extraction-quality/`
- Hybrid runtime HTML extraction selection is implemented:
  - server-side HTML extraction now runs the existing Readability path and `defuddle` against the same fetched or captured HTML
  - the extractor scores both candidates, penalizes image/caption/presentation residue, and keeps the better markdown/text result
  - worker extraction logs now record the selected engine and per-engine candidate diagnostics so landing-page wins and article-page regressions can be audited over time
  - each processed HTML item now persists a compact extraction-selection scorecard (`selectedEngine`, `selectionMode`, `scoreMargin`, compact JSON summary, recordedAt) on the durable `Item` row in both Prisma and Azure Table primary modes
  - `pnpm --filter @articlepod/web run ops:extraction-selection-report -- --limit 200` exports recent extraction-selection winners from either backend for local or production review
- Live Azure cutover completed on 2026-03-17:
  - `articlepod.com` is serving from the Azure Table primary + Blob runtime with no PostgreSQL in the hot path.
  - PostgreSQL has been stopped after the fresh-start Azure Table cutover.
  - live feed/media contract verification passed (`HEAD 200`, media `206`) after PostgreSQL was disabled.
- Eastus blue/green prestage started on 2026-04-10:
  - `rg-articlepod-prod-eastus`, `articlepod-eastus-vm`, `articlepod-aca-env`, and `articlepodacrdvlolaz43j6be` are provisioned.
  - overflow burst deployment is being moved to ACA before the final DNS cutover.
- Cost optimization boundary: Azure Table should hold operational product state only; verbose logs, job-event firehose, and demo/analytics diagnostics should remain local or explicitly opt-in, while compact per-item extraction-selection scorecards are allowed as operational metadata.
- New work should be added as new dated milestones before implementation starts.

### Future / Optional

- Long-form split episodes (Phase 1.5).
- Bookmarklet variant after extension.
- Additional provider expansion beyond current Kokoro-first UX.

### Core goals

- This must be impressive to **non-engineers** in a live demo:
  - clean interface, modern design
  - it “just works” out of the box
  - it produces a **private podcast RSS feed** compatible with Apple Podcasts and any RSS-capable podcast app (when the server is reachable over the network).
- This must also be impressive to **engineers**:
  - clean architecture + separation of concerns (web vs worker)
  - strong TypeScript types and stable interfaces
  - deterministic serialization (RSS XML, job logs, manifests)
  - idempotent job processing + caching
  - tests + lint + typecheck + deterministic snapshots
- You will run for hours: **plan first**, then implement **milestone by milestone**. Do not skip planning.

### Hard requirements (follow strictly)

**Local run experience**

- One command to start the full stack (document exact commands).
- Must run on **macOS**.
- Must run **fully locally by default**:
  - no required external hosted services
  - local DB + local storage
  - local TTS provider supported so the demo works without paid APIs (current default: Kokoro via python-tts; `say` can remain optional fallback).
- Have Auth integration with Google, Facebook, Apple (env-gated locally; local credential auth remains available).
- I should have a private account that I can setup in a manner that I point someone to a url and they should be able to run as a read only mode so that it's easily demoable to anyone.

**Remote run experience (Azure-ready)**

- Provide a simple path to deploy to Azure later:
  - containerize web + worker
  - document the Azure resource map and env vars
  - do not hardcode any local-only assumptions (except where explicitly labeled dev-only).

**Tech constraints**

- Language: **TypeScript**
- Frontend: **React + Tailwind**
- Backend: Node.js (TypeScript) + Python
- Use only **MIT / Apache-2.0 / BSD** licensed dependencies for production code.
- Do **not** introduce AGPL, SSPL, or “Non-Commercial” dependencies/models for production paths.

**Podcast compatibility constraints**

- RSS and audio hosting must support podcast clients:
  - audio endpoints must support **HTTP HEAD** and **byte-range requests**
  - each RSS item must have unique `<enclosure url=… length=… type=…>` and stable GUID

**Process constraints**

- Every milestone must include explicit verification steps:
  - tests, lint, typecheck, and deterministic snapshots where applicable.

### Deliverable (repo must contain)

- Working web app implementing the product spec below
- A demo “starter item” (sample PDF + pre-generated audio + feed entry) that loads by default so you can demo instantly even without API keys
- A short architecture doc (`docs/architecture.md`) explaining:
  - data model
  - job engine + idempotency strategy
  - RSS rendering and determinism strategy
  - media hosting (range/HEAD)
- Scripts:
  - `dev`, `build`, `test`, `lint`, `typecheck`, `format`
  - `export` (exports RSS + media to a local folder)
- A `plans.md` file capturing:
  - the full milestone plan
  - a risk register
  - ongoing notes and decisions
- An `AGENTS.md` file with persistent guardrails for Codex.

---

## 1) Product spec (build this)

### Product statement

ArticlePod turns **URLs and PDFs** into **audio episodes** and publishes them to a **private podcast RSS feed** that users can subscribe to in their favorite podcast app.

> Note: Google Podcasts has been discontinued; we target Apple Podcasts and other RSS-capable podcast apps. YouTube Music custom-feed behavior is best-effort and validated using MP3 enclosures.  
> For local-only demo, we validate RSS and playback via browser + curl; for Apple Podcasts integration you must run the server on a reachable host (Azure deployment or local tunnel).

### MVP scope (must-have)

A) Account + private feed

- Sign up + login
- Each user has a private feed URL:
  - `/rss/<feed_token>.xml`
- User can rotate the feed token (invalidates previous URL)
- Free users have a submission trial quota (default 2). Additional submissions require paid status or admin-granted extra tries.
- Pro upgrades use Stripe-hosted Checkout; ongoing billing changes/cancelation use Stripe Customer Portal.

B) Ingest content

- Submit URL (HTML article)
- Upload PDF (text-based PDFs only; no OCR in MVP)
- Each submission becomes an “Item” with status:
  - queued → processing → ready / failed

C) Convert to audio (worker)

- Worker extracts readable text:
  - URL: SSRF-validated fetch (pinned IP candidates first, hostname fallback when needed) plus dual-candidate HTML extraction (`Readability` and `defuddle`) with scored selection ahead of the shared cleanup pipeline.
  - PDF: deterministic text extraction (pdfjs path) with markdown output for downstream reuse.
  - Reuse as much as possible from reputable upstream repos (abogen first) and keep attribution in docs.
- Worker generates audio with a pluggable TTS provider:
  - default local provider: Kokoro via python-tts → MP3 (`.mp3`) (see below)
  - optional local fallback: macOS `say`
  - optional: OpenAI TTS provider (only if API key set)
- Output:
  - one episode per item (MVP)
  - optionally split very long items into multiple parts (Phase 1.5)

D) Podcast RSS feed

- RSS endpoint renders user feed deterministically
- Each episode appears as a feed `<item>` with stable GUID and unique enclosure
- Enclosure points to a media URL that supports HEAD + Range

E) Web UI (polished)

- `/`: social-first continue page with Google/Facebook/Apple buttons first and email login/signup fallback, plus a homepage-style marketing side focused on private feed listening and the Karpathy-inspired personal wiki
- `/app` episodes workspace:
  - compact signed-in header stays visible while the workspace scrolls, with the ArticlePod icon first and the compact billing pill immediately beside it
  - dedicated top-nav links for `Episodes`, `Podcast Apps`, `Chrome Extension`, conditional `Snippets`, and conditional `Wiki`, plus icon-first `Feedback`, `Settings`, and `Logout` utilities; the active destination stays visible and selected instead of disappearing from the nav
  - signed-in nav stays on one row on desktop; on mobile it compacts into two rows with `Upgrade to Pro` plus the utility icons on top and `Episodes`, `Podcast Apps`, plus conditional `Wiki` beneath
  - mobile signed-in nav hides `Chrome Extension` and `Snippets` to keep the workspace chrome dense and preserve more reading area
  - compact workspace billing control inside the header itself: free users see a single subtly highlighted `Upgrade to Pro` action that jumps straight to the billing section of `/app/settings` without extra upsell copy underneath it, while paid users see one clickable billing pill that opens Stripe billing; fuller billing details remain on `/app/settings`
  - the active submit mode, active input field, and primary submit button should read as one clear action cluster above the rest of the workspace
  - non-blocking trial quota or capacity copy should sit below the primary submit control with clearly secondary treatment; only blocking states should escalate visually
  - mode labels should be task-first (`Paste article URL`, `Upload PDF`) rather than generic numbered options
  - recent items list with status and actions (retry/delete)
  - ability to play in browser via streaming and download.
- `/app/podcast-apps`:
  - private feed copy/open shortcuts lead the page, with the feed URL copy action as the strongest visual element above the fold and private feed replacement tucked into a clearly secondary advanced control
  - Apple Podcasts and YouTube Music shortcuts appear first, with app-first mobile handoff before browser fallback
  - app walkthroughs sit directly below the live feed tools, while the top setup copy stays generic and points users there for exact app-specific labels and steps
- `/app/chrome-extension`:
  - Chrome extension install + connect/revoke controls lead the page and carry the strongest emphasis
  - quick start and walkthrough guidance sit below the live extension tools
- `/app/settings`:
  - billing controls first
  - voice settings (preview + save default) next
  - digest scheduling is collapsed by default and opened only when needed
  - demographic profile is collapsed by default and kept secondary
  - self-serve delete is hidden from the UI for now
- Strong empty states, toasts, clear failure messages, modern UI.

F) Admin Module

- Secure admin login with a predefined administrator account.
- Admin login can route directly to `/admin` for dashboard-first access.
- Role-gated, tabbed admin analytics dashboard with:
  - Investor Summary
  - Growth & Activation
  - Engagement & Retention
  - Reliability
  - Users
- Consumer KPI coverage:
  - acquisition, activation, engagement, retention, reliability, investor callouts
- Global filters:
  - time window (`7d`, `30d`, `90d`, custom)
  - source (`URL`, `PDF`, `HTML_SNAPSHOT`, all)
  - auth (`LOCAL`, `OAUTH_LINKED`, `GOOGLE`, `FACEBOOK`, `APPLE`, all)
  - role (`USER`, `ADMIN`, all)
- User analytics table masks PII by default, with admin-only reveal toggle.
- CSV export endpoints for summary, timeseries, and users datasets.
- Admin account deletion is blocked server-side and not exposed in dashboard controls.
- Enables monitoring, debugging, and investor-facing storytelling with clear usage metrics.

G) Export

- `pnpm export` writes:
  - RSS XML to `exports/rss.xml`
  - media files to `exports/media/`
  - a JSON manifest listing episodes and file paths

H) Quality and engineering

- Strong types + schema validation for API inputs (Zod)
- Deterministic serialization:
  - RSS generation produces stable ordering and stable XML formatting
- Unit tests + snapshot tests for RSS
- Integration tests for:
  - extraction on fixtures (HTML + PDF)
  - media serving range requests (local mode)
- License gate in CI: block AGPL / SSPL / NC.

I) Extraction artifacts (near-term track)

- Current (`M57`-`M64` implemented):
  - persist raw source artifacts and cleaned extracted markdown artifacts in object storage.
  - keep cleaned extracted markdown as the durable reusable artifact for downstream workflows.
  - store canonical item/digest/summary markdown under `users/<userId>/markdown/...`, while raw source artifacts, uploads, and audio stay under their existing namespaces.
  - apply conservative artifact-safe cleanup to extracted source markdown before persistence, while keeping richer source context such as links, raw URLs, metadata, captions, and tables available in `MARKDOWN`.
  - derive narration text, chunk hashes, and episode descriptions from cleaned extracted markdown, with raw HTML tags, legacy table remnants, raw source URL tails, image assets/wrappers, and leading metadata/caption noise stripped at the narration step before TTS.
  - fail low-signal pages with `EXTRACTION_EMPTY` when too little narratable text remains after cleanup.
  - apply retention lifecycle to raw artifacts (target 90 days).
  - apply retention lifecycle to generated audio episodes (target 60 days) with backfill + purge tooling for existing rows.

### Explicit non-goals (MVP)

- Native mobile app
- Word-by-word highlighting in third-party podcast apps
- Voice cloning

### Next Milestones (Post-MVP Phase 2)

- Add net-new milestones only (do not reopen completed milestones).
- Candidate future themes:
  - cost optimization rollout (`C01`-`C07`) with strict burn-rate guardrails
  - long-form multi-part episode splitting
  - richer managed observability exports/dashboards in Azure
  - bookmarklet ingestion mode after extension baseline

Policy for authenticated/paywalled pages:

- Extension capture is allowed only for content already rendered to the logged-in user in the browser.
- No credential forwarding, session forwarding, or backend login replay.
- No headless bypass, paywall bypass, or DRM bypass automation.

---

## 2) Architecture constraints and layout (keep the repo maintainable)

### Monorepo layout

- `apps/web/` — Next.js (React + Tailwind) UI + API routes (RSS endpoint lives here)
- `apps/worker/` — Node.js worker that processes queued items
- `packages/core/` — shared types, schemas, RSS builder, extraction utilities, TTS provider interfaces (local and remote)
- `packages/ui/` — shared UI components (optional; ok to keep in web app for MVP)
- `vendor/postcast/` — upstream reference repo (read-only; do not edit) to borrow patterns from
- `docs/` — docs, architecture, Azure deployment guide
- `fixtures/` — HTML + PDF fixtures for tests, plus demo starter content
- `scripts/` — helper scripts (export, seed demo, license report)

### Key architectural rule

**The web app must never do heavy conversion work in request handlers.**  
All extraction/TTS runs in the worker. The web app only:

- creates items/jobs
- renders status
- renders RSS XML
- serves local media files (dev mode)

### Derived-from-upstream rule (to leverage existing work safely)

We will leverage `https://github.com/denizsafak/abogen`, `https://github.com/iamspruce/postcast` (MIT) as a **reference** for:

- Readability extraction plumbing
- RSS generation patterns
- pipeline structuring patterns

**Do not fork it** and do not edit it in-place:

- include it under `vendor/postcast/` (submodule or pinned copy)
- copy only the minimal code patterns we need into our own packages with attribution in `docs/THIRD_PARTY.md`.

---

## 3) Process requirements (follow strictly)

### 3.1 PLANNING FIRST

Before writing any code:

- Create `plans.md` with **at least 12 milestones**.
- For each milestone include:
  - scope
  - key files/modules
  - acceptance criteria
  - commands to verify
- Include a **risk register** with mitigations (top risks):
  - podcast client compatibility (range/HEAD)
  - HTML extraction quality
  - PDF extraction quality
  - job idempotency and retries
  - determinism/snapshots drift
- Include a **3-minute demo script** for non-engineers:
  - show demo starter item
  - submit a URL
  - show it becomes an episode in RSS
  - show audio plays in browser and passes range test
- Include a short **architecture overview**:
  - data model
  - job engine state machine
  - RSS rendering strategy
  - media hosting strategy (local vs Azure)
  - TTS provider abstraction

Do NOT start coding until `plans.md` exists and is coherent.

### 3.2 SCAFFOLD SECOND

Initialize repo, scripts, lint/typecheck/test harness.
One command `pnpm dev` must start the system.

### 3.3 IMPLEMENT THIRD

Implement one milestone at a time.
After each milestone:

- run verification commands
- fix issues
- commit with a clear message

### 3.4 UX polish throughout

- clean design
- empty states, toasts, quick “copy feed” UX
- demo banner when running with demo data

### 3.5 If you hit complexity choices

Prefer correctness and maintainability over extra features.
Document tradeoffs in `plans.md`.

---

## 4) Engineering details (prescriptive)

### 4.1 DB and storage (local-first)

- Local DB: SQLite via Prisma (file in `apps/web/.data/db.sqlite`)
- Local media storage (dev): `apps/web/.data/media/`
- In Azure mode:
  - operational metadata can move to Azure Table via `METADATA_PRIMARY_BACKEND=azure_table`
  - `DATABASE_URL` is optional when Azure Table is primary and should stay unset in production unless you are intentionally running a legacy Prisma-backed auxiliary workflow
  - Azure PostgreSQL is optional only for rollback/canary or if Prisma remains the primary metadata backend
  - media stored in Azure Blob Storage

### 4.2 Job engine (deterministic + idempotent)

- Item statuses:
  - `queued`, `processing`, `ready`, `failed`
- Worker must be idempotent:
  - repeated job runs for same item must not produce duplicate episodes
- Store an `episode_id` or `episode_token` deterministically per item (e.g., derived from item UUID)
- Maintain a job events log:
  - append-only events in DB for debugging + deterministic snapshots

### 4.3 TTS provider interface

In `packages/core` define:

- `TtsProvider.synthesizeToFile({ text, voice, format, outPath })`
- Providers:
  - `MacSayTtsProvider` (default local)
  - `OpenAiTtsProvider` (optional)
  - Scaffolding in place to host and run tts models.

Chunking:

- chunk text by paragraphs/sentences to avoid max limits
- persist chunk hashes for caching

### 4.4 Media serving requirements (dev mode)

If serving media from the web server:

- Must implement:
  - `HEAD` returning correct `Content-Length`
  - `Range` returning `206 Partial Content` and correct `Content-Range`

### 4.5 RSS generation requirements

- Deterministic ordering (published_at desc, then stable tiebreaker)
- Stable GUID per episode
- Unique enclosure URL per episode
- Include `length` (bytes) and `type` (audio/mpeg or audio/mp4)

Start now.
First, create `plans.md` with the complete plan, risk register, demo script, and architecture overview. Do NOT start coding until `plans.md` exists and is coherent.

## Security Hardening Requirements (added 2026-02-28)

All items below map to milestones S01–S18 in `docs/plans.md`.
Each item must be implemented before the corresponding milestone is marked Done.
No item may be marked Done without passing the verification commands listed in its milestone.

### Authentication (S01, S03, S04, S18)

- Apple Sign-In `id_token` MUST be verified against Apple's JWKS endpoint before trusting any claims. (S01)
- `POST /api/auth/login` MUST enforce per-IP and per-email rate limits before any DB or bcrypt work. (S03)
- A dummy bcrypt compare MUST run when the email is not found to normalize response timing. (S03)
- `ensureAdminUser()` MUST NOT be called inside any request handler. It MUST run once at startup. (S04)
- Session cookies MUST set `Secure: true` when `runtimeProfile !== "simple"` (not based on `NODE_ENV`). (S18)

### Token Storage (S02)

- `FeedToken`, `DigestFeedToken`, `ShareToken`, and `ExtensionToken` MUST NOT store `tokenValue` (plaintext) in the database.
- Only `tokenHash` may be persisted. Plaintext token is returned once at creation time only.
- A DB migration MUST invalidate all existing plaintext-stored tokens and trigger re-issuance.
- Compatibility note: this migration is not complete today. Newly created and rotated item/digest feed tokens still persist `tokenValue` so `/app/settings` can re-display the same private RSS URL. Legacy hash-only feed rows must remain active until the user explicitly rotates them; do not silently rotate subscribers onto a new feed URL. Do not treat S02 as done until that replacement UX and migration path exist.

### SSRF and URL Fetching (S08)

- After DNS resolution in `validateFetchableUrl`, the resolved IP MUST be passed through to the actual fetch call.
- The fetch MUST use the resolved IP directly (with `Host` header set) to prevent DNS rebinding.

### Media Token Exposure (S16)

- Enclosure URLs in RSS feeds MUST NOT contain the long-lived `feed_token` as a query parameter.
- Media access MUST use short-lived HMAC-signed URLs generated at RSS serve time.
- A `MEDIA_SIGNING_KEY` environment variable (min 32 bytes) MUST be required for `parity` and `azure` profiles.

### Python TTS Sidecar (S07)

- `POST /v1/synthesize` MUST require an `X-Sidecar-Secret` header matching the `TTS_SIDECAR_SECRET` env var.
- The Dockerfile MUST include a `USER app` directive (no root process).
- uvicorn MUST bind to `127.0.0.1` in production profiles.

### Rate Limiting (S11)

- `enforceRateLimit` MUST be backed by a persistent shared store (Postgres `RateLimitBucket` table) for `parity` and `azure` profiles.
- In-memory fallback is acceptable for `simple` profile only.

### HTTP Headers (S09)

- All responses MUST include: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a baseline `Content-Security-Policy`.

### Global Auth Middleware (S10)

- A `middleware.ts` MUST exist that enforces session authentication for all `/app` and `/api/` routes.
- A `PUBLIC_ROUTES` list MUST explicitly enumerate every unauthenticated-accessible path.

### Upload Validation (S13)

- PDF uploads MUST check the first 5 bytes for the `%PDF-` magic signature before writing to storage.
- Files failing this check MUST return `INVALID_FILE_TYPE` error code.

### Digest Scheduler Secret (S06)

- `DIGEST_SCHEDULER_SECRET` MUST be asserted to be non-empty and ≥ 32 characters at server startup for `parity` and `azure` profiles.
- App MUST fail to start if this assertion fails.

### Worker Process Health (S12)

- The worker process MUST expose a `GET /health` HTTP endpoint on a configurable port (default 3001).
- The endpoint MUST return last-poll timestamp and count of stuck jobs.

### Cross-User Audio Privacy (S05)

- ChunkCache key MUST include `userId` so no user's audio artifacts are stored in another user's item path.

### Enumeration and Role Hardening (S14, S17)

- Signup conflict responses MUST NOT confirm whether an email is registered.
- `normalizeRole()` MUST throw on unrecognized role strings rather than silently downgrading.
- PostgreSQL schema MUST enforce `role IN ('USER', 'ADMIN')` at the DB level.

### Stale Job Reclaim (S15)

- Stale-job `updateMany` MUST include `status: "PROCESSING"` filter to prevent reverting completed jobs.

## Verification Prompts

Before marking any milestone complete, run and record the results for:

1. Workspace quality gates

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

2. Export and license gates

- `npm run export`
- `npm run license:check`

3. Live-site regression gate

- `npm run live-sites:test -- --env local`
- If GitHub CLI auth is available and VM probes are in scope, run the default dual-mode command:
  - `npm run live-sites:test`

4. Extraction-quality gate

- `npm run extraction-quality:audit`
- `npm run extraction-quality:test -- --limit 20`

5. Podcast compatibility gate

- Start web server (`npm run start --workspace @articlepod/web -- --hostname 127.0.0.1 --port 3000`)
- Run:
  - `./scripts/verify_podcast_contract.sh "http://127.0.0.1:3000/rss/<feed_token>.xml"`

6. Feed auth stability gate

- Confirm feed URL is unchanged after:
  - loading `/app`
  - loading `/app/settings`
  - background item refresh
  - existing-user OAuth callback/sign-in
- Confirm enclosure URLs remain unchanged across repeated RSS fetches for the same unchanged episode set.
- Confirm only explicit rotate/revoke flows issue a new externally visible podcast auth token.

6. Demo flow gate

- Confirm seeded demo user can login and see starter item.
- Confirm starter item plays in browser and seek works.
- Confirm tabbed admin dashboard loads and shows investor + reliability + users metrics.
- Confirm CSV export works from admin dashboard.

If any gate fails, fix and re-run all impacted gates before committing.

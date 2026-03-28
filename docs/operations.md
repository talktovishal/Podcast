# Operations Runbook

## Durability objective
Customer accounts, feed metadata, and generated audio must survive VM loss.

Durability boundary:
- durable: Azure Table operational metadata + Azure Blob artifacts
- optional rollback durable path: PostgreSQL only when explicitly kept for canary/rollback
- non-durable: VM local disk/process state (including auxiliary SQLite, local logs, and demo diagnostics unless archived elsewhere)

## VM runtime recovery
1. Recreate or repair VM compute.
2. Re-deploy runtime (`scripts/azure/deploy-vm-runtime.sh`).
3. Ensure env points to existing Azure Table + Blob resources (and optional PostgreSQL rollback resources only if that path is still enabled).
4. Restart systemd services.
5. Validate health and podcast contract.

## Pre-drill snapshot
Capture baseline before a failure simulation:
```bash
npm run ops:pre-drill-snapshot
```
Default artifact:
- `exports/ops/pre-drill-snapshot.json`

Cost + queue baseline snapshot (for cost optimization rollouts):
```bash
AZ_SUBSCRIPTION_ID="<SUBSCRIPTION_ID>" \
AZ_RESOURCE_GROUP="rg-articlepod-prod" \
npm run ops:cost-baseline
```

Azure cost rollups (daily last week, weekly last 30 days, optional monthly last year):
```bash
npm run ops:azure-cost-report -- --resource-group "rg-articlepod-prod"
```

Add top service/resource breakdowns for each day and ISO week:
```bash
npm run ops:azure-cost-report -- --resource-group "rg-articlepod-prod" --include-breakdown
```

This same breakdown view also prints a week-over-week delta section for the latest comparable ISO week pair so new spend spikes stand out quickly.

Include month-by-month trailing year output:
```bash
npm run ops:azure-cost-report -- --resource-group "rg-articlepod-prod" --include-monthly
```

Notes:
- The report uses Azure Cost Management UTC usage dates.
- The current UTC day or month may still be partial when the script is run.
- Use `--breakdown-top <N>` to change how many service/resource rows appear in each breakdown section.
- When a current ISO week is still partial, the delta section compares the latest two fully covered weeks instead.

## Restore verification
After VM replacement/redeploy:
```bash
npm run ops:verify-restore
```
This verifies:
- primary metadata counts are not regressed vs snapshot
- previously captured episodes still exist in the active metadata backend
- episode audio objects are still readable from storage
- parity smoke + podcast contract gate still pass

Notes:
- in `METADATA_PRIMARY_BACKEND=azure_table` mode, local/demo diagnostic counts are informational only and are excluded from restore regression gating.

## Signed durability drill report (template)
- Drill date:
- Operators:
- Snapshot file:
- Azure region/resource group:
- Failure simulated (VM stop/delete/recreate):
- Recovery completion time:
- Service health after restore (web/worker/python-tts):
- Snapshot verify result:
- Podcast contract result:
- Notes/remediations:
- Sign-off:

## Latest evidence
- 2026-02-15: First live Azure deployment completed in `rg-articlepod-prod` with public HTTPS health check passing at `https://articlepod-dvlolaz43j6be.centralus.cloudapp.azure.com/api/health`.
- 2026-02-15: Podcast compatibility gate passed for live feed (`scripts/verify_podcast_contract.sh`) with feed/media `HEAD 200` and media range `206`.
- 2026-03-17: Fresh-start low-cost Azure cutover completed on `https://articlepod.com` with `METADATA_PRIMARY_BACKEND=azure_table`, Blob artifact storage, local auxiliary SQLite, and VM size `Standard_B2s`.
- 2026-03-17: Managed PostgreSQL flexible server `articlepod-pg-dvlolaz43j6be` was stopped after the fresh-start cutover; exploratory PostgreSQL data was intentionally not migrated.
- 2026-03-17: Live podcast compatibility gate passed again after PostgreSQL was stopped (`feed HEAD 200`, `media HEAD 200`, `Range 206`, artwork `HEAD 200`).
- Durability snapshot + VM replacement restore drill is still pending signed execution.

## Extraction artifact lifecycle
Backfill markdown artifacts for existing ready items:
```bash
npm run artifacts:backfill
```

Purge expired raw artifacts and stale extension auth artifacts:
```bash
npm run artifacts:purge
```

Default retention behavior:
- `RAW_HTML` and `RAW_PDF` artifacts expire after `WORKER_RAW_ARTIFACT_RETENTION_DAYS` (default 90 days).
- `MARKDOWN` artifacts are retained for downstream reuse unless item/account deletion removes them.

## Digest automation runbook
Digest scheduler trigger (external cron/automation):
```bash
curl -X POST "$APP_URL/api/internal/digests/tick" \
  -H "authorization: Bearer $DIGEST_SCHEDULER_SECRET" \
  -H "content-type: application/json" \
  -d '{"forceNow": true, "requestedBy": "ops-manual"}'
```

Digest outputs:
- summary artifact key: `digests/<userId>/<cadence>/<periodKey>/summary.md`
- stub email artifact key: `digests/<userId>/<cadence>/<periodKey>/email.md`
- digest audio key: `digests/<userId>/<cadence>/<periodKey>/episode.<ext>`

Digest compatibility checks:
```bash
./scripts/verify_podcast_contract.sh "http://127.0.0.1:4100/rss/digest/<digest_token>.xml"
```

## Billing operations
Required Stripe env for recurring billing:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` (optional)

Environment isolation rules:
- keep separate Stripe test-mode secrets for local and staging
- keep separate webhook signing secrets per environment
- introduce live keys only after staging certification passes
- if a portal configuration id is pinned, remember Stripe test and live modes use different ids

Local webhook forwarding example:
```bash
stripe listen --forward-to http://127.0.0.1:3000/api/billing/webhook
```

Expected webhook behavior:
- `checkout.session.completed` links the Stripe customer and subscription back to the local user, but does not unlock access on redirect alone.
- `customer.subscription.created|updated|deleted` sync plan, price, status, current period end, cancel-at-period-end, and local entitlement shape.
- `invoice.paid` grants or extends access through the invoice period end.
- `invoice.payment_failed` and `invoice.payment_action_required` mark the account as `GRACE_PERIOD` or `INCOMPLETE` depending on whether the failure happened during initial signup vs. renewal.
- duplicate Stripe event ids are ignored after the first successful local apply.
- older subscription and invoice events are ignored when a newer event watermark was already applied for that domain.

Operational status mapping:
- `ACTIVE` + `PAID`: good standing
- `INCOMPLETE` + `FAILED` or `ACTION_REQUIRED`: initial payment did not complete; no access should be granted
- `GRACE_PERIOD` + `FAILED` or `ACTION_REQUIRED`: renewal issue; user may still have temporary access while recovering payment
- `CANCELED`: no future renewal; access should follow the stored end-of-period date or revoke per final webhook state

Troubleshooting checks:
```bash
curl -X GET "$APP_URL/api/billing/status" \
  -H "cookie: articlepod_session=<session-cookie>"
```

```bash
rg 'billing' \
  /Users/vishalchowdhary/Documents/Podcast/.runtime/logs/events/web \
  /Users/vishalchowdhary/Documents/Podcast/.runtime/logs/errors/web | tail -n 100
```

Recommended billing log patterns to watch:
- successful checkout session creation
- successful portal session creation
- webhook handled with `status=PROCESSED`
- webhook ignored with `status=IGNORED_DUPLICATE` or `status=IGNORED_STALE`
- billing issue states from failed or action-required invoices

Lifecycle QA checklist:
1. Purchase success:
   - buy `Pro monthly`
   - confirm settings shows pending activation before webhook confirmation
   - confirm the account becomes paid only after webhook processing
2. Initial payment failure:
   - simulate a failed first invoice
   - confirm status remains `INCOMPLETE` and settings offers a billing recovery path
3. Renewal success:
   - advance a Stripe Test Clock or trigger renewal
   - confirm `invoice.paid` extends `currentPeriodEnd`
4. Renewal failure:
   - simulate failed renewal or required authentication
   - confirm `GRACE_PERIOD` or action-required messaging appears
5. Cancel at period end:
   - cancel in the Customer Portal
   - confirm `cancelAtPeriodEnd` and end-date messaging sync locally
6. Webhook resilience:
   - replay the same event twice
   - replay an older subscription or invoice event after a newer one
   - confirm invalid signatures are rejected

Safe-disable and rollback guidance:
- to pause new self-serve purchases, unset `STRIPE_PRICE_PRO_MONTHLY` and redeploy; do not remove `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` if existing subscribers still need Portal or webhook sync
- do not disable the webhook endpoint while live subscriptions still exist, because Stripe remains the system of record for payment and cancelation state
- the billing schema changes are additive; rollback should prefer application-level feature disablement over destructive schema rollback
- existing quota checks still rely on `isPaid` as a compatibility cache, so emergency rollback does not require clearing the new billing columns

## Serverless metadata migration runbook
Backfill queue/item/digest projections into Azure Table mirror:
```bash
METADATA_MIRROR_BACKEND=azure_table \
METADATA_MIRROR_DUAL_WRITE=1 \
AZURE_TABLE_CONNECTION_STRING="<table-connection-string>" \
npm run metadata:backfill
```

Compare Prisma queue state against mirror snapshot:
```bash
METADATA_MIRROR_BACKEND=azure_table \
AZURE_TABLE_CONNECTION_STRING="<table-connection-string>" \
METADATA_CONSISTENCY_MAX_DIFF=0 \
npm run metadata:check
```

Recommended rollout pattern:
- dual-write on (`METADATA_MIRROR_DUAL_WRITE=1`)
- canary compare on (`METADATA_CANARY_COMPARE=1`)
- keep queue pressure source on Prisma first (`WORKER_QUEUE_PRESSURE_SOURCE=prisma`)
- switch queue pressure source to mirror only after consistency checks stay clean.

Full low-cost primary mode:
```bash
METADATA_PRIMARY_BACKEND=azure_table \
DATABASE_URL="file:/var/lib/articlepod/db.sqlite" \
AZURE_TABLE_CONNECTION_STRING="<table-connection-string>" \
ANALYTICS_STORAGE_MODE=off \
JOB_EVENT_STORAGE_MODE=off \
DEMO_EXTRACTION_TRACE_ENABLED=0
```

Fresh-start production note:
- exploratory PostgreSQL data does not need to be backfilled when the deployment is intentionally restarting from Azure Table primary state.
- if you do want historical data later, run export/backfill tooling before stopping PostgreSQL.

## Observability runbook
Dedicated local log root:
- `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/events/web/events.log.jsonl`
- `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/errors/web/errors.log.jsonl`
- `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/events/worker/events.log.jsonl`
- `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/errors/worker/errors.log.jsonl`
- `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/events/python-tts/events.log.jsonl`
- `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/errors/python-tts/errors.log.jsonl`

Retention intent:
- activity logs (`DEBUG`/`INFO`/`WARN`) age under `LOG_RETENTION_DAYS`
- `ERROR`/`FATAL` logs age under `LOG_ERROR_RETENTION_DAYS`

Collect and bundle diagnostics:
```bash
npm run logs:collect
```

Generate ranked error digest:
```bash
npm run logs:triage
```
Output:
- `/Users/vishalchowdhary/Documents/Podcast/exports/diagnostics/error-digest.md`

Podcast playback diagnostics (RSS + media request traces):
```bash
rg '"msg":"Podcast (feed|media) request' \
  /Users/vishalchowdhary/Documents/Podcast/.runtime/logs/events/web \
  /Users/vishalchowdhary/Documents/Podcast/.runtime/logs/errors/web | tail -n 200
```

Filter recent range-related failures (`401`, `404`, `416`):
```bash
rg '"msg":"Podcast media request (unauthorized|invalid range|object not found)"' \
  /Users/vishalchowdhary/Documents/Podcast/.runtime/logs/events/web \
  /Users/vishalchowdhary/Documents/Podcast/.runtime/logs/errors/web | tail -n 200
```

## Admin analytics runbook
Backfill admin analytics events/rollups/coverage:
```bash
npm run analytics:backfill
```

Export admin analytics datasets (role-gated APIs):
- summary CSV:
  - `/api/admin/analytics/export?dataset=summary`
- timeseries CSV:
  - `/api/admin/analytics/export?dataset=timeseries`
- users CSV (PII masked by default):
  - `/api/admin/analytics/export?dataset=users&pii=0`

## Alert query starter pack (Azure Log Analytics / Kusto)
- Top error codes:
  - `AppTraces | where SeverityLevel >= 3 | summarize count() by tostring(Properties.error_code) | top 20 by count_`
- Repeated invalid input patterns:
  - `AppTraces | where tostring(Properties.error_code) startswith \"INVALID_\" | summarize count() by Message, OperationName`
- Slow spans:
  - `AppDependencies | where DurationMs > 5000 | top 50 by DurationMs desc`
- Extension ingest failures:
  - `AppTraces | where Message has \"html-snapshot\" and SeverityLevel >= 3 | top 100 by TimeGenerated desc`

## Cost guardrails runbook
Configure budget and burn-rate alerts (subscription + resource-group):
```bash
./scripts/azure/configure-budget-alerts.sh \
  --subscription-id "<SUBSCRIPTION_ID>" \
  --resource-group "rg-articlepod-prod" \
  --monthly-budget-usd 120 \
  --contact-email "<FINOPS_EMAIL>"
```

Guardrail defaults for low-cost mode:
- keep primary compute always-on at `B2s`.
- keep `TTS_WORKERS=1`.
- keep overflow worker service disabled by default.
- enable overflow worker only with explicit queue thresholds and external TTS endpoint configured.
- keep logs on local disk and archive to Blob only if needed.
- set `ANALYTICS_STORAGE_MODE=off` if investor analytics is not needed in low-cost mode.
- set `JOB_EVENT_STORAGE_MODE=off` to keep worker job-event diagnostics in local logs only.
- set `DEMO_EXTRACTION_TRACE_ENABLED=0` outside demo-heavy troubleshooting windows.

Validate overflow guardrail env before enabling overflow worker:
```bash
ENV_FILE="/etc/articlepod/articlepod.env" \
./scripts/azure/validate-overflow-guardrails.sh
```

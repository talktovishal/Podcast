# Operations Runbook

## Durability objective
Customer accounts, feed metadata, and generated audio must survive VM loss.

Durability boundary:
- durable: Azure PostgreSQL + Azure Blob
- non-durable: VM local disk/process state

## VM runtime recovery
1. Recreate or repair VM compute.
2. Re-deploy runtime (`scripts/azure/deploy-vm-runtime.sh`).
3. Ensure env points to existing PostgreSQL + Blob resources.
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

## Restore verification
After VM replacement/redeploy:
```bash
npm run ops:verify-restore
```
This verifies:
- DB counts are not regressed vs snapshot
- previously captured episodes still exist in DB
- episode audio objects are still readable from storage
- parity smoke + podcast contract gate still pass

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

## Observability runbook
Dedicated local log root:
- `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/web/app.log.jsonl`
- `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/worker/app.log.jsonl`
- `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/python-tts/app.log.jsonl`

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
rg '"msg":"Podcast (feed|media) request' /Users/vishalchowdhary/Documents/Podcast/.runtime/logs/web/app.log.jsonl | tail -n 200
```

Filter recent range-related failures (`401`, `404`, `416`):
```bash
rg '"msg":"Podcast media request (unauthorized|invalid range|object not found)"' /Users/vishalchowdhary/Documents/Podcast/.runtime/logs/web/app.log.jsonl | tail -n 200
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

Validate overflow guardrail env before enabling overflow worker:
```bash
ENV_FILE="/etc/articlepod/articlepod.env" \
./scripts/azure/validate-overflow-guardrails.sh
```

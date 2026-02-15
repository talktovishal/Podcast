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
- Pending first live Azure drill execution.

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

## Alert query starter pack (Azure Log Analytics / Kusto)
- Top error codes:
  - `AppTraces | where SeverityLevel >= 3 | summarize count() by tostring(Properties.error_code) | top 20 by count_`
- Repeated invalid input patterns:
  - `AppTraces | where tostring(Properties.error_code) startswith \"INVALID_\" | summarize count() by Message, OperationName`
- Slow spans:
  - `AppDependencies | where DurationMs > 5000 | top 50 by DurationMs desc`
- Extension ingest failures:
  - `AppTraces | where Message has \"html-snapshot\" and SeverityLevel >= 3 | top 100 by TimeGenerated desc`

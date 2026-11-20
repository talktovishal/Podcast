# Supported runtime setups: design only

Approved deliverable S3, 2026-11-20. **This is a guide and proposal, not a
configuration change.** No defaults, environment names, tests, providers,
compatibility modes or deployment gates have been changed.

## In simple terms

ArticlePod has several ways to run. A developer's laptop and the live service
do not necessarily use the same database or file storage. We need a clear
"recipe" for each setup so that "the tests passed" tells us what was tested.

The immediate recommendation is to keep every existing option. If we later
share settings-reading code, first prove that the same settings still choose
the same systems. Do not silently turn a cleanup into a configuration change.

## 1. What the existing recipes actually select

These are source-defined recipes, not a fresh inspection of live machines.
Overrides can change them. A profile name alone does not select every backend.

| Recipe | Record database | Files | Item job notifications | Speech | Mirror and worker role |
|---|---|---|---|---|---|
| `simple` example | Prisma + SQLite | Local files | Prisma dispatch | Worker calls Python Kokoro; real synthesis needs the service/models | Mirror off; primary worker; overflow off |
| `parity` example and checked-in Compose | Prisma + PostgreSQL | Azurite Blob | Azurite Queue, explicitly selected | Separate Python service, Kokoro narration | Mirror off by default; primary worker |
| Azure Table deployment recipe | Explicit `METADATA_PRIMARY_BACKEND=azure_table` | Azure Blob | Explicit `azure_queue`, or the existing automatic selection | Python Kokoro at the configured endpoint | Do not infer optional mirror/overflow state from the profile name |
| Azure SQL compatibility recipe | Prisma + PostgreSQL | Azure Blob | Azure Queue in the example | Same worker provider contract | Retain for compatibility; do not assume unused |

Sources: [simple example](../.env.simple.example),
[parity example](../.env.parity.example),
[Azure example](../.env.azure.example),
[Compose](../docker-compose.parity.yml),
[Prisma schema selection](../scripts/prisma-profile.mjs),
[web settings](../apps/web/src/lib/env.ts),
[worker settings](../apps/worker/src/lib/env.ts),
[worker providers](../apps/worker/src/lib/providers.ts).

Important qualifications:

- The Azure example does **not** set `METADATA_PRIMARY_BACKEND`. The parsers
  therefore default to Prisma unless the effective environment explicitly
  selects Azure Table. `RUNTIME_PROFILE=azure` alone is not that selection.
- "Parity" covers PostgreSQL plus Blob/Queue emulation. It does not exercise
  the Azure Table primary store or prove real-cloud ETag, throttling or
  authentication behavior.
- Item dispatch contains item job notifications only. Summary Studio,
  article-summary and digest work retain their own metadata polling.
- The worker provider factory permits Kokoro narration only. Optional Python
  provider discovery and web previews are not proof that all discovered
  providers are supported worker narration lanes.
- Mirror modes are existing compatibility features, not a second primary
  database. S5's approved decision is to keep the current database and all
  compatibility paths, not to retire the SQL recipe.

## 2. Current interpretation rules to preserve

| Setting or input | Current interpretation | Consequence for a future cleanup |
|---|---|---|
| `METADATA_PRIMARY_BACKEND` | Exact `azure_table` selects Table; otherwise runtime parsers select Prisma | Do not change the default or normalize additional spellings accidentally |
| `STORAGE_BACKEND` | Exact `azure_blob` selects Blob; otherwise local | A profile label is not a storage override |
| `ITEM_DISPATCH_BACKEND` | Exact `prisma` / `azure_queue`; all other values mean automatic selection | Preserve explicit overrides and current unknown-value handling initially |
| Automatic dispatch | Azure Queue only when Blob is selected and a connection string or account-URL/SAS pair is present; otherwise Prisma | Credential **presence** affects selection; never print credential values |
| Shared boolean flags | Web accepts `1/true/yes` and `0/false/no`; several worker flags accept only `1` or test only for `0` | Sharing one boolean parser immediately would change behavior |
| Numeric settings | Web often uses `parseInt`; worker helpers use `Number` then floor | For example `12ms` may parse as 12 in web but fall back in worker; preserve process-specific semantics first |
| Relative file paths | Resolved using process working directory, with special treatment for `apps/` paths | Test web and worker working directories separately |
| Non-simple worker startup | Requires a digest scheduler secret | Do not move a worker-only startup requirement into web build-time parsing |

The [environment checker](../scripts/check-env.mjs) already validates profiles,
required values, storage modes, Table credentials and summary-provider needs.
Reuse it; do not build a competing validation framework.

There are existing differences that a support guide must expose rather than
quietly "fix":

- The checker rejects an invalid metadata selector, while the runtime parser
  falls back to Prisma. Stricter startup validation would be a behavior change.
- Its database-required condition treats **either** Table primary or Table
  mirror as "uses Azure Table". A SQL-primary setup with a Table mirror still
  needs its SQL database in practice. A passed check alone is not proof of
  complete runtime readiness.
- The checker merges profile example, root environment file, profile-specific
  environment file and process environment in that order. The
  [development launcher](../scripts/dev.mjs) loads root values only when the
  process value is absent/falsy; the worker also loads its local environment
  file. A shared parser must not silently change file-loading precedence.

These are design findings, not new code changes or approvals to reject
previously accepted inputs.

## 3. Source-known consumers and ownership

| Area | Where the choices are used | What must remain intact |
|---|---|---|
| Launch and setup | [run.sh](../run.sh), [dev launcher](../scripts/dev.mjs), [checker](../scripts/check-env.mjs), [Prisma profile](../scripts/prisma-profile.mjs) | Simple local development, explicit profile selection, current precedence and schema choice |
| Primary records | [web store](../apps/web/src/lib/metadata-primary-store.ts), [worker store](../apps/worker/src/lib/metadata-primary-store.ts) | Exactly one selected primary; build-time deferral remains web-specific |
| Objects and dispatch | [web storage](../apps/web/src/lib/storage.ts), [worker storage](../apps/worker/src/lib/storage.ts), [web queue](../apps/web/src/lib/item-dispatch-queue.ts), [worker queue](../apps/worker/src/lib/item-dispatch-queue.ts) | Existing connection handling, lazy construction, queue visibility/heartbeat rules |
| Mirror projections | [web projection](../apps/web/src/lib/metadata-projection.ts), [worker projection](../apps/worker/src/lib/metadata-projection.ts), [worker mirror](../apps/worker/src/lib/metadata-mirror.ts) | Existing enablement and logged best-effort writes; no promotion into primary authority |
| Comparison and pressure | [queue pressure](../apps/worker/src/jobs/queuePressure.ts), [worker loop](../apps/worker/src/index.ts) | Optional comparison and mirror selection; the historically named Prisma pressure reader also handles Table primary |
| Overflow lane | [worker loop](../apps/worker/src/index.ts), [overflow policy](../apps/worker/src/lib/overflowPolicy.ts), [provider selection](../apps/worker/src/lib/providers.ts), [overflow guardrails](../scripts/azure/validate-overflow-guardrails.sh) | Item-only role, current activation thresholds and configured speech endpoint |
| SQL/mirror operations | [metadata backfill](../apps/web/scripts/metadata-backfill-table.ts), [consistency check](../apps/web/scripts/metadata-consistency-check.ts), [migration tool](../scripts/migrate-sqlite-to-postgres.sh) | Keep operational consumers even if one production inventory shows a feature inactive |
| Validation and release | [source CI](../.github/workflows/ci.yml), [parity smoke](../scripts/parity-smoke.sh), [legacy runtime launcher](../scripts/azure/runtime-exec.sh) | Preserve current CI gates and private protected deployment ownership; no automation changes here |

This is a repository consumer inventory. External scripts, operators' local
setups and private deployment overrides have not been exhaustively inventoried.
Their owners must confirm usage before any mode can be deprecated. No live
credentials or environment values were collected for this document.

## 4. Proposed small follow-up, requiring implementation approval

1. **Characterize first.** Capture current web/worker resolved selectors using
   synthetic environment fixtures in isolated processes. Compare enum outputs
   and safe presence flags, not secrets. Record differences as differences.
2. **Share only identical rules first.** Add a pure selector function in the
   existing core workspace. Its input is explicit values/presence flags; its
   output is selected metadata, storage and item-dispatch kinds plus validation
   diagnostics. It performs no file I/O, reads no global environment, constructs
   no clients, opens no connections and logs nothing.
3. **Keep local responsibilities local.** File loading, cwd-relative paths,
   Next build handling, worker role/hostname, provider secrets and service
   construction stay with their current callers. Keep differing boolean and
   numeric parsing local until a separately approved alignment.
4. **Wire one process at a time.** Compare old/new results for every supported
   fixture before replacing a caller. The other process must keep matching
   the applicable common-selector results. No mode or default is removed.
5. **Reuse the checker.** Propose only clearly identified checker/runtime
   mismatches for a separate behavior review; do not add new failing gates as
   part of extraction.

### Required fixtures and evidence

- Each recipe above, with unset and explicit selectors; explicit dispatch
  overrides both with and without storage credential presence.
- Automatic dispatch with no credentials, connection-string presence, complete
  account pair, incomplete account pair, and local storage despite credentials.
- Empty, whitespace, unknown and differently cased selector values.
- Boolean `1`, `0`, `true`, `false`, `yes`, `no`, empty and omitted values;
  numeric zero, negative, fractional and nonnumeric-suffix values. Preserve
  existing process-specific outcomes, not a newly invented common default.
- Web build versus runtime; worker simple versus non-simple; relative paths
  under both app working directories.
- Mirror enabled/disabled, optional comparison/pressure, primary/overflow,
  and absent optional speech providers.
- Existing SQL tests and Azure SDK-boundary tests remain required.
  Compose covers PostgreSQL/Blob/Queue; separate real-Table integration evidence
  is needed before claiming equivalence of cloud behavior. Model-free tests
  are not a real Kokoro synthesis check.

### Acceptance and rollback

Accept an implementation only if existing selected systems and errors remain
unchanged and configuration is easier to explain. No benchmark or cost saving
is claimed. Revert caller wiring to undo a parser extraction; no stored data
needs rollback. Removing a mode, changing a default, rejecting a previously
accepted setting or modifying a release gate requires separate approval.

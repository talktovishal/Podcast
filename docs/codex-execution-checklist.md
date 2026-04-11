# Codex Execution Checklist (Always Apply)

This checklist is mandatory for every change.

## Before editing
- Read this file fully.
- Read relevant sections in `docs/Prompts.md`.
- If the task touches RSS, feed tokens, media URLs, extension auth, or any private-link behavior, read `docs/feed-auth-model.md`.
- Confirm scope and keep the change minimal.
- Identify impacted milestone(s) in `docs/plans.md`.
- Decide whether the change affects any persisted schema or durable data contract.
- If it does, write the forward migration/backfill plan before editing code and explicitly rule out reset/drop-table shortcuts.
- Identify docs that must be kept in sync in this same change set:
  - `docs/Prompts.md`
  - `docs/plans.md`
  - any impacted architecture/ops/docs files.

## During implementation
- Make small, reviewable diffs.
- Keep logging and error handling clear.
- Add or update tests when behavior changes.
- For schema/data changes, prefer expand -> backfill/compatibility -> contract; do not make rollout depend on destructive resets.
- Keep milestone metadata consistent:
  - `target_finish` required for every milestone.
  - `completed_on` + evidence required when status becomes `Done`.

## Before marking complete
- Run required validation (`lint`, `test`, `build`) for touched areas.
- Run podcast compatibility gate when applicable:
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`
- If the task touched feed/media auth, confirm normal read paths did not mutate externally visible podcast auth (dashboard, settings, refresh, existing-user auth callbacks).
- For schema/data changes, confirm the PR/change note includes:
  - impacted stores/contracts
  - migration/backfill steps
  - compatibility/rollout notes
  - rollback or safe-disable notes when needed
- Confirm the change does not require dropping tables, force-resetting databases, or asking operators to start from scratch.
- Update milestone status table and per-milestone metadata in `docs/plans.md`.
- Run cross-doc consistency check:
  - status in `docs/Prompts.md` matches `docs/plans.md`
  - architecture/documentation language matches current implementation status.

## Git requirements (default)
- Commit all validated changes.
- Keep commits local by default.
- Do not push unless explicitly requested by the user.
- Treat pushes to `origin/main` as a separate explicit confirmation step.
- Never commit runtime logs (`.runtime/logs/` and diagnostics artifacts).

## Response requirements
- Summarize what changed.
- Include what was verified and results.
- Call out anything not run and why.

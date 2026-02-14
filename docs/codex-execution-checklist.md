# Codex Execution Checklist (Always Apply)

This checklist is mandatory for every change.

## Before editing
- Read this file fully.
- Read relevant sections in `docs/Prompts.md`.
- Confirm scope and keep the change minimal.
- Identify impacted milestone(s) in `docs/plans.md`.
- Identify docs that must be kept in sync in this same change set:
  - `docs/Prompts.md`
  - `docs/plans.md`
  - any impacted architecture/ops/docs files.

## During implementation
- Make small, reviewable diffs.
- Keep logging and error handling clear.
- Add or update tests when behavior changes.
- Keep milestone metadata consistent:
  - `target_finish` required for every milestone.
  - `completed_on` + evidence required when status becomes `Done`.

## Before marking complete
- Run required validation (`lint`, `test`, `build`) for touched areas.
- Run podcast compatibility gate when applicable:
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`
- Update milestone status table and per-milestone metadata in `docs/plans.md`.
- Run cross-doc consistency check:
  - status in `docs/Prompts.md` matches `docs/plans.md`
  - architecture/documentation language matches current implementation status.

## Git requirements (default)
- Commit all validated changes.
- Push to `origin/main`.
- Do not leave local-only work unless explicitly requested.
- Never commit runtime logs (`.runtime/logs/` and diagnostics artifacts).

## Response requirements
- Summarize what changed.
- Include what was verified and results.
- Call out anything not run and why.

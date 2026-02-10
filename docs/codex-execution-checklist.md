# Codex Execution Checklist (Always Apply)

This checklist is mandatory for every change.

## Before editing
- Read this file fully.
- Read relevant sections in `docs/Prompts.md`.
- Confirm scope and keep the change minimal.

## During implementation
- Make small, reviewable diffs.
- Keep logging and error handling clear.
- Add or update tests when behavior changes.

## Before marking complete
- Run required validation (`lint`, `test`, `build`) for touched areas.
- Run podcast compatibility gate when applicable:
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

## Git requirements (default)
- Commit all validated changes.
- Push to `origin/main`.
- Do not leave local-only work unless explicitly requested.

## Response requirements
- Summarize what changed.
- Include what was verified and results.
- Call out anything not run and why.

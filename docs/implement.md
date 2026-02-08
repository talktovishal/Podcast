# Implementation Guide

## First-time setup
1. Install dependencies:
   - `npm install`
2. Generate Prisma client:
   - `npx pnpm --filter @listenlater/web run prisma:generate`
3. Bootstrap local SQLite schema:
   - `npx pnpm --filter @listenlater/web run db:bootstrap`
4. Seed demo content:
   - `npx pnpm --filter @listenlater/web run seed:demo`
5. Start full stack:
   - `npm run dev`

## Milestone execution mode
- Implement one milestone from `docs/plans.md`.
- Run verification commands from that milestone.
- Fix failures.
- Commit and push.

## Spec status workflow
- Keep `docs/Prompts.md` synchronized with implementation using status-tagged sections:
  - `Implemented (as of <date>)`
  - `Next Milestones`
  - `Future / Optional`
- After each merged milestone, update:
  - `docs/Prompts.md` status sections
  - `docs/plans.md` milestone status snapshot (`Done`, `In Progress`, `Planned`)
  - `docs/chat_log.md` with summary + exact user prompt references

## Worker
- Starts from `apps/worker/src/index.ts`.
- Polls queue and processes jobs continuously.
- Uses adapter-based TTS; current default UX is Kokoro via python-tts in local mode.

## Web
- Login/sign-up via `/login`.
- User dashboard via `/app`.
- Admin dashboard via `/admin`.
- Private RSS via `/rss/<feed_token>.xml`.

## Upcoming implementation sequence (next)
1. `M23` OAuth hardening completion (Google + Apple, env-gated production-ready).
2. `M24` extension auth model (connect-code -> extension token exchange).
3. `M25` HTML snapshot ingest endpoint (`POST /api/items/html-snapshot`).
4. `M26` worker extraction path for `HTML_SNAPSHOT`.
5. `M27` Chrome extension MV3 capture + submit UX.
6. `M28` extension security/compliance hardening + demo script updates.

## Export artifacts
- Run `npm run export`.
- Outputs:
  - `exports/rss.xml`
  - `exports/media/*`
  - `exports/manifest.json`

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
1. `M28` extension security/compliance hardening + demo script updates.
2. `M29` OAuth + extension CI integration matrix and regression gates.
3. `M30` extension onboarding/reconnect UX hardening.
4. `M31` extraction quality guardrails for noisy/authenticated HTML.
5. `M32` operational observability baseline + admin surfacing.
6. `M33` release certification matrix for Apple Podcasts + secondary app.
7. `M34` security/data lifecycle hardening for diagnostics and extension tokens.

## Export artifacts
- Run `npm run export`.
- Outputs:
  - `exports/rss.xml`
  - `exports/media/*`
  - `exports/manifest.json`

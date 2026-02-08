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

## Worker
- Starts from `apps/worker/src/index.ts`.
- Polls queue and processes jobs continuously.
- Uses `OPENAI_API_KEY` only when set; defaults to local `say` provider.

## Web
- Login/sign-up via `/login`.
- User dashboard via `/app`.
- Admin dashboard via `/admin`.
- Private RSS via `/rss/<feed_token>.xml`.

## Export artifacts
- Run `npm run export`.
- Outputs:
  - `exports/rss.xml`
  - `exports/media/*`
  - `exports/manifest.json`

# ListenLater

RSS-first personal podcast feed that converts URLs/PDFs into private podcast episodes.

## Monorepo layout
- `apps/web` - Next.js UI + API routes
- `apps/worker` - async processing worker
- `packages/core` - shared extraction, RSS, chunking, security, adapter types
- `docs` - plans, architecture, implementation docs
- `fixtures` - deterministic HTML/PDF/demo fixtures

## Quick start
1. `npm install`
2. `npx pnpm --filter @listenlater/web run prisma:generate`
3. `npx pnpm --filter @listenlater/web run prisma:migrate`
4. `npx pnpm --filter @listenlater/web run seed:demo`
5. `npm run dev`

## Validation
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

# Product Documentation

## What ListenLater does
ListenLater converts URLs and PDFs into private podcast episodes and publishes them as a private RSS feed.

## User flow
1. Sign in or create account.
2. Submit URL or upload text-based PDF.
3. Item enters `queued` and is processed by worker.
4. Episode becomes playable in dashboard and appears in RSS feed.

## Demo setup and login
Running `./run.sh` creates local demo accounts and starter media automatically.

- Demo account:
  - email: `demo@listenlater.local`
  - password: `demo-password`
- Admin account:
  - email: `admin@listenlater.local`
  - password: `admin-demo-password` (or `ADMIN_PASSWORD` from `.env`)

Suggested local demo walkthrough:
1. Sign in as demo account at `/login`.
2. Open `/app` and confirm seeded starter episode exists.
3. Submit a URL and one text-based PDF.
4. Wait for `READY` state and confirm audio playback + seek.
5. Copy feed URL and subscribe in a podcast app.
6. Sign in as admin account and open `/admin` to show system metrics.

OAuth notes:
- Google login works only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured.
- Apple login works only when `APPLE_CLIENT_ID` and `APPLE_CLIENT_SECRET` are configured.
- Empty OAuth vars are expected for local no-provider demos.

## Current vs planned
Currently available:
- URL and PDF ingestion from web dashboard.
- Private feed + share links + admin dashboard.
- Kokoro-first voice settings and preview.

Planned next features (see `docs/plans.md`):
- `M23`: OAuth hardening completion (Google + Apple).
- `M24`: extension connect-code auth model.
- `M25`: HTML snapshot ingest API (`POST /api/items/html-snapshot`).
- `M26`: worker extraction mode for `HTML_SNAPSHOT`.
- `M27`: Chrome extension MV3 capture flow.
- `M28`: extension security/compliance hardening and demo updates.

## Feed and media
- Feed endpoint: `/rss/<feed_token>.xml`
- Media endpoint: `/api/media/...` (HEAD + Range enabled)
- Rotate feed token from dashboard to invalidate old feed URL.

## Read-only sharing
- Generate share link from dashboard.
- Share recipients can view/listen but cannot mutate data.

## Admin module
- `/admin` displays:
  - active user count
  - job status breakdown
  - recent job events and errors
- Admin account is bootstrapped from `.env` if not present.
- Updating `ADMIN_PASSWORD` later does not automatically rotate/reset existing DB credentials.

## Known MVP boundaries
- No OCR for scanned/image-heavy PDFs.
- No voice cloning.
- No native mobile app.
- Chrome extension is planned post-MVP and tracked in `M24`-`M28`.

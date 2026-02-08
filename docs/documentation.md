# Product Documentation

## What ListenLater does
ListenLater converts URLs and PDFs into private podcast episodes and publishes them as a private RSS feed.

## User flow
1. Sign in or create account.
2. Submit URL or upload text-based PDF.
3. Item enters `queued` and is processed by worker.
4. Episode becomes playable in dashboard and appears in RSS feed.

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

## Known MVP boundaries
- No OCR for scanned/image-heavy PDFs.
- No voice cloning.
- No native mobile app.

# Product Documentation

## What ArticlePod does
ArticlePod converts URLs, PDFs, and Chrome-captured HTML snapshots into private podcast episodes and publishes them through a private RSS feed.

## User flow
1. Sign in with local credentials (or OAuth when configured).
2. Submit URL, upload PDF, or capture page from Chrome extension.
3. Item enters `QUEUED` -> `PROCESSING` -> `READY/FAILED`.
4. Episode appears in recent items and private RSS feed.

## Accounts
Local defaults:
- Demo account: `demo@articlepod.local` / `demo-password`
- Admin account: `admin@articlepod.local` / `admin-demo-password`

## Chrome extension
- Source: `/Users/vishalchowdhary/Documents/Podcast/apps/extension`
- Package command: `npm run extension:package`
- Local load: `chrome://extensions` -> Developer mode -> Load unpacked

Connect flow:
1. In `/app`, generate one-time extension connect code.
2. Paste code in extension popup and connect.
3. Capture current page; item is enqueued to your account feed.

## Feed and media
- Feed URL: `/rss/<feed_token>.xml`
- Media URL: `/api/media/...`
- Media route supports `HEAD` and byte-range `206 Partial Content`

## Runtime profiles
- `simple`: local SQLite + local object storage
- `parity`: Docker Compose PostgreSQL + Azurite + python-tts
- `azure`: single VM compute + Azure PostgreSQL + Azure Blob

## Durable rollout status
Milestones `M35`-`M46` are implemented in repository assets:
- parity Docker Compose stack and profile env gates
- object storage abstraction (`local` + `azure_blob`)
- SQLite -> PostgreSQL migration/export/import scripts
- storage-backed media route with `HEAD`/`Range`
- queue resilience hardening and tests
- Bicep + azd IaC baseline
- VM deploy/systemd automation scripts
- durability snapshot/restore drill scripts and operations runbook
- CI matrix with simple + parity release gates

## Observability status
Current implementation:
- structured JSONL runtime logs in `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs`
- support IDs included on API error payloads from shared error helper
- correlation propagation from worker to python-tts (`traceparent`, request/job/item IDs)
- diagnostics scripts:
  - `npm run logs:collect`
  - `npm run logs:triage`

Planned next steps:
- M51-M54 for full OTel export, Azure Monitor wiring, and dashboards/alerts.

## OAuth setup
Google + Apple setup guide:
- `/Users/vishalchowdhary/Documents/Podcast/docs/oauth-setup.md`

OAuth buttons show unavailable until provider env vars are configured.

## Known boundaries
- No OCR for scanned/image-heavy PDFs.
- No voice cloning.
- No native mobile app.

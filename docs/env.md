# Environment Variables

## Required defaults
- `DATABASE_URL` (default `file:./apps/web/.data/db.sqlite`)
- `APP_URL` (default `http://localhost:3000`)

## Storage and paths
- `MEDIA_ROOT` (default `./apps/web/.data/media`)
- `UPLOAD_ROOT` (default `./apps/web/.data/uploads`)

## Auth and admin
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- Optional OAuth:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `APPLE_CLIENT_ID`
  - `APPLE_CLIENT_SECRET`

## Optional TTS provider
- `OPENAI_API_KEY`

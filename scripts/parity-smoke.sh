#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
DEMO_EMAIL="${DEMO_EMAIL:-demo@listenlater.local}"
DEMO_PASSWORD="${DEMO_PASSWORD:-demo-password}"

COOKIE_JAR="$(mktemp)"
cleanup() {
  rm -f "$COOKIE_JAR"
}
trap cleanup EXIT

echo "[parity-smoke] waiting for web app at $BASE_URL"
for _ in $(seq 1 90); do
  if curl -sf "$BASE_URL/login" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -sf "$BASE_URL/login" >/dev/null 2>&1; then
  echo "[parity-smoke] web app did not become reachable"
  exit 1
fi

echo "[parity-smoke] logging in as demo user"
LOGIN_RESPONSE="$(curl -sS -c "$COOKIE_JAR" -X POST "$BASE_URL/api/auth/login" -H "content-type: application/json" -d "{\"mode\":\"login\",\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\"}")"

node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.ok) {
  console.error("[parity-smoke] login failed", payload);
  process.exit(1);
}
' "$LOGIN_RESPONSE"

echo "[parity-smoke] fetching dashboard"
APP_HTML="$(curl -sS -b "$COOKIE_JAR" "$BASE_URL/app")"
FEED_TOKEN="$(printf '%s' "$APP_HTML" | grep -Eo '/rss/[A-Za-z0-9_-]+\.xml' | head -n1 | sed 's#^/rss/##;s#\.xml$##')"

if [[ -z "$FEED_TOKEN" ]]; then
  echo "[parity-smoke] could not extract feed token from dashboard"
  exit 1
fi

echo "[parity-smoke] checking item refresh API"
SEED_RESPONSE="$(curl -sS -b "$COOKIE_JAR" "$BASE_URL/api/seed-demo?refresh=items")"
node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.ok || !Array.isArray(payload.items)) {
  console.error("[parity-smoke] unexpected refresh payload", payload);
  process.exit(1);
}
' "$SEED_RESPONSE"

FEED_URL="$BASE_URL/rss/$FEED_TOKEN.xml"
echo "[parity-smoke] running podcast contract check for $FEED_URL"
./scripts/verify_podcast_contract.sh "$FEED_URL"

echo "[parity-smoke] completed"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

print_usage() {
  cat <<'EOF'
Usage: ./run-web.sh [--setup-only] [--force-install]

Starts only the ArticlePod web app for quick local testing.
This bootstraps the database and demo data, but intentionally skips
the worker and python-tts services. New submissions will stay queued
until you start the full stack with ./run.sh.

Options:
  --setup-only    Run setup checks, then exit without starting the web app.
  --force-install Reinstall Node dependencies even if node_modules exists.
  -h, --help      Show this help message.
EOF
}

SETUP_ONLY=0
FORCE_INSTALL="${FORCE_INSTALL:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --setup-only)
      SETUP_ONLY=1
      shift
      ;;
    --force-install)
      FORCE_INSTALL=1
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      print_usage
      exit 2
      ;;
  esac
done

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required. Please install Node.js 20+."
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: npx is required. Please install Node.js 20+."
  exit 1
fi

if [[ ! -f ".env" ]]; then
  if [[ -f ".env.simple.example" ]]; then
    cp ".env.simple.example" ".env"
    echo "Created .env from .env.simple.example"
  elif [[ -f ".env.example" ]]; then
    cp ".env.example" ".env"
    echo "Created .env from .env.example"
  else
    echo "Warning: no env template found; continuing without creating .env"
  fi
fi

if [[ "$FORCE_INSTALL" == "1" || ! -d "node_modules" ]]; then
  echo "Installing dependencies with pnpm lockfile..."
  npx pnpm install --frozen-lockfile
else
  echo "Using existing node_modules (set FORCE_INSTALL=1 or --force-install to reinstall)."
fi

echo "Running environment check..."
npm run check:env -- --profile simple

if [[ "$SETUP_ONLY" == "1" ]]; then
  echo "Setup complete for web-only mode."
  exit 0
fi

echo "Starting local web app only. Worker and python-tts are skipped."
exec node scripts/dev.mjs --web-only

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

print_usage() {
  cat <<'EOF'
Usage: ./run.sh [--web] [--fast] [--skip-bootstrap] [--clean] [--setup-only] [--force-install] [--profile simple|parity|azure]

Starts the local ArticlePod stack from one command.

Modes:
  default         Start the web app + worker.
  --web           Start only the web app for the fastest UI loop.

Speed helpers:
  --fast          Skip env validation and app bootstrap, then start watchers immediately.
                  Best for repeated local UI/dev work after an initial setup run.
  --skip-bootstrap
                  Skip Prisma/db/demo bootstrap, but still run env validation.
  --clean         Clear local dev caches before starting (.next, .turbo, tsbuildinfo).

Options:
  --setup-only    Run setup checks, then exit without starting dev servers.
  --force-install Reinstall Node dependencies even if node_modules exists.
  --profile       Runtime profile (default: simple).
                  simple -> existing local mode
                  parity -> docker compose parity stack (postgres + azurite + python-tts + web + worker)
                  azure  -> env validation only
  -h, --help      Show this help message.
EOF
}

SETUP_ONLY=0
FORCE_INSTALL="${FORCE_INSTALL:-0}"
PROFILE="${RUNTIME_PROFILE:-simple}"
WEB_ONLY=0
SKIP_BOOTSTRAP=0
SKIP_ENV_CHECK=0
CLEAN=0

clean_dev_caches() {
  echo "Clearing local dev caches..."
  rm -rf \
    apps/web/.next \
    .turbo
  rm -f \
    apps/web/tsconfig.tsbuildinfo \
    apps/worker/tsconfig.tsbuildinfo
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --web|--web-only)
      WEB_ONLY=1
      shift
      ;;
    --fast)
      SKIP_BOOTSTRAP=1
      SKIP_ENV_CHECK=1
      shift
      ;;
    --skip-bootstrap)
      SKIP_BOOTSTRAP=1
      shift
      ;;
    --clean)
      CLEAN=1
      shift
      ;;
    --setup-only)
      SETUP_ONLY=1
      shift
      ;;
    --force-install)
      FORCE_INSTALL=1
      shift
      ;;
    --profile)
      PROFILE="${2:-$PROFILE}"
      shift 2
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

if [[ "$PROFILE" != "simple" && "$PROFILE" != "parity" && "$PROFILE" != "azure" ]]; then
  echo "Unsupported profile '$PROFILE'. Expected one of: simple, parity, azure."
  exit 2
fi

if [[ "$PROFILE" == "parity" && "$WEB_ONLY" == "1" ]]; then
  echo "Error: --web is only supported with the simple profile."
  exit 2
fi

export RUNTIME_PROFILE="$PROFILE"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required. Please install Node.js 20+."
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: npx is required. Please install Node.js 20+."
  exit 1
fi

if [[ ! -f ".env" ]]; then
  PROFILE_ENV_TEMPLATE=".env.${PROFILE}.example"
  if [[ -f "$PROFILE_ENV_TEMPLATE" ]]; then
    cp "$PROFILE_ENV_TEMPLATE" ".env"
    echo "Created .env from $PROFILE_ENV_TEMPLATE"
  elif [[ -f ".env.example" ]]; then
    cp ".env.example" ".env"
    echo "Created .env from .env.example"
  else
    echo "Warning: .env.example not found; continuing without creating .env"
  fi
fi

if [[ "$FORCE_INSTALL" == "1" || ! -d "node_modules" ]]; then
  echo "Installing dependencies with pnpm lockfile..."
  npx pnpm install --frozen-lockfile
else
  echo "Using existing node_modules (set FORCE_INSTALL=1 or --force-install to reinstall)."
fi

if [[ "$CLEAN" == "1" ]]; then
  clean_dev_caches
fi

if [[ "$SKIP_ENV_CHECK" == "1" ]]; then
  echo "Skipping environment check in fast mode."
else
  echo "Running environment check..."
  npm run check:env -- --profile "$PROFILE"
fi

if [[ "$PROFILE" == "parity" ]]; then
  if [[ "$SETUP_ONLY" == "1" ]]; then
    echo "Setup complete for parity profile."
    exit 0
  fi

  echo "Starting parity stack via docker compose..."
  exec ./scripts/parity-up.sh
fi

if [[ "$PROFILE" == "azure" ]]; then
  echo "Azure profile selected. Local dev stack is not started by run.sh for this profile."
  echo "Use deployment scripts under scripts/azure/ and docs/azure-deploy.md."
  exit 0
fi

if [[ "$SKIP_BOOTSTRAP" == "1" ]]; then
  echo "Skipping local bootstrap steps."
elif [[ "${ENABLE_PYTHON_TTS_DEV:-1}" != "0" && "$WEB_ONLY" != "1" ]]; then
  echo "Bootstrapping python-tts dependencies (Kokoro + Melo)..."
  ./scripts/bootstrap-python-tts.sh
fi

if [[ "$SETUP_ONLY" == "1" ]]; then
  echo "Setup complete."
  exit 0
fi

DEV_ARGS=()
if [[ "$WEB_ONLY" == "1" ]]; then
  DEV_ARGS+=("--web-only")
fi
if [[ "$SKIP_BOOTSTRAP" == "1" ]]; then
  DEV_ARGS+=("--skip-bootstrap")
fi
if [[ "$SKIP_ENV_CHECK" == "1" ]]; then
  DEV_ARGS+=("--fast")
fi

if [[ "$WEB_ONLY" == "1" ]]; then
  echo "Starting local web app only. Press Ctrl+C to stop."
else
  echo "Starting local stack (web + worker). Press Ctrl+C to stop."
fi

if [[ "${#DEV_ARGS[@]}" -gt 0 ]]; then
  exec node scripts/dev.mjs "${DEV_ARGS[@]}"
else
  exec node scripts/dev.mjs
fi

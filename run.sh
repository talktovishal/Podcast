#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

print_usage() {
  cat <<'EOF'
Usage: ./run.sh [--setup-only] [--force-install] [--profile simple|parity|azure]

Starts the full local ArticlePod stack (web + worker) with one command.

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

echo "Running environment check..."
npm run check:env -- --profile "$PROFILE"

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

if [[ "${ENABLE_PYTHON_TTS_DEV:-1}" != "0" ]]; then
  echo "Bootstrapping python-tts dependencies (Kokoro + Melo)..."
  ./scripts/bootstrap-python-tts.sh
fi

if [[ "$SETUP_ONLY" == "1" ]]; then
  echo "Setup complete."
  exit 0
fi

echo "Starting local stack (web + worker). Press Ctrl+C to stop."
exec npm run dev

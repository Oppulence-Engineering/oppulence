#!/usr/bin/env bash
# Full-stack local dev: validate env, check rowboat-api health, start hot-reload www.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(cd ../../.. && pwd)"

export OPPULENCE_WWW_PORT="${OPPULENCE_WWW_PORT:-18082}"
export OPPULENCE_WWW_API_PROXY_URL="${OPPULENCE_WWW_API_PROXY_URL:-http://localhost:18080}"
export OPPULENCE_WWW_PUBLIC_API_BASE_URL="${OPPULENCE_WWW_PUBLIC_API_BASE_URL:-$OPPULENCE_WWW_API_PROXY_URL}"
export OPPULENCE_WWW_PUBLIC_APP_URL="${OPPULENCE_WWW_PUBLIC_APP_URL:-http://localhost:${OPPULENCE_WWW_PORT}}"
export OPPULENCE_WWW_SESSION_SECRET="${OPPULENCE_WWW_SESSION_SECRET:-dev-only-rowboat-www-session-secret-change-me}"

echo "==> rowboat-www dev stack"
echo "    API:  $OPPULENCE_WWW_API_PROXY_URL"
echo "    WWW:  $OPPULENCE_WWW_PUBLIC_APP_URL"
echo ""
echo "    Start API if missing:"
echo "      cd $ROOT && docker compose -f docker-compose.rowboat-api.yml up -d"
echo "      (Temporal + worker come up with the API; chat calls OpenRouter)"
echo "      — or — make api-up"
echo ""

node scripts/validate-dev-env.mjs || true

exec bash scripts/dev-local.sh

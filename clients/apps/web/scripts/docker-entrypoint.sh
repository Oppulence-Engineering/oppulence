#!/bin/sh
set -eu

# Fly, App Platform, and the Helm values still set the pre-rename
# ROWBOAT_WWW_* names. Copy each one to its OPPULENCE_WWW_* name unless that is
# already set, so the app reads a single set of names.
for legacy in $(env | sed -n 's/^\(ROWBOAT_WWW_[A-Z0-9_]*\)=.*/\1/p'); do
  current="OPPULENCE_${legacy#ROWBOAT_}"
  eval "[ -n \"\${$current:-}\" ] || export $current=\"\${$legacy}\""
done

OPPULENCE_WWW_PUBLIC_API_BASE_URL="${OPPULENCE_WWW_PUBLIC_API_BASE_URL:-${ROWBOATX_PUBLIC_API_BASE_URL:-${ROWBOATX_API_BASE_URL:-https://api.oppulence.io}}}"
OPPULENCE_WWW_API_PROXY_URL="${OPPULENCE_WWW_API_PROXY_URL:-${ROWBOATX_API_PROXY_URL:-${ROWBOATX_API_BASE_URL:-https://api.oppulence.io}}}"
OPPULENCE_WWW_PUBLIC_API_BASE_URL="${OPPULENCE_WWW_PUBLIC_API_BASE_URL%/}"
OPPULENCE_WWW_API_PROXY_URL="${OPPULENCE_WWW_API_PROXY_URL%/}"
OPPULENCE_WWW_PORT="${OPPULENCE_WWW_PORT:-${ROWBOATX_PORT:-8080}}"

export OPPULENCE_WWW_PUBLIC_API_BASE_URL
export OPPULENCE_WWW_API_PROXY_URL
export PORT="${OPPULENCE_WWW_PORT}"
export HOSTNAME=0.0.0.0

exec node server.js

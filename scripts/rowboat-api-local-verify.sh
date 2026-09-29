#!/usr/bin/env bash
#
# Self-contained local rowboat-api stack — NO Infisical, NO kind required.
#
# Use this when you want to run/verify the rowboat-api backend (HTTP API +
# Temporal worker) against a real durable execution path without provisioning
# kind or linking Infisical. It is the fast path for AI agents and humans
# verifying API-native background-task behavior and assistant chat end to end.
#
# It brings up, all locally:
#   - Postgres (docker)                       -> :55432
#   - Temporal auto-setup (docker)            -> :57233   (real durable workflows)
#   - devstack  (repo cmd/devstack)           -> :18190   (mints JWTs; mock LLM only when opted in)
#   - rowboat-api server (repo cmd/server)    -> :18180   (http) :19190 (metrics)
#   - rowboat-api worker (repo cmd/worker)    -> :19191   (metrics; runs the Temporal worker)
#
# Schema is applied with cmd/migrate. Postgres rejects AUTO_MIGRATE, so this
# script never sets it. The worker also refuses to boot unless the development
# connector-entitlement bypass is on: there is no product signer in this stack.
#
# LLM upstream follows the kind script. A real OpenRouter key (sk-or-…) calls
# https://openrouter.ai/api/v1. Anything else, or ROWBOAT_LOCAL_MOCK_LLM=1,
# points the gateway at devstack, which replies "Hello from the mock LLM."
#
# The devstack mints RS256 tokens (aud=rowboat-api) the server validates via its
# published JWKS, so no real WorkOS/Infisical secrets are needed. DB_ENCRYPTION_KEY
# falls back to a dev default; Redis is optional (in-memory rate limiter fallback).
#
# For the production-like path (kind + real secrets) use scripts/rowboat-api-kind.sh
# instead — that one DOES require Infisical (`infisical init` in the repo root, or
# INFISICAL_PROJECT_ID) so the rowboat repo is linked to the correct Infisical project.
#
# Usage:
#   scripts/rowboat-api-local-verify.sh up       # bring the stack up (idempotent)
#   scripts/rowboat-api-local-verify.sh smoke    # mint a token + exercise the API
#   scripts/rowboat-api-local-verify.sh all      # up + smoke (default)
#   scripts/rowboat-api-local-verify.sh down     # tear everything down
#
# Requires: docker (running), go, jq, curl.
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/rowboat-api"
WORK="${RBV_WORK:-/tmp/rbv}"; BIN="$WORK/bin"; LOGS="$WORK/logs"
NET=rbv-net; PG=rbv-pg; TMP=rbv-temporal
PGPORT=55432; TMPPORT=57233; DEVPORT=18190; APIPORT=18180; SRVMET=19190; WRKMET=19191; GRPCPORT=18181
MOCK_REPLY="Hello from the mock LLM."

# Stop a binary we built. Match the executable path, including the "(deleted)"
# suffix Linux reports after go build overwrites a running binary. Do not use
# pkill -f: the pattern is often in the caller's own command line.
# Kill one pid and wait until it releases the binary, so the next go build
# does not hit ETXTBSY and the next process can bind the port.
kill_wait() {
  local pid="$1" _
  [[ -n "${pid:-}" ]] || return 0
  kill "$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.2
  done
  kill -9 "$pid" 2>/dev/null || true
}

stop_built() {
  local name="$1"
  # ${name} cannot share the local declaration above: bash expands the
  # right-hand side before the assignment, and set -u then aborts.
  local pidfile="$WORK/${name}.pid"
  local pid exe
  if [[ -f "$pidfile" ]]; then
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    kill_wait "$pid"
    rm -f "$pidfile"
  fi
  for pid in $(pgrep -x "$name" 2>/dev/null || true); do
    # Raw readlink, not -f: a replaced binary shows up as "path (deleted)".
    exe="$(readlink "/proc/$pid/exe" 2>/dev/null || true)"
    if [[ "$exe" == "$BIN/$name" || "$exe" == "$BIN/$name (deleted)" ]]; then
      kill_wait "$pid"
    fi
  done
}

wait_http() {
  local url="$1" label="$2" tries="${3:-60}" code=000
  for _ in $(seq 1 "$tries"); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)
    if [[ "$code" == "200" ]]; then
      echo "$label ready"
      return 0
    fi
    sleep 2
  done
  echo "$label not ready (last HTTP ${code})" >&2
  return 1
}

# Live OpenRouter only when the caller actually supplied an sk-or- key and did
# not opt into the mock. The historical dummy values (dev-openrouter-key,
# dev-dummy) must not be sent to the real gateway.
configure_llm() {
  local key="${OPENROUTER_API_KEY:-}"
  mkdir -p "$WORK"
  if [[ -n "${ROWBOAT_LOCAL_MOCK_LLM:-}" || "$key" != sk-or-* ]]; then
    export OPENROUTER_API_KEY="dev-openrouter-key"
    export OPENROUTER_BASE_URL="http://localhost:${DEVPORT}/v1"
    printf 'mock\n' >"$WORK/llm-mode"
    if [[ -n "${ROWBOAT_LOCAL_MOCK_LLM:-}" ]]; then
      echo "LLM upstream: devstack mock (ROWBOAT_LOCAL_MOCK_LLM set)"
    else
      echo "LLM upstream: devstack mock (export an sk-or- OPENROUTER_API_KEY for live OpenRouter)"
    fi
    return 0
  fi
  export OPENROUTER_API_KEY="$key"
  unset OPENROUTER_BASE_URL
  printf 'live\n' >"$WORK/llm-mode"
  echo "LLM upstream: live OpenRouter (set ROWBOAT_LOCAL_MOCK_LLM=1 to use the mock)"
}

up() {
  mkdir -p "$BIN" "$LOGS"
  echo "### cleanup prior run"
  stop_built server
  stop_built worker
  stop_built devstack
  docker rm -f "$PG" "$TMP" >/dev/null 2>&1 || true
  docker network create "$NET" >/dev/null 2>&1 || true

  echo "### postgres"
  docker run -d --name "$PG" --network "$NET" \
    -e POSTGRES_USER=rowboat -e POSTGRES_PASSWORD=rowboat -e POSTGRES_DB=rowboat \
    -p ${PGPORT}:5432 postgres:16-alpine >/dev/null
  local pg_ready=0
  for _ in $(seq 1 30); do
    if docker exec "$PG" pg_isready -U rowboat >/dev/null 2>&1; then
      pg_ready=1
      break
    fi
    sleep 2
  done
  if [[ "$pg_ready" != 1 ]]; then
    echo "postgres did not become ready" >&2
    return 1
  fi

  echo "### temporal (auto-setup, backed by the same postgres)"
  docker run -d --name "$TMP" --network "$NET" \
    -e DB=postgres12 -e DB_PORT=5432 -e POSTGRES_SEEDS="$PG" \
    -e POSTGRES_USER=rowboat -e POSTGRES_PWD=rowboat -e ENABLE_ES=false \
    -p ${TMPPORT}:7233 temporalio/auto-setup:1.27.2 >/dev/null

  echo "### build binaries"
  ( cd "$API_DIR" && go build -o "$BIN/devstack" ./cmd/devstack \
      && go build -o "$BIN/server" ./cmd/server \
      && go build -o "$BIN/worker" ./cmd/worker \
      && go build -o "$BIN/migrate" ./cmd/migrate ) || { echo "BUILD FAILED"; return 1; }

  export DATABASE_URL="postgres://rowboat:rowboat@localhost:${PGPORT}/rowboat?sslmode=disable"
  echo "### schema (cmd/migrate apply; AUTO_MIGRATE stays false)"
  DATABASE_URL="$DATABASE_URL" "$BIN/migrate" apply || { echo "MIGRATE FAILED"; return 1; }

  export APP_URL="http://localhost:${APIPORT}"
  export OIDC_ISSUER_URL="http://localhost:${DEVPORT}" TOKEN_ISSUER="http://localhost:${DEVPORT}"
  export TOKEN_AUDIENCE="rowboat-api" JWKS_URL="http://localhost:${DEVPORT}/.well-known/jwks.json"
  export ORY_PUBLIC_URL="http://localhost:${DEVPORT}" PUBLIC_BASE_URL="http://localhost:${APIPORT}"
  export INFISICAL_ENABLED=false ENVIRONMENT=development LOG_LEVEL=info
  export CONNECTOR_ALLOW_LOCAL_ENTITLEMENT_DEVELOPMENT=true
  export FREE_TIER_CREDITS=10000
  export AUTO_MIGRATE=false
  export LLM_MODEL="${LLM_MODEL:-openai/gpt-4.1}"
  export TEMPORAL_ENABLED=true TEMPORAL_ADDRESS="localhost:${TMPPORT}" \
         TEMPORAL_NAMESPACE=default TEMPORAL_TASK_QUEUE=rowboat-api-background-tasks
  configure_llm

  echo "### devstack"
  ADDR=":${DEVPORT}" ISSUER="http://localhost:${DEVPORT}" AUDIENCE="rowboat-api" \
    nohup "$BIN/devstack" >"$LOGS/devstack.log" 2>&1 &
  echo $! >"$WORK/devstack.pid"
  wait_http "http://localhost:${DEVPORT}/.well-known/jwks.json" devstack 30 || return 1

  echo "### wait for temporal"
  local temporal_ready=0
  for _ in $(seq 1 90); do
    if docker exec "$TMP" sh -c 'tctl --address "$(hostname -i):7233" cluster health' 2>/dev/null | grep -q SERVING; then
      temporal_ready=1
      break
    fi
    sleep 2
  done
  if [[ "$temporal_ready" != 1 ]]; then
    echo "temporal did not become ready" >&2
    docker logs "$TMP" 2>&1 | tail -40 >&2
    return 1
  fi
  echo "temporal ready"

  echo "### server"
  HTTP_ADDR=":${APIPORT}" GRPC_ADDR=":${GRPCPORT}" METRICS_ADDR=":${SRVMET}" \
    nohup "$BIN/server" >"$LOGS/server.log" 2>&1 &
  echo $! >"$WORK/server.pid"
  wait_http "http://localhost:${APIPORT}/readyz" server 60 || {
    tail -40 "$LOGS/server.log" >&2 || true
    return 1
  }

  echo "### worker"
  METRICS_ADDR=":${WRKMET}" \
    nohup "$BIN/worker" >"$LOGS/worker.log" 2>&1 &
  echo $! >"$WORK/worker.pid"
  wait_http "http://localhost:${WRKMET}/readyz" worker 60 || {
    tail -40 "$LOGS/worker.log" >&2 || true
    return 1
  }
  echo "=== STACK UP — API http://localhost:${APIPORT} · devstack http://localhost:${DEVPORT} · llm $(cat "$WORK/llm-mode") ==="
}

# One assistant turn. Fails closed: live mode rejects the devstack canned
# reply, mock mode rejects anything else (that would mean we called a real
# model by accident).
chat_smoke() {
  local API="http://localhost:${APIPORT}" DEV="http://localhost:${DEVPORT}"
  local mode TOK resp code body sid events content provider failed
  if [[ ! -f "$WORK/llm-mode" ]]; then
    echo "chat smoke: $WORK/llm-mode missing; run up first" >&2
    return 1
  fi
  mode="$(tr -d '[:space:]' <"$WORK/llm-mode")"
  TOK=$(curl -sf "$DEV/mint?workos_user_id=user_chat&email=chat%40x.co" | jq -r .token)
  if [[ -z "$TOK" || "$TOK" == "null" ]]; then
    echo "chat smoke: could not mint a devstack token" >&2
    return 1
  fi
  resp=$(curl -sS -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
    -X POST "$API/v1/agent-sessions" \
    -d '{"agent":"assistant","input":"Reply with the single word pong and nothing else.","title":"chat-smoke","channel":"web"}' \
    -w '\n%{http_code}')
  code="$(printf '%s\n' "$resp" | tail -n1)"
  body="$(printf '%s\n' "$resp" | sed '$d')"
  echo "chat create HTTP $code (llm=$mode)"
  if [[ "$code" != "201" ]]; then
    printf '%s\n' "$body" | jq -c . 2>/dev/null || printf '%s\n' "$body"
    return 1
  fi
  sid="$(printf '%s\n' "$body" | jq -r '.sessionId // empty')"
  if [[ -z "$sid" ]]; then
    echo "chat smoke: create response had no sessionId" >&2
    return 1
  fi
  content="" provider="" failed=""
  for _ in $(seq 1 90); do
    events=$(curl -sf -H "Authorization: Bearer $TOK" "$API/v1/agent-sessions/$sid/events" || true)
    content="$(printf '%s' "$events" | jq -r '[.events[] | select(.type=="agent.message") | .data.content] | last // empty' 2>/dev/null || true)"
    provider="$(printf '%s' "$events" | jq -r '[.events[] | select(.type=="agent.llm_call_completed") | .data.provider] | last // empty' 2>/dev/null || true)"
    failed="$(printf '%s' "$events" | jq -r '[.events[] | select(.type=="agent.turn_failed" or .type=="agent.session_failed") | .data.error] | last // empty' 2>/dev/null || true)"
    if [[ -n "$content" || -n "$failed" ]]; then
      break
    fi
    sleep 2
  done
  # Never print a vendor key if an upstream error echoes one back.
  failed="$(printf '%s' "$failed" | sed -E 's/sk-or-[A-Za-z0-9_-]+/[redacted]/g')"
  if [[ -n "$failed" && -z "$content" ]]; then
    echo "chat smoke: turn failed: $failed" >&2
    return 1
  fi
  if [[ -z "$content" ]]; then
    echo "chat smoke: no assistant message within 3 minutes (session $sid)" >&2
    return 1
  fi
  echo "chat provider=${provider:-unknown} reply_chars=${#content}"
  if [[ "$mode" == "live" ]]; then
    if [[ "$content" == "$MOCK_REPLY" ]]; then
      echo "chat smoke: live OpenRouter returned the devstack mock reply" >&2
      return 1
    fi
    if [[ "$provider" != "openrouter" ]]; then
      echo "chat smoke: live turn provider=$provider, want openrouter" >&2
      return 1
    fi
    printf '%s\n' "$content" | head -c 240
    printf '\n'
    return 0
  fi
  if [[ "$content" != "$MOCK_REPLY" ]]; then
    echo "chat smoke: mock mode reply was not the canned devstack string" >&2
    return 1
  fi
  echo "chat mock reply ok"
}

smoke() {
  chat_smoke || return 1
  local API="http://localhost:${APIPORT}" DEV="http://localhost:${DEVPORT}"
  local TOK; TOK=$(curl -s "$DEV/mint?workos_user_id=user_verify&email=verify%40x.co" | jq -r .token)
  local A=(-H "Authorization: Bearer $TOK") J=(-H "Content-Type: application/json") SLUG=verify-task
  echo "# create api task";   curl -s "${A[@]}" "${J[@]}" -X POST "$API/v1/background-tasks" -d "{\"slug\":\"$SLUG\",\"name\":\"Verify\",\"instructions\":\"Summarize.\",\"executionTarget\":\"api\"}" | jq -c '{slug,executionTarget}'
  echo "# trigger";           local RID; RID=$(curl -s "${A[@]}" "${J[@]}" -X POST "$API/v1/background-tasks/$SLUG/trigger" -d '{"trigger":"manual","context":"verify"}' | tee /dev/stderr | jq -r .runId)
  echo "# poll to terminal";  for _ in $(seq 1 40); do S=$(curl -s "${A[@]}" "$API/v1/background-tasks/$SLUG/runs/$RID/status" | jq -r .status); case "$S" in succeeded|failed|stopped) break;; esac; sleep 1; done; echo "status=$S"
  echo "# events";            curl -s "${A[@]}" "$API/v1/background-tasks/$SLUG/runs/$RID/events" | jq -c '[.events[].type]'
  echo "# artifact provenance"; curl -s "${A[@]}" "$API/v1/background-tasks/$SLUG/artifact" | jq -c '{revision,updatedByRunId,contentType}'
  echo "# filters trigger=retry / status=succeeded"; curl -s "${A[@]}" "$API/v1/background-task-runs?status=succeeded" | jq -c '{n:(.runs|length)}'
  echo "# server cloud_run metrics"; curl -s "http://localhost:${SRVMET}/metrics" | grep -E "^cloud_runs?_(triggered|completed|stopped|retry)" | sort
  echo "# worker cloud_run metrics"; curl -s "http://localhost:${WRKMET}/metrics" | grep -E "^cloud_run_(duration|queue_latency)_seconds_count|^cloud_runs_completed_total" | sort
}

down() {
  stop_built server
  stop_built worker
  stop_built devstack
  docker rm -f "$PG" "$TMP" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -f "$WORK/llm-mode" "$WORK/server.pid" "$WORK/worker.pid" "$WORK/devstack.pid"
  echo "stack down"
}

case "${1:-all}" in
  up) up ;;
  smoke) smoke ;;
  down) down ;;
  all|"") up && smoke ;;
  *) echo "usage: $0 {up|smoke|all|down}"; exit 2 ;;
esac

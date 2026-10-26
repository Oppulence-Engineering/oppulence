#!/usr/bin/env bash
# Sets the DigitalOcean PgBouncer pool to the `databasePool` block of a values
# file. Production deploys run it, so a pool change made outside the file does
# not stay. Needs an authenticated doctl and yq.
set -euo pipefail

VALUES_FILE="${1:-charts/rowboat-api/values-production.yaml}"

pool() { yq ".databasePool.$1" "${VALUES_FILE}"; }
cluster_id="$(doctl databases list --format ID,Name --no-header | awk -v name="$(pool cluster)" '$2 == name { print $1 }')"
if [[ -z "${cluster_id}" ]]; then
  echo "Database cluster $(pool cluster) not found"
  exit 1
fi

# --format Size keeps the pool connection URI out of the log.
current="$(doctl databases pool get "${cluster_id}" "$(pool name)" --format Size --no-header)"
if [[ "${current}" == "$(pool size)" ]]; then
  echo "$(pool name) already has size ${current}"
  exit 0
fi

doctl databases pool update "${cluster_id}" "$(pool name)" \
  --db "$(pool database)" \
  --user "$(pool user)" \
  --mode "$(pool mode)" \
  --size "$(pool size)" >/dev/null
echo "$(pool name) size changed from ${current} to $(pool size)"

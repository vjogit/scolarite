#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: $(basename "$0") <url> [timeout_seconds] [interval_seconds]

Wait for an HTTP endpoint to become available.

Arguments:
  url               The URL to probe (e.g. http://localhost:8080/auth/realms/master/protocol/openid-connect/certs)
  timeout_seconds   (optional) total seconds to wait before failing (default: 60)
  interval_seconds  (optional) seconds between probes (default: 2)

Returns exit code 0 when the endpoint responds, 1 on timeout.
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ $# -lt 1 ]; then
  echo "Error: missing url" >&2
  usage
  exit 2
fi

BASE_URL="$1"
TIMEOUT_SECONDS=${2:-120}
INTERVAL_SECONDS=${3:-2}

if ! [[ "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || ! [[ "$INTERVAL_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "Error: timeout and interval must be integers" >&2
  exit 2
fi

TOKEN_URL="${BASE_URL%/auth*}/auth/realms/master/protocol/openid-connect/token"

elapsed=0

echo "Waiting for Keycloak to accept admin login at $TOKEN_URL (timeout ${TIMEOUT_SECONDS}s) ..."

# Sur un terminal, l'état de la sonde est réécrit sur la même ligne ; sinon
# (log, CI) on n'imprime une ligne que lorsque la réponse change.
INTERACTIVE=0
[ -t 1 ] && INTERACTIVE=1
last_probe=""

report() {
  local probe="$1"
  if [ "$INTERACTIVE" = "1" ]; then
    printf '\r\033[2K  → %s (%ss/%ss)' "$probe" "$elapsed" "$TIMEOUT_SECONDS"
  elif [ "$probe" != "$last_probe" ]; then
    printf '  → %s (%ss/%ss)\n' "$probe" "$elapsed" "$TIMEOUT_SECONDS"
  fi
  last_probe="$probe"
}

end_progress() {
  if [ "$INTERACTIVE" = "1" ] && [ -n "$last_probe" ]; then
    printf '\n'
  fi
}

KC_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KC_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
while true; do
  RESPONSE=$(curl -s --max-time 5 -w "\n%{http_code}" -X POST "$TOKEN_URL" \
    -d "client_id=admin-cli&username=${KC_ADMIN}&password=${KC_ADMIN_PASSWORD}&grant_type=password" \
    2>/dev/null || echo -e "\n000")
  HTTP_STATUS=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -1)
  PROBE="HTTP $HTTP_STATUS"
  [ -n "$BODY" ] && PROBE="$PROBE : ${BODY:0:100}"
  report "$PROBE"
  [ "$HTTP_STATUS" = "200" ] && break
  elapsed=$((elapsed + INTERVAL_SECONDS))
  if [ $elapsed -ge $TIMEOUT_SECONDS ]; then
    end_progress
    echo "Timed out waiting for Keycloak after $TIMEOUT_SECONDS seconds" >&2
    exit 1
  fi
  sleep $INTERVAL_SECONDS
done
end_progress

echo "Keycloak is ready (admin login OK)"

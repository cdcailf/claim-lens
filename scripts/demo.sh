#!/usr/bin/env bash
# Paced demo runner for screen recording.
# Usage: DEMO_PAUSE=3 ./scripts/demo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PAUSE="${DEMO_PAUSE:-2}"
step() {
  printf '\n\033[1;36m$ %s\033[0m\n' "$*"
  sleep 1
  "$@"
  sleep "$PAUSE"
}

if [ -t 1 ] && [ -n "${TERM:-}" ]; then clear; fi
step node bin/cli.js assess \
  --policy data/policies/p1.json \
  --claim data/claims/c1.json

step node bin/cli.js assess \
  --policy data/policies/p1.json \
  --claim data/claims/c1.json \
  --html examples/report.html

if [ -z "${DEMO_NO_OPEN:-}" ]; then
  open examples/report.html 2>/dev/null || true
  sleep "$PAUSE"
fi

printf '\n\033[1;36m$ %s\033[0m\n' "node bin/cli.js eval"
sleep 1
node bin/cli.js eval | sed -n '1p'
sleep "$PAUSE"

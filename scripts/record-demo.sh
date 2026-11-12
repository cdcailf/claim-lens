#!/usr/bin/env bash
# Terminal recording script for docs/demo.gif
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -t 1 ] && [ -n "${TERM:-}" ]; then clear; fi
printf '\033[1;36mClaim Lens\033[0m  rules-first claim adjudication\n\n'
sleep 1

printf '\033[1;37m$ %s\033[0m\n' "node bin/cli.js assess --policy data/policies/p1.json --claim data/claims/c1.json"
sleep 1
node bin/cli.js assess --policy data/policies/p1.json --claim data/claims/c1.json
sleep 5

printf '\n\033[1;37m$ %s\033[0m\n' "node bin/cli.js eval | head -1"
sleep 1
node bin/cli.js eval | sed -n '1p'
sleep 3

printf '\n\033[1;32mgithub.com/cdcailf/claim-lens\033[0m  ·  MIT\n'
sleep 2

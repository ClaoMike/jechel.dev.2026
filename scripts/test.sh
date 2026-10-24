#!/usr/bin/env bash
# Everything CI runs, here: the backend's tests, the frontend's lint, build and tests, and the end-to-end tests (Docker
# must be running). CI itself only runs on the way to production (a pull request into main, see ci.yml).
#   ./scripts/test.sh            all of it
#   ./scripts/test.sh backend    or frontend, or e2e: one part
set -euo pipefail
cd "$(dirname "$0")/.."

parts=("${@:-backend frontend e2e}")
for part in ${parts[*]}; do
  echo "━━ $part"
  case "$part" in
    backend) (cd backend && ./test.sh) ;;
    frontend) (cd frontend && npm run lint && npm run build && npm test) ;;
    e2e) ./e2e/run.sh ;;
    *) echo "No part called $part (backend, frontend or e2e)."; exit 1 ;;
  esac
done
echo "━━ All passed."

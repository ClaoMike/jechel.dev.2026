#!/usr/bin/env bash
# The end-to-end tests (see playwright.config.ts): ./run.sh [playwright test options], e.g. ./run.sh --project chrome
# Starts a fresh PostgreSQL in Docker, installs the latest Playwright and browsers, builds the API and the site,
# runs the tests, and removes the database again.
set -euo pipefail
cd "$(dirname "$0")"

DB_PORT="${E2E_DB_PORT:-5434}"
DB_CONTAINER=jechel-e2e-db

echo "▸ A fresh database (Docker, port $DB_PORT)"
docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
docker run -d --rm --name "$DB_CONTAINER" -p "$DB_PORT:5432" --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_DB=portfolio -e POSTGRES_USER=portfolio -e POSTGRES_PASSWORD=portfolio postgres:16-alpine >/dev/null
FIREFOX_CONTAINER=jechel-e2e-firefox
trap 'docker rm -f "$DB_CONTAINER" "$FIREFOX_CONTAINER" >/dev/null 2>&1 || true' EXIT
until docker exec "$DB_CONTAINER" pg_isready -U portfolio -d portfolio >/dev/null 2>&1; do sleep 1; done

echo "▸ The latest Playwright, and its Firefox and WebKit (Safari's engine)"
npm install --no-save --no-package-lock --no-audit --no-fund @playwright/test@latest @axe-core/playwright@latest >/dev/null
npx playwright --version
if [ -n "${CI:-}" ]; then
  npx playwright install --with-deps chromium firefox webkit
  # The real Chrome and Edge, their current stable versions (the runner's own may be older).
  npx playwright install --force chrome msedge
else
  npx playwright install chromium webkit
  # Chrome and Edge as installed on this computer (they update themselves); installed only if missing.
  for browser in chrome msedge; do npx playwright install "$browser" 2>/dev/null || true; done
fi

# Playwright's Firefox doesn't start on macOS 27: on a Mac it runs in Playwright's Linux image instead, same version.
if [ "$(uname)" = Darwin ]; then
  echo "▸ Firefox in Docker (Playwright's Linux image)"
  version=$(node -p "require('@playwright/test/package.json').version")
  docker rm -f "$FIREFOX_CONTAINER" >/dev/null 2>&1 || true
  docker run -d --rm --name "$FIREFOX_CONTAINER" -p 3333:3333 --init "mcr.microsoft.com/playwright:v$version-noble" \
    /bin/sh -c "npx -y playwright@$version run-server --port 3333 --host 0.0.0.0" >/dev/null
  until curl -s -o /dev/null localhost:3333; do sleep 1; done
  export E2E_FIREFOX_WS=ws://localhost:3333/
fi

echo "▸ Building the API and the site"
dotnet build ../backend/src/Portfolio.Api --nologo -v quiet
(cd ../frontend && { [ -d node_modules ] || npm ci --no-audit --no-fund; } && npm run build >/dev/null)

echo "▸ Type-checking the tests"
../frontend/node_modules/.bin/tsc -p .

echo "▸ Testing"
npx playwright test "$@"

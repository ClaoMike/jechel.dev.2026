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
trap 'docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true' EXIT
until docker exec "$DB_CONTAINER" pg_isready -U portfolio -d portfolio >/dev/null 2>&1; do sleep 1; done

echo "▸ The latest Playwright and browsers"
npm install --no-save --no-package-lock --no-audit --no-fund @playwright/test@latest @axe-core/playwright@latest >/dev/null
npx playwright --version
# Chrome, Edge and Firefox are the real ones; WebKit (Safari's engine) is Playwright's, from its latest release.
if [ -n "${CI:-}" ]; then
  # A download can stall (one hung for half an hour at 100%): each try gets 10 minutes, three tries.
  retry() { for attempt in 1 2 3; do timeout 600 "$@" && return 0; echo "Try $attempt failed or stalled: again."; done; return 1; }
  retry npx playwright install-deps firefox webkit
  retry npx playwright install webkit
  # The current stable Chrome and Edge, from Google and Microsoft (the runner's own may be older).
  retry npx playwright install --force chrome msedge
  # The current Firefox, from Mozilla.
  firefox_dir="${RUNNER_TEMP:-/tmp}/firefox-latest"
  rm -rf "$firefox_dir" && mkdir -p "$firefox_dir"
  retry curl -fsSL "https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US" -o "$firefox_dir/firefox.tar.xz"
  tar -xf "$firefox_dir/firefox.tar.xz" -C "$firefox_dir"
  export E2E_FIREFOX_PATH="$firefox_dir/firefox/firefox"
else
  npx playwright install webkit
  # Chrome, Edge and Firefox as installed on this computer (they update themselves).
  for browser in chrome msedge; do npx playwright install "$browser" 2>/dev/null || true; done
fi

echo "▸ Every browser the newest release (or stop)"
node checkBrowsers.ts

echo "▸ Building the API and the site"
dotnet build ../backend/src/Portfolio.Api --nologo -v quiet
(cd ../frontend && { [ -d node_modules ] || npm ci --no-audit --no-fund; } && npm run build >/dev/null)

echo "▸ Type-checking the tests"
../frontend/node_modules/.bin/tsc -p .

echo "▸ Testing"
npx playwright test "$@"

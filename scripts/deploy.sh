#!/usr/bin/env bash
# Deploy: opens (or reuses) the pull request develop → main with auto-merge on. GitHub runs the whole
# test suite on it, merges it when every required check passes, and the merge deploys (deploy.yml).
# Needs the GitHub CLI, signed in: brew install gh && gh auth login
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "Not deployed: $1"; exit 1; }

command -v gh >/dev/null || fail "the GitHub CLI isn't installed (brew install gh && gh auth login)."
[ "$(git branch --show-current)" = develop ] || fail "deploys go from develop; switch to it first."
[ -z "$(git status --porcelain)" ] || fail "there are uncommitted changes; commit or stash them first."

git fetch -q origin
# CI may have committed to develop (the newest Playwright for the frontend tests): those first, then ours on top.
git pull -q --rebase origin develop || fail "develop on GitHub has commits that don't go with yours; pull and sort them out first."
git push origin develop
git rev-parse -q --verify origin/main >/dev/null || fail "there's no main branch on GitHub yet."
[ -n "$(git log --oneline origin/main..develop 2>/dev/null)" ] || fail "main already has everything on develop."

if ! gh pr view develop --json state -q .state 2>/dev/null | grep -q OPEN; then
  gh pr create --base main --head develop --title "Deploy $(date '+%Y-%m-%d %H:%M')" \
    --body "$(git log --format='- %s' origin/main..develop --no-merges)"
fi
pr=$(gh pr view develop --json number -q .number)
# Auto-merge waits for the tests; GitHub refuses it when they've already passed ("clean"): then it merges now.
if ! gh pr merge "$pr" --auto --merge 2>/dev/null; then
  gh pr merge "$pr" --merge || fail "the pull request can't be merged; see it: $(gh pr view "$pr" --json url -q .url)"
fi
echo
echo "Waiting for the tests (merged and deployed automatically when they pass)..."
# GitHub takes a moment to start the checks after a push: until they show up, there's nothing to watch (and "no
# checks" would read as a failure). Two minutes at most.
for _ in $(seq 24); do
  [ "$(gh pr checks "$pr" --required --json name -q length 2>/dev/null || echo 0)" -gt 0 ] && break
  sleep 5
done
# By number: once it's merged, "develop" no longer names an open pull request.
gh pr checks "$pr" --watch --required || fail "a required check failed; see the pull request."
echo
echo "Tests passed: merging and deploying. Follow it here: $(gh repo view --json url -q .url)/actions/workflows/deploy.yml"

#!/bin/sh
# Dumps the database every night at BACKUP_HOUR (UTC, default 3) and uploads it as <weekday>.dump
# (mon.dump … sun.dump): the last seven days are always there, each night replacing last week's.
# A failure rings the phone when NTFY_URL is set. RUN_NOW=1 also takes one at start (to try it out).
#
# Needs: POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
#        S3_ENDPOINT (https://…), S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY; optional S3_REGION (auto),
#        S3_PREFIX (e.g. "jechel/"), BACKUP_HOUR, NTFY_URL (https://ntfy.sh/<topic>), NTFY_TOKEN.
set -u

export PGPASSWORD="$POSTGRES_PASSWORD"
hour=$(printf '%02d' "${BACKUP_HOUR:-3}")

log() { echo "$(date -u '+%Y-%m-%d %H:%M:%S') $*"; }

alert() {
  [ -n "${NTFY_URL:-}" ] || return 0
  message=$1
  if [ -n "${NTFY_TOKEN:-}" ]; then set -- -H "Authorization: Bearer $NTFY_TOKEN"; else set --; fi
  curl --silent --show-error --max-time 30 -H "Title: Database backup failed" -H "Priority: high" -H "Tags: warning" "$@" \
    -d "$message" "$NTFY_URL" >/dev/null || true
}

# One dump, uploaded under today's weekday. Fails (non-zero) if either step does.
backup() {
  day=$(date -u +%a | tr '[:upper:]' '[:lower:]')
  file=/tmp/backup.dump
  log "Dumping $POSTGRES_DB…"
  if ! pg_dump --format=custom --no-owner --no-privileges -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$file"; then
    alert "pg_dump failed: see the backup service's logs."
    return 1
  fi
  key="${S3_PREFIX:-}$day.dump"
  log "Uploading $(du -h "$file" | cut -f1) as $key…"
  if ! curl --fail --silent --show-error --max-time 1800 --aws-sigv4 "aws:amz:${S3_REGION:-auto}:s3" \
    --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" -T "$file" "${S3_ENDPOINT%/}/$S3_BUCKET/$key"; then
    alert "The upload of $key failed: see the backup service's logs."
    rm -f "$file"
    return 1
  fi
  rm -f "$file"
  log "Backed up as $key."
}

[ "${RUN_NOW:-0}" = 1 ] && backup

log "Backing up every night at $hour:00 UTC."
done_on=""
while true; do
  today=$(date -u +%F)
  if [ "$(date -u +%H)" = "$hour" ] && [ "$today" != "$done_on" ]; then
    backup || true
    done_on=$today
  fi
  sleep 300
done

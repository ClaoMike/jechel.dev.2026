#!/bin/sh
# Puts a backup back: downloads <name>.dump (e.g. "wed") and restores it over the database, replacing
# everything in it. Run it by setting the backup service's CMD to "/backup/restore.sh wed" and deploying it;
# afterwards set the CMD back (empty) and deploy again, or a restart would restore once more.
# The same settings as backup.sh.
set -eu

name=${1:?Say which backup: mon, tue, wed, thu, fri, sat or sun.}
export PGPASSWORD="$POSTGRES_PASSWORD"
file=/tmp/restore.dump
key="${S3_PREFIX:-}$name.dump"

echo "Downloading $key…"
curl --fail --silent --show-error --max-time 1800 --aws-sigv4 "aws:amz:${S3_REGION:-auto}:s3" \
  --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" -o "$file" "${S3_ENDPOINT%/}/$S3_BUCKET/$key"

echo "Restoring it over $POSTGRES_DB…"
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$file"
rm -f "$file"

echo "Restored $key. Set this service's CMD back (empty) and deploy it, so it goes back to taking backups."
exec sleep infinity

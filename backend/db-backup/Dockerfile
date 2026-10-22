# The nightly database backup: a small service next to the API and Postgres on the same server (Sliplane).
# pg_dump from Postgres 16 (the database's own version); curl uploads the dump to S3-compatible storage.
# Build context: this folder.
FROM postgres:16-alpine
RUN apk add --no-cache curl
COPY backup.sh restore.sh /backup/
RUN chmod +x /backup/*.sh
# Root, so it can write to a freshly mounted volume (owned by root); it's alone in its container.
ENTRYPOINT []
CMD ["/backup/backup.sh"]

# The nightly database backup: a small service next to the API and Postgres on the same server (Sliplane).
# pg_dump from Postgres 16 (the database's own version); curl uploads the dump to S3-compatible storage.
# Build context: this folder.
FROM postgres:16-alpine
RUN apk add --no-cache curl
COPY backup.sh restore.sh /backup/
RUN chmod +x /backup/*.sh
USER postgres
ENTRYPOINT []
CMD ["/backup/backup.sh"]

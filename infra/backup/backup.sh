#!/bin/sh
# Daily backups of Postgres and ClickHouse into the S3 bucket Roost already uses.
#
#   s3://$S3_BUCKET/$BACKUP_PREFIX/postgres/roost-<UTC stamp>.sql.gz   (pg_dump, gzip)
#   s3://$S3_BUCKET/$BACKUP_PREFIX/clickhouse/<UTC stamp>/             (BACKUP DATABASE ... TO S3)
#
# Usage (the image's entrypoint):
#   roost-backup                           once a day at BACKUP_HOUR (UTC), forever
#   BACKUP_ONCE=1 roost-backup             one backup now, then exit
#   roost-backup list                      backups in the bucket
#   roost-backup restore postgres <stamp>  DROPS the database, then loads that dump
#   roost-backup restore clickhouse <stamp>
# Restores expect the api and worker to be stopped. Nothing here prunes old backups: add a
# lifecycle rule on the prefix (see DEPLOY.md).
# Never echo the variables below; they hold passwords and S3 keys.
set -eu
set -o pipefail

: "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}" "${PGDATABASE:?}"
: "${CLICKHOUSE_URL:?}" "${CLICKHOUSE_USER:?}" "${CLICKHOUSE_PASSWORD:?}" "${CLICKHOUSE_DB:?}"
: "${S3_ENDPOINT:?}" "${S3_BUCKET:?}" "${S3_ACCESS_KEY:?}" "${S3_SECRET_KEY:?}"
BACKUP_PREFIX="${BACKUP_PREFIX:-backups}"
BACKUP_HOUR="${BACKUP_HOUR:-3}"
S3_ENDPOINT="${S3_ENDPOINT%/}"

export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup: $*"; }
s3() { aws --endpoint-url "$S3_ENDPOINT" "$@"; }

backup_postgres() {
  key="$BACKUP_PREFIX/postgres/roost-$1.sql.gz"
  # Dump to a local file first, so a failed pg_dump never leaves a truncated object behind.
  file="${TMPDIR:-/tmp}/roost-$1.sql.gz"
  pg_dump --no-owner --no-privileges | gzip -6 >"$file" || { rm -f "$file"; return 1; }
  s3 s3 cp --only-show-errors "$file" "s3://$S3_BUCKET/$key" || { rm -f "$file"; return 1; }
  rm -f "$file"
  log "postgres -> $key"
}

backup_clickhouse() {
  dest="$S3_ENDPOINT/$S3_BUCKET/$BACKUP_PREFIX/clickhouse/$1"
  # ClickHouse writes straight to S3 itself, so it must reach S3_ENDPOINT from its own container.
  # The query goes in the body, not the URL, so the keys stay out of access logs.
  printf "BACKUP DATABASE %s TO S3('%s', '%s', '%s')" "$CLICKHOUSE_DB" "$dest" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" | ch_query
  log "clickhouse -> $BACKUP_PREFIX/clickhouse/$1/"
}

run_backup() {
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  s3 s3api head-bucket --bucket "$S3_BUCKET" >/dev/null 2>&1 || s3 s3api create-bucket --bucket "$S3_BUCKET" >/dev/null
  backup_postgres "$stamp"
  backup_clickhouse "$stamp"
  log "done ($stamp)"
}

list_backups() {
  echo "postgres:"
  s3 s3 ls "s3://$S3_BUCKET/$BACKUP_PREFIX/postgres/" || true
  echo "clickhouse:"
  s3 s3 ls "s3://$S3_BUCKET/$BACKUP_PREFIX/clickhouse/" || true
}

restore_postgres() {
  key="$BACKUP_PREFIX/postgres/roost-$1.sql.gz"
  s3 s3api head-object --bucket "$S3_BUCKET" --key "$key" >/dev/null
  # DROP DATABASE can't run inside a transaction, so each statement is its own -c.
  psql -v ON_ERROR_STOP=1 -q -d postgres \
    -c "DROP DATABASE IF EXISTS \"$PGDATABASE\" WITH (FORCE)" -c "CREATE DATABASE \"$PGDATABASE\""
  s3 s3 cp --only-show-errors "s3://$S3_BUCKET/$key" - | gunzip | psql -v ON_ERROR_STOP=1 -q >/dev/null
  log "postgres restored from $key"
}

ch_query() {
  curl -sS --fail-with-body -u "$CLICKHOUSE_USER:$CLICKHOUSE_PASSWORD" --data-binary @- "$CLICKHOUSE_URL/" >/dev/null
}

restore_clickhouse() {
  src="$S3_ENDPOINT/$S3_BUCKET/$BACKUP_PREFIX/clickhouse/$1"
  echo "DROP DATABASE IF EXISTS $CLICKHOUSE_DB SYNC" | ch_query
  printf "RESTORE DATABASE %s FROM S3('%s', '%s', '%s')" "$CLICKHOUSE_DB" "$src" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" | ch_query
  log "clickhouse restored from $BACKUP_PREFIX/clickhouse/$1/"
}

# Seconds from now until the next BACKUP_HOUR:00 UTC.
seconds_until_next_run() {
  now=$(date -u +%s)
  today=$(date -u +%Y-%m-%d)
  next=$(date -u -d "$today $(printf %02d "$BACKUP_HOUR"):00:00" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  echo $((next - now))
}

case "${1:-}" in
  list) list_backups; exit 0 ;;
  restore)
    [ $# -eq 3 ] || { echo "usage: roost-backup restore postgres|clickhouse <stamp>" >&2; exit 2; }
    case "$2" in
      postgres) restore_postgres "$3" ;;
      clickhouse) restore_clickhouse "$3" ;;
      *) echo "unknown store: $2" >&2; exit 2 ;;
    esac
    exit 0 ;;
  "") ;;
  *) echo "unknown command: $1" >&2; exit 2 ;;
esac

if [ "${BACKUP_ONCE:-0}" = "1" ]; then
  run_backup
  exit 0
fi

log "scheduled daily at $(printf %02d "$BACKUP_HOUR"):00 UTC"
while true; do
  sleep "$(seconds_until_next_run)"
  # A child process, because `set -e` is ignored inside a function called from `||`.
  # One failed night must not stop the loop; the error is in `docker compose logs backup`.
  BACKUP_ONCE=1 "$0" || log "FAILED, will retry tomorrow"
done

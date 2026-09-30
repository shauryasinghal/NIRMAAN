#!/usr/bin/env bash
# Rebuild a scratch Postgres database from ZERO: Supabase stub -> every migration in order.
# Usage: supabase/local/reset.sh [dbname]     (default: nirmaan_dev)
# Env:   PGHOST/PGPORT/PGUSER as usual for psql. Refuses to touch anything not on localhost.
set -euo pipefail
DB="${1:-nirmaan_dev}"
HOST="${PGHOST:-localhost}"
case "$HOST" in localhost|127.0.0.1|/tmp|/var/run/postgresql) ;; *) echo "refusing to reset non-local host: $HOST" >&2; exit 1;; esac
case "$DB" in nirmaan_dev|nirmaan_test|nirmaan_e2e|nirmaan_*) ;; *) echo "refusing db name: $DB" >&2; exit 1;; esac
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=(psql -X -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_supabase_stub.sql" >/dev/null
for f in "$HERE"/../migrations/*.sql; do
  echo "apply $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -1 -f "$f" >/dev/null
done
echo "OK: $DB rebuilt from zero"

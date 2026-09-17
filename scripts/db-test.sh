#!/usr/bin/env bash
#
# Recree une base jetable, applique toutes les migrations, puis execute la
# suite d'assertions de securite. Utilise en local et en CI.
#
# Usage : scripts/db-test.sh [admin_url] [db_name]
set -euo pipefail

ADMIN_URL="${1:-${STAX_PG_ADMIN_URL:-postgresql://postgres@127.0.0.1:55432/postgres}}"
DB_NAME="${2:-stax_test}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_URL="${ADMIN_URL%/*}/${DB_NAME}"

printf 'Recreation de la base %s...\n' "$DB_NAME"
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 \
  -c "drop database if exists ${DB_NAME} with (force);" \
  -c "create database ${DB_NAME};"

"$ROOT/scripts/db-apply.sh" "$TARGET_URL" > /dev/null

printf 'Execution des tests de securite...\n'
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -f "$ROOT/tests/sql/rls.test.sql" 2>&1 \
  | sed 's/^psql:[^ ]*: NOTICE:  //' \
  | grep -vE '^(SET|DO|CREATE|INSERT|UPDATE|DELETE|ALTER|GRANT|REVOKE|COMMENT)' || true

printf '\nBase de test disponible : %s\n' "$TARGET_URL"

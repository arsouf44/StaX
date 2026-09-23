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
# Le statut de psql est lu a part : filtrer la sortie ne doit JAMAIS masquer
# un echec (auparavant, le `|| true` du filtre rendait la suite toujours
# verte, meme quand une assertion echouait).
set +e
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -f "$ROOT/tests/sql/rls.test.sql" 2>&1 \
  | sed 's/^psql:[^ ]*: NOTICE:  //' \
  | grep -vE '^(SET|DO|CREATE|INSERT|UPDATE|DELETE|ALTER|GRANT|REVOKE|COMMENT)'
status=${PIPESTATUS[0]}
set -e
if [ "$status" -ne 0 ]; then
  printf '\nECHEC des tests de securite (psql a termine avec le code %s).\n' "$status" >&2
  exit "$status"
fi

printf '\nBase de test disponible : %s\n' "$TARGET_URL"

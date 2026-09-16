#!/usr/bin/env bash
# Applique le shim Supabase puis toutes les migrations sur une base jetable.
# Usage : scripts/db-apply.sh <database_url>
set -euo pipefail
DB_URL="${1:?Usage: db-apply.sh <database_url>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/tests/sql/supabase-shim.sql"
for file in "$ROOT"/supabase/migrations/*.sql; do
  printf '  → %s\n' "$(basename "$file")"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$file"
done
echo "Migrations appliquees."

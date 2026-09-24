#!/usr/bin/env bash
#
# Pile locale des tests de bout en bout.
#
# Demarre, sur cette machine, ce que Supabase execute en production :
#
#   PostgreSQL 16   la base, avec TOUTES les migrations du depot
#   GoTrue          le vrai service d'authentification de Supabase
#   PostgREST       la vraie API de donnees de Supabase
#   passerelle      une seule origine (/auth/v1, /rest/v1, /storage/v1)
#   fournisseurs    faux GitHub et faux Cloudflare (providers.mjs) : memes API,
#                   sans le reseau — depots, commits, deploiements Pages
#
# Rien n'est simule cote base ni cote authentification : une connexion est une
# vraie connexion, un jeton est un vrai jeton signe, une policy RLS est la vraie
# policy. Seul le stockage des fichiers est emule (voir gateway.mjs).
#
# Usage :
#   tests/e2e/stack/stack.sh start    base neuve + services, ecrit $STACK_DIR/env
#   tests/e2e/stack/stack.sh stop
#   tests/e2e/stack/stack.sh env      affiche les variables a exporter
#
# Prerequis : binaires PostgreSQL 16 (initdb, pg_ctl, psql), Node 22, curl.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HERE="$ROOT/tests/e2e/stack"
STACK_DIR="${STAX_E2E_STACK_DIR:-$ROOT/.e2e-stack}"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/16/bin/initdb)")}"
[ -x "$PG_BIN/initdb" ] || PG_BIN=/usr/lib/postgresql/16/bin

PG_PORT="${STAX_E2E_PG_PORT:-55440}"
REST_PORT=54330
AUTH_PORT=54340
GATEWAY_PORT=54321
PROVIDERS_PORT=54350
DB_NAME=stax_e2e
# Compte Cloudflare fictif (32 caracteres hexadecimaux, non secret).
CLOUDFLARE_ACCOUNT=0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e

POSTGREST_VERSION=v12.2.12
GOTRUE_VERSION=v2.178.0

# Secret de signature des jetons de la pile locale. Il n'a aucune valeur hors
# de cette machine ; il est regenere si le repertoire de la pile est efface.
secret_file="$STACK_DIR/jwt-secret"

as_postgres() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

download() {
  mkdir -p "$STACK_DIR/bin"
  if [ ! -x "$STACK_DIR/bin/postgrest" ]; then
    echo "→ Telechargement de PostgREST $POSTGREST_VERSION"
    curl -sSfL -o "$STACK_DIR/postgrest.tar.xz" \
      "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x86-64.tar.xz"
    tar -xJf "$STACK_DIR/postgrest.tar.xz" -C "$STACK_DIR/bin"
  fi
  if [ ! -x "$STACK_DIR/gotrue/auth" ]; then
    echo "→ Telechargement de GoTrue $GOTRUE_VERSION"
    mkdir -p "$STACK_DIR/gotrue"
    curl -sSfL -o "$STACK_DIR/gotrue.tar.gz" \
      "https://github.com/supabase/auth/releases/download/$GOTRUE_VERSION/auth-$GOTRUE_VERSION-x86.tar.gz"
    tar -xzf "$STACK_DIR/gotrue.tar.gz" -C "$STACK_DIR/gotrue"
  fi
}

stop_all() {
  for name in gateway postgrest gotrue providers; do
    if [ -f "$STACK_DIR/$name.pid" ]; then
      kill "$(cat "$STACK_DIR/$name.pid")" 2>/dev/null || true
      rm -f "$STACK_DIR/$name.pid"
    fi
  done
  if [ -f "$STACK_DIR/pgdata/PG_VERSION" ]; then
    as_postgres "$PG_BIN/pg_ctl" -D "$STACK_DIR/pgdata" -m fast stop >/dev/null 2>&1 || true
  fi
}

wait_http() {
  local url="$1" label="$2"
  for _ in $(seq 1 100); do
    if curl -s -o /dev/null "$url"; then return 0; fi
    sleep 0.2
  done
  echo "✗ $label ne repond pas ($url). Journal : $STACK_DIR/$label.log" >&2
  tail -20 "$STACK_DIR/$label.log" >&2 || true
  exit 1
}

start_all() {
  mkdir -p "$STACK_DIR"
  download
  stop_all

  [ -f "$secret_file" ] || head -c 48 /dev/urandom | base64 | tr -d '\n=/+' > "$secret_file"
  local secret
  secret="$(cat "$secret_file")"

  # --- PostgreSQL ----------------------------------------------------------
  # PostgreSQL refuse de tourner en root : ses repertoires lui appartiennent.
  local fresh=false
  [ -f "$STACK_DIR/pgdata/PG_VERSION" ] || fresh=true
  mkdir -p "$STACK_DIR/pgdata" "$STACK_DIR/pgsock" "$STACK_DIR/pglog"
  if [ "$(id -u)" = "0" ]; then
    chown -R postgres:postgres "$STACK_DIR/pgdata" "$STACK_DIR/pgsock" "$STACK_DIR/pglog"
  fi
  if [ "$fresh" = true ]; then
    echo "→ Initialisation de PostgreSQL"
    as_postgres "$PG_BIN/initdb" -D "$STACK_DIR/pgdata" -U postgres --auth=trust -E UTF8 >/dev/null
  fi
  as_postgres "$PG_BIN/pg_ctl" -D "$STACK_DIR/pgdata" -l "$STACK_DIR/pglog/postgres.log" \
    -o "-p $PG_PORT -k $STACK_DIR/pgsock -c listen_addresses=127.0.0.1" -w start >/dev/null

  local admin="postgresql://postgres@127.0.0.1:$PG_PORT/postgres"
  local db="postgresql://postgres@127.0.0.1:$PG_PORT/$DB_NAME"

  echo "→ Base neuve $DB_NAME"
  psql "$admin" -q -v ON_ERROR_STOP=1 \
    -c "drop database if exists $DB_NAME with (force);" \
    -c "create database $DB_NAME;"
  psql "$db" -q -v ON_ERROR_STOP=1 -f "$HERE/bootstrap.sql"

  # --- GoTrue : ses propres migrations d'abord (schema auth) ---------------
  export GOTRUE_DB_DRIVER=postgres
  export DATABASE_URL="postgres://supabase_auth_admin:auth-admin-e2e@127.0.0.1:$PG_PORT/$DB_NAME"
  export GOTRUE_DB_MIGRATIONS_PATH="$STACK_DIR/gotrue/migrations"
  export GOTRUE_JWT_SECRET="$secret"
  export GOTRUE_JWT_EXP=3600
  export GOTRUE_JWT_AUD=authenticated
  export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
  export GOTRUE_JWT_ADMIN_ROLES=service_role
  export GOTRUE_SITE_URL="http://127.0.0.1:3100"
  export API_EXTERNAL_URL="http://127.0.0.1:$GATEWAY_PORT/auth/v1"
  export GOTRUE_API_HOST=127.0.0.1
  export PORT=$AUTH_PORT
  export GOTRUE_MAILER_AUTOCONFIRM=true
  export GOTRUE_EXTERNAL_EMAIL_ENABLED=true
  export GOTRUE_DISABLE_SIGNUP=false
  export GOTRUE_RATE_LIMIT_EMAIL_SENT=1000
  export GOTRUE_LOG_LEVEL=warn
  "$STACK_DIR/gotrue/auth" migrate > "$STACK_DIR/gotrue-migrate.log" 2>&1

  # --- Migrations StaX -------------------------------------------------------
  echo "→ Migrations StaX"
  "$ROOT/scripts/db-apply.sh" "$db" > "$STACK_DIR/migrations.log"

  # --- Services --------------------------------------------------------------
  nohup "$STACK_DIR/gotrue/auth" serve > "$STACK_DIR/gotrue.log" 2>&1 &
  echo $! > "$STACK_DIR/gotrue.pid"

  PGRST_DB_URI="postgres://authenticator:authenticator-e2e@127.0.0.1:$PG_PORT/$DB_NAME" \
  PGRST_DB_SCHEMAS=public \
  PGRST_DB_EXTRA_SEARCH_PATH=public,extensions \
  PGRST_DB_ANON_ROLE=anon \
  PGRST_JWT_SECRET="$secret" \
  PGRST_SERVER_HOST=127.0.0.1 \
  PGRST_SERVER_PORT=$REST_PORT \
  PGRST_LOG_LEVEL=error \
    nohup "$STACK_DIR/bin/postgrest" > "$STACK_DIR/postgrest.log" 2>&1 &
  echo $! > "$STACK_DIR/postgrest.pid"

  mkdir -p "$STACK_DIR/storage"
  GATEWAY_PORT=$GATEWAY_PORT POSTGREST_PORT=$REST_PORT GOTRUE_PORT=$AUTH_PORT \
  JWT_SECRET="$secret" STORAGE_DIR="$STACK_DIR/storage" DATABASE_URL="$db" \
    nohup node "$HERE/gateway.mjs" serve > "$STACK_DIR/gateway.log" 2>&1 &
  echo $! > "$STACK_DIR/gateway.pid"

  PROVIDERS_PORT=$PROVIDERS_PORT nohup node "$HERE/providers.mjs" serve > "$STACK_DIR/providers.log" 2>&1 &
  echo $! > "$STACK_DIR/providers.pid"

  wait_http "http://127.0.0.1:$AUTH_PORT/health" gotrue
  wait_http "http://127.0.0.1:$REST_PORT/" postgrest
  wait_http "http://127.0.0.1:$GATEWAY_PORT/health" gateway
  wait_http "http://127.0.0.1:$PROVIDERS_PORT/health" providers

  # --- Variables pour la plateforme, le moteur des sites et les tests ----------
  local keys anon service
  keys="$(node "$HERE/gateway.mjs" keys "$secret")"
  anon="$(printf '%s\n' "$keys" | sed -n 's/^ANON_KEY=//p')"
  service="$(printf '%s\n' "$keys" | sed -n 's/^SERVICE_KEY=//p')"

  cat > "$STACK_DIR/env" <<EOF
STAX_E2E_DATABASE_URL=$db
SUPABASE_URL=http://127.0.0.1:$GATEWAY_PORT
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$GATEWAY_PORT
SUPABASE_ANON_KEY=$anon
NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon
SUPABASE_SERVICE_ROLE_KEY=$service
SUPABASE_JWT_SECRET=$secret
STAX_E2E_PROVIDERS_URL=http://127.0.0.1:$PROVIDERS_PORT
GITHUB_API_BASE_URL=http://127.0.0.1:$PROVIDERS_PORT/github
GITHUB_APP_ID=424242
GITHUB_APP_SLUG=stax-sites-e2e
$(node "$HERE/providers.mjs" keys)
GITHUB_APP_WEBHOOK_SECRET=$(head -c 24 /dev/urandom | base64 | tr -d '\n=/+')
CLOUDFLARE_API_BASE_URL=http://127.0.0.1:$PROVIDERS_PORT/cloudflare/client/v4
CLOUDFLARE_API_TOKEN=cf-e2e-$(head -c 12 /dev/urandom | base64 | tr -d '\n=/+')
CLOUDFLARE_SITES_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT
CLOUDFLARE_WEBHOOK_SECRET=$(head -c 24 /dev/urandom | base64 | tr -d '\n=/+')
CRON_SECRET=$(head -c 24 /dev/urandom | base64 | tr -d '\n=/+')
EOF
  echo "✓ Pile prete. Variables : $STACK_DIR/env"
}

case "${1:-}" in
  start) start_all ;;
  stop) stop_all; echo "Pile arretee." ;;
  env) cat "$STACK_DIR/env" ;;
  *) echo "Usage : $0 start|stop|env" >&2; exit 1 ;;
esac

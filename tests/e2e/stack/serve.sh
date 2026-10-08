#!/usr/bin/env bash
#
# Demarre la plateforme (build de production) et le moteur des sites clients
# contre la pile locale. A lancer apres `stack.sh start` et `pnpm build:platform`.
#
#   plateforme      http://127.0.0.1:3100
#   sites clients   http://127.0.0.1:3101   (nom d'hote *.sites.nemasus.test)
#
# Usage : tests/e2e/stack/serve.sh platform|sites
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STACK_DIR="${NEMASUS_E2E_STACK_DIR:-$ROOT/.e2e-stack}"
set -a
# shellcheck disable=SC1091
. "$STACK_DIR/env"
set +a

export NEMASUS_ENV=test
export NEXT_PUBLIC_PLATFORM_URL=http://127.0.0.1:3100
# Lu a l'execution (le pont d'apercu, les liens des e-mails), quel que soit
# l'environnement du build.
export PLATFORM_URL=http://127.0.0.1:3100
export NEXT_PUBLIC_SITES_DOMAIN=sites.nemasus.test
export SITES_DOMAIN=sites.nemasus.test
export SITES_PUBLIC_SCHEME=http
export SITES_PUBLIC_PORT=3101
# Secret jetable, propre a la pile locale : il signe les jetons anti-CSRF.
export NEMASUS_SECRET_KEY="${NEMASUS_SECRET_KEY:-$(cat "$STACK_DIR/jwt-secret")-nemasus-e2e-secret}"
# Coordonnees bancaires FICTIVES (IBAN de test au format valide) : elles
# n'apparaissent que dans les e-mails de modalites de la pile locale.
export BANK_TRANSFER_HOLDER="${BANK_TRANSFER_HOLDER:-Nemasus (pile de test)}"
export BANK_TRANSFER_IBAN="${BANK_TRANSFER_IBAN:-FR7630006000011234567890189}"
export BANK_TRANSFER_BIC="${BANK_TRANSFER_BIC:-AGRIFRPP}"
# Stripe (encaissements des boutiques clientes, Connect) n'est jamais joint
# depuis la pile locale : valeur jetable, sans aucun droit.
export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_nemasus_e2e_local_only}"

case "${1:-}" in
  platform)
    cd "$ROOT/apps/platform"
    exec npx next start -p 3100 -H 127.0.0.1
    ;;
  sites)
    cd "$ROOT/apps/site-runtime"
    exec npx wrangler dev --port 3101 --ip 127.0.0.1 \
      --var "NEMASUS_ENV:test" \
      --var "SUPABASE_URL:$SUPABASE_URL" \
      --var "SUPABASE_ANON_KEY:$SUPABASE_ANON_KEY" \
      --var "SUPABASE_SERVICE_ROLE_KEY:$SUPABASE_SERVICE_ROLE_KEY" \
      --var "NEXT_PUBLIC_SUPABASE_URL:$SUPABASE_URL" \
      --var "NEXT_PUBLIC_SUPABASE_ANON_KEY:$SUPABASE_ANON_KEY" \
      --var "NEXT_PUBLIC_PLATFORM_URL:$NEXT_PUBLIC_PLATFORM_URL" \
      --var "NEXT_PUBLIC_SITES_DOMAIN:$NEXT_PUBLIC_SITES_DOMAIN" \
      --var "NEMASUS_SECRET_KEY:$NEMASUS_SECRET_KEY"
    ;;
  *)
    echo "Usage : $0 platform|sites" >&2
    exit 1
    ;;
esac

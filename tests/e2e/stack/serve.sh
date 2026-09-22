#!/usr/bin/env bash
#
# Demarre la plateforme (build de production) et le moteur des sites clients
# contre la pile locale. A lancer apres `stack.sh start` et `pnpm build`.
#
#   plateforme      http://127.0.0.1:3100
#   sites clients   http://127.0.0.1:3101   (nom d'hote *.sites.stax.test)
#
# Usage : tests/e2e/stack/serve.sh platform|sites
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STACK_DIR="${STAX_E2E_STACK_DIR:-$ROOT/.e2e-stack}"
set -a
# shellcheck disable=SC1091
. "$STACK_DIR/env"
set +a

export STAX_ENV=test
export NEXT_PUBLIC_PLATFORM_URL=http://127.0.0.1:3100
export NEXT_PUBLIC_SITES_DOMAIN=sites.stax.test
export SITES_DOMAIN=sites.stax.test
export SITES_PUBLIC_SCHEME=http
export SITES_PUBLIC_PORT=3101
# Secret jetable, propre a la pile locale : il signe les jetons anti-CSRF.
export STAX_SECRET_KEY="${STAX_SECRET_KEY:-$(cat "$STACK_DIR/jwt-secret")-stax-e2e-secret}"
# Stripe n'est jamais joint depuis la pile locale. Ces valeurs jetables
# permettent seulement de VERIFIER la signature d'un webhook que les tests
# signent eux-memes (meme derivation que tests/e2e/journeys/support/stack.ts) :
# c'est le vrai chemin « paiement recu -> site prepare », sans le reseau.
export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_stax_e2e_local_only}"
export STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-whsec_$(printf '%s' "$(cat "$STACK_DIR/jwt-secret")-stripe-webhook" | sha256sum | cut -c1-48)}"

case "${1:-}" in
  platform)
    cd "$ROOT/apps/platform"
    exec npx next start -p 3100 -H 127.0.0.1
    ;;
  sites)
    cd "$ROOT/apps/site-runtime"
    exec npx wrangler dev --port 3101 --ip 127.0.0.1 \
      --var "STAX_ENV:test" \
      --var "SUPABASE_URL:$SUPABASE_URL" \
      --var "SUPABASE_ANON_KEY:$SUPABASE_ANON_KEY" \
      --var "SUPABASE_SERVICE_ROLE_KEY:$SUPABASE_SERVICE_ROLE_KEY" \
      --var "NEXT_PUBLIC_SUPABASE_URL:$SUPABASE_URL" \
      --var "NEXT_PUBLIC_SUPABASE_ANON_KEY:$SUPABASE_ANON_KEY" \
      --var "NEXT_PUBLIC_PLATFORM_URL:$NEXT_PUBLIC_PLATFORM_URL" \
      --var "NEXT_PUBLIC_SITES_DOMAIN:$NEXT_PUBLIC_SITES_DOMAIN" \
      --var "STAX_SECRET_KEY:$STAX_SECRET_KEY"
    ;;
  *)
    echo "Usage : $0 platform|sites" >&2
    exit 1
    ;;
esac

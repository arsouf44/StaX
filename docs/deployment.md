# Déploiement

Deux applications, un seul dépôt, un seul pipeline.

| Application | Cible | Rôle |
| --- | --- | --- |
| `apps/platform` | Worker Cloudflare (OpenNext) | Site public, espace client, back-office, API |
| `apps/site-runtime` | Worker Cloudflare | Sert **tous** les sites clients |

---

## Ordre des opérations

L’ordre compte. Une migration appliquée après le déploiement du code laisse une
fenêtre pendant laquelle l’application appelle des fonctions qui n’existent pas
encore.

```
1. Migrations SQL          (les colonnes et fonctions nouvelles arrivent d’abord)
2. Types régénérés         (le build échoue sinon, ce qui est voulu)
3. Build des deux Workers
4. Déploiement de site-runtime
5. Déploiement de platform
6. Vérification            (/status, un site client, un webhook de test)
```

Corollaire : **une migration ne doit jamais supprimer une colonne encore lue par
la version en production**. Suppression en deux temps — on cesse de lire, on
déploie, puis on supprime dans une migration ultérieure.

---

## Première mise en production

### 1. Supabase

```bash
# Projet dans une région européenne
supabase projects create stax-production --region eu-west-3

pnpm db:migrate            # DATABASE_URL pointe vers la production
pnpm db:types
```

Vérifier ensuite :

- RLS active sur toutes les tables multi-tenant ;
- sauvegardes quotidiennes activées ;
- restauration à un instant donné (PITR) activée.

### 2. Secrets Cloudflare

```bash
cd apps/platform
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env production
wrangler secret put STAX_SECRET_KEY           --env production   # openssl rand -base64 48
wrangler secret put STRIPE_SECRET_KEY         --env production
wrangler secret put STRIPE_WEBHOOK_SECRET     --env production
wrangler secret put STRIPE_CONNECT_WEBHOOK_SECRET --env production
wrangler secret put TURNSTILE_SECRET_KEY      --env production

cd ../site-runtime
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env production
wrangler secret put STAX_SECRET_KEY           --env production   # LA MÊME valeur
wrangler secret put TURNSTILE_SECRET_KEY      --env production
```

> `STAX_SECRET_KEY` doit être **identique** dans les deux Workers : elle signe
> les jetons de formulaire émis par le moteur des sites et vérifiés par lui.

### 3. Informations légales

```bash
wrangler secret put LEGAL_COMPANY_NAME --env production
# … et toutes les variables listées dans docs/legal-configuration.md
pnpm legal:check
```

Sans elles, **la production refuse de démarrer**. C’est voulu.

### 4. Déploiement

```bash
pnpm build:cf
pnpm --filter @stax/site-runtime deploy:production
pnpm --filter @stax/platform deploy:production
```

### 5. Compte administrateur

```bash
ADMIN_EMAIL=... \
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
ADMIN_BOOTSTRAP_PASSWORD="$(openssl rand -base64 24)" \
pnpm admin:bootstrap
```

Puis, immédiatement : se connecter, enrôler le second facteur, changer le mot de
passe, retirer `ADMIN_BOOTSTRAP_PASSWORD` de l’environnement.

### 6. Webhooks Stripe

| Point d’entrée | Événements |
| --- | --- |
| `https://…/api/webhooks/stripe` | `checkout.session.*`, `customer.subscription.*`, `invoice.*`, `charge.refunded` |
| `https://…/api/webhooks/stripe-connect` | `account.updated`, `payment_intent.succeeded`, `charge.refunded` |

Le second doit être créé en mode **Connect**.

---

## Vérification après déploiement

```bash
curl -sS https://stax.fr/status            # page d’état
curl -sS https://stax.fr/robots.txt        # doit autoriser en production
curl -sSI https://stax.fr | grep -i content-security-policy
```

Dans l’interface :

- ouvrir un site client publié, vérifier son certificat et son contenu ;
- envoyer un message depuis un formulaire public, vérifier qu’il arrive ;
- déclencher un événement de test Stripe et vérifier son statut `processed`
  dans `webhook_events`.

---

## Retour arrière

**Le code.** Les Workers conservent leurs versions précédentes :

```bash
wrangler deployments list --env production
wrangler rollback <deployment-id> --env production
```

**La base.** Il n’y a pas de retour arrière automatique — c’est délibéré : une
migration inverse mal écrite détruit des données. La procédure est décrite dans
[backup-recovery.md](./backup-recovery.md).

**Un site client.** Le retour arrière est instantané et sans risque : l’espace
client permet de repointer vers une version antérieure, chacune étant un
instantané complet et figé.

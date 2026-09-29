# Déploiement

Deux applications, un seul dépôt.

| Application | Cible | Rôle |
| --- | --- | --- |
| `apps/platform` | **Vercel**, région Paris (`cdg1`) — [vercel.md](./vercel.md) | Site public, espace client, back-office, webhooks, tâche de fond |
| `apps/site-runtime` | Worker Cloudflare `nemasus-sites` — [cloudflare.md § 0](./cloudflare.md) | API des sites clients ; sites de l’ancien moteur |

Les **sites clients** ne sont pas déployés ici : chacun a son dépôt GitHub et
son projet Cloudflare, et se déploie par son propre build
([site-delivery.md](./site-delivery.md)). La plateforme doit seulement être
reliée à GitHub (application) et à Cloudflare (jeton d’API) — étapes 7 à 9
ci-dessous, et pas à pas dans [integrations.md](./integrations.md).

---

## Ordre des opérations

L’ordre compte. Une migration appliquée après le déploiement du code laisse une
fenêtre pendant laquelle l’application appelle des fonctions qui n’existent pas
encore.

```
1. Migrations SQL          (les colonnes et fonctions nouvelles arrivent d’abord)
2. Types régénérés         (le build échoue sinon, ce qui est voulu)
3. Build                   (pnpm build : plateforme + Worker des sites)
4. Déploiement de site-runtime (pnpm deploy:sites:production)
5. Déploiement de platform (Vercel, à chaque fusion sur la branche de production)
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
supabase projects create nemasus-production --region eu-west-3

pnpm db:migrate            # DATABASE_URL pointe vers la production
pnpm db:types
```

Vérifier ensuite :

- RLS active sur toutes les tables multi-tenant ;
- sauvegardes : l’offre gratuite n’en fournit pas de téléchargeables ni de
  PITR ; faire un export régulier ([backup-recovery.md](./backup-recovery.md)).

### 2. Variables de la plateforme (Vercel)

*Vercel → projet → Settings → Environment Variables*, environnement
**Production**. La liste complète, avec les symptômes de chaque absence, est
dans [vercel.md § 2](./vercel.md) :

```
NEMASUS_ENV=production
PLATFORM_URL / NEXT_PUBLIC_PLATFORM_URL       https://<domaine>
SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL       https://<ref>.supabase.co
SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY                     (secret)
NEMASUS_SECRET_KEY                            (secret — openssl rand -base64 48)
STRIPE_SECRET_KEY  STRIPE_WEBHOOK_SECRET  STRIPE_CONNECT_WEBHOOK_SECRET
TURNSTILE_SECRET_KEY  NEXT_PUBLIC_TURNSTILE_SITE_KEY
# Sites livrés (étapes 7 à 9, integrations.md)
GITHUB_APP_ID  GITHUB_APP_SLUG  GITHUB_APP_PRIVATE_KEY  GITHUB_APP_WEBHOOK_SECRET
CLOUDFLARE_SITES_API_TOKEN  CLOUDFLARE_SITES_ACCOUNT_ID  CLOUDFLARE_WEBHOOK_SECRET
CRON_SECRET                                   (openssl rand -base64 32)
SITES_DOMAIN
```

Puis les secrets du Worker des sites (Cloudflare) :

```bash
cd apps/site-runtime
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env production
wrangler secret put NEMASUS_SECRET_KEY        --env production   # LA MÊME valeur
wrangler secret put TURNSTILE_SECRET_KEY      --env production
```

> `NEMASUS_SECRET_KEY` doit être **identique** sur Vercel et sur le Worker des
> sites : elle signe les jetons de formulaire émis par l’un et vérifiés par
> l’autre.

### 3. Informations légales

L’identité de LallianSe et de l’hébergeur est dans
`packages/config/src/legal.ts`. Reste à fournir, sur Vercel, `LEGAL_PHONE`
(téléphone de l’éditeur, exigé par la LCEN), puis :

```bash
pnpm legal:check
```

Le Worker des sites clients nomme Nemasus comme **hébergeur** de chaque site
client (article 6 III de la LCEN) : les mêmes valeurs par défaut s’y
appliquent, et `LEGAL_PHONE` doit y être posé aussi :

```bash
cd apps/site-runtime
wrangler secret put LEGAL_PHONE --env production
```

Les polices des sites clients sont servies par le Worker lui-même
(`/_nemasus/fonts/`, configuration `assets` de `wrangler.jsonc`) : aucun visiteur
n’est jamais envoyé vers Google Fonts.

### 4. Déploiement

```bash
pnpm build
pnpm deploy:sites:production     # Worker des sites (Cloudflare)
```

La plateforme est déployée par Vercel à chaque fusion sur la branche de
production ; un aperçu est construit pour chaque autre branche.

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

Le second doit être créé en mode **Connect**. L’abonnement mensuel de
maintenance n’est pas créé au paiement de la commande mais **à la livraison**
du site ([stripe.md](./stripe.md)). Pour un site **proposé après un appel**, le
webhook livre le site aussitôt le paiement confirmé : l’abonnement démarre donc
le même jour ([vente-par-telephone.md](./vente-par-telephone.md)).

### 6 bis. E-mails et authentification

- `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` : e-mails de Nemasus
  (propositions, livraison, réponses de l’équipe, alertes) ;
- `SUPPORT_EMAIL` : reçoit aussi **toutes les alertes de l’équipe** (à défaut
  `ADMIN_EMAIL`) ;
- Supabase → Authentication : SMTP personnalisé, *Site URL* et *Redirect URLs*
  = `https://<domaine>/auth/confirmation` ([supabase.md](./supabase.md)).

Pas à pas complet : [LANCEMENT.md](./LANCEMENT.md).

### 7. Application GitHub

Créer l’application (permissions *Contents: Read & write*, *Metadata: Read*,
webhook `https://…/api/webhooks/github`), générer sa clé privée, l’installer
sur le compte qui héberge les dépôts des sites. Pas à pas :
[github-integration.md](./github-integration.md).

| Variable | Secret | Contenu |
| --- | --- | --- |
| `GITHUB_APP_ID` | non | identifiant numérique |
| `GITHUB_APP_SLUG` | non | nom court (lien d’installation) |
| `GITHUB_APP_PRIVATE_KEY` | **oui** | clé PEM (`\n` ou base64) |
| `GITHUB_APP_WEBHOOK_SECRET` | **oui** | 16 caractères au moins |

### 8. Cloudflare (projets des sites)

Jeton **limité au compte des sites** : *Cloudflare Pages: Edit*, *Workers
Scripts: Read*, *Workers Builds Configuration: Edit*. Destination webhook
`https://…/api/webhooks/cloudflare` avec un secret, et notifications de
déploiement Pages / Workers Builds. Détails : [cloudflare.md](./cloudflare.md).

| Variable | Secret | Contenu |
| --- | --- | --- |
| `CLOUDFLARE_SITES_API_TOKEN` | **oui** | jeton ci-dessus (à défaut `CLOUDFLARE_API_TOKEN`) |
| `CLOUDFLARE_SITES_ACCOUNT_ID` | non | compte proposé par défaut à l’équipe |
| `CLOUDFLARE_WEBHOOK_SECRET` | **oui** | secret de la destination webhook |

### 9. Tâche de fond

`GET /api/cron/sites`, **toutes les 5 minutes**, avec
`Authorization: Bearer <CRON_SECRET>` : publications programmées, suivi des
déploiements, délai de 45 minutes, aperçus, surveillance HTTPS des sites
livrés. Sans secret valide, la route répond **401**.

**Qui l’appelle.** **Supabase** : `pg_cron` exécute
`app.trigger_site_operations()` toutes les 5 minutes (migrations 0053 et
0057), qui appelle la route avec `pg_net`. L’adresse de la
plateforme et le secret sont lus dans Supabase Vault ; tant qu’ils sont
absents, rien n’est envoyé. À faire une fois, dans l’éditeur SQL de Supabase,
avec **la même valeur** que la variable `CRON_SECRET` de Vercel :

```sql
select vault.create_secret('https://votre-domaine.fr', 'nemasus_platform_url');
select vault.create_secret('<valeur de CRON_SECRET>', 'nemasus_cron_secret');
```

Pour changer une valeur : `select vault.update_secret(id, 'nouvelle valeur')`
(l’`id` se lit dans `vault.secrets`). Pour vérifier les appels :
`select status_code, created from net._http_response order by created desc limit 5;`
(200 attendu). En complément, Vercel Cron appelle la même route une fois par
jour (`apps/platform/vercel.json`, 4 h UTC).

Vérifier ensuite *Administration → Santé* : l’application GitHub, l’API
Cloudflare des sites et les tâches de fond ne doivent plus figurer parmi les
fonctions non configurées.

---

## Vérification après déploiement

```bash
curl -sS https://nemasus.fr/status            # page d’état
curl -sS https://nemasus.fr/robots.txt        # doit autoriser en production
curl -sSI https://nemasus.fr | grep -i content-security-policy
```

Dans l’interface :

- ouvrir un site client livré, vérifier son certificat et son contenu ;
- *Administration → Site → Infrastructure & livraison* : dépôt et projet
  « synchronisés », dernier déploiement de production « réussi » ;
- envoyer un webhook de test depuis GitHub (*Recent Deliveries → Redeliver*)
  et vérifier la réponse 200 ;
- envoyer un message depuis un formulaire public, vérifier qu’il arrive ;
- déclencher un événement de test Stripe et vérifier son statut `processed`
  dans `webhook_events`.

---

## Retour arrière

**Le code.** Vercel conserve chaque déploiement : *Deployments → (un
déploiement précédent) → ⋯ → Promote to Production* (ou `vercel rollback`).
Le Worker des sites garde lui aussi ses versions :

```bash
cd apps/site-runtime
wrangler deployments list --env production
wrangler rollback <deployment-id> --env production
```

**La base.** Il n’y a pas de retour arrière automatique — c’est délibéré : une
migration inverse mal écrite détruit des données. La procédure est décrite dans
[backup-recovery.md](./backup-recovery.md).

**Un site client.** Depuis *Mon site → Versions*, **Restaurer** une version
crée une nouvelle version avec l’ancien contenu, l’écrit dans le dépôt et la
redéploie réellement ; elle n’est affichée « en ligne » qu’une fois le
déploiement confirmé. En cas d’échec, la version en ligne ne change pas. Un
retour arrière du **code** d’un site (hors contenu) se fait dans son dépôt,
par l’équipe, comme pour tout projet.

# Cloudflare

Tout Nemasus tourne sur Cloudflare : la plateforme (site public, espace
client, administration), l’API des sites et chaque site client. La base est
chez Supabase, les paiements chez Stripe, le code sur GitHub.

## 0. Mettre la plateforme en ligne (Workers Builds)

Le Worker de la plateforme est construit et déployé par **Workers Builds**,
relié au dépôt GitHub. Réglages, dans *Workers & Pages → (le Worker) →
Settings → Build* :

| Réglage | Valeur |
| --- | --- |
| Dépôt, branche de production | ce dépôt, `main` |
| Root directory | `/` (la racine du dépôt) |
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` |
| Version command (autres branches) | `npx wrangler versions upload` |

`pnpm run build` produit le Worker avec OpenNext (`apps/platform/.open-next`)
et `npx wrangler deploy` le publie d’après [`wrangler.jsonc`](../wrangler.jsonc)
**à la racine** du dépôt. Aucune variable n’est nécessaire au build : la
configuration est lue à l’exécution.

**Nom du Worker.** Le fichier le nomme `nemasus`. Si le Worker s’appelle
encore `stax` dans Cloudflare, le build le signale (« Failed to match Worker
name ») mais déploie quand même sur `stax` ; renommez-le en `nemasus`
(*Settings → General → Name*) pour faire disparaître l’avertissement — les
domaines rattachés suivent.

**Offre Workers Paid obligatoire** (5 $/mois, *Workers & Pages → Plans*) : le
Worker compressé pèse environ 4,1 Mo, au-delà de la limite de 3 Mo de l’offre
gratuite, et une page rendue dépasse les 10 ms de calcul qu’elle accorde.

### Variables et secrets du Worker

*Settings → Variables and Secrets*. Les valeurs publiques (URL du projet
Supabase et sa clé « anon », `NEMASUS_ENV=production`) sont déjà dans
`wrangler.jsonc`, et l’identité légale dans `packages/config/src/legal.ts`.
Les variables posées ici survivent aux déploiements (`keep_vars`).

**Secrets (type « Secret ») — sans eux, la plateforme ne fonctionne pas :**

```
SUPABASE_SERVICE_ROLE_KEY   Supabase → Project Settings → API keys (clé secrète)
NEMASUS_SECRET_KEY          openssl rand -base64 48 — ou la valeur de l’ancienne
                            STAX_SECRET_KEY si elle existait déjà (les deux noms sont lus)
```

**Adresse publique (type « Text ») :**

```
PLATFORM_URL        https://<domaine de la plateforme>, sans / final
SITES_DOMAIN        domaine parent des adresses temporaires des sites, ex. sites.nemasus.fr
```

Tant que `PLATFORM_URL` manque, les pages prennent l’adresse par laquelle le
Worker est appelé (`https://stax.<compte>.workers.dev`, puis votre domaine) pour
leurs URL canoniques, le plan du site et les retours de paiement. Les e-mails
envoyés hors d’une visite (tâches planifiées) exigent, eux, `PLATFORM_URL`.

Les **aperçus** de branche (`wrangler versions upload`) peuvent ne recevoir
aucune de ces variables : le catalogue y apparaît « momentanément
indisponible ». Vérifiez le site sur l’adresse de production, pas sur un aperçu.

**Selon les fonctions** (chaque fonction non configurée se déclare
indisponible au lieu d’échouer ; `/admin/sante` liste ce qui manque) :

```
STRIPE_SECRET_KEY  STRIPE_WEBHOOK_SECRET          (Secret)  paiements
STRIPE_CONNECT_WEBHOOK_SECRET  STRIPE_CONNECT_CLIENT_ID     encaissements des clients
EMAIL_PROVIDER=resend  EMAIL_API_KEY (Secret)  EMAIL_FROM=Nemasus <…>  EMAIL_REPLY_TO
NEXT_PUBLIC_TURNSTILE_SITE_KEY  TURNSTILE_SECRET_KEY (Secret)  anti-robot des formulaires
GITHUB_APP_ID  GITHUB_APP_SLUG  GITHUB_APP_PRIVATE_KEY (Secret)  GITHUB_APP_WEBHOOK_SECRET (Secret)
CLOUDFLARE_SITES_API_TOKEN (Secret)  CLOUDFLARE_SITES_ACCOUNT_ID  CLOUDFLARE_WEBHOOK_SECRET (Secret)
CRON_SECRET (Secret)
```

### Domaine

*Settings → Domains & Routes → Add → Custom domain* : le domaine de la
plateforme (par exemple `nemasus.fr`), s’il est géré par Cloudflare. Mettez
ensuite la même adresse dans `PLATFORM_URL`, dans Supabase
(*Authentication → URL Configuration*) et dans les webhooks Stripe
(`https://<domaine>/api/webhooks/stripe`).

### Vérifier après chaque déploiement

```
/tarifs              les offres s’affichent avec leurs prix
/mentions-legales    aucun marqueur « [A CONFIGURER — … ] »
/inscription         créer un compte de test
/admin/sante         ce qui manque encore, en clair
```

Journaux : *Workers & Pages → nemasus → Logs* (activés par `observability`).

### L’API des sites : un second Worker

`apps/site-runtime` (formulaires, réservations, boutique, comptes des sites
clients ; sites de l’ancien moteur) est un Worker distinct, `nemasus-sites`.
Créez un second projet Workers Builds sur le même dépôt :

| Réglage | Valeur |
| --- | --- |
| Root directory | `/` |
| Build command | *(vide)* |
| Deploy command | `npx wrangler deploy -c apps/site-runtime/wrangler.jsonc --env production` |

avec les mêmes secrets Supabase et `NEMASUS_SECRET_KEY`. Il n’est utile que
lorsque des sites livrés utilisent ces fonctions.

---

Cloudflare joue deux rôles, à ne pas confondre :

1. **Chaque site client a son propre projet Cloudflare** (Pages, ou Worker
   avec Workers Builds), relié à **son** dépôt GitHub. C’est ce projet qui
   construit et sert le site. Nemasus ne déploie pas à sa place : il **lit l’état
   réel** des déploiements pour savoir, sans le supposer, si une version est
   en ligne.
2. **Nemasus a ses propres Workers** : la plateforme (`nemasus`, § 0) et
   `apps/site-runtime`, qui porte l’API des sites et l’ancien moteur.

Code : `packages/infrastructure/src/cloudflare-sites.ts` (client API),
`apps/platform/src/app/api/webhooks/cloudflare/route.ts` (notifications),
`apps/platform/src/lib/external-sites/publisher.ts` (suivi des versions).

---

## 1. Le projet Cloudflare d’un site

Créé par l’équipe au moment du développement, comme pour n’importe quel
projet web :

- **Pages** : *Workers & Pages → Create → Pages → Connect to Git*, dépôt du
  site, branche de production (souvent `main`), commande de build du
  framework. Les aperçus sont construits sur les autres branches, dont
  `nemasus-preview`.
- **Worker + Workers Builds** : *Workers & Pages → Create → Import a
  repository*. Relever l’identifiant du déclencheur de build si l’équipe veut
  pouvoir relancer un build depuis Nemasus.

Le domaine du client est ajouté **au projet** (Pages : Nemasus peut le faire
depuis *Infrastructure & livraison* ; Worker : domaine personnalisé ajouté
dans Cloudflare puis vérifié par Nemasus). Le client pointe son DNS vers
l’adresse du projet (`<projet>.pages.dev`, ou la cible indiquée par
Cloudflare) ; Nemasus relit l’état du domaine et du certificat auprès de
Cloudflare (`site_domains.status` : `pending` → `verifying` → `active`), puis
vérifie lui-même la réponse HTTPS avant la livraison.

### Rattachement dans Nemasus

*Administration → Site → Infrastructure & livraison → Hébergement* : compte
Cloudflare, nom du projet. Nemasus **lit le projet chez Cloudflare** (existence,
branche de production, URL, dernier déploiement) avant de l’enregistrer
(`app.connect_site_hosting`, réservé à l’équipe, audité). Un projet ne sert
qu’un site.

## 2. Jeton d’API (serveur uniquement)

`CLOUDFLARE_SITES_API_TOKEN` (à défaut `CLOUDFLARE_API_TOKEN`), créé dans
*My Profile → API Tokens → Create Custom Token*, **limité au compte qui
héberge les sites** :

| Permission | Niveau | Pourquoi |
| --- | --- | --- |
| Account → Cloudflare Pages | Edit | lire projets et déploiements, relancer un déploiement, ajouter un domaine |
| Account → Workers Scripts | Read | lire l’étiquette d’un Worker de site |
| Account → Workers Builds Configuration | Edit | lire les builds, relancer un build (sites servis par un Worker) |

Aucune permission de zone DNS, de facturation ou de membres. Le jeton ne
quitte jamais le serveur : ni `NEXT_PUBLIC_`, ni base de données, ni
navigateur (vérifié par `tests/security/external-sites.test.ts`).

`CLOUDFLARE_SITES_ACCOUNT_ID` : compte proposé par défaut à l’équipe (non
secret). `CLOUDFLARE_API_BASE_URL` : facultatif (tests).

## 3. Ce que Nemasus lit

| Donnée | Source | Usage |
| --- | --- | --- |
| Déploiements de production (commit, état, étape, erreur, URL) | Pages : `…/pages/projects/<p>/deployments` ; Workers : builds | passer une version à `published` ou `failed` |
| Déploiements d’aperçu (branche `nemasus-preview`) | idem | afficher l’aperçu réel dans l’éditeur |
| Journal d’un déploiement échoué | `…/deployments/<id>/history/logs` | message clair à l’équipe |
| Domaines du projet | `…/pages/projects/<p>/domains` | état du domaine et du certificat |

Correspondance des états : `queued`, `building`, `deploying`, `success`,
`failure`, `canceled`, `skipped`. Une version n’est **publiée** que si le
déploiement de production **de son commit exact** est `success`
(`app.record_site_deployment`). Sans confirmation sous 45 minutes, elle passe
en échec (étape `timeout`) ; une confirmation plus tardive la rétablit si
rien de plus récent n’a été publié.

Le suivi est déclenché par trois voies, toutes idempotentes :

1. l’éditeur du client, qui interroge l’état toutes les 4 secondes pendant
   une publication ;
2. le **webhook** Cloudflare (ci-dessous) ;
3. la tâche de fond `/api/cron/sites`, toutes les 5 minutes.

## 4. Notifications (webhook)

*Notifications → Destinations → Webhooks* : URL
`https://<plateforme>/api/webhooks/cloudflare`, **secret** de 16 caractères ou
plus → `CLOUDFLARE_WEBHOOK_SECRET`. Puis une notification *Pages : Deployment
status* (et/ou *Workers Builds*) vers cette destination.

- Cloudflare transmet le secret dans l’en-tête `cf-webhook-auth` : comparé à
  temps constant, **401** sinon, sans lire le corps.
- La notification n’est qu’un **signal** : Nemasus relit les déploiements du
  projet auprès de l’API. Une notification forgée, même avec le bon secret, ne
  peut pas faire passer une version pour publiée.

Sans webhook, le suivi fonctionne quand même (éditeur, tâche de fond), un peu
moins vite.

## 5. Relancer un déploiement

*Infrastructure & livraison → Déploiements → Relancer* : Pages rejoue le
déploiement (`retry`) ; Workers relance le déclencheur de build. L’action est
réservée à l’équipe et auditée. Le client, lui, **republie** une version
depuis son historique : cela crée une nouvelle version et un nouveau commit.

---

## 6. Les Workers de Nemasus

| Worker | Nom | Sert |
| --- | --- | --- |
| `apps/platform` | `nemasus` (déployé par Workers Builds, `wrangler.jsonc` à la racine) | le domaine de la plateforme, par exemple `nemasus.fr` |
| `apps/site-runtime` | `nemasus-sites` | API des sites ; sites de l’ancien moteur (`*.sites.nemasus.fr`, domaines rattachés) |

`compatibility_date` : `2026-09-01`. Indicateurs : `nodejs_compat`,
`global_fetch_strictly_public`. Ce dernier interdit à un Worker d’atteindre
des adresses internes : une défense contre la falsification de requête côté
serveur (SSRF).

### API des sites

`https://<api>/v1/sites/<clé publique>/…` : `collect` (mesure d’audience sans
cookie), `forms/<slug>`, `catalog`, `bookings/services`, `bookings/slots`,
`bookings`, `checkout`, `customers/login`, `customers/session`,
`customers/me`. Les écritures exigent une origine appartenant au site (ses
domaines, son projet, ses aperçus) ; la base vérifie les droits de l’offre à
chaque opération. Le **rendu** d’un site ne dépend jamais de cette API.

### Ancien moteur

Les sites construits avant le modèle actuel (`architecture = 'legacy_engine'`)
restent servis par `nemasus-sites`, tenant résolu par le nom d’hôte :

```
*.sites.nemasus.fr             → nemasus-sites
preview.sites.nemasus.fr       → nemasus-sites   (aperçus privés, jamais indexés)
<domaine rattaché>          → nemasus-sites   (Cloudflare for SaaS)
```

| Ressource | Politique de cache |
| --- | --- |
| Page publiée | `s-maxage=60, stale-while-revalidate=600` |
| Aperçu privé, espace client, API | `no-store` |
| Ressource versionnée par empreinte | `immutable`, un an |

À la publication d’un site de l’ancien moteur, la plateforme purge ses pages
(`packages/infrastructure/src/cache-purge.ts`, jeton **Zone → Cache Purge**,
`CLOUDFLARE_SITES_ZONE_ID`) ; sans jeton, la purge est sautée et la nouvelle
version apparaît à l’expiration du cache (une minute).

---

## Ce que Cloudflare ne fait pas ici

- **Pas de déploiement déclenché « à l’aveugle ».** Nemasus écrit un commit ;
  c’est l’intégration Git du projet qui construit. Nemasus n’envoie jamais de
  fichiers de build directement.
- **Pas de Workers KV pour les données de Nemasus.** La source de vérité est
  PostgreSQL.
- **Pas de R2 pour la médiathèque.** Elle est dans Supabase Storage ; les
  images publiées sont copiées **dans le dépôt du site** et servies par son
  projet.

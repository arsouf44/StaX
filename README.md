# Nemasus

**Nous créons votre site. Vous le gérez ensuite.**

Nemasus vend, fait réaliser, livre et fait gérer des sites web professionnels.
Une entreprise commande son site en ligne (aucun prix public), règle par
virement le montant convenu, reçoit un **code d’accès personnel** qui ouvre son
espace, et présente son activité ; l’équipe
**conçoit et développe son site individuellement, hors de Nemasus** — dans son
propre dépôt GitHub, déployé par son propre projet Cloudflare, sur son
domaine. Le site est vérifié, rattaché à Nemasus, puis **livré** : le client
modifie alors lui-même son contenu (textes, photos, horaires, pages déclarées
modifiables) et publie ; chaque publication est un vrai commit, un vrai
déploiement, et n’est annoncée « en ligne » qu’une fois confirmée.

Nemasus n’est **pas** un générateur de sites : aucun modèle, aucune structure
choisie par le métier ou un questionnaire.

```
COMMANDE → MODALITÉS DE VIREMENT → VIREMENT REÇU → CODE D’ACCÈS → ESPACE CLIENT
→ DÉVELOPPEMENT HORS DE NEMASUS → GITHUB → CLOUDFLARE → VÉRIFICATIONS
→ RATTACHEMENT À NEMASUS → LIVRAISON → BROUILLON DU CLIENT → PUBLIER
→ COMMIT GITHUB → DÉPLOIEMENT CLOUDFLARE → EN LIGNE
```

Deuxième façon de vendre, **par téléphone** : après un appel concluant, le
site est construit et vérifié, puis proposé au prospect par e-mail avec un code
personnel (14 jours). Il crée son compte, voit son site, écrit à l’équipe s’il
le souhaite, paie — et le site lui est livré automatiquement. Voir
[vente-par-telephone.md](./docs/vente-par-telephone.md).

> **Nemasus s’appelait StaX.** Tout a été renommé — marque, paquets
> `@nemasus/*`, variables `NEMASUS_*`, contrat `nemasus.manifest.json`,
> textes stockés en base (migration 0057). Restent volontairement sous
> l’ancien nom, parce qu’ils sont gravés dans les migrations déjà appliquées ou
> dans les lignes de la base, et jamais montrés aux clients : les valeurs
> internes `'stax'` (auteur « équipe »), `stax_purchase`, `stax_publish`,
> `stax_preview`…, les colonnes `last_stax_commit_sha`, `purchased_by_stax`,
> `dns_managed_by_stax`, le paramètre `stax.retention_purge` et le slug interne
> `stax-plateforme`. Une variable encore nommée `STAX_*` (par exemple
> `STAX_SECRET_KEY`) reste lue tant que `NEMASUS_*` n’est pas
> définie : rien ne casse au renommage.

> **Avant le premier client :** [docs/LANCEMENT.md](./docs/LANCEMENT.md) liste,
> dans l’ordre, ce qu’il reste à configurer (base, identité légale, e-mails
> Resend, coordonnées bancaires, GitHub, Cloudflare) et la répétition générale.

---

## Ce que le produit fait réellement

| Capacité                                                            | État | Où c’est implémenté                                              |
| ------------------------------------------------------------------- | ---- | ---------------------------------------------------------------- |
| Commande en ligne **sans aucun prix affiché** ni compte à créer     | ✅   | `apps/platform/src/app/(commande)`, `app.submit_site_order`      |
| Modalités de **virement** envoyées par l’équipe (montant convenu)   | ✅   | `/admin/commandes`, `app.request_site_order_payment`             |
| Virement reçu → espace créé + **code d’accès** personnel par e-mail | ✅   | `app.confirm_site_order_payment`, `activation_codes` (HMAC)      |
| Accès par code, vérifié **côté serveur**, session ouverte par lui   | ✅   | `/acces`, `lib/access-code.ts`, `app.check_access_code`          |
| Mot de passe oublié par **Resend** (jeton haché, 1 h, usage unique) | ✅   | `/mot-de-passe-oublie`, `lib/password-reset.ts`                  |
| Suivi du projet par le client (7 étapes, validations)               | ✅   | `/app`, `app.set_project_phase`, `app.respond_to_project_review` |
| Aucune édition avant la livraison (imposé par la base)              | ✅   | `app.site_content_access`                                        |
| Rattacher un dépôt GitHub et un projet Cloudflare                   | ✅   | application GitHub, `admin/sites/[id]/livraison`                 |
| Contrat d’édition `nemasus.manifest.json`                           | ✅   | `packages/site-contract`                                         |
| Checklist de livraison, livraison auditée                           | ✅   | `app.delivery_readiness`, `app.deliver_site`                     |
| Éditeur du client généré depuis le contrat, aperçu réel             | ✅   | `apps/platform/src/app/app/editeur/contract`                     |
| Publier : commit GitHub + déploiement Cloudflare suivi              | ✅   | `lib/external-sites/publisher.ts`, `app.record_site_deployment`  |
| Historique, Voir, Restaurer (redéploiement réel), Republier         | ✅   | `/app/site/versions`, `site_releases`                            |
| Webhooks GitHub, Cloudflare, Stripe Connect signés ; tâche de fond  | ✅   | `api/webhooks/*`, `api/cron/sites`                               |
| Surveillance HTTPS des sites livrés                                 | ✅   | `site_health_checks`                                             |
| Statistiques réelles (visiteurs, sources, appareils, contacts)      | ✅   | `app.rollup_site_metrics` (horaire), `/app/statistiques`         |
| Mesure d’audience des sites indépendants en une ligne               | ✅   | `/v1/sites/<clé>/mesure.js`, sans cookie                         |
| Bilan de santé : disponibilité 30 jours, bilan qualité hebdo        | ✅   | `/app/site/sante`, `site_quality_reports`                        |
| Bilan mensuel envoyé aux clients le 1er du mois                     | ✅   | `lib/monthly-report.ts`, `site_monthly_reports`                  |
| Tableau de production de l’équipe, file « à traiter »               | ✅   | `/admin/production`, `staff_work_queue()`                        |
| Page d’état dérivée des journaux, jamais « saine » par défaut       | ✅   | `app.refresh_system_health` (10 min)                             |
| API des sites : formulaires, réservations, boutique, comptes        | ✅   | `apps/site-runtime/src/sites-api.ts`                             |
| Espace client (projet, messages, réservations, « Ma commande »)     | ✅   | `apps/platform/src/app/app`                                      |
| Encaissements sur les sites clients                                 | ✅   | Stripe Connect, commission à zéro                                |
| Projets sur mesure sur devis                                        | ✅   | `/devis` → `quotes`                                              |
| **Vente par téléphone** : commande saisie par l’équipe, même suite  | ✅   | `/admin/commandes/nouvelle`, `app.admin_create_site_order`       |
| Discussion client ↔ équipe, réponses par e-mail, alertes à l’équipe | ✅   | `/app/discussion`, `/admin/messages`, `lib/team-alerts.ts`       |
| Invitations de collaborateurs (compte créé par le lien)             | ✅   | `/invitation`, `app.invitation_signup_context`                   |
| Sites de l’ancien moteur : toujours servis, rien d’effacé           | ✅   | `apps/site-runtime`, `packages/site-engine`                      |
| Comptes internes Nemasus : sites sans paiement                      | ✅   | `app.create_internal_order`, `pnpm internal:bootstrap`           |
| Intervention de l’équipe Nemasus, tracée et visible du client       | ✅   | sessions d’assistance, `app.org_can`                             |
| Boutique en ligne, du panier à l’encaissement                       | ✅   | `app.create_shop_order`, `/api/checkout`                         |
| Comptes client sur les sites, sans mot de passe                     | ✅   | `site_customers` + `/compte`                                     |
| Registre des violations de données (art. 33.5)                      | ✅   | `data_breaches` + `/admin/securite/violations`                   |

> Aucune ligne de ce tableau n’est une intention : chacune correspond à du code
> exécuté et, pour les points sensibles, à une assertion de test.

**Ce qui n’est pas terminé est écrit noir sur blanc** dans
[`docs/GAP_AUDIT.md`](./docs/GAP_AUDIT.md), avec ce qui a été trouvé en cours de
route — y compris les défauts que ce README avait laissés passer. Lisez-le avant
de vous fier à ce tableau.

---

## Démarrage rapide

```bash
# 1. Dépendances (pnpm 10, Node 22)
corepack enable
pnpm install

# 2. Configuration — copiez et renseignez (a la RACINE du depot)
cp .env.example .env.local

# 3. Base de données
pnpm db:migrate            # applique les migrations SQL
pnpm db:types              # régénère les types TypeScript

# 4. Compte administrateur (secret fourni au moment de l’exécution)
ADMIN_BOOTSTRAP_PASSWORD="$(openssl rand -base64 24)" pnpm admin:bootstrap

# 4 bis. Compte interne Nemasus (sites sans paiement) — voir docs/admin-bootstrap.md
INTERNAL_OWNER_EMAIL=… INTERNAL_OWNER_PASSWORD='…' pnpm internal:bootstrap

# 5. Développement
pnpm dev                   # plateforme, http://localhost:3000
pnpm dev:site              # API des sites / ancien moteur, http://localhost:3001
```

Pour rattacher et publier de vrais sites, renseignez aussi l’application
GitHub (`GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`,
`GITHUB_APP_WEBHOOK_SECRET`), le jeton Cloudflare des sites
(`CLOUDFLARE_SITES_API_TOKEN`, `CLOUDFLARE_SITES_ACCOUNT_ID`,
`CLOUDFLARE_WEBHOOK_SECRET`) et `CRON_SECRET` — voir
[github-integration.md](./docs/github-integration.md) et
[deployment.md](./docs/deployment.md). Ces valeurs restent **côté serveur**.

> **`.env.local` se trouve a la racine, pas dans `apps/platform`.**
> Next.js ne lit nativement les fichiers `.env*` que dans le repertoire de
> l'application, et les scripts `tsx` n'en lisent aucun. `@nemasus/config/dotenv`
> comble cet ecart : `next.config.ts` et chaque script chargent le `.env.local`
> (puis le `.env`) de la racine avant toute autre chose. Une variable deja
> definie — `VAR=... pnpm <script>`, variable Vercel, variable de CI — n'est
> jamais ecrasee.
>
> Le moteur des sites clients fait exception : c'est un Worker Cloudflare, sa
> configuration arrive par les bindings `wrangler` (`.dev.vars` en local).

### Vérification complète

```bash
pnpm verify                # format + lint + typecheck + tests
scripts/db-test.sh         # 630 assertions SQL (échoue au premier échec)
pnpm build                 # build de production (plateforme + Worker des sites)
```

### Où tourne quoi

| Application         | Cible                             | Note                                                                                              |
| ------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/platform`     | **Vercel** (région Paris, `cdg1`) | Racine du projet Vercel : `apps/platform`. Voir [vercel.md](./docs/vercel.md)                     |
| `apps/site-runtime` | Cloudflare Worker `nemasus-sites` | API des sites clients et sites de l’ancien moteur. Voir [cloudflare.md § 0](./docs/cloudflare.md) |
| Chaque site client  | **son** projet Cloudflare         | Construit depuis **son** dépôt GitHub ; voir [site-delivery.md](./docs/site-delivery.md)          |

---

## Architecture

```
apps/
  platform/        Next.js 16 — site public, commande, espace client, back-office,
                   webhooks (GitHub, Cloudflare, Stripe Connect), tâche de fond
  site-runtime/    Worker Cloudflare — API des sites ; sites de l’ancien moteur
packages/
  site-contract/   Contrat d’édition nemasus.manifest.json, fichier de contenu, pont d’aperçu
  infrastructure/  GitHub App, API Cloudflare, webhooks, sonde HTTPS (serveur uniquement)
  config/          Environnement, configuration légale, politiques commerciales
  types/           Types partagés, énumérations, Result<T>
  validation/      Schémas Zod — une seule définition par frontière
  payments/        Arithmétique monétaire, Stripe Connect (boutiques des clients)
  business/        Secteurs, métiers, questionnaire, vocabulaire, RBAC — aucune structure de site
  security/        Crypto, en-têtes, CSRF, anti-pourriel, limitation de débit
  site-engine/     Ancien moteur : blocs, thèmes, instantanés, rendu HTML
  database/        Clients Supabase et requêtes typées
  auth/            Sessions, gardes, activation, prise en main support
  emails/          Modèles et interface d’envoi indépendante du fournisseur
  analytics/       Mesure d’audience sans cookie
  ui/              Système de design, primitives, icônes, mouvement
supabase/migrations/   66 migrations SQL versionnées (jamais réécrites)
tests/                 unitaires, intégration, sécurité, SQL, E2E
```

Documentation détaillée dans [`docs/`](./docs) :

| Document                                                      | Contenu                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| [LANCEMENT.md](./docs/LANCEMENT.md)                           | **Lancement commercial** : ce qui est prêt, ce qu’il reste à faire |
| [commande-virement.md](./docs/commande-virement.md)           | **Commande, virement, code d’accès, mot de passe** : tout le cycle |
| [vente-par-telephone.md](./docs/vente-par-telephone.md)       | **Vente par téléphone** : mode d’emploi de l’équipe                |
| [architecture.md](./docs/architecture.md)                     | Choix structurants et leurs raisons                                |
| [site-delivery.md](./docs/site-delivery.md)                   | **Le cycle complet** : commande → livraison → publication          |
| [github-integration.md](./docs/github-integration.md)         | Application GitHub : permissions, jetons, commits, webhook         |
| [editable-site-contract.md](./docs/editable-site-contract.md) | Contrat `nemasus.manifest.json` et fichier de contenu              |
| [database.md](./docs/database.md)                             | Schéma, RLS, fonctions, invariants                                 |
| [security.md](./docs/security.md)                             | Modèle de menace et défenses                                       |
| [deployment.md](./docs/deployment.md)                         | Mise en production, étape par étape                                |
| [vercel.md](./docs/vercel.md)                                 | Déploiement de la plateforme sur Vercel, variables                 |
| [integrations.md](./docs/integrations.md)                     | Créer l’application GitHub et le jeton Cloudflare                  |
| [cloudflare.md](./docs/cloudflare.md)                         | Sites des clients : projets Cloudflare, jeton, webhook ; API       |
| [supabase.md](./docs/supabase.md)                             | Projet, rôles, sauvegardes                                         |
| [stripe.md](./docs/stripe.md)                                 | Ce que Stripe fait encore (Connect seulement)                      |
| [stripe-connect.md](./docs/stripe-connect.md)                 | Encaissements des clients                                          |
| [domains.md](./docs/domains.md)                               | Connexion d’un domaine client                                      |
| [admin-bootstrap.md](./docs/admin-bootstrap.md)               | Création du compte propriétaire                                    |
| [backup-recovery.md](./docs/backup-recovery.md)               | Sauvegardes et restauration                                        |
| [incident-response.md](./docs/incident-response.md)           | Conduite en cas d’incident                                         |
| [legal-configuration.md](./docs/legal-configuration.md)       | Mentions légales obligatoires                                      |
| [GAP_AUDIT.md](./docs/GAP_AUDIT.md)                           | Écart exigences / code réel, et ce qui reste à faire               |

---

## Les règles qui ne se négocient pas

1. **L’isolation entre clients est imposée par PostgreSQL**, pas par un filtre
   dans l’interface. Toutes les lectures et écritures de l’espace client passent
   par un client Supabase portant le jeton de la personne. Les assertions SQL
   vérifient qu’un client ne peut pas lire, modifier ni supprimer les données
   d’un autre, ni rattacher le site, le dépôt ou le domaine d’une autre
   organisation.

2. **Un paiement n’est jamais déclaré par le navigateur.** Le virement est
   constaté par une personne de l’équipe sur le relevé bancaire, puis confirmé
   dans l’administration ; seule la base, sur ce geste, crée l’espace et le code
   d’accès. Le code n’est vérifié que côté serveur et n’est stocké que haché.

3. **L’argent est toujours manipulé en centimes entiers.** Aucun flottant
   n’intervient dans un calcul de montant. Les arrondis TypeScript reproduisent
   exactement ceux de PostgreSQL, et un test compare les deux implémentations.

4. **Aucune donnée n’est inventée.** Pas de chiffre commercial non mesuré, pas
   de SIREN fictif, pas de statistique illustrative. Une valeur inconnue affiche
   un marqueur explicite ou n’est pas affichée.

5. **Posséder l’adresse e-mail d’administration ne confère aucun droit.** Le
   rôle vient de `profiles.platform_role`, écrit uniquement par le script
   d’approvisionnement avec la clé de service, et protégé en base par un
   déclencheur.

6. **Aucun modèle de site.** Chaque site est conçu et développé pour son
   client ; rien dans le code ne choisit ni ne fabrique une structure de site.

7. **« En ligne » veut dire en ligne.** Une version n’est publiée que lorsque
   Cloudflare a confirmé le déploiement de son commit ; un échec laisse la
   version précédente en ligne et le dit.

8. **Les secrets GitHub et Cloudflare ne quittent jamais le serveur**, et tout
   webhook est authentifié avant d’être lu.

---

## Qualité

| Contrôle                                   | Commande              | État |
| ------------------------------------------ | --------------------- | ---- |
| Formatage                                  | `pnpm format:check`   | ✅   |
| Lint (0 avertissement toléré)              | `pnpm lint`           | ✅   |
| Types (strict, `noUncheckedIndexedAccess`) | `pnpm typecheck`      | ✅   |
| Tests unitaires et d’intégration           | `pnpm test`           | ✅   |
| Assertions de sécurité SQL                 | `scripts/db-test.sh`  | ✅   |
| Build production                           | `pnpm build:platform` | ✅   |
| Build du Worker des sites                  | `pnpm build:sites`    | ✅   |
| Parcours navigateur                        | `pnpm test:e2e`       | ✅   |
| Parcours complets contre une vraie pile    | `pnpm test:e2e:stack` | ✅   |

Les tests d’intégration et les assertions SQL ont besoin d’une base :
`NEMASUS_TEST_DATABASE_URL=… pnpm test`. **Sans elle, ils sont sautés, jamais
passés en silence** — un test vert sur une suite sautée est pire qu’un test
rouge.

### Parcours complets contre une vraie pile

`tests/e2e/stack` monte, sans Docker, une pile locale fidèle : PostgreSQL avec
toutes les migrations, l’authentification Supabase (GoTrue), l’API PostgREST et
un stockage de fichiers soumis à la même règle que la production. La plateforme
tourne en build de production, le moteur des sites en Worker local
(`*.sites.nemasus.test`). **GitHub et Cloudflare** y sont remplacés par des
émulateurs qui parlent les mêmes API (`tests/e2e/stack/providers.mjs` : jetons
d’installation, API Git Data avec contrôle d’avance rapide, projets Pages,
déploiements, échecs provoqués) : le code de production les appelle sans le
savoir.

```bash
pnpm e2e:stack start       # base, authentification, API, stockage
pnpm build:platform        # build de production (next build)
pnpm test:e2e:stack        # démarre plateforme + sites, puis les parcours
```

Les parcours (`tests/e2e/journeys`) :

- **cycle d’un site développé hors de Nemasus** (`external-site.spec.ts`) : avant
  la livraison, le client suit son projet sans éditeur ; l’équipe rattache le
  dépôt et le projet Cloudflare par l’interface, importe le contrat, la
  livraison est refusée tant que la checklist est incomplète, puis le site est
  livré ; le client publie → commit `nemasus: publication client…` en avance
  rapide → déploiement → « Version 2 en ligne » ; un déploiement en échec n’est
  jamais annoncé publié et la version 2 reste servie ; restaurer la version 1
  la redéploie réellement ; une autre société ne voit rien ;
- **commande par virement** (`bank-transfer.spec.ts`) : le visiteur commande
  sans prix ni compte ; l’équipe envoie les modalités puis confirme le virement ;
  le code, affiché une fois (sans fournisseur d’e-mail), ouvre l’espace et fait
  choisir un mot de passe ; codes inventé, déjà servi, expiré et désactivé
  refusés ; déconnexion, reconnexion ; mot de passe oublié (même réponse pour
  toute adresse, lien unique, autres sessions fermées) ; un autre client reste
  invisible même avec des cookies forgés ;
- **compte interne** (`internal-account.spec.ts`) : commande
  sans paiement, site construit hors de Nemasus, rattaché puis confié au compte,
  qui ne peut le modifier qu’à partir de ce moment ; le privilège est refusé à
  un client ordinaire par la base ;
- **toutes les pages** (`all-pages.spec.ts`) : pages publiques, administration,
  espace client d’un site livré et d’un site en construction : aucune ne
  répond une erreur ;
- **signalement d’un contenu** hébergé (`content-report.spec.ts`) ;
- **intrusion** (`penetration.spec.ts`) : deux clients étrangers et un
  visiteur anonyme ; aucune lecture ni écriture croisée, codes et jetons
  inaccessibles depuis un client, blocage des essais de codes.

Aucun virement n’est émis : comme en production, c’est l’équipe qui déclare
l’avoir reçu, par l’administration ou par la même fonction.

---

## Licence et statut

Logiciel privé. Les textes juridiques livrés sont des **modèles** : ils doivent
être relus et validés par un professionnel du droit avant toute ouverture
commerciale. Voir [`docs/legal-configuration.md`](./docs/legal-configuration.md).

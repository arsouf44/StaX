# StaX

Plateforme française de création, vente, livraison et gestion de sites web professionnels.

StaX permet à une entreprise de commander un site, de le faire réaliser, de le
publier sur son propre nom de domaine, puis de le gérer elle-même : contenus,
photos, horaires, messages reçus, réservations, commandes et encaissements.

---

## Ce que le produit fait réellement

| Capacité                                                        | État | Où c’est implémenté                                       |
| --------------------------------------------------------------- | ---- | --------------------------------------------------------- |
| Vendre des sites (offres, panier, paiement)                     | ✅   | `apps/platform/src/app/(commande)` + `packages/payments`  |
| Recevoir commandes et paiements                                 | ✅   | webhooks Stripe signés + `app.apply_order_paid`           |
| Créer et publier des sites clients                              | ✅   | `app.publish_site` (instantané figé, immuable)            |
| Héberger et servir les sites publiés                            | ✅   | `apps/site-runtime` (Worker multi-tenant)                 |
| Espace client (contenus, messages, factures)                    | ✅   | `apps/platform/src/app/app`                               |
| Formulaires, prospects, réservations sur les sites              | ✅   | `app.submit_form`, `app.create_booking`                   |
| Domaine propre par client                                       | ✅   | `site_domains` + résolution par nom d’hôte                |
| Encaissements sur les sites clients                             | ✅   | Stripe Connect, commission à zéro                         |
| Abonnement de maintenance                                       | ✅   | `subscriptions` + webhooks                                |
| Projets sur mesure sur devis                                    | ✅   | `/devis` → `quotes`                                       |
| Éditeur visuel : clic sur l’aperçu, sections, photos, téléphone | ✅   | `apps/platform/src/app/app/editeur`                       |
| Tout réversible : annuler/rétablir, corbeille, versions         | ✅   | `editor_revisions`, `draft_checkpoints`, `site_versions`  |
| Publication vérifiée, immuable, purge du cache, retour arrière  | ✅   | `app.publish_site`, `app.rollback_site`, `cache-purge.ts` |
| Comptes internes StaX : sites illimités sans paiement           | ✅   | `app.create_internal_order`, `pnpm internal:bootstrap`    |
| Intervention de l’équipe StaX, tracée et visible du client      | ✅   | sessions d’assistance, `app.org_can`                      |
| Boutique en ligne, du panier à l’encaissement                   | ✅   | `app.create_shop_order`, `/api/checkout`                  |
| Comptes client sur les sites, sans mot de passe                 | ✅   | `site_customers` + `/compte`                              |
| Registre des violations de données (art. 33.5)                  | ✅   | `data_breaches` + `/admin/securite/violations`            |

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

# 4 bis. Compte interne StaX (sites sans paiement) — voir docs/admin-bootstrap.md
INTERNAL_OWNER_EMAIL=… INTERNAL_OWNER_PASSWORD='…' pnpm internal:bootstrap

# 5. Développement
pnpm dev                   # plateforme, http://localhost:3000
pnpm dev:site              # moteur des sites clients, http://localhost:3001
```

> **`.env.local` se trouve a la racine, pas dans `apps/platform`.**
> Next.js ne lit nativement les fichiers `.env*` que dans le repertoire de
> l'application, et les scripts `tsx` n'en lisent aucun. `@stax/config/dotenv`
> comble cet ecart : `next.config.ts` et chaque script chargent le `.env.local`
> (puis le `.env`) de la racine avant toute autre chose. Une variable deja
> definie — `VAR=... pnpm <script>`, secret Cloudflare, variable de CI — n'est
> jamais ecrasee.
>
> Le moteur des sites clients fait exception : c'est un Worker Cloudflare, sa
> configuration arrive par les bindings `wrangler` (`.dev.vars` en local).

### Vérification complète

```bash
pnpm verify                # format + lint + typecheck + tests
scripts/db-test.sh         # 309 assertions de sécurité SQL (échoue au premier échec)
pnpm build:cf              # build Cloudflare des deux applications
```

### Où tourne quoi

| Application         | Cible             | Note                                                                                                                               |
| ------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apps/platform`     | **Vercel**        | `vercel.json` à la racine. Voir [vercel.md](./docs/vercel.md)                                                                      |
| `apps/site-runtime` | Cloudflare Worker | Sert les sites clients. **Pas d'équivalent Vercel en l'état** — la dernière section de [vercel.md](./docs/vercel.md) pose le choix |

---

## Architecture

```
apps/
  platform/        Next.js 16 — site public, espace client, back-office, API
  site-runtime/    Worker Cloudflare — sert TOUS les sites clients
packages/
  config/          Environnement, configuration légale, politiques commerciales
  types/           Types partagés, énumérations, Result<T>
  validation/      Schémas Zod — une seule définition par frontière
  payments/        Arithmétique monétaire, Stripe, Connect, remboursements
  business/        Registre des secteurs, métiers, modules, RBAC
  security/        Crypto, en-têtes, CSRF, anti-pourriel, limitation de débit
  site-engine/     Blocs, thèmes, instantanés, SEO, rendu HTML
  database/        Clients Supabase et requêtes typées
  auth/            Sessions, gardes, activation, prise en main support
  emails/          Modèles et interface d’envoi indépendante du fournisseur
  analytics/       Mesure d’audience sans cookie
  ui/              Système de design, primitives, icônes, mouvement
supabase/migrations/   18 migrations SQL versionnées
tests/                 unitaires, intégration, sécurité, SQL, E2E
```

Documentation détaillée dans [`docs/`](./docs) :

| Document                                                | Contenu                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| [architecture.md](./docs/architecture.md)               | Choix structurants et leurs raisons                             |
| [database.md](./docs/database.md)                       | Schéma, RLS, fonctions, invariants                              |
| [security.md](./docs/security.md)                       | Modèle de menace et défenses                                    |
| [vercel.md](./docs/vercel.md)                           | **Plateforme sur Vercel** — variables, symptômes, vérifications |
| [deployment.md](./docs/deployment.md)                   | Mise en production, étape par étape                             |
| [cloudflare.md](./docs/cloudflare.md)                   | Workers, domaines, cache, DNS — moteur des sites clients        |
| [supabase.md](./docs/supabase.md)                       | Projet, rôles, sauvegardes                                      |
| [stripe.md](./docs/stripe.md)                           | Produits, prix, webhooks                                        |
| [stripe-connect.md](./docs/stripe-connect.md)           | Encaissements des clients                                       |
| [domains.md](./docs/domains.md)                         | Connexion d’un domaine client                                   |
| [admin-bootstrap.md](./docs/admin-bootstrap.md)         | Création du compte propriétaire                                 |
| [backup-recovery.md](./docs/backup-recovery.md)         | Sauvegardes et restauration                                     |
| [incident-response.md](./docs/incident-response.md)     | Conduite en cas d’incident                                      |
| [legal-configuration.md](./docs/legal-configuration.md) | Mentions légales obligatoires                                   |

---

## Les cinq règles qui ne se négocient pas

1. **L’isolation entre clients est imposée par PostgreSQL**, pas par un filtre
   dans l’interface. Toutes les lectures et écritures de l’espace client passent
   par un client Supabase portant le jeton de la personne. 175 assertions SQL
   vérifient qu’un client ne peut pas lire, modifier ni supprimer les données
   d’un autre.

2. **La vérité sur un paiement vient du webhook signé**, jamais de la
   redirection du navigateur. La page de confirmation ne lit même pas le
   `session_id` renvoyé par Stripe : elle relit l’état réel de la commande.

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

---

## Qualité

| Contrôle                                   | Commande              | État |
| ------------------------------------------ | --------------------- | ---- |
| Formatage                                  | `pnpm format:check`   | ✅   |
| Lint (0 avertissement toléré)              | `pnpm lint`           | ✅   |
| Types (strict, `noUncheckedIndexedAccess`) | `pnpm typecheck`      | ✅   |
| Tests unitaires et d’intégration           | `pnpm test`           | ✅   |
| Assertions de sécurité SQL                 | `scripts/db-test.sh`  | ✅   |
| Build production                           | `pnpm build`          | ✅   |
| Build Cloudflare                           | `pnpm build:cf`       | ✅   |
| Parcours navigateur                        | `pnpm test:e2e`       | ✅   |
| Parcours complets contre une vraie pile    | `pnpm test:e2e:stack` | ✅   |

Les tests d’intégration et les assertions SQL ont besoin d’une base :
`STAX_TEST_DATABASE_URL=… pnpm test`. **Sans elle, ils sont sautés, jamais
passés en silence** — un test vert sur une suite sautée est pire qu’un test
rouge.

### Parcours complets contre une vraie pile

`tests/e2e/stack` monte, sans Docker, une pile locale fidèle : PostgreSQL avec
toutes les migrations, l’authentification Supabase (GoTrue), l’API PostgREST et
un stockage de fichiers soumis à la même règle que la production. La plateforme
tourne en build de production, le moteur des sites en Worker local
(`*.sites.stax.test`).

```bash
pnpm e2e:stack start       # base, authentification, API, stockage
pnpm build                 # build de production
pnpm test:e2e:stack        # démarre plateforme + sites, puis les parcours
```

Les parcours (`tests/e2e/journeys`) vérifient chaque publication par une
**vraie requête HTTP sur l’adresse publique du site** :

- un client se connecte, modifie un titre en cliquant dessus, remplace une
  photo, ajoute, déplace, supprime puis restaure une section, vérifie le rendu
  téléphone, publie ; le site public sert la nouvelle version ; une
  modification non publiée n’y apparaît pas ; il revient à la première version ;
- annuler/rétablir, comparer, restaurer une version sans rien détruire, page
  supprimée puis restaurée, intervention de l’équipe StaX visible du client ;
- compte interne : commande Ultra Premium sans paiement, site créé, modifié et
  publié ; le privilège est refusé à un client ordinaire par la base.

Le paiement Stripe y est remplacé par un webhook **signé** avec un secret
jetable : c’est le vrai chemin « paiement reçu → site préparé », sans réseau.

---

## Licence et statut

Logiciel privé. Les textes juridiques livrés sont des **modèles** : ils doivent
être relus et validés par un professionnel du droit avant toute ouverture
commerciale. Voir [`docs/legal-configuration.md`](./docs/legal-configuration.md).

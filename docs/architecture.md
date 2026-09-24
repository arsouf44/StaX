# Architecture

Ce document explique les choix structurants et, surtout, **pourquoi** ils ont
été faits. Un choix dont la raison n’est pas écrite finit par être défait par
quelqu’un qui ne la connaissait pas.

Le cycle complet d’un site, pas à pas, est décrit dans
[site-delivery.md](./site-delivery.md) ; le contrat d’édition dans
[editable-site-contract.md](./editable-site-contract.md) ; l’application
GitHub dans [github-integration.md](./github-integration.md).

---

## 0. Vue d’ensemble

```
                         ┌──────────────────────── StaX (apps/platform, Next.js) ────────────────────────┐
  Visiteur ─ marketing ─▶│ offres · commande · paiement Stripe · compte · questionnaire · suivi du projet │
                         │ administration : Projet › Infrastructure & livraison (checklist, livraison)   │
  Client ── /app ───────▶│ éditeur du contrat · brouillon · Publier · versions · restaurer · abonnement   │
                         └──────┬──────────────────────┬──────────────────────────┬──────────────────────┘
                                │ RLS + fonctions app.*│ GitHub App (serveur)     │ API Cloudflare (serveur)
                                ▼                      ▼                          ▼
                     Supabase Postgres        Dépôt GitHub DU site ──build──▶ Projet Cloudflare DU site
                     (vérité : droits,        stax.manifest.json              Pages / Workers, domaine
                      versions, audit)        + fichier de contenu            ──▶ site en ligne
                                ▲                      │ webhook signé            │ webhook signé
                                └──────────────────────┴──────────────────────────┘
                                ▲
             Site en ligne ─────┘  API des sites (apps/site-runtime) : formulaires, réservations,
                                   boutique, comptes clients, mesure d’audience — jamais le rendu
```

ORDER → BUILD EXTERNALLY → GITHUB → CLOUDFLARE → VERIFY → IMPORT INTO STAX →
DELIVER → CLIENT EDITS DRAFT → PUBLISH → GITHUB COMMIT → CLOUDFLARE DEPLOYMENT
→ LIVE.

| Élément | Rôle |
| --- | --- |
| `apps/platform` | site commercial, commande, espace client, administration, webhooks, tâche de fond `/api/cron/sites` |
| `apps/site-runtime` | Worker Cloudflare : **API des sites** (`/v1/sites/<clé publique>/…`) et rendu des sites de l’ancien moteur |
| `packages/site-contract` | contrat `stax.manifest.json` : schéma, validation, fichier de contenu, pont d’aperçu, contrôle de l’offre |
| `packages/infrastructure` | clients serveur GitHub App et Cloudflare, vérification des webhooks, sonde HTTPS |
| `packages/database` | clients Supabase (anonyme, utilisateur, service) et requêtes typées |
| `packages/payments` | Stripe, prix, machines à états des commandes et abonnements |
| `packages/business` | secteurs et métiers : questionnaire, vocabulaire, modules — **aucune structure de site** |
| `packages/site-engine`, `site-data` | ancien moteur de rendu, conservé pour les sites construits avant (voir § 11) |
| `supabase/migrations` | schéma, RLS, fonctions `app.*` : la règle fait foi en base |

---

## 1. StaX ne fabrique pas de sites

**Le choix.** Il n’existe aucun modèle de site, nulle part : ni table de
modèles, ni fonction qui écrit une structure dans un site, ni sélection par
l’offre, le métier, les couleurs ou le questionnaire (migration 0045). Chaque
site est **conçu et développé individuellement** par l’équipe, hors de StaX.

**Pourquoi.** C’est la promesse commerciale : « Nous créons votre site. Vous
le gérez ensuite. » Un site généré puis « personnalisé » ne la tient pas. Le
retirer du code, et pas seulement du discours, empêche qu’un raccourci
technique la trahisse plus tard. Un test (`tests/unit/product-promises.test.ts`)
refuse les formulations de générateur dans le site commercial.

---

## 2. Un dépôt et un projet Cloudflare par site

**Le choix.** Chaque site a **son** dépôt GitHub et **son** projet Cloudflare
Pages (ou Workers Builds), avec son domaine. StaX s’y rattache, il ne les
remplace pas. `sites.architecture = 'external_repository'` pour tout nouveau
site.

**Pourquoi.**

- Le site est un vrai projet de développement : son code, ses dépendances,
  ses optimisations, son design, sans contrainte de moteur commun.
- Il reste **réversible** : le client peut repartir avec son code, qui se
  construit sans StaX.
- Il ne dépend pas de StaX pour s’afficher : le contenu est **écrit dans le
  dépôt** et lu à la construction. Une panne de la plateforme n’éteint aucun
  site.

**La conséquence sur la sécurité.** StaX doit écrire dans des dépôts et
piloter des déploiements. Il le fait avec une **application GitHub** (jetons
d’une heure, limités à un dépôt et à `contents`), un jeton Cloudflare au
périmètre minimal, tous deux **côté serveur uniquement** ; chaque webhook est
signé ; un dépôt ne sert qu’un site ; seule l’équipe rattache ; tout est
audité. Détails : [security.md](./security.md).

---

## 3. Le contrat d’édition : une surface, pas une structure

**Le choix.** Le développeur déclare dans `stax.manifest.json` ce que le
client pourra modifier (champs typés, pages, collections, formulaires). StaX
construit l’éditeur à partir de cette déclaration et écrit le contenu dans un
fichier JSON du dépôt.

**Pourquoi.**

- Le client modifie son contenu **sans pouvoir casser** le design ni le code.
- Le contrat est versionné (`"contract": 1`) : une version inconnue est
  refusée plutôt que mal lue.
- La même bibliothèque valide partout (import, brouillon, publication, tests)
  et compare le contrat aux droits de l’offre : un site dont le contrat
  dépasse l’offre ne peut pas être livré.

---

## 4. La livraison est une frontière technique

**Le choix.** Avant `sites.delivered_at`, le client **suit** son projet (sept
étapes réelles, validations demandées par l’équipe) mais **ne modifie rien** :
`app.site_content_access` le refuse en base, quelle que soit la porte
d’entrée. Seule l’administration livre (`app.deliver_site`), et seulement
quand la checklist est complète (`app.delivery_readiness`).

**Pourquoi.** Un client qui modifie un site en construction entre en conflit
avec le développement, et un site livré incomplet n’est pas un site livré.
L’interface le reflète, mais c’est la base qui l’impose.

---

## 5. Une version n’est « en ligne » que lorsqu’elle l’est

**Le choix.** Publier crée une **version** qui suit une machine à états :

```
scheduled ─▶ queued ─▶ committing ─▶ deploying ─▶ published
                 │            │             │
                 └────────────┴─────────────┴──▶ failed      (+ superseded, cancelled)
```

Le passage à `published` n’a lieu **que** sur confirmation du déploiement
Cloudflare du commit exact (`app.record_site_deployment`), par le webhook, le
suivi de l’éditeur ou la tâche de fond (toutes les 5 minutes). Sans
confirmation sous 45 minutes, la version passe en échec ; une confirmation
tardive la rétablit, si rien de plus récent n’a été publié (0049).

**Pourquoi.** Afficher « Publié » après un simple commit mentirait au client
si le build échoue. En cas d’échec (GitHub, build, délai), la **version
précédente reste en ligne** et le client le lit en clair.

**Commits.** Avance rapide uniquement (jamais `force`) : si un développeur a
poussé entre-temps, la publication est rejouée au-dessus de son travail. Le
marqueur `Stax-Release` rend l’écriture idempotente.

**Historique.** Chaque version garde son contenu, son commit, son
déploiement, son auteur, sa date et son état. **Restaurer** crée une
**nouvelle** version avec l’ancien contenu et la redéploie réellement —
jamais un simple changement de pointeur.

---

## 6. L’API des sites : les modules StaX au service d’un site indépendant

**Le choix.** Formulaires, réservations, boutique, paiement sur le compte
Stripe du commerçant, comptes clients et mesure d’audience passent par
`apps/site-runtime` (`/v1/sites/<clé publique>/…`).

**Pourquoi.** Ces fonctions ont besoin de la base, du back-office et de la
messagerie du client ; elles ne doivent pas être redéveloppées pour chaque
site. La clé publique **n’ouvre aucun droit seule** : les écritures exigent une
origine appartenant au site, sont limitées en débit, et la base vérifie à
chaque opération que l’offre comprend le module.

---

## 7. Toute la logique sensible vit en PostgreSQL

**Le choix.** Isolation, droits d’offre, quotas, livraison, machine à états
des versions, calcul des prix, éligibilité au remboursement, capacité d’un
créneau : tout cela est implémenté dans des fonctions SQL `app.*`
(`SECURITY DEFINER`, exposées par des enveloppes `public.*`), pas dans
l’application.

**Pourquoi.** L’application a plusieurs portes d’entrée : l’espace client, le
back-office, les webhooks, la tâche de fond, l’API des sites, les scripts
d’exploitation. Une règle implémentée dans l’une d’elles ne protège pas les
autres. Une règle implémentée en base protège *toutes* les portes, y compris
celles qui n’existent pas encore.

Corollaire assumé : **ce qui est en base fait foi**. Le code TypeScript qui
reproduit une règle (le calcul de prix, la matrice RBAC, le contrôle de
l’offre) est comparé à l’implémentation SQL par des tests. Les deux ne peuvent
pas diverger sans faire échouer l’intégration continue.

---

## 8. Trois clients de base de données, trois niveaux de confiance

| Client | Clé | RLS | Usage |
| --- | --- | --- | --- |
| `createAnonClient()` | publique | active | catalogue public, page d’état |
| `createUserClient(jwt)` | publique + JWT | **active, complète** | espace client, back-office |
| `createServiceClient()` | service | **contournée** | webhooks, tâche de fond, API des sites, scripts |

L’espace client et le back-office utilisent **exclusivement** le deuxième. C’est
ce qui fait qu’un défaut applicatif — un filtre oublié, un identifiant mal
vérifié — ne peut pas franchir la frontière entre deux organisations : la base
refuserait la ligne. Les étapes machine de la publication (`claim`, `record`,
`finalize`) exigent le rôle de service (`app.require_service_role`).

Le client de service refuse de s’initialiser côté navigateur, et sa clé n’est
jamais préfixée `NEXT_PUBLIC_`. Il en va de même des secrets GitHub et
Cloudflare.

---

## 9. La maintenance commence à la livraison

**Le choix.** Le paiement de la commande règle la création (paiement unique)
et enregistre le moyen de paiement. L’abonnement **mensuel** de maintenance
est créé **à la livraison** ; la base refuse un abonnement pour un site non
livré (`site_not_delivered`).

**Pourquoi.** Facturer un service de maintenance sur un site qui n’existe pas
encore serait injuste et contraire aux conditions de vente. Détails :
[stripe.md](./stripe.md).

---

## 10. Le registre métier : des mots et des questions, pas des sites

`packages/business` décrit secteurs et métiers : questions du questionnaire,
vocabulaire de l’espace client (« prestations », « plats », « biens »),
modules utiles, exemples de pages montrés sur le site commercial. Aucun
composant ne contient `if (metier === 'restaurant')`.

Il ne produit **aucune structure de site** : ce que contient le site est
décidé par l’équipe avec le client, puis développé.

---

## 11. L’ancien moteur, conservé pour les sites existants

Les sites construits avant ce modèle (`sites.architecture = 'legacy_engine'`)
restent servis par le moteur multi-tenant de `apps/site-runtime`
(`packages/site-engine`) : tenant résolu par le nom d’hôte uniquement, HTML
échappé par construction, contenu en blocs validés, instantané publié
immuable. Rien de ce qui existe n’a été effacé. Aucun nouveau site n’y est
créé, et un dépôt GitHub ne peut pas être rattaché à un site de l’ancien
moteur (`legacy_site`).

---

## 12. Le rendu dynamique est un choix, pas un défaut

Les pages marketing sont prérendues. Sont **dynamiques**, volontairement :

- les pages légales, parce que l’identité de l’éditeur vient des secrets de
  déploiement et non du build : prérendre figerait les marqueurs
  « [A CONFIGURER — …] » dans le HTML publié ;
- la page des sous-traitants, lue directement en base ;
- la page d’état des services, qui n’aurait aucun sens mise en cache ;
- tout l’espace client et le back-office, jamais mis en cache ni indexés.

---

## 13. Ce que cette architecture ne fait pas

Dit franchement, pour éviter les mauvaises surprises :

- **Pas de publication instantanée.** Une publication prend le temps d’un
  build Cloudflare (souvent une à quelques minutes). C’est le prix d’un site
  réellement construit, et c’est affiché comme tel.
- **Pas de modification de la mise en page par le client.** Il modifie ce que
  le contrat déclare ; une nouvelle section ou un nouveau design relève d’une
  demande à l’équipe.
- **Pas d’éditeur temps réel collaboratif.** Deux personnes sur le même
  brouillon : la révision attendue refuse l’écriture périmée, sans fusion
  automatique.
- **Pas de multi-région pour les données.** La base est dans une seule région
  européenne ; les sites, eux, sont servis par le réseau mondial de
  Cloudflare.

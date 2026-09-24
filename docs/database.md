# Base de données

PostgreSQL 15+ via Supabase. 51 migrations versionnées, 95 tables, 177
politiques RLS, 450 assertions SQL exécutées à chaque modification
(`tests/sql/rls.test.sql`).

Les migrations 0042 à 0051 portent le modèle actuel : sites développés dans
leur propre dépôt, contrat d’édition, publication confirmée par Cloudflare,
offres mensuelles, maintenance à la livraison. Elles **s’ajoutent** aux
précédentes : aucune migration existante n’a été réécrite.

---

## Principes

### Le schéma `app` n’est pas exposé

Les fonctions sensibles vivent dans `app`, qui n’est **pas** publié par
PostgREST. Ce qui doit être appelable depuis l’application passe par une
enveloppe `public` avec des droits accordés explicitement, rôle par rôle.

```sql
-- Réservé au rôle de service : le moteur des sites publics
grant execute on function public.resolve_published_site(text) to service_role;

-- Ouvert aux personnes authentifiées : la RLS fait le reste
grant execute on function public.publish_site(uuid, text) to authenticated;
```

Une assertion vérifie, pour chaque fonction, que `anon` et `authenticated` n’ont
que ce qui leur est nécessaire.

### Les identifiants

- `gen_random_uuid()` (UUIDv4) pour les entités durables.
- `app.uuid_v7()` pour les tables append-only (paiements, journaux, événements,
  soumissions) : l’ordre d’insertion est encodé dans l’identifiant, ce qui rend
  les index temporels beaucoup plus compacts.

### Les montants

`integer` en **centimes**, avec la devise portée explicitement. Jamais de
`numeric` ni de `float` pour de l’argent. Des contraintes `check` interdisent les
montants négatifs là où ils n’ont pas de sens.

### Les dates

`timestamptz`, stockées en UTC. Le fuseau du site (`sites.timezone`) sert
uniquement à l’affichage et au calcul des créneaux — sans quoi un restaurant
parisien verrait « aujourd’hui » basculer à 2 h du matin.

---

## Fonctions structurantes

| Fonction | Ce qu’elle garantit |
| --- | --- |
| `app.org_can(org, capability)` | Matrice RBAC — miroir exact du TypeScript, comparé par test |
| `app.site_content_access(site, …)` | Édition réservée aux membres, **après la livraison**, site disponible ; l’équipe seule avant |
| `app.site_is_available(site)` | Ni archivé ni suspendu (statut ou date) : seule définition (0051) |
| `app.connect_site_repository(...)` / `app.connect_site_hosting(...)` | Rattachement par l’équipe seulement ; installation connue, propriétaire cohérent, un dépôt = un site |
| `app.record_site_manifest(...)` | Contrat importé, figé, un seul actif par site |
| `app.initialize_site_content(...)` | Contenu initial = version 1, reprise du commit de production |
| `app.delivery_readiness(site)` / `app.deliver_site(site)` | Checklist complète exigée ; livraison auditée ; maintenance déclenchée |
| `app.save_site_draft(site, content, revision)` | Brouillon versionné, écriture périmée refusée |
| `app.request_site_release(...)` | Version immuable, une seule publication en cours par site, programmation possible |
| `app.claim_site_release` → `record_release_commit` → `record_site_deployment` → `finalize_site_release` | Étapes machine (rôle de service) ; « publiée » uniquement sur déploiement confirmé |
| `app.resolve_site_api(key, origin)` | API des sites : clé publique + origine du site, droits de l’offre |
| `app.quota_exceeded(org, key)` | Quotas de l’offre appliqués en base (0046) |
| `app.resolve_published_site(hostname)` | Ancien moteur : résolution du tenant par le seul nom d’hôte |
| `app.publish_site(site, label)` / `app.rollback_site(...)` | Ancien moteur : instantané figé, retour arrière |
| `app.compute_order_pricing(plan, coupon)` | Prix lu dans le catalogue, jamais fourni |
| `app.create_order(...)` | Commande créée avec un prix serveur et une preuve d’acceptation des CGV |
| `app.request_refund(order, reason)` | Éligibilité calculée, déduction domaine conditionnelle |
| `app.apply_order_paid(...)` | Paiement appliqué une seule fois, quoi qu’il arrive |
| `app.upsert_subscription_from_stripe(...)` | Abonnement synchronisé, prix figé ; **refusé pour un site non livré** (`site_not_delivered`) |
| `app.submit_form(...)` | Liste blanche de champs, résolution par couple (site, slug) |
| `app.available_slots(...)` / `app.create_booking(...)` | Capacité vérifiée sous verrou |
| `app.redeem_activation_code(...)` | Consommation atomique, réponse identique pour tout échec |
| `app.write_audit(...)` | Journal purgé de toute clé sensible |

---

## Invariants imposés par la base

Ces règles ne peuvent pas être contournées par un défaut applicatif.

| Invariant | Mécanisme |
| --- | --- |
| Une version publiée ne change jamais | Déclencheur `app.freeze_published_version` |
| Un journal d’audit n’est ni modifié ni supprimé | Déclencheurs append-only |
| Les montants d’une commande payée sont immuables | `app.guard_order_financials` |
| Un client ne peut pas changer son offre ni son statut d’abonnement | `app.guard_site_commercials`, `app.guard_subscription_state` |
| Un client ne peut pas s’attribuer un rôle plateforme | `app.guard_platform_role` |
| Une organisation garde toujours au moins un propriétaire | `app.guard_last_owner` |
| Un nom d’hôte ne peut pas être détourné | Index unique partiel sur `site_domains` |
| Les quotas de l’offre sont respectés (pages, collaborateurs, produits, médias, formulaires) | `app.enforce_page_quota`, `app.enforce_*_quota` (0046) |
| Le créateur d’une organisation en est propriétaire | `app.grant_creator_ownership` |
| Seule l’équipe livre un site ; le client ne touche ni à `delivered_at`, ni à son offre, ni à sa version en production | `app.guard_site_commercials` |
| Un site externe ne passe « en ligne » qu’avec une version confirmée en production | `app.guard_site_status` |
| Le contenu et le commit d’une version ne changent jamais ; transitions contrôlées (`scheduled → queued → committing → deploying → published`) | `app.guard_site_release` |
| Une seule publication en cours, une seule programmée, par site | index uniques partiels `site_releases_in_flight_key`, `site_releases_scheduled_key` |
| Un dépôt ou un projet Cloudflare ne sert qu’un site | index uniques partiels sur `site_repositories`, `site_hosting` |
| Un manifeste importé est immuable | `app.freeze_site_manifest` |
| Un site externe ne reçoit jamais d’instantané de l’ancien moteur | `app.forbid_engine_snapshot_for_external` |
| Le domaine d’un site externe n’est modifié que par l’équipe | `app.guard_external_domain` |
| Pas d’abonnement de maintenance avant la livraison | `app.upsert_subscription_from_stripe` |
| Un site suspendu n’est ni modifié ni publié ; une publication en attente échoue | `app.site_content_access`, `app.claim_site_release` (0051) |

---

## Tables du modèle actuel

| Table | Contenu | Qui écrit |
| --- | --- | --- |
| `plan_inclusions` | ce que chaque offre comprend, ligne par ligne (affiché tel quel) | migrations |
| `github_installations` | installations de l’application GitHub (compte, état) | service (webhook) |
| `site_repositories` | dépôt rattaché : identifiants GitHub, branches, chemin du manifeste, état de synchronisation | équipe (fonction), service |
| `site_hosting` | projet Cloudflare Pages/Workers : compte, projet, branche, URL de production | équipe (fonction), service |
| `site_manifests` | contrats importés (commit, empreinte, résumé, erreurs, avertissements), un actif | équipe (fonction) |
| `site_content_drafts` | brouillon du client, avec révision | client (fonction) |
| `site_releases` | versions : contenu, auteur, commit, déploiement, état, erreur, restauration d’origine | client (fonction), service |
| `site_deployments` | déploiements Cloudflare observés (production et aperçus) | service |
| `site_delivery_checks` | contrôles de la checklist : automatique (preuve) ou attesté (note, auteur) | équipe, service |
| `site_health_checks` | surveillance HTTPS des sites livrés | service (tâche de fond) |

Colonnes ajoutées à `sites` : `architecture` (`external_repository` |
`legacy_engine`), `public_key` (API des sites), `production_release_id`
(version réellement en ligne), `delivered_at`/`delivered_by`, étapes du projet
(0042, 0050). Aucune de ces tables ne contient de jeton GitHub ou Cloudflare.

Chaque fonction de rattachement, d’import, de livraison, de publication et
de restauration écrit une ligne d’audit (`app.write_audit`).

---

## Anti-détournement de domaine

```sql
create unique index site_domains_hostname_active_key
  on public.site_domains (hostname) where status <> 'detached';
```

Sans cet index, un client pourrait déclarer le nom d’hôte d’un autre et capter
son trafic. L’unicité est partielle : un domaine détaché redevient disponible.

---

## Travailler avec les migrations

```bash
pnpm db:migrate            # applique ce qui manque
pnpm db:migrate --status   # liste sans rien appliquer
pnpm db:types              # régénère les types TypeScript
scripts/db-test.sh         # base jetable + migrations + 450 assertions
```

**Une migration appliquée ne se modifie jamais.** `db-migrate` enregistre
l’empreinte de chaque fichier et refuse de continuer si elle a changé : sans
cela, les environnements divergeraient silencieusement. Pour corriger, créez une
nouvelle migration.

---

## Tester une politique RLS

La suite `tests/sql/rls.test.sql` fournit deux helpers :

```sql
-- Compte les lignes visibles PAR une personne donnée
t.count_as(alice, 'select 1 from sites')

-- Vrai si l'écriture est refusée POUR cette personne
t.denied_as(bob, 'update sites set name = ''pirate'' where id = ...')
```

Toute nouvelle table multi-tenant doit arriver avec ses assertions. Une table
sans RLS testée est une fuite qui attend son heure.

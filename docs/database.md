# Base de données

PostgreSQL 15+ via Supabase. 18 migrations versionnées, 80 tables, ~160
politiques RLS, 175 assertions de sécurité exécutées à chaque modification.

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
| `app.resolve_published_site(hostname)` | Résolution du tenant par le seul nom d’hôte |
| `app.build_site_snapshot(site)` | Instantané complet et cohérent d’un site |
| `app.publish_site(site, label)` | Publication atomique, version figée et immuable |
| `app.rollback_site(site, version)` | Retour arrière instantané |
| `app.compute_order_pricing(plan, coupon)` | Prix lu dans le catalogue, jamais fourni |
| `app.create_order(...)` | Commande créée avec un prix serveur et une preuve d’acceptation des CGV |
| `app.request_refund(order, reason)` | Éligibilité calculée, déduction domaine conditionnelle |
| `app.apply_order_paid(...)` | Paiement appliqué une seule fois, quoi qu’il arrive |
| `app.upsert_subscription_from_stripe(...)` | Abonnement synchronisé, prix figé |
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
| Le quota de pages est respecté | `app.enforce_page_quota` |
| Le créateur d’une organisation en est propriétaire | `app.grant_creator_ownership` |

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
scripts/db-test.sh         # base jetable + migrations + 175 assertions
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

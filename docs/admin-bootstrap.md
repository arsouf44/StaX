# Compte propriétaire de la plateforme

## Le point essentiel

**Posséder l’adresse e-mail d’administration ne confère aucun droit.**

Une personne qui créerait un compte avec cette adresse via le formulaire public
obtient un compte ordinaire. Le rôle vient de `profiles.platform_role`, écrit
uniquement par le script d’approvisionnement avec la clé de service, et protégé
en base par le déclencheur `app.guard_platform_role`.

C’est vérifié par une assertion de la suite de sécurité.

---

## Le mot de passe initial n’existe nulle part

Il n’apparaît ni dans le dépôt, ni dans le JavaScript, ni dans Git, ni dans une
migration, ni dans `.env.example`. Il est fourni **au moment de l’exécution** :

```bash
ADMIN_EMAIL=a.gomez@eleves-alsacienne.org \
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
ADMIN_BOOTSTRAP_PASSWORD="$(openssl rand -base64 24)" \
pnpm admin:bootstrap
```

Le script :

- exige la clé de service et refuse de s’exécuter côté navigateur ;
- impose 16 caractères minimum, avec majuscule, minuscule, chiffre et caractère
  spécial ;
- **ne journalise jamais** le mot de passe, ni ne l’affiche, ni ne le renvoie ;
- est **idempotent** : relancé, il ne réinitialise aucun mot de passe existant ;
- marque `mfa_enforced = true` — la première connexion impose l’enrôlement du
  second facteur ;
- écrit une trace d’audit sans aucun secret.

---

## Immédiatement après

1. Se connecter et **enrôler le second facteur**. Sans lui, le back-office reste
   fermé : le contrôle exige `aal2`, pas seulement un facteur enrôlé.
2. Changer le mot de passe initial.
3. Retirer `ADMIN_BOOTSTRAP_PASSWORD` de l’environnement d’approvisionnement.

---

## Rôles internes

| Rôle | Ce qu’il peut faire |
| --- | --- |
| `platform_owner` | Tout, y compris supprimer une organisation |
| `platform_admin` | Gérer clients, commandes, sites, remboursements |
| `billing_admin` | Facturation et remboursements uniquement |
| `support` | Consulter et prendre la main, sans modifier la facturation |
| `developer` | Diagnostic technique, journaux |
| `designer` | Modèles et ressources graphiques |

Attribution depuis le back-office, par un `platform_owner` uniquement.

---

## Compte interne StaX (sites sans paiement)

Un compte interne peut créer **autant de sites qu’il veut, sur n’importe quelle
offre et n’importe quel métier, sans jamais payer**. Il sert à l’équipe (sites
de démonstration, sites offerts, comptes de test commerciaux).

### Ce qui fait le privilège — et ce qui ne le fait pas

Comme pour le propriétaire : **l’adresse e-mail ne confère rien**. Le privilège
est porté par le profil (`account_type = 'internal'`, `billing_exempt`,
`unlimited_sites`, `all_features`), écrit uniquement avec la clé de service et
protégé par le déclencheur `app.guard_account_privileges`. Aucun test du type
`if (email === …)` n’existe, ni côté navigateur ni côté serveur.

La commande sans paiement passe par `app.create_internal_order`, qui **vérifie
en base** que la personne connectée est un compte interne exonéré, puis crée
dans la même transaction : l’organisation, une commande `internal` à 0 € (prix
catalogue intégralement remis, ligne `internal_waiver`), le site sur l’offre
choisie, le projet, les pages, sections et formulaires du métier, l’adresse
`<sous-domaine>.sites.stax.fr`, et une trace d’audit
(`order.internal_created`). Aucun passage par Stripe, aucun paiement ni créance
fictifs. Une commande interne ne peut jamais basculer en « payée ».

Un client ordinaire qui appelle la même fonction est refusé par la base, et ne
peut pas s’attribuer le statut lui-même : c’est vérifié par la suite SQL et par
un parcours navigateur.

### Approvisionnement

Le mot de passe est un **secret d’approvisionnement** : il n’est écrit ni dans
Git, ni dans une migration, ni dans le front, ni dans `.env.example`, ni dans
un journal. Il est fourni au moment de l’exécution :

```bash
INTERNAL_OWNER_EMAIL=a.gomez@macrobot-ai.com \
INTERNAL_OWNER_NAME="Arsene Gomez" \
INTERNAL_OWNER_PASSWORD='…' \
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=… \
pnpm internal:bootstrap
```

Le script `scripts/bootstrap-internal-owner.ts` :

- crée le compte s’il n’existe pas (adresse confirmée), sinon le retrouve ;
- **ne touche pas** au mot de passe d’un compte existant, sauf
  `INTERNAL_OWNER_RESET_PASSWORD=true` ;
- exige 12 caractères au moins ; **n’affiche ni ne journalise** jamais le mot
  de passe ;
- pose les privilèges internes et écrit une trace d’audit
  (`account.internal_provisioned`) sans aucun secret ;
- est **idempotent** : le relancer ne change rien de plus.

Ensuite, depuis `/commander` : choisir l’offre et le métier, cocher « Je confirme
la création de ce site dans le cadre d’une commande interne StaX, sans
paiement » et cliquer « Créer le site maintenant ». Le site s’ouvre dans
l’espace client, prêt à être modifié et publié. « Créer un nouveau site »
reste accessible depuis le menu du compte.

---

## Si le compte propriétaire est perdu

Il n’existe **aucune** procédure de récupération dans l’application : ce serait
une porte dérobée. La seule voie est un accès direct à la base avec la clé de
service, c’est-à-dire un accès à l’infrastructure.

C’est la raison pour laquelle il faut **au moins deux comptes `platform_owner`**,
détenus par deux personnes différentes, avec leurs codes de secours conservés
séparément.

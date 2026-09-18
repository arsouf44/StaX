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

## Si le compte propriétaire est perdu

Il n’existe **aucune** procédure de récupération dans l’application : ce serait
une porte dérobée. La seule voie est un accès direct à la base avec la clé de
service, c’est-à-dire un accès à l’infrastructure.

C’est la raison pour laquelle il faut **au moins deux comptes `platform_owner`**,
détenus par deux personnes différentes, avec leurs codes de secours conservés
séparément.

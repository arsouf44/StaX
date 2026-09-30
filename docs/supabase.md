# Supabase

## Projet

- Région **européenne** (`eu-west-3` par défaut) : les données applicatives ne
  quittent pas l’Union européenne.
- Sauvegardes quotidiennes et restauration à un instant donné (PITR) activées.
- Authentification par e-mail et mot de passe, double facteur TOTP activé.

## Rôles et clés

| Clé | Portée | Où elle vit |
| --- | --- | --- |
| `anon` | RLS active, aucune session | Navigateur et serveur (publique) |
| `service_role` | **RLS contournée** | Secret de déploiement uniquement |

La clé de service n’est **jamais** préfixée `NEXT_PUBLIC_`, et
`createServiceClient()` refuse de s’initialiser côté navigateur.

## Authentification

| Réglage | Valeur | Raison |
| --- | --- | --- |
| Confirmation de l’e-mail | activée | Empêche l’usurpation d’adresse |
| Durée du jeton d’accès | 1 h | Compromis entre confort et exposition |
| Rotation du jeton de rafraîchissement | activée | Un jeton volé devient vite inutilisable |
| Double facteur TOTP | activé | Obligatoire pour les comptes d’administration |
| URL de redirection | liste fermée : `https://<domaine>/auth/confirmation` | Empêche une redirection ouverte ; cette route ouvre la session des liens d’e-mail (confirmation, mot de passe oublié) |
| Site URL | `https://<domaine>` | Base des liens envoyés par Supabase |
| SMTP | personnalisé (Resend, Postmark…) | Le SMTP par défaut de Supabase n’envoie que quelques e-mails par heure |

## Stockage

Deux compartiments :

| Compartiment | Public | Contenu |
| --- | --- | --- |
| `site-media` | oui | Images publiées sur les sites clients |
| `project-files` | non | Documents échangés pendant un projet |

Les fichiers privés ne reçoivent **jamais** d’URL publique : ils passent par une
URL signée, générée côté serveur pour un destinataire identifié.

Le type MIME est vérifié par une contrainte en base **et** par les octets d’en-tête
du fichier à l’envoi : une extension ne prouve rien.

## Sauvegardes

Voir [backup-recovery.md](./backup-recovery.md).

## Durées de conservation (purge quotidienne)

La fonction `app.apply_retention()` (migration 0039) supprime chaque jour les
données qui ont dépassé la durée annoncée dans la politique de confidentialité
et le registre des traitements : journaux techniques (12 mois), journal d’audit
(3 ans), statistiques unitaires (30 jours), signalements clos (1 an), etc.

Elle est planifiée automatiquement à 3 h 17 **si l’extension `pg_cron` est
active** au moment de la migration. Sur Supabase, activez `pg_cron`
(Database → Extensions) **avant** d’appliquer les migrations, ou planifiez-la
ensuite :

```sql
select cron.schedule('nemasus-retention', '17 3 * * *', 'select app.apply_retention()');
```

Sans cette planification, les durées de conservation publiées ne sont pas
respectées : c’est une non-conformité au RGPD (article 5.1.e).

## Tâche de fond des sites (toutes les 5 minutes)

La migration 0053 active `pg_net` et planifie `nemasus-site-operations`
(`*/5 * * * *`), qui appelle `/api/cron/sites` de la plateforme. Elle ne fait
rien tant que l’adresse de la plateforme et `CRON_SECRET` ne sont pas dans
Vault :

```sql
select vault.create_secret('https://votre-domaine.fr', 'nemasus_platform_url');
select vault.create_secret('<valeur de CRON_SECRET>', 'nemasus_cron_secret');
```

Détails et vérification : [deployment.md](./deployment.md) § 9.

## Tâches planifiées par la base elle-même

Trois autres tâches `pg_cron` tournent **sans dépendre de la plateforme** (ni
adresse, ni secret) : elles ne font que lire et écrire la base.

| Tâche | Cadence | Rôle | Migration |
| --- | --- | --- | --- |
| `nemasus-analytics-rollup` | chaque heure (`7 * * * *`) | recalcule les statistiques des sites (visiteurs distincts, pages, sources, appareils, pays, contacts, commandes, encaissé) des journées encore ouvertes | 0059 |
| `nemasus-system-health` | toutes les 10 minutes | dérive l’état réel de la page d’état (webhooks Stripe, e-mails, domaines, sauvegardes, dernier passage de chaque tâche) | 0060 |
| `nemasus-retention` | chaque nuit (3 h 17) | purge de conservation (ci-dessus) | 0039 |

**Administration → État des services** liste ces tâches, leur dernier passage
et son résultat, et dit si les secrets Vault de `nemasus-site-operations` sont
présents (jamais leur valeur).

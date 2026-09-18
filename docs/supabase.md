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
| URL de redirection | liste fermée | Empêche une redirection ouverte |

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

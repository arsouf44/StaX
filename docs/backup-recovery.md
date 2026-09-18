# Sauvegardes et restauration

## Ce qui est sauvegardé

| Donnée | Où | Fréquence | Rétention |
| --- | --- | --- | --- |
| Base PostgreSQL | Supabase | Quotidienne + PITR | 7 jours (PITR), 30 jours (quotidiennes) |
| Médias | Supabase Storage | Répliqué | Selon l’offre |
| Code | Git | À chaque commit | Permanente |
| Configuration Workers | `wrangler.jsonc` versionné | À chaque commit | Permanente |
| **Secrets** | **Aucune sauvegarde** | — | — |

Les secrets ne sont volontairement sauvegardés nulle part : une sauvegarde de
secrets est une fuite qui attend son heure. Ils sont conservés dans un
gestionnaire de mots de passe d’équipe, hors du système.

---

## Ce qu’une sauvegarde ne protège pas

À dire clairement :

- **Une suppression logique propagée.** Si un défaut supprime des lignes et que
  personne ne s’en aperçoit pendant huit jours, le PITR ne remonte plus assez
  loin. C’est pourquoi les journaux d’audit sont append-only et les versions
  publiées immuables : ils survivent à une erreur applicative.
- **Un secret compromis.** Restaurer la base ne referme pas une fuite de clé.
- **Une erreur de configuration DNS chez un client.** Elle n’est pas dans notre
  périmètre de sauvegarde.

---

## Restauration complète

À faire uniquement en cas de perte majeure, et en connaissance de cause : une
restauration **écrase** l’état courant.

```bash
# 1. Couper l’accès écrit (mode maintenance)
wrangler secret put STAX_MAINTENANCE_MODE --env production   # valeur: true

# 2. Restaurer depuis l’interface Supabase (PITR ou sauvegarde datée)

# 3. Vérifier la cohérence AVANT de rouvrir
psql "$DATABASE_URL" -f tests/sql/rls.test.sql

# 4. Rouvrir
wrangler secret delete STAX_MAINTENANCE_MODE --env production
```

**Entre l’instant restauré et l’instant de la panne, les données sont perdues.**
Les paiements de cet intervalle sont récupérables : Stripe rejoue ses webhooks
pendant trois jours, et les fonctions sont idempotentes. Les messages et
réservations reçus dans l’intervalle ne le sont pas.

---

## Restauration d’un seul client

Beaucoup plus fréquent, et sans risque pour les autres.

**Un site revenu à une version antérieure** — le client le fait lui-même depuis
son espace, en un clic. Chaque version publiée est un instantané complet et figé.

**Des données supprimées par erreur** — restaurer la base entière pour un seul
client serait disproportionné. La procédure est : restauration dans une base
temporaire, extraction des lignes du seul `organization_id` concerné,
réinsertion. À faire avec la clé de service et une trace d’audit explicite.

---

## Exercice de restauration

Une sauvegarde qui n’a jamais été restaurée n’est pas une sauvegarde.

**Trimestriellement :** restaurer une sauvegarde de production dans un projet
jetable, exécuter `tests/sql/rls.test.sql` dessus, vérifier que les comptages
des tables principales correspondent, puis détruire le projet.

Ce qui est mesuré à chaque exercice : durée totale, ancienneté réelle des données
restaurées, et écarts constatés. Ces chiffres sont notés — ils constituent les
seules valeurs honnêtes de RTO et RPO que nous puissions annoncer.

# Sauvegardes et restauration

## Ce qui est sauvegardé

| Donnée | Où | Fréquence | Rétention |
| --- | --- | --- | --- |
| Données de la base (PostgreSQL) | Export chiffré AES-256, artefact GitHub Actions ([`backup.yml`](../.github/workflows/backup.yml)) | Quotidienne (2 h 17 UTC) | 30 jours |
| Schéma de la base | Migrations du dépôt (`supabase/migrations`) | À chaque commit | Permanente |
| Médias | Supabase Storage ; images publiées copiées dans le dépôt de chaque site | Répliqué | Selon l’offre |
| Code | Git | À chaque commit | Permanente |
| Configuration | `apps/platform/vercel.json`, `apps/site-runtime/wrangler.jsonc` versionnés | À chaque commit | Permanente |
| **Secrets** | **Aucune sauvegarde** | — | — |

Supabase reste sur l’offre gratuite : **ni sauvegarde téléchargeable, ni
restauration à un instant donné (PITR)**. L’export quotidien en tient lieu.
Il ne fonctionne qu’une fois posés, dans *GitHub → Settings → Secrets and
variables → Actions* :

| Secret | Valeur |
| --- | --- |
| `SUPABASE_DB_URL` | *Supabase → Connect → Session pooler* (port 5432), mot de passe compris. La « Direct connection » est en IPv6 seulement : les machines de GitHub ne l’atteignent pas. |
| `BACKUP_PASSPHRASE` | Phrase secrète d’au moins 24 caractères (`openssl rand -base64 32`), **conservée aussi dans le gestionnaire de mots de passe de l’équipe** : sans elle, aucune sauvegarde ne se restaure. |

Lancez-le une première fois à la main (*Actions → Sauvegarde de la base → Run
workflow*) et vérifiez l’artefact. Un échec est signalé par e-mail par GitHub.

L’artefact est chiffré avant de quitter la machine d’exécution : GitHub
(sous-traitant déjà déclaré) ne conserve qu’un fichier illisible sans la
phrase secrète.

Les secrets ne sont volontairement sauvegardés nulle part : une sauvegarde de
secrets est une fuite qui attend son heure. Ils sont conservés dans un
gestionnaire de mots de passe d’équipe, hors du système.

---

## Ce qu’une sauvegarde ne protège pas

À dire clairement :

- **Une suppression logique propagée.** Si un défaut supprime des lignes et que
  personne ne s’en aperçoit pendant plus de trente jours, aucune sauvegarde ne remonte assez
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
# 1. Couper l’accès : Vercel → Settings → Deployment Protection → « All Deployments »
#    (la production n’est plus servie qu’à l’équipe connectée à Vercel)

# 2. Récupérer et déchiffrer la dernière sauvegarde (Actions → Sauvegarde de la base → artefact)
gpg --decrypt nemasus-<date>.dump.gpg > nemasus.dump

# 3. Base neuve (nouveau projet Supabase, ou base vidée) : le schéma d’abord…
DATABASE_URL="postgresql://…" pnpm db:migrate
#    … puis les données, triggers suspendus le temps du chargement
PGOPTIONS='-c session_replication_role=replica' \
  pg_restore --data-only --no-owner --dbname="$DATABASE_URL" nemasus.dump

# 4. Vérifier la cohérence AVANT de rouvrir
psql "$DATABASE_URL" -f tests/sql/rls.test.sql

# 5. Rouvrir : remettre la protection sur « Preview Deployments » seulement
```

La sauvegarde doit être restaurée sur une base au **même niveau de
migrations** que le jour de l’export (`git log` du jour, puis `pnpm db:migrate`
à ce commit).

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

# Conduite en cas d’incident

## Niveaux

| Niveau | Exemple | Délai de première réponse |
| --- | --- | --- |
| **P1** | Fuite de données, sites hors ligne, paiements bloqués | Immédiat |
| **P2** | Une fonctionnalité majeure indisponible | 1 heure |
| **P3** | Un client affecté, contournement possible | 1 jour ouvré |
| **P4** | Gêne mineure | Prochaine version |

---

## Les six premières minutes

1. **Constater** — reproduire, noter l’heure exacte.
2. **Mesurer la portée** — un client ? tous ? les lectures ou les écritures ?
3. **Annoncer** — mettre à jour `system_health` : la page d’état est publique.
4. **Contenir** avant de comprendre. Comprendre peut attendre ; l’hémorragie,
   non.

```bash
# Revenir à la version précédente
wrangler rollback <deployment-id> --env production

# Suspendre un site compromis
psql "$DATABASE_URL" -c "update sites set status='suspended' where id='...'"

# Révoquer toutes les sessions d’un compte
# (interface Supabase, ou auth.admin.signOut côté serveur)
```

---

## Suspicion de fuite de données

**Ne pas supprimer les journaux.** Ce sont les seules preuves de ce qui s’est
passé.

1. Geler l’état : sauvegarde immédiate des journaux d’audit et de sécurité.
2. Déterminer la portée : quelles tables, quelles organisations, quelle période.
3. Couper l’accès : révoquer les clés concernées, fermer les sessions.
4. Évaluer l’obligation de notification.

### Notification à la CNIL

Si la violation est susceptible d’engendrer un risque pour les droits et libertés
des personnes : **notification dans les 72 heures**, même si l’analyse n’est pas
terminée. Une notification incomplète dans les délais vaut mieux qu’une
notification complète hors délai.

Si le risque est **élevé**, les personnes concernées doivent être informées
directement, en termes clairs et sans minimiser.

---

## Incident de paiement

| Symptôme | Vérifier d’abord |
| --- | --- |
| Virement reçu mais pas de code chez le client | `/admin/commandes` → la commande : état de l’e-mail du code ; « Envoyer un nouveau code » (le précédent est désactivé) |
| Client bloqué sur `/acces` | Liste des codes de la commande : expiré, désactivé, déjà utilisé, nombre d’essais ; émettre un nouveau code |
| E-mails non reçus | `/admin/sante` (fournisseur configuré ?) et `email_log` ; `RESEND_API_KEY`, domaine d’envoi vérifié dans Resend |
| Encaissements Connect non appliqués | `webhook_events` : statut `failed` et son motif |

Les fonctions étant idempotentes, **rejouer un événement est sans danger**. En
cas de doute, rejouer est préférable à ne rien faire.

```sql
select event_id, event_type, status, attempts, error
  from webhook_events
 where status = 'failed'
 order by received_at desc limit 20;
```

---

## Après

**Sous cinq jours ouvrés**, écrire un compte rendu qui répond à cinq questions :

1. Que s’est-il passé, du point de vue du client ?
2. Quelle était la cause première — pas le symptôme ?
3. Pourquoi ne l’avions-nous pas détecté plus tôt ?
4. Qu’est-ce qui a permis à ce défaut d’exister ?
5. Quelle protection empêche sa réapparition ?

**Le document ne nomme personne.** Un incident est un défaut de système : si une
seule personne pouvait provoquer une panne majeure, c’est le système qui le
permettait.

Chaque incident P1 ou P2 doit produire au moins **un test** qui aurait échoué
avant le correctif. Un correctif sans test est une invitation à la récidive.

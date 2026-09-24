# Stripe — paiements de la plateforme

Ce document couvre les revenus de StaX. Les encaissements réalisés **sur les
sites des clients** sont décrits dans [stripe-connect.md](./stripe-connect.md).

---

## Produits et prix

Les prix font autorité **en base** (`plans`, migration 0043), pas chez Stripe.
Les identifiants Stripe (`stripe_setup_price_id`,
`stripe_maintenance_price_id`) sont facultatifs : s’ils sont absents, le
montant est envoyé en `price_data` à partir de la commande. Les prix sont
**hors taxes** (`prices_include_vat = false`), TVA de 20 % ajoutée.

| Offre | Création (HT, une fois) | Maintenance (HT, par mois, dès la livraison) |
| --- | --- | --- |
| Essentiel | 300 € | 12 € |
| Premium | 550 € | 14 € |
| Ultra Premium | 1 099 € | 16 € |
| Exceptionnel | 1 790 € | 18 € |
| Sur mesure | sur devis | sur devis |

Les anciennes versions **annuelles** des offres sont archivées, jamais
réécrites : un contrat déjà vendu garde son prix et sa périodicité.

**Une évolution du tarif public n’affecte jamais un contrat en cours.** Le prix
de maintenance est figé dans la commande (`orders.maintenance_price_cents`)
puis dans l’abonnement. C’est vérifié par un test.

---

## Le flux, et pourquoi il est dans cet ordre

```
COMMANDE
1. Le client valide son récapitulatif
2. app.create_order()        → prix LU DANS LE CATALOGUE, CGV horodatées,
                               maintenance « en attente de livraison »
3. checkout.sessions.create  → mode `payment` : la CRÉATION seulement,
                               setup_future_usage = off_session (carte enregistrée)
4. Redirection vers Stripe
5. Webhook signé             → app.apply_order_paid()
6. La commande devient « payée », le site et le projet sont créés

… conception, développement hors de StaX, vérifications …

LIVRAISON
7. L’équipe livre le site    → app.deliver_site() (checklist complète)
8. startMaintenanceAtDelivery → stripe.subscriptions.create, `month`,
                               carte enregistrée, off_session
9. Webhook customer.subscription.* → app.upsert_subscription_from_stripe()
                               (refusé si le site n’est pas livré)
```

L’étape 5 est la seule qui fasse basculer la commande. La page de confirmation
ne lit même pas le `session_id` renvoyé par Stripe : elle relit l’état réel.

**Aucune maintenance n’est facturée avant la livraison.** Le code ne crée
l’abonnement qu’à l’étape 8, et la base refuse d’enregistrer un abonnement
mensuel pour un site non livré (`site_not_delivered`). La première période
mensuelle commence le jour de la livraison.

**Échec au démarrage.** Si la carte est refusée ou si Stripe est
indisponible, la livraison n’est pas annulée : la commande passe en
« démarrage échoué » (`app.mark_maintenance_start_failed`), l’équipe le voit
dans *Infrastructure & livraison* et relance. Si la banque exige une
authentification, l’abonnement reste « incomplet » et Stripe envoie au client
le lien pour la valider : rien n’est supposé payé. L’idempotence
(`maintenance-start:<commande>`) empêche deux abonnements.

Pendant les quelques secondes qui séparent le retour du navigateur de la
réception du webhook, la page affiche « paiement en cours de confirmation ».
C’est honnête, et préférable à une confirmation qui pourrait être fausse.

---

## Idempotence

Stripe rejoue un événement jusqu’à trois jours. Deux niveaux de protection :

1. `webhook_events (provider, event_id)` sous contrainte d’unicité — un
   événement déjà traité est refusé immédiatement.
2. Chaque fonction appliquée est elle-même idempotente — un rejeu ne crée ni
   paiement, ni site, ni projet, ni abonnement en double. Prouvé par test.

À la création, une clé d’idempotence dérivée de l’identifiant de commande évite
qu’un double-clic ne produise deux sessions de paiement.

---

## Codes de réponse du webhook

| Situation | Code | Raison |
| --- | --- | --- |
| Signature invalide ou absente | 400 | Rejouer ne changerait rien |
| Secret non configuré | 503 | Erreur de déploiement, réessai utile |
| Base injoignable | 503 | Réessai utile |
| Événement déjà traité | 200 | Rien à faire |
| Traitement en échec | 200 | Enregistré avec son motif, rejoué par la tâche de fond |

Un 500 ferait rejouer Stripe indéfiniment sur une erreur qui ne se résoudra pas
d’elle-même.

---

## Résiliation, impayés, suspension

- **Résiliation** : à tout moment, en ligne (*Abonnement → Résilier votre
  contrat*, portail Stripe), sans frais ni durée minimale. Elle prend effet au
  terme du mois en cours (`cancel_at_period_end`) ; un e-mail confirme la
  date de fin.
- **Impayé** : `invoice.payment_failed` met l’abonnement en retard ; Stripe
  relance selon ses réglages de recouvrement.
- **Après la dernière période payée** : le site reste accessible pendant la
  période de continuité (`MAINTENANCE_GRACE_PERIOD_DAYS`, 30 jours par
  défaut), puis peut être suspendu. Un site suspendu n’est plus modifiable ni
  publiable (`app.site_is_available`) ; ses données ne sont ni supprimées ni
  altérées pendant `MAINTENANCE_SUSPENSION_RETENTION_DAYS` (90 jours par
  défaut), puis archivées. L’export reste possible pendant toute cette
  période.

Ces règles sont celles des CGV (articles 9 à 11) : la page `/cgv` et ce code
lisent les mêmes durées.

## Contrats annuels antérieurs : rappel de reconduction

Seuls les contrats vendus **avant** le passage à la maintenance mensuelle sont
annuels et reconduits tacitement. Pour eux, l’article L215-1 du Code de la
consommation impose d’informer le client **entre trois mois et un mois** avant
l’échéance. Le rappel part à la réception de `invoice.upcoming`, uniquement
pour un abonnement `billing_interval = 'year'` non résilié. Deux réglages
Stripe restent donc **obligatoires** tant qu’il existe de tels contrats :

1. l’endpoint de webhook de la plateforme doit être abonné à `invoice.upcoming` ;
2. dans les paramètres de facturation Stripe, le délai des « upcoming renewal
   events » (événements de renouvellement à venir) doit être fixé à **45 jours** :
   c’est la seule valeur qui tombe dans la fenêtre légale d’un à trois mois.

Un abonnement déjà résilié (`cancel_at_period_end`) ne reçoit pas de rappel. Un
envoi en échec est rejoué par la tâche de fond, comme tout événement en échec.

---

## Remboursements

Déclenchés depuis le back-office après examen, jamais automatiquement.

L’éligibilité est calculée **en base** par `app.request_refund` à partir de la
date réelle de mise en ligne (`projects.go_live_at`). La retenue de 10 € ne s’applique **que** si un nom
de domaine a effectivement été acheté — condition vérifiée sur l’état réel du
dossier.

Le remboursement n’est considéré comme abouti que lorsque Stripe le confirme par
`charge.refunded`.

---

## Tests locaux

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger checkout.session.completed
```

`stripe listen` affiche un secret de webhook temporaire : renseignez-le dans
`STRIPE_WEBHOOK_SECRET` pour la session de développement.

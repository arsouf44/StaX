# Stripe — paiements de la plateforme

Ce document couvre les revenus de StaX. Les encaissements réalisés **sur les
sites des clients** sont décrits dans [stripe-connect.md](./stripe-connect.md).

---

## Produits et prix

Les prix font autorité **en base** (`plans`), pas chez Stripe. Les identifiants
Stripe (`stripe_setup_price_id`, `stripe_monthly_price_id`) sont facultatifs :
s’ils sont absents, le montant est envoyé en `price_data` à partir de la
commande.

| Offre | Création | Maintenance |
| --- | --- | --- |
| Classique | 239,99 € | 14 € / mois |
| Premium | 499 € | 32 € / mois |
| Signature | 999 € | 40 € / mois |
| Sur mesure | sur devis | sur devis |

**Une évolution du tarif public n’affecte jamais un contrat en cours.** Le prix
mensuel est figé dans `subscriptions.monthly_price_cents` au moment de la
commande. C’est vérifié par un test.

---

## Le flux, et pourquoi il est dans cet ordre

```
1. Le client valide son récapitulatif
2. app.create_order()        → prix LU DANS LE CATALOGUE, CGV horodatées
3. checkout.sessions.create  → montants figés dans la commande
4. Redirection vers Stripe
5. Webhook signé             → app.apply_order_paid()
6. La commande devient « payée », le site et le projet sont créés
```

L’étape 5 est la seule qui fasse basculer la commande. La page de confirmation
ne lit même pas le `session_id` renvoyé par Stripe : elle relit l’état réel.

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

## Rappel de reconduction (obligation légale)

La maintenance est annuelle et se reconduit tacitement. L’article L215-1 du Code
de la consommation impose d’informer le client **entre trois mois et un mois**
avant l’échéance ; sans ce rappel, un client non professionnel peut résilier à
tout moment après la reconduction. StaX l’envoie à tous ses clients.

Le rappel part à la réception de l’événement `invoice.upcoming`. Deux réglages
Stripe sont donc **obligatoires** en production :

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
date réelle de mise en ligne. La retenue de 10 € ne s’applique **que** si un nom
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

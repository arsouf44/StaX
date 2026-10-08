# Stripe — ce qu’il fait encore

Depuis la migration 0066, **Nemasus n’encaisse plus ses prestations par
Stripe** : aucune offre, aucun prix public, aucun abonnement, aucun paiement par
carte. Une commande se règle par **virement bancaire**, au montant convenu avec
le client, et l’accès à l’espace client s’ouvre avec un code personnel envoyé
après réception du virement. Voir [commande-virement.md](./commande-virement.md).

Stripe ne sert plus qu’à **Stripe Connect** : les encaissements réalisés sur les
sites **des clients** (boutique, acomptes), versés sur le compte Stripe du
commerçant, sans commission. Voir [stripe-connect.md](./stripe-connect.md).

| Variable | Usage |
| --- | --- |
| `STRIPE_SECRET_KEY` | Connect : création des comptes connectés et des paiements des boutiques |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signature du webhook `/api/webhooks/stripe-connect` |
| `STRIPE_CONNECT_CLIENT_ID` | Rattachement d’un compte Stripe existant (OAuth) |

Ces trois variables sont facultatives : sans elles, l’encaissement en ligne des
sites clients reste désactivé, et tout le reste fonctionne.

## Ce qui a été retiré

- La route `/api/webhooks/stripe` (paiement de la création, abonnements,
  factures, remboursements) n’existe plus ; `STRIPE_WEBHOOK_SECRET` n’est plus
  utilisé par la plateforme.
- Les fonctions de commande au prix d’une offre, de session de paiement, de
  propositions payées par carte, de rattachement de facture et de demande de
  remboursement en ligne restent en base pour l’historique, mais **aucune
  session cliente ne peut plus les exécuter** (0066).
- Les anciennes offres (`plans`) restent en base, non publiques, pour les sites
  et contrats qui y sont déjà rattachés. Les nouveaux sites reçoivent l’offre
  interne `site-nemasus`, sans prix, qui ne porte que leurs droits techniques.

Les contrats déjà conclus par carte (avant 0066) restent consultables dans
l’administration (organisations) et dans le tableau de bord Stripe.

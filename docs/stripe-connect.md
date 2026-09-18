# Stripe Connect — encaissements des clients

## Le principe

Quand un visiteur paie sur le site d’un client StaX, **l’argent ne transite
jamais par un compte StaX**. Il va directement sur le compte Stripe du client,
ouvert à son nom.

```ts
export const PLATFORM_APPLICATION_FEE_BPS = 0;
```

La commission est de zéro. L’architecture la prévoit — un champ
`application_fee_cents` existe — mais elle n’est pas appliquée, et aucun texte
commercial ne prétend le contraire.

Conséquences pour le client :

- il perçoit ses recettes directement, selon son calendrier de versement Stripe ;
- il ne dépend pas de la solvabilité de StaX ;
- il voit ses transactions dans son propre tableau de bord Stripe ;
- il ne paie que les frais bancaires de Stripe, facturés par Stripe.

---

## Type de compte

Comptes **Express**. Le client garde la relation avec Stripe, mais
l’inscription est guidée et bien plus courte qu’un compte standard.

---

## Parcours

```
1. Le client clique « Activer les paiements »
2. accounts.create({ type: 'express' })        → connected_accounts
3. accountLinks.create()                       → redirection Stripe
4. Le client fournit ses justificatifs
5. Webhook account.updated                     → statut mis à jour
6. charges_enabled && payouts_enabled          → paiements ouverts
```

| Statut | Signification pour le client |
| --- | --- |
| `not_started` | Rien n’a encore été demandé |
| `onboarding` | Inscription commencée, non terminée |
| `pending_verification` | Stripe vérifie les justificatifs |
| `active` | Les paiements sont ouverts |
| `restricted` | Encaissements possibles, versements bloqués |
| `disabled` | Stripe a suspendu le compte |

Un statut n’est **jamais** déduit de l’interface : il vient du webhook, qui
seul reflète la décision de Stripe.

---

## Identification du tenant

L’événement Connect porte un champ `account`. **C’est lui, et lui seul, qui
identifie le client concerné.** Aucun identifiant présent dans la charge utile
n’est utilisé pour cette décision : la correspondance passe par
`connected_accounts.stripe_account_id`, enregistré au moment où StaX a créé le
compte pour ce client.

---

## Ce que le client doit savoir

- **Le compte est à son nom.** Il peut le déconnecter de StaX à tout moment
  depuis son tableau de bord Stripe ; son site cessera alors d’encaisser.
- **Stripe peut demander des justificatifs** au-delà de certains seuils : c’est
  une obligation réglementaire, pas une décision de StaX.
- **Les litiges sont gérés par le client**, dans son tableau de bord Stripe.
  StaX n’est pas partie à la transaction.

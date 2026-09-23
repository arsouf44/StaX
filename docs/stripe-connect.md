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

Comptes **Stripe complets, au nom du client** (propriétés `controller`
équivalentes à un compte « Standard ») :

| Propriété | Valeur | Conséquence |
| --- | --- | --- |
| `stripe_dashboard.type` | `full` | Le client a le tableau de bord Stripe complet et s’y connecte avec **ses propres identifiants** sur dashboard.stripe.com |
| `fees.payer` | `account` | Les frais Stripe sont facturés au client par Stripe, pas à StaX |
| `losses.payments` | `stripe` | Litiges et soldes négatifs relèvent de Stripe et du client : StaX n’en est pas garant |
| `requirement_collection` | `stripe` | Stripe collecte lui-même les justificatifs : aucune donnée KYC ne transite par StaX |

Les paiements sont des **charges directes** sur ce compte (`Stripe-Account`) :
l’argent ne transite jamais par un compte StaX, et la commission est nulle.

Un compte « Express » aurait fait de StaX le payeur des frais et le
responsable des pertes de chaque client, avec un tableau de bord réduit : il
n’est plus utilisé. Un ancien compte Express éventuel reste accessible par un
lien de connexion à usage unique.

---

## Deux parcours

**Le client n’a pas de compte Stripe** — « Créer mon compte Stripe » :

```
1. accounts.create({ controller: … })         → connected_accounts
2. accountLinks.create()                       → pages hébergées par Stripe
3. Le client fournit ses justificatifs à Stripe
4. Webhook account.updated                     → statut mis à jour
5. charges_enabled && payouts_enabled          → paiements ouverts
```

**Le client a déjà un compte Stripe** — « J’ai déjà un compte Stripe »
(disponible si `STRIPE_CONNECT_CLIENT_ID` est configuré) :

```
1. connect.stripe.com/oauth/authorize          → le client se connecte chez Stripe
2. Retour /api/stripe/connect/retour           → état signé, même personne, même
                                                 organisation, droit payments.connect
3. oauth.token()                               → identifiant du compte relié
4. connected_accounts + journal d’audit        → paiements ouverts si le compte est actif
```

Aucun justificatif n’est à refournir, et le client peut retirer l’accès de StaX
à tout moment depuis Stripe (`account.application.deauthorized` coupe alors
l’encaissement sur son site).

| Statut | Signification pour le client |
| --- | --- |
| `not_started` | Rien n’a encore été demandé |
| `onboarding` | Inscription commencée, non terminée |
| `pending_verification` | Stripe vérifie les justificatifs |
| `active` | Les paiements sont ouverts |
| `restricted` | Encaissements possibles, versements bloqués |
| `disabled` | Stripe a suspendu le compte, ou le client a retiré l’accès |

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

- **Le compte est à son nom.** Il s’y connecte directement sur stripe.com, et
  peut déconnecter StaX à tout moment ; son site cessera alors d’encaisser.
- **Stripe peut demander des justificatifs** au-delà de certains seuils : c’est
  une obligation réglementaire, pas une décision de StaX.
- **Les litiges sont gérés par le client**, dans son tableau de bord Stripe.
  StaX n’est pas partie à la transaction.

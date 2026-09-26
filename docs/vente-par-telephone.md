# Vente par téléphone — le mode d'emploi de l'équipe

**L'idée :** on appelle une entreprise. Si l'appel est concluant, on lui
prépare son site, on le met en ligne sur son projet Cloudflare, et on lui
envoie un e-mail : « Votre site est prêt ». Elle le regarde, crée son compte
avec un code, nous écrit si elle veut une retouche, et paie. Le site lui est
alors **livré automatiquement** : elle peut le modifier elle-même, la
maintenance mensuelle démarre.

```
APPEL CONCLUANT → SITE CONSTRUIT ET VÉRIFIÉ → PROPOSITION (e-mail + code, 14 jours)
→ LE PROSPECT CRÉE SON COMPTE ET SAISIT SON CODE → IL VOIT SON SITE ET LE PRIX
→ (MESSAGES / RETOUCHES) → PAIEMENT → LIVRAISON AUTOMATIQUE
```

Règles décidées :

| Question | Règle |
| --- | --- |
| Quel prix ? | Une des 4 offres du catalogue (Essentiel, Premium, Ultra Premium, Exceptionnel), **sans remise**, figée à l'envoi |
| Combien de temps ? | **14 jours**. Ensuite le code ne marche plus ; **rien n'est effacé** : on relance ou on retire |
| Le code ? | 12 caractères (`7K2M-9QXP-4HTA`), prérempli par le lien de l'e-mail, **valable uniquement avec l'adresse du prospect** |
| Avant de payer ? | Le prospect **voit** son site et le prix, et peut **écrire** à l'équipe. Il ne peut **rien modifier** (la base le refuse) |
| Après le paiement ? | Livraison **automatique** : éditeur ouvert, maintenance démarrée, e-mails envoyés |
| Le domaine ? | Le site est livré sur son adresse Cloudflare (`…pages.dev` / `…workers.dev`). Le client demande son domaine ensuite, par la messagerie |

---

## 1. Préparer le site

1. **Sites → Créer un site** : nom de l'entreprise, métier, ville. L'offre
   peut rester « À définir » : elle sera fixée par la proposition.
2. Développez le site dans son **dépôt GitHub**, déployé par son **projet
   Cloudflare** (comme tout site StaX : [site-delivery.md](./site-delivery.md)).
3. **Fiche du site → Infrastructure & livraison** : rattachez le dépôt et le
   projet, importez le manifeste (contenu initial = version 1), puis faites la
   **checklist** :
   - « Formulaires testés » et « Responsive vérifié » : attestez-les ;
   - contrôles automatiques (déployé, HTTPS, SEO) : « Lancer les vérifications » ;
   - **le domaine n'est pas nécessaire** pour une proposition.

Pourquoi tout vérifier avant d'envoyer ? Parce qu'après le paiement, le site
est livré **sans intervention** : il doit être prêt avant.

## 2. Envoyer la proposition

**Fiche du site → « Proposer ce site à un prospect »** (ou **Propositions →
Nouvelle proposition**) :

| Champ | Conseil |
| --- | --- |
| Offre convenue | Celle annoncée au téléphone. Le prix affiché est celui du catalogue |
| Adresse e-mail | **Celle que le prospect utilisera pour créer son compte.** Faites-la épeler au téléphone |
| Nom de l'entreprise, prénom | Repris dans l'e-mail : « Bonjour Marie, le site de la Boulangerie Martin est prêt » |
| Petit mot | Facultatif, repris dans l'e-mail et sur sa page : « Ravi de notre échange de ce matin » |
| Notes internes | Jamais montrées au prospect |

« Envoyer la proposition » vérifie d'abord le site (contrôles de moins de
20 h, sinon ils sont refaits), puis envoie l'e-mail. Si l'e-mail ne part pas
(fournisseur non configuré, adresse refusée), **le code et le lien s'affichent
une seule fois** : copiez-les et envoyez-les vous-même.

## 3. Suivre

**Propositions** affiche, pour chaque prospect :

| État | Ce que ça veut dire | Quoi faire |
| --- | --- | --- |
| Envoyée | E-mail parti, code pas encore utilisé | Rappeler au bout de quelques jours |
| Compte créé · paiement attendu | Il a vu son site | Répondre à ses messages, rappeler |
| Payée · site livré | Vendu | Rien : il a reçu son e-mail de livraison |
| Payée · livraison à terminer | Un contrôle a échoué au moment du paiement | Ouvrir la checklist, corriger : la livraison se refait seule (toutes les 5 min), ou livrez à la main |
| Expirée | 14 jours écoulés | **Relancer** ou **Retirer** |
| Retirée | Abandonnée | — |

- **Relancer (+14 jours)** : si le code n'a pas servi, un **nouveau code** est
  envoyé (l'ancien ne marche plus) ; si le prospect a déjà son compte, il
  reçoit un rappel « Une dernière étape ».
- **Retirer** : le code cesse de fonctionner ; si le prospect avait récupéré le
  site, il n'y a plus accès (son compte reste). Rien n'est effacé. Impossible
  pendant un paiement en cours.

Vous recevez un e-mail quand un prospect **récupère** son site, quand il vous
**écrit**, et quand il **paie** (ou si la livraison attend un contrôle).

## 4. Ce que voit le prospect

1. **L'e-mail** : « Le site de … est prêt », un bouton **Récupérer mon site**,
   le prix (HT et TTC), la maintenance, la date limite, son code.
2. **`/recuperer`** : trois étapes expliquées ; « Créer mon compte » (adresse
   préremplie) ou « J'ai déjà un compte ». L'e-mail de confirmation le ramène
   directement sur cette page, connecté ; le code est prérempli : un clic.
3. **Son espace** : son site en grand, le prix, ce que comprend l'offre,
   « Payer … et récupérer mon site », et en dessous la discussion
   « Une question ou une petite retouche ? Écrivez-nous ».
4. **Le paiement** (Stripe) : deux cases à cocher (usage professionnel, CGV),
   puis la page de paiement Stripe.
5. **« Merci ! Votre site est à vous »** : bouton « Modifier mon site », carte
   « Vos premiers pas », e-mail de livraison.

## 5. Cas particuliers

| Situation | Réponse |
| --- | --- |
| « Je n'ai pas reçu l'e-mail » | Vérifier les indésirables ; sinon **Relancer** (nouveau code) ou dicter le code affiché |
| Il a créé son compte avec une autre adresse | Le code est refusé (message clair). Il se déconnecte et crée son compte avec la bonne adresse — ou retirez et renvoyez une proposition à la nouvelle adresse |
| Il veut une retouche avant de payer | Faites-la dans le dépôt (nouveau déploiement) : il la voit aussitôt sur son espace. Répondez-lui dans *Messages clients* |
| Il veut une autre offre | Retirez la proposition et envoyez-en une nouvelle avec la bonne offre |
| Il veut payer par virement | Ce parcours encaisse par carte (Stripe), ce qui permet aussi de prélever la maintenance. Un règlement par virement n'est pas automatisé ici : utilisez le parcours *Factures de vente*, et livrez à la main |
| Il abandonne le paiement | Il revient sur son espace (« Paiement interrompu, rien n'a été débité ») et peut reprendre |

---

Côté technique : table `site_proposals` et fonctions `app.*_site_proposal`
(migration 0054), `lib/proposals.ts`, `/admin/propositions`, `/recuperer`,
`/app` (tableau de bord du prospect), webhook Stripe → `completePaidProposal`,
reprise par `/api/cron/sites`. Preuves : `tests/sql/rls.test.sql`
(« Propositions de site »), `tests/unit/proposals.test.ts`,
`tests/e2e/journeys/cold-call.spec.ts`.

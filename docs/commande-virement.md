# Commande, virement et code d’accès

Nemasus ne publie aucun prix et n’encaisse rien en ligne pour ses propres
prestations. Le cycle complet d’un client est le suivant :

```
1. COMMANDE        le visiteur décrit son activité et envoie sa commande (/commander)
2. MODALITÉS       l’équipe fixe le montant convenu et envoie les instructions de virement
3. VIREMENT REÇU   l’équipe constate le virement sur le relevé et le confirme
4. CODE D’ACCÈS    la base crée l’organisation, le site, le projet et un code personnel
5. ACCÈS           le client saisit son code (/acces), choisit son mot de passe
6. ESPACE CLIENT   il suit son projet, puis gère son site une fois livré
```

Aucun prix, aucune offre, aucun abonnement n’apparaît sur le site public, dans
le parcours de commande, les métadonnées ou les données structurées. Un test
(`tests/unit/product-promises.test.ts`) refuse toute grille tarifaire dans les
fichiers visibles des clients.

---

## 1. Commande (visiteur, sans compte)

`/commander` → activité → informations → adresse du site → envoi.

- Le serveur enregistre la commande par `app.submit_site_order` (clé de
  service uniquement) : limitation de débit (`orderForm`, 5 par heure et par
  adresse), champ piège, Turnstile si configuré, acceptation des CGV
  obligatoire, double envoi dédoublonné (15 minutes).
- Référence `CMD-AAAA-NNNNN`, accusé de réception par e-mail, alerte à
  l’équipe, page `/commander/merci`.
- Rien n’est créé d’autre : ni compte, ni organisation, ni site.

Une commande prise **au téléphone** se saisit dans
`/admin/commandes/nouvelle` (`app.admin_create_site_order`) et suit ensuite
exactement le même chemin.

## 2. Modalités de paiement (équipe)

`/admin/commandes/{id}` → « 1. Modalités de paiement » : montant convenu (TTC)
et message facultatif. L’e-mail contient le montant, le titulaire, l’IBAN, le
BIC et la **référence à indiquer dans le libellé du virement**, avec un
avertissement : *nos coordonnées bancaires ne changent jamais par e-mail*.

Les coordonnées viennent de la configuration serveur (`BANK_TRANSFER_HOLDER`,
`BANK_TRANSFER_IBAN`, `BANK_TRANSFER_BIC`, `BANK_TRANSFER_BANK`). Sans titulaire
ni IBAN, l’envoi est bloqué et l’administration l’indique. Les modalités peuvent
être renvoyées (rappel) ou corrigées.

## 3. Virement reçu (équipe)

« 2. Virement reçu » : montant reçu, durée de validité du code (7 à 90 jours,
30 par défaut), site déjà préparé facultatif, et case **« Je confirme que le
virement est arrivé sur le compte bancaire »**. `app.confirm_site_order_payment`
(administrateur de la plateforme uniquement) :

- crée l’organisation, le site (offre interne `site-nemasus`, sans prix) et le
  projet, ou reprend un site préparé qui n’a pas encore de client ;
- émet un code d’accès lié à l’adresse e-mail de la commande ;
- refuse une adresse appartenant à un compte de l’équipe (`staff_email`) ;
- passe la commande en « payée » (une seule fois : `already_paid`).

Le code est envoyé par e-mail. **Si l’e-mail n’a pas pu partir** (fournisseur
absent ou en panne), le code est affiché **une seule fois** à la personne de
l’équipe, avec le lien d’accès, pour être transmis par un autre canal ; la page
n’est mise à jour qu’après « J’ai noté le code ».

## 4. Le code d’accès

| Propriété | Comment |
| --- | --- |
| Jamais stocké en clair | Empreinte HMAC-SHA-256 avec `NEMASUS_SECRET_KEY` (`activation_codes.code_hash`) ; seuls les 4 derniers caractères sont conservés pour l’affichage |
| Imprévisible | 12 caractères tirés d’un alphabet de 31 (sans 0, O, 1, I, L), environ 60 bits |
| Vérifié côté serveur uniquement | `app.check_access_code` et `redeem_activation_code` ne sont exécutables que par la clé de service |
| Force brute | 8 essais par quart d’heure et par adresse IP (`accessCode`) ; au-delà de 10 essais sur un même code, il est bloqué même juste |
| Expiration, révocation | Date d’expiration ; « Désactiver » dans l’administration ; un nouveau code désactive les précédents encore ouverts |
| Usage unique | Consommé à la première ouverture réussie |
| Isolation | Le code désigne une organisation et un site précis ; la session ouverte est celle du compte de l’adresse de la commande, jamais un identifiant fourni par le navigateur |
| Organisation suspendue | Code refusé |
| Lien de l’e-mail | `/acces?code=…` **préremplit** seulement le champ : un antivirus qui visite le lien ne consomme rien |

Messages affichés : code non reconnu, expiré, désactivé, déjà utilisé, trop de
tentatives, compte indisponible. Aucun ne révèle une adresse ou un autre client.

## 5. Accès (client)

`/acces` → « Entrez votre code d’accès » → « Accéder à mon site ».
`lib/access-code.ts` :

1. vérifie le code (`check_access_code`) ;
2. crée le compte s’il n’existe pas (adresse confirmée par la possession du
   code), sinon reprend le compte existant ;
3. ouvre la session **côté serveur** (lien magique généré et vérifié par le
   serveur, cookies `httpOnly`) — avant de consommer le code, pour qu’une panne
   du service d’authentification ne le brûle jamais ;
4. consomme le code (`redeem_activation_code`) : le compte devient propriétaire
   de l’organisation ;
5. demande le second facteur si le compte en a un, puis le premier mot de passe
   (`/acces/mot-de-passe`) pour un nouveau compte.

Les comptes de l’équipe ne peuvent pas s’ouvrir par un code : ils se
connectent avec mot de passe et second facteur.

## 6. Mot de passe oublié (Resend)

`/mot-de-passe-oublie` → e-mail → `/nouveau-mot-de-passe?jeton=…` → connexion.

- Réponse **identique** pour toute adresse : « Si un compte correspond à cette
  adresse, vous recevrez un e-mail permettant de réinitialiser votre mot de
  passe. » L’e-mail part **après** la réponse : la durée de la requête ne
  trahit pas l’existence d’un compte.
- Jeton aléatoire de 256 bits ; la base n’en garde que l’empreinte HMAC
  (`password_reset_tokens`), valable une heure, un seul lien ouvert par compte,
  5 demandes par heure et par compte, 5 essais par lien.
- La page affiche le formulaire **sans consommer** le jeton ; il est consommé à
  l’envoi, puis le mot de passe est changé, **toutes les sessions** du compte
  sont fermées et les autres liens révoqués. Un échec du service
  d’authentification rend le lien à nouveau utilisable.
- Redirection vers `/connexion?reinitialise=1`.

Ce parcours ne dépend plus des e-mails de Supabase : aucune configuration SMTP
de Supabase n’est nécessaire pour la réinitialisation.

## 7. E-mails

| Modèle | Quand |
| --- | --- |
| `siteOrderReceivedEmail` | Commande reçue (référence, suite du parcours, aucun prix) |
| `bankTransferInstructionsEmail` | Modalités, et leurs rappels (montant, IBAN, référence) |
| `accessCodeEmail` | Virement reçu (code, lien, expiration, usage unique) |
| `passwordResetEmail` | Mot de passe oublié (lien valable une heure, une fois) |

Mise en page commune (`packages/emails/src/layout.ts`) : responsive, version
texte, champs échappés, aucun secret. Chaque envoi est journalisé
(`email_log`) et son issue est visible dans l’administration.

`RESEND_API_KEY` suffit à activer Resend. C’est un **secret serveur** : à
renseigner dans les variables d’environnement du déploiement (jamais dans le
dépôt, jamais dans une variable `NEXT_PUBLIC_*`). Sans `EMAIL_FROM`, les
e-mails partent de `Nemasus <notifications@nemasus.com>` — le domaine
`nemasus.com` est vérifié dans Resend — et les réponses vont à l’adresse de
support, `a.gomez@contact-nemasus.com`. Un `EMAIL_FROM` sur un autre domaine
doit d’abord être vérifié dans Resend, sinon l’envoi est refusé.
Sans clé, les e-mails sont seulement journalisés (mode console).

## 8. Tests

| Fichier | Ce qu’il prouve |
| --- | --- |
| `tests/sql/rls.test.sql` (bloc 0066) | Surface réservée au serveur, aucune écriture directe, code haché lié à l’adresse, usage unique, expiré, désactivé, force brute, organisation suspendue, compte de l’équipe refusé, isolation entre clients, jetons de réinitialisation |
| `tests/unit/site-orders.test.ts` | Format et empreinte des codes, montants, e-mails (échappement, IBAN, référence), configuration Resend |
| `tests/e2e/journeys/bank-transfer.spec.ts` | Le parcours entier par l’interface, de la commande à la réinitialisation du mot de passe |
| `tests/e2e/journeys/penetration.spec.ts` | Un client ne lit, ne valide ni ne consomme rien d’un autre |

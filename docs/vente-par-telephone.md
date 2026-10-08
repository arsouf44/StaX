# Vente par téléphone — le mode d’emploi de l’équipe

Un appel concluant suit **le même chemin qu’une commande en ligne** : il n’y a
plus de proposition payée par carte ni de prix de catalogue. Le montant est
celui convenu au téléphone, réglé par virement ; l’espace du client s’ouvre
avec son code d’accès personnel. Référence complète :
[commande-virement.md](./commande-virement.md).

```
APPEL CONCLUANT → COMMANDE SAISIE PAR L’ÉQUIPE → MODALITÉS DE VIREMENT
→ VIREMENT REÇU → CODE D’ACCÈS → LE CLIENT OUVRE SON ESPACE → PROJET → LIVRAISON
```

## 1. Saisir la commande

**Commandes → Saisir une commande** (`/admin/commandes/nouvelle`) : entreprise,
adresse e-mail du client (celle qui recevra le code), contact, métier, ce qui a
été convenu, notes internes (jamais montrées au client). La commande reçoit sa
référence `CMD-AAAA-NNNNN`.

Le client accepte les conditions générales lors de son premier accès : la
commande saisie par l’équipe le note (`saisie-equipe`).

## 2. Envoyer les modalités

Sur la fiche de la commande, « 1. Modalités de paiement » : montant convenu,
message facultatif. Le client reçoit le montant, les coordonnées bancaires de la
configuration et la référence à indiquer dans le libellé du virement. On peut
renvoyer un rappel ou corriger le montant tant que le virement n’est pas reçu.

## 3. Constater le virement

Vérifiez sur le relevé bancaire le virement portant la référence, puis
« 2. Virement reçu » : montant reçu, validité du code, et, si le site a déjà
été préparé (Sites → Créer un site), le site à rattacher. Cochez la
confirmation : l’organisation, le projet et le code d’accès sont créés, et le
code part par e-mail.

Si l’e-mail ne part pas, le code s’affiche **une seule fois** : transmettez-le
par téléphone ou SMS, puis cliquez sur « J’ai noté le code ».

## 4. Après l’accès du client

Le client saisit son code sur `/acces`, choisit son mot de passe et suit son
projet. La suite (développement hors de Nemasus, rattachement, checklist,
livraison) est décrite dans [site-delivery.md](./site-delivery.md).

| Situation | Geste |
| --- | --- |
| Code perdu ou expiré | « Envoyer un nouveau code » : les codes encore ouverts sont désactivés |
| Code envoyé à une mauvaise adresse | « Désactiver », corriger l’adresse avec le client, émettre un nouveau code |
| Commande abandonnée | « Annuler la commande » (motif interne facultatif) |
| Adresse d’un compte de l’équipe | Refusée : un code n’ouvre jamais un compte de l’équipe |

## 5. Les règles du démarchage — à respecter à chaque appel

Le démarchage des **entreprises** est permis ; celui des **particuliers** ne
l’est plus sans leur accord préalable (loi n° 2025-594 du 30 juin 2025, en
vigueur depuis le **11 août 2026**, article L.223-1 du Code de la
consommation). D’où ces règles, qui protègent la société :

1. **N’appeler que des numéros professionnels** (standard, ligne de
   l’établissement, numéro publié pour l’activité). Un artisan ou un
   indépendant joint sur son numéro **personnel** peut être regardé comme un
   consommateur : en cas de doute, on n’appelle pas.
2. **Parler de son activité professionnelle** : l’offre (un site pour son
   entreprise) doit être en rapport avec elle.
3. **Se présenter** dès le début de l’appel : votre prénom, « Nemasus », l’objet
   de l’appel. Si l’appel est enregistré, le dire et demander l’accord. Si la
   personne commande, dire avant de raccrocher (information RGPD) :
   > « Je vous envoie les modalités de paiement par e-mail. Nous avons trouvé le
   > numéro de votre établissement dans un annuaire professionnel ; vos
   > coordonnées ne servent qu’à votre commande, et vous pouvez nous demander à
   > tout moment de les effacer. »
4. **Respecter le refus immédiatement** : « pas intéressé » → on raccroche
   poliment et on inscrit l’entreprise dans la liste d’opposition (3 ans) ;
   « ne me rappelez plus » → idem, et on efface le reste.
5. **Ne saisir la commande qu’après un « oui »** pendant l’appel, avec
   l’adresse que la personne a donnée. Jamais d’envoi en masse.
6. **Horaires raisonnables** : jours ouvrés, pendant les heures d’ouverture
   de l’entreprise appelée.
7. **Fichiers** : ne constituer les listes qu’à partir de sources publiques
   (registres, annuaires professionnels, fiches d’établissement, sites des
   entreprises) ; ne conserver un prospect que 3 ans après son dernier
   contact ; le traitement est décrit dans
   [REGISTRE_TRAITEMENTS.md § A9](./REGISTRE_TRAITEMENTS.md).

Chaque e-mail envoyé au client renvoie à la politique de confidentialité
(« Vos données et vos droits »).

## Données des prospects

Une commande non payée (reçue, en attente de virement ou annulée) est anonymisée
trois ans après le dernier échange (`app.apply_retention()`). Les anciennes
propositions (avant 0066) restent soumises à leurs règles de conservation
d’origine.

# Configuration légale

Publier un site commercial français sans mentions légales valides est une
infraction, pas un détail cosmétique. Ce document liste ce qui doit être
renseigné, et ce qui se passe si ça ne l’est pas.

---

## Aucune valeur n’est inventée

Le dépôt ne contient **aucun** numéro SIREN, aucune adresse, aucun capital,
aucun nom de directeur de la publication. Toutes ces valeurs viennent de
l’environnement. Une valeur absente affiche un marqueur explicite :

```
[A CONFIGURER — SIREN]
```

Volontairement laid et impossible à confondre avec une vraie valeur.

---

## Variables

### Obligatoires — bloquent le démarrage en production

| Variable | Contenu |
| --- | --- |
| `LEGAL_COMPANY_NAME` | Dénomination sociale exacte (extrait Kbis) |
| `LEGAL_FORM` | SASU, SAS, SARL, EI, micro-entreprise… |
| `LEGAL_ADDRESS` | Adresse postale complète du siège |
| `LEGAL_SIREN` | Numéro d’identification INSEE |
| `LEGAL_DIRECTOR` | Directeur de la publication (personne physique, LCEN) |
| `LEGAL_HOST` | Raison sociale de l’hébergeur |
| `LEGAL_HOST_ADDRESS` | Adresse et contact de l’hébergeur |
| `LEGAL_HOST_PHONE` | Téléphone de l’hébergeur (LCEN art. 6 III, modifié en 2024) |
| `LEGAL_DPO_CONTACT` | Contact pour l’exercice des droits RGPD |
| `SUPPORT_EMAIL` | Adresse de contact publique |

### Facultatives mais recommandées

| Variable | Quand la renseigner |
| --- | --- |
| `LEGAL_CAPITAL` | Sociétés de capitaux |
| `LEGAL_RCS` | Ville d’immatriculation et numéro |
| `LEGAL_VAT` | Sauf franchise en base (art. 293 B du CGI) |
| `LEGAL_MEDIATOR` | **Obligatoire pour la vente aux consommateurs** (art. L.612-1) |
| `LEGAL_SUPPORT_PHONE` | Recommandé pour la confiance client |

---

## Comportement selon l’environnement

| Environnement | Information manquante |
| --- | --- |
| Développement | Marqueur affiché, bandeau d’avertissement sur les pages légales |
| Préversion | Idem |
| **Production** | **Le démarrage est refusé** |

Pour ouvrir une production encore privée sans toutes les informations :

```bash
LEGAL_ALLOW_INCOMPLETE=true
```

Le démarrage est alors autorisé, un avertissement est journalisé, et les pages
légales affichent un bandeau rouge. **Cette option doit être retirée avant toute
ouverture commerciale.**

Vérification manuelle :

```bash
pnpm legal:check
```

---

## LEGAL_REVIEW_REQUIRED

```ts
export const LEGAL_REVIEW_REQUIRED = true as const;
```

Les neuf documents livrés (mentions légales, CGV, CGU, confidentialité, cookies,
remboursements, données personnelles, sous-traitants, accessibilité) sont des
**modèles**. Ils sont sérieux, structurés et cohérents avec ce que le produit
fait réellement — ils n’ont pas été relus par un professionnel du droit.

**À faire avant ouverture commerciale :**

1. Faire relire les neuf documents par un avocat spécialisé.
2. Valider la rédaction du droit de rétractation (article 8 des CGV) : les
   exceptions applicables aux services pleinement exécutés et aux biens
   personnalisés doivent être formulées avec précision.
3. Vérifier les clauses limitatives de responsabilité : une clause qui viderait
   de sa substance l’obligation essentielle du contrat serait réputée non écrite
   (art. 1170 du Code civil).
4. Désigner un médiateur de la consommation et renseigner `LEGAL_MEDIATOR`.
5. Vérifier la liste des sous-traitants et les garanties de transfert.
6. Passer `LEGAL_REVIEW_REQUIRED` à `false` **uniquement** après cette relecture.

---

## Garantie commerciale de remboursement

| Paramètre | Défaut | Variable |
| --- | --- | --- |
| Délai après mise en ligne | 15 jours | `REFUND_WINDOW_DAYS` |
| Retenue si un domaine a été acheté | 10 € | `DOMAIN_REFUND_DEDUCTION_CENTS` |

La retenue ne s’applique **que** si un nom de domaine a réellement été acheté —
condition vérifiée sur l’état réel du dossier par `app.request_refund`, jamais
déclarée à la main.

Cette garantie est un **engagement volontaire**. Elle s’ajoute aux garanties
légales de conformité et des vices cachés, et au droit de rétractation : elle ne
les remplace ni ne les restreint. Aucun texte du produit ne doit laisser penser
le contraire.

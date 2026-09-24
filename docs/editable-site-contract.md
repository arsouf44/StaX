# Le contrat d’édition : `stax.manifest.json`

Chaque site StaX est **conçu et développé individuellement**, dans son propre
dépôt, avec le code et le design faits pour ce client. StaX ne fournit aucun
modèle de site et n’en choisit aucun : l’offre, le métier ou les réponses au
questionnaire ne sélectionnent jamais de modèle.

Ce que StaX sait d’un site, c’est ce que son développeur y **déclare
modifiable**, dans un fichier à la racine du dépôt : `stax.manifest.json`. Ce
fichier ne décrit pas le site, il décrit une **surface d’édition** : les
titres, textes, images, horaires, coordonnées, pages, collections et
formulaires que le client pourra changer depuis StaX après la livraison. La
mise en page, le design, le code et les intégrations restent ceux qui ont été
développés : le client ne peut ni les casser ni les remplacer.

Deux sites peuvent avoir des manifestes sans aucun point commun ; c’est voulu.

Code : `packages/site-contract/` (schéma, validation, fichier de contenu, pont
d’aperçu, contrôle de l’offre). Schéma JSON public, pour l’autocomplétion dans
l’éditeur du développeur : `/schemas/stax.manifest.v1.json`.

---

## 1. Le cycle en une phrase

Le développeur déclare les zones modifiables → l’équipe importe le manifeste
dans StaX (*Administration → Site → Infrastructure & livraison*) → StaX reprend
le contenu déjà présent dans le dépôt comme **version 1** → après la
livraison, le client modifie un **brouillon** → **Publier** → StaX écrit le
**fichier de contenu** (et les images nouvelles) dans le dépôt par un commit
`stax: publication client 0000N` → Cloudflare reconstruit le site → la version
n’est « en ligne » qu’une fois le déploiement confirmé.

Le site **lit ce fichier au moment de sa construction**. Il n’appelle pas StaX
pour afficher son contenu : un site livré continue de fonctionner même si la
plateforme est indisponible.

## 2. Structure du manifeste

```json
{
  "$schema": "https://stax.fr/schemas/stax.manifest.v1.json",
  "contract": 1,
  "site": { "name": "Boulangerie Lumière", "locales": ["fr"], "defaultLocale": "fr" },
  "content": {
    "file": "src/content/stax.content.json",
    "mediaDir": "public/media/stax",
    "mediaUrl": "/media/stax"
  },
  "preview": { "bridge": true },
  "globals": [ … ],
  "pages": [ … ],
  "collections": [ … ],
  "forms": [ … ],
  "modules": ["contact"],
  "integrations": { "analytics": true }
}
```

| Clé | Obligatoire | Rôle |
| --- | --- | --- |
| `contract` | oui | version du contrat (`1`). Une version inconnue est **refusée**, jamais interprétée. |
| `site.locales`, `site.defaultLocale` | oui | langues du site ; la langue par défaut doit figurer dans la liste |
| `content.file` | oui | fichier `.json` du dépôt où StaX écrit le contenu publié |
| `content.mediaDir` | oui | dossier du dépôt où StaX dépose les images envoyées par le client |
| `content.mediaUrl` | oui | adresse publique de ce dossier sur le site (`/media/stax`) |
| `preview.bridge` | non | le site charge le pont d’aperçu dans ses builds d’aperçu (clic pour modifier) |
| `globals` | non | groupes partagés par tout le site (coordonnées, horaires, réseaux, pied de page) |
| `pages` | oui (≥ 1) | pages éditables, chacune découpée en sections, chacune en champs |
| `collections` | non | listes d’éléments : actualités, réalisations, biens, fiches… |
| `forms` | non | formulaires du site, reçus dans la messagerie StaX du client |
| `modules` | non | services StaX que le code du site utilise via l’API des sites |
| `integrations` | non | mesure d’audience sans cookie, comptes clients, suivi de commande |

Les chemins du dépôt sont relatifs et sans `..`. Les identifiants de pages,
sections, groupes et collections sont en *kebab-case* ; ceux des champs en
*camelCase* ou *snake_case*. **Ils doivent rester stables** : c’est par eux que
StaX relie le contenu du client au code du site.

### Pages et sections

```json
{
  "id": "accueil",
  "label": "Accueil",
  "path": "/",
  "seo": true,
  "sections": [
    {
      "id": "hero",
      "label": "Bandeau d’accueil",
      "fields": [
        { "id": "titre", "label": "Titre", "type": "text", "required": true, "maxLength": 120 },
        { "id": "photo", "label": "Photo", "type": "image", "aspectRatio": "16:9" }
      ]
    }
  ]
}
```

`seo: true` ajoute un titre et une description pour les moteurs de recherche
à la page. `path` sert à l’aperçu et au plan affiché dans l’éditeur.

### Collections

```json
{
  "id": "actualites",
  "label": "Actualités",
  "itemLabel": "Article",
  "kind": "articles",
  "route": "/actualites/{slug}",
  "slugFrom": "titre",
  "fields": [ … ]
}
```

Une collection avec `route` doit indiquer `slugFrom` (un champ texte). Le
client ajoute, masque, réordonne et supprime des éléments ; le site génère
leurs pages à la construction.

### Formulaires

```json
{
  "slug": "contact",
  "label": "Contact",
  "kind": "contact",
  "fields": [
    { "name": "nom", "label": "Nom", "type": "text", "required": true },
    { "name": "email", "label": "E-mail", "type": "email", "required": true },
    { "name": "message", "label": "Message", "type": "textarea", "required": true }
  ]
}
```

Types de base : `text`, `textarea`, `email`, `tel`, `consent`. Types avancés
(droit « formulaires avancés » de l’offre) : `select`, `multiselect`, `radio`,
`checkbox`, `number`, `date`, `time`. Déclarer des formulaires exige le module
`contact`. Le site envoie les réponses à
`POST https://<api>/v1/sites/<clé publique>/forms/<slug>` ; StaX revalide
chaque réponse contre cette déclaration (champs inconnus rejetés).

## 3. Types de champs

| Type | Valeur éditée par le client | Dans le fichier de contenu |
| --- | --- | --- |
| `text` | texte (option `multiline`, `minLength`, `maxLength` ≤ 5 000) | chaîne ou `null` |
| `richtext` | paragraphes, intertitres, listes, citations ; gras, italique, liens (≤ 50 000) | `{ "html", "blocks" }` — HTML déjà assaini |
| `image` | photo de la médiathèque, texte alternatif (obligatoire par défaut) | `{ "src", "alt", "width", "height" }` |
| `gallery` | plusieurs photos (`min`, `max` ≤ 200) | tableau d’images |
| `link` | libellé + adresse | `{ "label", "href" }` |
| `url` | adresse interne ou externe | chaîne |
| `phone` | numéro | `{ "display", "href": "tel:+33…" }` |
| `email` | adresse | chaîne |
| `number` | nombre (`min`, `max`, `step`, `integer`, `unit`) | nombre |
| `boolean` | oui / non | booléen |
| `select` | un choix parmi `options` | valeur choisie |
| `date` | date (`min`, `max`) | `AAAA-MM-JJ` |
| `opening_hours` | horaires de la semaine, fermetures exceptionnelles | `{ "week": { "mon": [{ "open", "close" }], … }, "exceptions", "note" }` |
| `seo` | titre, description, image de partage (option `image`) | `{ "title", "description", "image" }` |
| `address` | adresse postale | `{ "line1", "line2", "postalCode", "city", "country" }` |
| `navigation` | menu (`maxItems` ≤ 40, `maxDepth` 1 ou 2) | `[{ "id", "label", "href", "children" }]` |
| `repeater` | liste répétable de champs simples (équipe, FAQ, carte…) | `[{ "_id", … }]` |

Chaque champ accepte `label`, `help`, `required` et `localized`. Par défaut,
sur un site multilingue, `text`, `richtext`, `link`, `seo` et `navigation` sont
traduisibles ; les autres non.

## 4. Limites

Elles protègent la plateforme et l’usage : un éditeur à trois mille champs
n’est plus utilisable. Un projet qui les dépasse relève de l’offre sur mesure.

| Élément | Maximum |
| --- | --- |
| pages | 60 |
| sections par page | 40 |
| champs par section / groupe / collection | 60 |
| groupes globaux | 20 |
| collections | 20 |
| éléments par collection | 1 000 |
| formulaires | 40 |
| champs par formulaire | 40 |
| langues | 8 |
| éléments d’une liste répétable | 200 |
| images d’une galerie | 200 |
| entrées de menu | 40 |
| options d’une liste de choix | 60 |
| contenu complet sérialisé | 1,5 Mo |

## 5. Contrôle de l’offre

À l’import, le résumé du manifeste (pages, langues, formulaires, collections,
modules) est comparé aux **droits de l’offre achetée** (`checkManifestAgainstPlan`,
et `app.delivery_readiness` en base, contrôle « Offre correctement
appliquée ») :

| Déclaration | Droit exigé |
| --- | --- |
| nombre de pages | `max_pages` de l’offre |
| plusieurs langues | `multi_language` et `max_locales` |
| nombre de formulaires | `max_forms` |
| champs de formulaire avancés | `advanced_forms` |
| collections | `blog` |
| module `booking` | `bookings` |
| modules `products`, `orders` | `ecommerce` |
| modules `payments`, `donations` | `online_payments` |
| module `customer-accounts` | `customer_accounts` (+ `integrations.customerAccounts.loginPath`) |

Un site dont le contrat dépasse l’offre **ne peut pas être livré** : l’équipe
corrige le manifeste ou l’offre, jamais l’inverse en silence. Le même contrôle
s’applique côté API des sites : un module non inclus reste fermé, quel que
soit le manifeste.

## 6. Le fichier de contenu

À chaque publication, StaX écrit `content.file` dans le dépôt :

```json
{
  "$schema": "https://stax.fr/schemas/stax.content.v1.json",
  "contract": 1,
  "stax": { "site": "1f0a…", "version": 2, "release": "7c3b…", "preview": null },
  "defaultLocale": "fr",
  "locales": {
    "fr": {
      "globals": { "coordonnees": { "telephone": { "display": "04 78 00 00 00", "href": "tel:+33478000000" } } },
      "pages": {
        "accueil": {
          "path": "/",
          "seo": { "title": "…", "description": "…", "image": null },
          "sections": { "hero": { "titre": "Fournée du matin", "photo": { "src": "/media/stax/0b4e….webp", "alt": "…", "width": 1600, "height": 900 } } }
        }
      },
      "collections": { "actualites": [ { "_id": "…", "_slug": "ouverture", "_path": "/actualites/ouverture", "titre": "…" } ] }
    }
  }
}
```

Garanties :

- **chaque champ déclaré est présent** (`null`, `[]` s’il est vide) : le code
  n’a pas à deviner ;
- **chaque langue est complète** : un texte non traduit reprend la langue par
  défaut ;
- les éléments masqués d’une collection ne sont pas écrits ;
- la sérialisation est **stable** (clés triées) : un même contenu donne
  toujours le même fichier, donc des commits lisibles et des publications
  idempotentes ;
- `stax.preview` n’est renseigné que dans les builds d’aperçu (branche
  `stax-preview`), jamais en production.

**Images.** Une photo envoyée par le client est déposée dans
`content.mediaDir` sous le nom `<identifiant>.<extension>` (jpg, png, webp,
avif, gif, svg, pdf), dans le même commit que le contenu, puis référencée par
son adresse publique (`content.mediaUrl`). Une image manquante bloque la
publication plutôt que de publier un site cassé.

**Contenu initial.** Le site est livré avec son fichier de contenu déjà
rempli : à l’import, StaX relit `content.file` au commit de production, le
valide contre le contrat et en fait la **version 1** du site (le contenu que
l’équipe a réellement mis en ligne). Un fichier absent ou invalide bloque
l’import : un site qui ne lit pas ses textes depuis ce fichier ne peut pas
être géré par StaX.

## 7. Obligations du code du site

1. **Lire `content.file` à la construction** (import JSON, chargeur de
   contenu du framework) et en tirer tout texte déclaré modifiable.
2. **Ne jamais coder en dur** un texte, une image ou une coordonnée déclarée
   dans le manifeste : sinon la publication du client n’aurait aucun effet.
3. Générer les pages des collections, le `sitemap.xml` et les balises SEO
   **à la construction**, depuis le fichier de contenu.
4. Servir `content.mediaDir` à l’adresse `content.mediaUrl`.
5. Rendre le HTML de `richtext.html` tel quel (il est assaini par StaX), ou
   rendre `blocks` soi-même.
6. Accepter qu’un commit `stax:` modifie **uniquement** le fichier de contenu
   et le dossier des médias. StaX ne touche à aucun autre fichier.
7. Garder les identifiants stables ; pour renommer ou retirer une zone,
   modifier le manifeste puis le faire **réimporter** par l’équipe (le
   contenu du client est revalidé ; les zones retirées sont signalées).

## 8. Aperçu cliquable (facultatif, recommandé)

Le code marque les éléments modifiables avec l’adresse de leur champ :

```html
<h1 data-stax="pages.accueil.hero.titre">Fournée du matin</h1>
<p data-stax="globals.coordonnees.telephone">04 78 00 00 00</p>
<title data-stax="pages.accueil._seo">…</title>
<h2 data-stax="collections.actualites.<_id>.titre">…</h2>
```

et, **dans les builds d’aperçu seulement** (quand `stax.preview` est
renseigné), charge le pont :

```html
<script src="https://app.stax.fr/bridge/v1.js" defer></script>
```

Dans l’éditeur, un clic sur l’élément ouvre le champ correspondant, et une
saisie de texte s’affiche aussitôt dans l’aperçu en attendant le build. Le
pont n’écoute que l’origine de l’éditeur StaX, n’exécute jamais de code reçu
et ne fait que remplacer du texte ou des attributs d’image et de lien
(messages `ready`/`select` du site, `mode`/`highlight`/`patch` de l’éditeur).
Sans pont, l’aperçu fonctionne ; le client choisit simplement la zone dans la
liste.

## 9. Validation

| Moment | Contrôle |
| --- | --- |
| Import du manifeste | schéma strict (clé inconnue = erreur), unicité des identifiants et chemins, cohérences (`slugFrom`, options des listes, module `contact`), limites, offre |
| Enregistrement d’un brouillon (`mode: draft`) | types et formats des valeurs ; un champ obligatoire vide est accepté |
| Publication (`mode: publish`) | champs obligatoires remplis, minimum d’éléments des collections, médias présents, taille totale |
| Base de données | le brouillon et les versions ne s’écrivent que par des fonctions contrôlées (`save_site_draft`, `request_site_release`) : révision attendue, membre de l’organisation, site livré (côté client) et non suspendu |

Les avertissements (pont non déclaré, mesure d’audience non déclarée) ne
bloquent pas : ils sont affichés à l’équipe.

## 10. Vérifier son manifeste

- Autocomplétion : ajouter `"$schema": "https://stax.fr/schemas/stax.manifest.v1.json"`.
- Validation complète (mêmes règles que StaX) : `parseManifest` de
  `@stax/site-contract` ; l’import dans *Infrastructure & livraison* affiche
  chaque erreur avec son chemin (`pages[0].sections[1].fields[2].maxLength`).
- Tests : `tests/unit/site-contract.test.ts` (manifeste, valeurs, fichier de
  contenu, pont, offre).

---

Voir aussi : [site-delivery.md](./site-delivery.md),
[github-integration.md](./github-integration.md),
[cloudflare.md](./cloudflare.md).

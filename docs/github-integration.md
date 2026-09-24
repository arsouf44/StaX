# Intégration GitHub : l’application StaX

Chaque site client vit dans **son propre dépôt GitHub**. StaX y écrit les
publications du client (le fichier de contenu et les médias nouveaux) au moyen
d’une **application GitHub** — jamais d’un jeton personnel à portée
universelle.

Code : `packages/infrastructure/src/github-app.ts` (client),
`apps/platform/src/lib/external-sites/` (flux), `apps/platform/src/app/api/webhooks/github/route.ts`
(webhook), migration `20260101000044_external_sites.sql` (tables et règles).

---

## 1. Créer l’application

GitHub → *Settings* du compte qui héberge les dépôts des sites → *Developer
settings* → *GitHub Apps* → *New GitHub App*.

| Réglage | Valeur |
| --- | --- |
| Homepage URL | l’adresse de la plateforme |
| Webhook URL | `https://<plateforme>/api/webhooks/github` |
| Webhook secret | une valeur aléatoire de 32 caractères ou plus → `GITHUB_APP_WEBHOOK_SECRET` |
| Where can this app be installed | **Only on this account** |

**Permissions (le strict nécessaire) :**

| Permission de dépôt | Niveau | Pourquoi |
| --- | --- | --- |
| Contents | Read and write | lire le manifeste et le contenu, écrire les publications |
| Metadata | Read-only | obligatoire ; lister les dépôts de l’installation |

Aucune autre permission : ni *Administration*, ni *Workflows*, ni *Secrets*, ni
permission d’organisation ou de compte.

**Événements :** *Installation* (implicite), *Installation repositories*,
*Push*, *Repository*.

Générez ensuite une **clé privée** et installez l’application sur le compte,
en sélectionnant les dépôts des sites (*Only select repositories*) ou tous.

## 2. Configuration (serveur uniquement)

| Variable | Contenu |
| --- | --- |
| `GITHUB_APP_ID` | identifiant numérique de l’application |
| `GITHUB_APP_SLUG` | nom court (lien d’installation dans l’administration) |
| `GITHUB_APP_PRIVATE_KEY` | clé privée PEM (PKCS#1 ou PKCS#8), sur une ligne avec `\n`, ou encodée en base64 |
| `GITHUB_APP_WEBHOOK_SECRET` | secret du webhook (16 caractères au moins) |
| `GITHUB_API_BASE_URL` | facultatif (tests, GitHub Enterprise) |

Ces valeurs ne sont lues que par le code serveur (`readEnv`), jamais préfixées
`NEXT_PUBLIC_`, jamais transmises au navigateur ni écrites en base. Un test
(`tests/security/external-sites.test.ts`) vérifie qu’aucun composant client ne
les référence. La page *Administration → Santé* indique si l’intégration est
configurée.

Après la première installation : *Administration → Site → Infrastructure &
livraison → Synchroniser les installations* (ou attendre le webhook
`installation`).

## 3. Jetons : courts, limités à un dépôt

1. **Jeton d’application** : JWT RS256 signé avec la clé privée (WebCrypto,
   conversion PKCS#1 → PKCS#8 incluse), valable 9 minutes.
2. **Jeton d’installation** demandé **pour une opération**, restreint :

   ```json
   { "repository_ids": [<le dépôt du site>],
     "permissions": { "contents": "read" | "write", "metadata": "read" } }
   ```

   Lecture pour importer un manifeste ou vérifier une branche ; écriture pour
   publier. Le jeton reste en mémoire du processus (jamais en base) tant qu’il
   lui reste plus de 5 minutes de validité.
3. Pour **lister** les dépôts d’une installation, un jeton limité à
   `metadata: read`.

## 4. Rattacher un dépôt à un site

Seule l’administration rattache un dépôt (`app.connect_site_repository`,
réservée au personnel de la plateforme ; un client est refusé). La base
refuse :

| Code | Cas |
| --- | --- |
| `installation_unknown` | installation absente, suspendue ou retirée |
| `owner_mismatch` | le dépôt n’appartient pas au compte de l’installation |
| `repository_already_attached` | le dépôt sert déjà un autre site |
| `legacy_site` | site servi par l’ancien moteur |

Un dépôt ne sert **qu’un** site ; **aucun client ne peut rattacher le dépôt
d’une autre organisation**. Chaque rattachement et détachement est audité.

## 5. Écrire une publication

`RepositoryClient.commitFiles` utilise l’API Git Data :

1. sommet de la branche de production → arbre de base ;
2. seuls les fichiers **modifiés** sont envoyés (empreinte Git comparée) :
   le fichier de contenu, et les médias nouveaux (`<mediaId>.<ext>` dans le
   dossier déclaré par le contrat) ;
3. un blob par fichier, un arbre, **un commit** ;
4. avance de la branche **sans `force`** : si un développeur a poussé
   entre-temps (422 *not a fast forward*), l’opération est rejouée **une fois**
   au-dessus du nouveau sommet, sinon elle échoue proprement.

Message de commit :

```
stax: publication client 00002

Publiée depuis StaX par Marie Dupont.

Stax-Release: 7c3b…
Stax-Site: 1f0a…
Stax-Version: 2
```

Une restauration : `stax: restauration de la version 1 (version 5)`. Le
marqueur `Stax-Release` rend l’écriture **idempotente** : après une
interruption, le commit déjà écrit est retrouvé parmi les commits récents au
lieu d’être refait.

**Aperçus** : branche technique `stax-preview`, toujours repartie du commit de
production, puis déplacée (seule branche jamais publiée, seule où StaX déplace
une référence).

## 6. Le webhook

`POST /api/webhooks/github` :

1. **signature** `X-Hub-Signature-256` (HMAC SHA-256 du corps brut, comparaison
   à temps constant) vérifiée **avant toute lecture** — sinon **401** ;
2. **idempotence** : `X-GitHub-Delivery` enregistré sous contrainte d’unicité
   (`begin_webhook_event`) ; un rejeu n’est pas retraité ;
3. le webhook est un **signal** : aucun identifiant reçu n’ouvre de droit, et
   l’état qui compte est relu auprès de l’API.

| Événement | Effet |
| --- | --- |
| `installation`, `installation_repositories` | installation connue, suspendue, retirée |
| `push` sur la branche de production | commit de StaX (marqueur) → dépôt à jour ; commit d’un développeur → `sync_status = developer_changes`, manifeste signalé s’il a changé |
| `repository` | dépôt renommé, transféré, archivé, supprimé |

## 7. Développeurs et StaX sur le même dépôt

Les développeurs continuent de travailler normalement sur le dépôt. StaX
n’écrase jamais leur travail (avance rapide). L’administration voit les
commits extérieurs ; si `stax.manifest.json` a changé, il faut le
**réimporter** avant la prochaine publication (le contenu du client est
revalidé contre le nouveau contrat ; les zones retirées sont signalées).

## 8. Dépannage

| Symptôme | Cause probable |
| --- | --- |
| « GitHub a refusé l’authentification » (401) | `GITHUB_APP_ID` ou clé privée incorrects |
| « L’application n’a pas la permission » (403) | permission *Contents: write* absente, ou demande d’acceptation des nouvelles permissions en attente |
| « Dépôt… introuvable » (404) | application non installée sur ce dépôt |
| « La branche change trop vite » (409) | poussées concurrentes répétées ; republier |
| Webhook 401 | secret différent entre GitHub et `GITHUB_APP_WEBHOOK_SECRET` |

Tests : `tests/security/external-sites.test.ts` (JWT, jeton limité, avance
rapide, signature), `tests/integration/journeys.test.ts`,
`tests/e2e/journeys/external-site.spec.ts` (faux GitHub de la pile, mêmes API).

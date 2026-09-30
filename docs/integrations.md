# Intégrations : GitHub et Cloudflare

Sans elles, l’écran *État des services* affiche :

> Application GitHub absente (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
> `GITHUB_APP_WEBHOOK_SECRET`). Jeton Cloudflare absent
> (`CLOUDFLARE_SITES_API_TOKEN`).

Rien n’est simulé : tant qu’elles manquent, le rattachement d’un dépôt ou d’un
projet, les vérifications de livraison et les publications des clients sont
refusés. Les deux se configurent en une dizaine de minutes, depuis
**Administration → Intégrations** (`/admin/integrations`, compte propriétaire).

Prérequis : la plateforme répond en HTTPS à son adresse de production, et
`PLATFORM_URL` la désigne (GitHub doit pouvoir joindre le webhook).

---

## 1. Application GitHub — en un clic

1. *Administration → Intégrations → Application GitHub* : choisissez
   **l’organisation GitHub qui héberge les dépôts des sites** (ou votre compte
   personnel), gardez ou changez le nom (`Nemasus Sites`), puis **Créer
   l’application sur GitHub**.
2. GitHub affiche l’application préremplie — permissions, événements, adresse
   du webhook — et vous demande de confirmer.
3. Vous revenez sur Nemasus, qui affiche **une seule fois** les quatre valeurs.
   Copiez-les dans *Vercel → Settings → Environment Variables* (Production),
   « Sensitive » pour la clé et le secret :

   | Variable | Valeur |
   | --- | --- |
   | `GITHUB_APP_ID` | identifiant numérique |
   | `GITHUB_APP_SLUG` | nom court |
   | `GITHUB_APP_PRIVATE_KEY` | clé privée, déjà encodée en base64 sur une ligne |
   | `GITHUB_APP_WEBHOOK_SECRET` | secret du webhook, généré par GitHub |

4. **Redéployez** (Deployments → ⋯ → Redeploy).
5. **Installez** l’application (bouton sur la page de retour, ou
   `https://github.com/apps/<nom court>/installations/new`) sur le compte des
   dépôts, en choisissant *Only select repositories* et les dépôts des sites.
6. *Administration → Site → Infrastructure & livraison → Synchroniser les
   installations* (ou attendez le webhook `installation`).

Ce que l’application reçoit, et rien de plus : **Contents** en lecture et
écriture, **Metadata** en lecture ; événements *Installation repositories*,
*Push*, *Repository* (et *Installation*, toujours envoyé). Détail et raisons :
[github-integration.md](./github-integration.md).

Sécurité du parcours : le retour de GitHub porte un jeton signé pour **votre**
compte, valable deux heures ; un lien de retour rejoué ou forgé est refusé
avant tout échange. Les secrets ne sont ni journalisés ni écrits en base ; seule
la création (identifiant, nom court) est inscrite au journal d’audit.

**Sans passer par Nemasus** : la création manuelle reste possible (*GitHub →
Settings → Developer settings → GitHub Apps → New GitHub App*), avec les
réglages de [github-integration.md § 1](./github-integration.md).

---

## 2. Jeton Cloudflare des sites — dans votre tableau de bord

Cloudflare ne permet pas qu’une autre application crée un jeton à votre place.

1. [Cloudflare → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   → **Create Token** → **Create Custom Token**.
2. Nom : `Nemasus — sites`. Permissions, toutes au niveau **Account** :

   | Permission | Niveau | Pourquoi |
   | --- | --- | --- |
   | Cloudflare Pages | Edit | lire projets et déploiements, relancer un déploiement, ajouter un domaine |
   | Workers Scripts | Read | lire l’étiquette d’un Worker de site |
   | Workers Builds Configuration | Edit | lire les builds, relancer un build |

3. *Account Resources* : **Include** → le compte qui héberge les sites.
   Aucune permission de zone, de facturation ni de membres.
4. *Vercel → Settings → Environment Variables* (Production) :
   - `CLOUDFLARE_SITES_API_TOKEN` : le jeton (Sensitive) ;
   - `CLOUDFLARE_SITES_ACCOUNT_ID` : l’identifiant du compte (page d’accueil
     Cloudflare, colonne de droite, *Account ID*).
5. Facultatif, pour un suivi immédiat des déploiements : *Notifications →
   Destinations → Webhooks*, URL `https://<plateforme>/api/webhooks/cloudflare`,
   secret aléatoire de 32 caractères → `CLOUDFLARE_WEBHOOK_SECRET` ; puis une
   notification *Pages : Deployment status* (et/ou *Workers Builds*) vers
   cette destination.
6. **Redéployez**.

Détail : [cloudflare.md § 2 à 4](./cloudflare.md).

---

## 3. Vérifier

*Administration → État des services* : « Application GitHub » et « API
Cloudflare des sites » ne figurent plus parmi les services non configurés.
Puis, sur un site de test : *Infrastructure & livraison* → rattacher le dépôt et
le projet Cloudflare → *Importer le manifeste* → la checklist se remplit.

Tâche de fond (publications programmées, suivi des déploiements) :
`CRON_SECRET` sur Vercel et les deux secrets Vault — voir
[deployment.md § 9](./deployment.md).

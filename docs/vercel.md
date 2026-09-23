# Déploiement sur Vercel

> Ce document remplace `docs/cloudflare.md` pour **`apps/platform`** (site public,
> espace client, back-office, API). Il ne le remplace pas pour
> **`apps/site-runtime`** : lisez la dernière section, elle est importante.

---

## 1. Le projet Vercel

| Réglage | Valeur |
| --- | --- |
| Root Directory | **`apps/platform`** |
| Include files outside the Root Directory | **activé** (obligatoire) |
| Framework | Next.js — détecté |
| Build Command | laisser vide (`next build` par défaut) |
| Output Directory | **laisser vide** |
| Install Command | laisser vide |
| Node.js | 22.x |

`apps/platform/vercel.json` ne fixe que la région (`cdg1`, Paris). **Il ne
redéfinit aucun chemin, et c'est volontaire :** avec un Root Directory, Vercel
résout `outputDirectory` *à partir de ce répertoire*. Un `vercel.json` à la
racine du dépôt qui annonce `apps/platform/.next` produit donc :

```
The Next.js output directory "apps/platform/.next" was not found at
"/vercel/path0/apps/platform/apps/platform/.next"
```

Le chemin est double. Si vous avez saisi quoi que ce soit dans « Build Command »
ou « Output Directory », **videz ces champs** : les valeurs par défaut sont les
bonnes.

`apps/platform` dépend de quatorze paquets de l'espace de travail publiés en
TypeScript source et compilés par Next (`transpilePackages`). D'où les deux
exigences : « Include files outside the Root Directory » activé, pour que pnpm
voie le `pnpm-workspace.yaml`, et aucune étape de build préalable — `next build`
seul suffit.

## 2. Variables d'environnement

**À renseigner AVANT le premier déploiement.** Next.js remplace chaque
`process.env.NEXT_PUBLIC_*` par sa valeur **au moment du build** : une variable
ajoutée après coup n'existe pas dans le bundle déjà construit. Si vous les
ajoutez après, **redéployez** (Deployments → ⋯ → Redeploy, sans le cache).

### Sans elles, voici ce que voit un visiteur

| Variable absente | Symptôme exact |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | « Le catalogue tarifaire est momentanément indisponible » — la page s'affiche, vide |
| `STAX_SECRET_KEY` | **Tous** les formulaires refusent de s'exécuter : inscription, contact, devis, activation |
| `SUPABASE_SERVICE_ROLE_KEY` | Contact, devis et activation annoncent une indisponibilité ; la limitation de débit cesse d'être appliquée ; les webhooks Stripe échouent ; l'ouverture de l'éditeur depuis l'administration (sessions de construction et d'assistance) est refusée avec un message |

**Aucune page ne plante pour autant** : chaque écran qui dépend d'une variable
absente l'annonce en clair. L'écran **Administration → État des services**
liste, en tête, les variables manquantes (leur nom, jamais leur valeur).

**Noms équivalents acceptés** — pour les variables Supabase, le serveur accepte
aussi les noms posés par l'intégration Supabase de Vercel :

| Variable attendue | Équivalents acceptés |
| --- | --- |
| `SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` (même valeur) |
| `SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_KEY` (jamais une variable `NEXT_PUBLIC_*`) |

### Obligatoires

```
STAX_ENV=production
NEXT_PUBLIC_PLATFORM_URL=https://votre-domaine
PLATFORM_URL=https://votre-domaine

NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon>
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<clé anon>
SUPABASE_SERVICE_ROLE_KEY=<clé secrète>      # jamais préfixée NEXT_PUBLIC_
STAX_SECRET_KEY=<openssl rand -base64 48>
```

`SUPABASE_SERVICE_ROLE_KEY` et `STAX_SECRET_KEY` sont des **secrets**. Ils ne
doivent exister que dans les variables Vercel, jamais dans le dépôt. La clé de
service contourne la Row Level Security : quiconque l'obtient lit toute la base.

### Identité légale — bloquante en production

Sans ces valeurs, les pages légales affichent des marqueurs explicites et
`pnpm legal:check` échoue. Aucune n'est devinée ni inventée par le code.

```
LEGAL_COMPANY_NAME=   LEGAL_FORM=      LEGAL_CAPITAL=   LEGAL_ADDRESS=
LEGAL_SIREN=          LEGAL_RCS=       LEGAL_VAT=       LEGAL_DIRECTOR=
LEGAL_HOST=           LEGAL_HOST_ADDRESS=               LEGAL_DPO_CONTACT=
LEGAL_MEDIATOR=       SUPPORT_EMAIL=   SUPPORT_PHONE=
```

`LEGAL_ALLOW_INCOMPLETE=true` débloque temporairement une mise en ligne avec
des mentions incomplètes. **C'est une dette, pas une solution :** publier un
site commercial français sans mentions légales valides est une infraction.

### Selon les fonctions activées

```
EMAIL_PROVIDER=resend|postmark        EMAIL_API_KEY=   EMAIL_FROM=   EMAIL_REPLY_TO=
STRIPE_SECRET_KEY=   STRIPE_WEBHOOK_SECRET=   STRIPE_CONNECT_WEBHOOK_SECRET=
STRIPE_CONNECT_CLIENT_ID=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=       TURNSTILE_SECRET_KEY=
```

Chaque fonction non configurée se déclare indisponible au lieu d'échouer, et
`/admin/systeme` l'affiche comme telle. Aucun paiement n'est possible tant que
Stripe n'est pas renseigné.

---

## 3. Après le déploiement

```
1. /tarifs          les trois offres s'affichent avec leurs prix
2. /status          les indicateurs répondent
3. /inscription     créer un compte, en laissant le téléphone vide
4. /mentions-legales   aucun marqueur « [À CONFIGURER — … ] »
5. /admin/systeme   la liste des capacités manquantes est-elle celle attendue ?
```

Webhook Stripe : `https://votre-domaine/api/webhooks/stripe`, et
`https://votre-domaine/api/webhooks/stripe-connect` pour Connect. Le secret de
signature de chaque endpoint va dans les variables ci-dessus. **Aucun paiement
n'est jamais considéré comme abouti sur la seule redirection du navigateur :
c'est le webhook qui fait foi.**

---

## 4. Ce que Vercel ne remplace pas

`apps/site-runtime` — le moteur qui sert **les sites de vos clients** — est un
Worker Cloudflare. Un seul Worker sert tous les sites : il résout le tenant à
partir du nom d'hôte, à l'exécution, en périphérie.

**Il n'a pas d'équivalent sur Vercel en l'état.** Trois voies, et il faut en
choisir une :

1. **Garder Cloudflare pour ce seul Worker.** La plateforme est sur Vercel, les
   sites clients restent sur Cloudflare. C'est le moins de travail, et les noms
   de domaine personnalisés continuent de passer par Cloudflare for SaaS.
2. **Porter le moteur sur Next.js** dans une application Vercel distincte. Le
   travail est réel : la résolution du tenant, le rendu, les API publiques
   (formulaires, réservations, panier, comptes clients) et les en-têtes de
   cache sont à réécrire pour le runtime Next.
3. **Ne pas servir de sites clients pour l'instant.** La plateforme fonctionne :
   on vend, on encaisse, on construit — mais rien n'est en ligne côté client.

Tant que ce choix n'est pas fait, `SITES_DOMAIN`, `PREVIEW_DOMAIN` et
`CLOUDFLARE_SAAS_FALLBACK_ORIGIN` ne désignent rien qui réponde.

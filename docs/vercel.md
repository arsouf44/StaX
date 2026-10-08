# Déploiement sur Vercel

> **La plateforme** (`apps/platform` : site public, espace client,
> back-office, API) est déployée par **Vercel**. **Les sites des clients** et
> leur API (`apps/site-runtime`) restent sur Cloudflare : voir
> [cloudflare.md](./cloudflare.md) et la dernière section de ce document.

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

`apps/platform/vercel.json` fixe la région (`cdg1`, Paris) et une tâche
planifiée **quotidienne** (`/api/cron/sites`, 4 h UTC) : le plan Hobby refuse
toute cadence plus fréquente. La cadence de 5 minutes est assurée par Supabase
(`pg_cron` + `pg_net`, voir [deployment.md](./deployment.md) § 9). **Il ne
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
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Connexion et espace client indisponibles, annoncés comme tels ; les pages publiques s'affichent |
| `NEMASUS_SECRET_KEY` | **Tous** les formulaires refusent de s'exécuter : commande, accès par code, contact, devis, mot de passe oublié |
| `SUPABASE_SERVICE_ROLE_KEY` | Commande, accès par code, mot de passe oublié, contact et devis annoncent une indisponibilité ; la limitation de débit cesse d'être appliquée ; l'ouverture de l'éditeur depuis l'administration est refusée avec un message |

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
NEMASUS_ENV=production
NEXT_PUBLIC_PLATFORM_URL=https://votre-domaine
PLATFORM_URL=https://votre-domaine

NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon>
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<clé anon>
SUPABASE_SERVICE_ROLE_KEY=<clé secrète>      # jamais préfixée NEXT_PUBLIC_
NEMASUS_SECRET_KEY=<openssl rand -base64 48>
```

`SUPABASE_SERVICE_ROLE_KEY` et `NEMASUS_SECRET_KEY` sont des **secrets**. Ils ne
doivent exister que dans les variables Vercel, jamais dans le dépôt. La clé de
service contourne la Row Level Security : quiconque l'obtient lit toute la base.

### Identité légale

L'identité de LallianSe et celle de l'hébergeur (Vercel Inc.) sont écrites
dans `packages/config/src/legal.ts` ; une variable de même nom les remplace.
**Une seule reste à fournir** : le téléphone de l'éditeur, exigé par la LCEN
(art. 6, III) pour une personne morale.

```
LEGAL_PHONE=+33 1 …          # téléphone de LallianSe, affiché dans les mentions légales
```

Tant qu'il manque, `pnpm legal:check` échoue et `/admin/sante` le signale.
Les autres clés, si elles doivent changer :

```
LEGAL_COMPANY_NAME=   LEGAL_FORM=      LEGAL_CAPITAL=   LEGAL_ADDRESS=
LEGAL_SIREN=          LEGAL_RCS=       LEGAL_VAT=       LEGAL_DIRECTOR=
LEGAL_REPRESENTATIVE= LEGAL_HOST=      LEGAL_HOST_ADDRESS=   LEGAL_HOST_PHONE=
LEGAL_DPO_CONTACT=    LEGAL_MEDIATOR=  SUPPORT_EMAIL=   SUPPORT_PHONE=
```

`LEGAL_ALLOW_INCOMPLETE=true` débloque temporairement une mise en ligne avec
des mentions incomplètes. **C'est une dette, pas une solution :** publier un
site commercial français sans mentions légales valides est une infraction.

### Selon les fonctions activées

```
RESEND_API_KEY=   (secret)            EMAIL_FROM=   EMAIL_REPLY_TO=
BANK_TRANSFER_HOLDER=   BANK_TRANSFER_IBAN=   BANK_TRANSFER_BIC=   BANK_TRANSFER_BANK=
STRIPE_SECRET_KEY=   STRIPE_CONNECT_WEBHOOK_SECRET=   STRIPE_CONNECT_CLIENT_ID=   (Connect, facultatif)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=       TURNSTILE_SECRET_KEY=
GITHUB_APP_ID=  GITHUB_APP_SLUG=  GITHUB_APP_PRIVATE_KEY=  GITHUB_APP_WEBHOOK_SECRET=
CLOUDFLARE_SITES_API_TOKEN=  CLOUDFLARE_SITES_ACCOUNT_ID=  CLOUDFLARE_WEBHOOK_SECRET=
CRON_SECRET=   SITES_DOMAIN=
```

L'application GitHub et le jeton Cloudflare se créent en quelques minutes :
voir [integrations.md](./integrations.md).

Chaque fonction non configurée se déclare indisponible au lieu d'échouer, et
`/admin/sante` l'affiche comme telle. Sans `RESEND_API_KEY`, aucun e-mail ne
part (les codes d'accès sont alors affichés une fois à l'équipe) ; sans
coordonnées bancaires, les modalités de virement ne peuvent pas être envoyées.

---

## 3. Après le déploiement

```
1. /                  aucun prix, « Commander mon site » mène à /commander
2. /status            les indicateurs répondent
3. /acces             « Entrez votre code d'accès » ; un code inventé est refusé
4. /mot-de-passe-oublie   même message pour toute adresse ; l'e-mail arrive (Resend)
5. /mentions-legales  aucun marqueur « [À CONFIGURER — … ] »
6. /admin/sante       la liste des capacités manquantes est-elle celle attendue ?
```

Seul webhook Stripe : `https://votre-domaine/api/webhooks/stripe-connect`
(Connect, facultatif). Les commandes de sites se règlent par virement : **un
paiement n'est déclaré que par une personne de l'équipe, après l'avoir constaté
sur le relevé bancaire** ([commande-virement.md](./commande-virement.md)).

---

## 4. Les sites des clients restent sur Cloudflare

Vercel sert la plateforme ; **Cloudflare sert les sites des clients**. Chaque
site a son propre dépôt GitHub et son propre projet Cloudflare, que Nemasus
pilote (commits, suivi des déploiements, domaines) avec l'application GitHub
et le jeton Cloudflare ([integrations.md](./integrations.md)). Le Worker
`nemasus-sites` (`apps/site-runtime`) porte l'API de ces sites (formulaires,
réservations, boutique) : voir [cloudflare.md](./cloudflare.md) § 0.

## 5. Quitter l'ancien Worker de la plateforme

La plateforme a été un temps servie par un Worker Cloudflare (`stax`), déployé
par Workers Builds. Le dépôt n'en contient plus la configuration :

1. *Cloudflare → Workers & Pages → stax → Settings → Build* : **Disconnect**
   (sinon chaque envoi de code y produit un build en échec) ;
2. retirez son éventuel domaine personnalisé, puis supprimez le Worker ;
3. rattachez le domaine de la plateforme au projet Vercel
   (*Settings → Domains*) et mettez la même adresse dans `PLATFORM_URL`,
   `NEXT_PUBLIC_PLATFORM_URL`, Supabase (*Authentication → URL Configuration*)
   et le webhook Stripe Connect.

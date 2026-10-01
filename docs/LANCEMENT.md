# Lancement commercial — la liste, dans l'ordre

Ce document dit **ce qui est prêt** dans le code, et **ce qu'il reste à faire
vous-même** avant le premier client : des comptes à ouvrir, des clés à copier,
des textes à faire relire. Rien de cette liste ne peut être fait depuis le
dépôt : ce sont vos comptes, vos secrets, votre société.

Chaque étape dit **où** cliquer et **comment vérifier** que c'est bon.
L'écran **Administration → État des services** (`/admin/sante`) affiche en
permanence ce qui manque encore.

---

## Ce qui est prêt

| Parcours | État | Détail |
| --- | --- | --- |
| **Vente en ligne** : offre → paiement → création en 1 à 10 semaines selon l'offre → livraison | ✅ | [site-delivery.md](./site-delivery.md) |
| **Vente par téléphone** : site prêt → e-mail + code → compte → paiement → livraison automatique | ✅ | [vente-par-telephone.md](./vente-par-telephone.md) |
| Le client modifie son site seul (éditeur, aperçu, publier, restaurer) | ✅ | premiers pas guidés, menu court |
| Discussion client ↔ équipe, avec e-mail des deux côtés | ✅ | `/app/discussion`, `/admin/messages` |
| Alertes e-mail à l'équipe : message, ticket, contact, devis, prospect, paiement, site en panne | ✅ | envoyées à `SUPPORT_EMAIL` (à défaut `ADMIN_EMAIL`) |
| Maintenance mensuelle qui démarre à la livraison, résiliable en ligne | ✅ | [stripe.md](./stripe.md) |
| Mot de passe oublié, confirmation d'inscription, invitations de collaborateurs | ✅ | corrigés (voir [GAP_AUDIT.md § 13](./GAP_AUDIT.md)) |
| Statistiques réelles des sites (visiteurs, sources, appareils, contacts, encaissé), recalculées chaque heure | ✅ | `/app/statistiques` ; mesure en une ligne pour les sites indépendants ([contrat](./editable-site-contract.md)) |
| Bilan de santé du site : disponibilité sur 30 jours, bilan qualité hebdomadaire | ✅ | `/app/site/sante` |
| Bilan mensuel envoyé aux clients le 1er du mois | ✅ | part dès que Resend est branché (étape 4) |
| Tableau de production de l'équipe, file « à traiter » complète | ✅ | `/admin/production`, `/admin` |
| Page d'état qui dit la vérité (sauvegardes, e-mails, paiements, tâches) | ✅ | `/status`, `/admin/sante` |

Preuves : 630 assertions SQL, 423 tests unitaires et d'intégration, 66 tests
navigateur (ordinateur + téléphone), 31 parcours complets contre une vraie
pile, dont la vente par téléphone de bout en bout et une simulation
d'intrusion (deux clients étrangers et un visiteur anonyme). Détail de
l'audit opérationnel du 2026-09-30 : [GAP_AUDIT.md § 17](./GAP_AUDIT.md).

**Sécurité :** audit complet du 2026-09-27 — voir
[security.md § 16](./security.md#16-audit-du-2026-09-27--ce-qui-a-été-trouvé-et-corrigé).

---

## Étape 0 — La marque Nemasus (anciennement StaX)

Le code, les textes, les e-mails et les documents juridiques disent
« Nemasus ». Ce qui reste à faire est **hors du dépôt** :

1. **Nom de domaine.** Achetez `nemasus.fr` (et, par précaution, `nemasus.com`)
   — ou le domaine de votre choix — puis rattachez-le au projet Vercel
   (étape 3). Les valeurs `nemasus.fr` écrites dans le code ne sont que des
   exemples et des valeurs de repli.
2. **Marque.** Vérifiez sur [data.inpi.fr](https://data.inpi.fr) que
   « Nemasus » n'est pas déjà déposé pour des services informatiques
   (classes 35, 42) puis déposez la marque à l'INPI (≈ 190 € pour une classe,
   40 € par classe supplémentaire). Tant qu'elle n'est pas déposée, n'utilisez
   pas le symbole ®.
3. **Kbis.** Si Nemasus devient le nom commercial de LallianSe, faites-le
   inscrire au registre (formalité de modification sur
   [formalites.entreprises.gouv.fr](https://formalites.entreprises.gouv.fr)).
4. **Comptes des prestataires** : renommez l'application GitHub, le compte
   Stripe (*Paramètres → Informations publiques* : nom, libellé sur relevé
   bancaire « NEMASUS »), l'expéditeur des e-mails (`EMAIL_FROM=Nemasus <…>`),
   le projet Supabase (nommé « StaX » dans le tableau de bord) et le projet
   Vercel `sta-x-platform` → `nemasus` (*Settings → General*). Le Worker
   Cloudflare `stax`, qui a servi la plateforme quelques jours, doit être
   **déconnecté puis supprimé** (étape 3).
5. **Variables d'environnement** (facultatif) : `STAX_SECRET_KEY` et
   `STAX_ENV` peuvent être renommées `NEMASUS_SECRET_KEY` et `NEMASUS_ENV` **en
   gardant exactement la même valeur**. L'ancien nom reste lu tant que le
   nouveau n'existe pas : rien ne casse si vous ne faites rien.

---

## Étape 1 — Base de données : ✅ fait (0054 à 0057)

Les migrations **0054** (propositions), **0055** (messagerie, invitations),
**0056** (durcissement de sécurité, 2026-09-27) et **0057** (renommage Nemasus,
sous-traitants, effacement des coordonnées d'un prospect qui s'oppose,
2026-09-28) sont appliquées sur le projet Supabase de production (nommé
« StaX » dans le tableau de bord), chacune dans une transaction, et inscrites
dans `app.schema_migrations` avec l'empreinte de leur fichier
(`pnpm db:migrate` les voit comme passées). La production a été comparée au
dépôt : fonctions, colonnes, contraintes, index et règles de sécurité
**identiques**.

La 0057 a réécrit les libellés « StaX » stockés en base (offres, messages
d'erreur, notifications), renommé les tâches planifiées
(`nemasus-site-operations`, `nemasus-retention`) et complété la liste publique
des sous-traitants (Resend ajouté). La **0058** (2026-09-29) inscrit Vercel,
hébergeur de la plateforme, et recentre Cloudflare sur les sites des clients.

**À faire : migrations 0060 à 0065** (2026-09-30 et 2026-10-01). La **0059**
(statistiques réellement calculées) est appliquée en production et inscrite
avec son empreinte ; l'agrégation horaire y tourne déjà. Les suivantes sont
prêtes et toutes additives — état des services dérivé des journaux (0060),
libellés accentués (0061), pilotage de l'équipe (0062), bilan de santé des
sites (0063), bilan mensuel des clients (0064), e-mail au commerçant pour
chaque message, réservation ou commande reçus par son site (0065) :

```
DATABASE_URL="postgresql://…" pnpm db:migrate
```

Le code tolère leur absence (les écrans concernés s'annoncent indisponibles),
mais appliquez-les **avant** de fusionner : c'est l'ordre sûr.

Pour une future migration : `DATABASE_URL="postgresql://…" pnpm db:migrate`.

## Étape 2 — Identité légale de la société : ✅ faite

Tout est renseigné dans `packages/config/src/legal.ts` (valeurs publiques,
remplaçables par variable d'environnement si elles changent) : LallianSe, SAS
au capital de 3 000 €, siège, SIREN, SIRET, RCS, TVA ; nom commercial
Nemasus ; directrice de la publication Julie Rachline Gomez ; contact et
demandes RGPD `nemasus@lallianse.com` ; hébergeur de la plateforme Vercel
Inc. (adresse et téléphone) ; sites des clients chez Cloudflare, Inc.

**Reste une valeur à fournir (bloquant)** : le **téléphone de LallianSe**, que
la LCEN (art. 6, III) exige dans les mentions légales d'une personne morale.
Variable Vercel `LEGAL_PHONE` (par exemple `+33 1 23 45 67 89`), puis
redéployez. Tant qu'elle manque, `pnpm legal:check` échoue et `/admin/sante`
le signale.

**À vérifier** : la directrice de la publication d'une société est son
représentant légal (loi du 29 juillet 1982, art. 93-2). Si la présidente de
LallianSe est une société (SELALLIAN), indiquez la chaîne exacte dans
`LEGAL_REPRESENTATIVE` (par exemple « SELALLIAN, présidente, représentée par
Julie Rachline Gomez ») et faites valider la formulation.

Facultatif : `SUPPORT_PHONE` (affiché aux clients ; à défaut `LEGAL_PHONE`),
`LEGAL_MEDIATOR` (voir étape 10).

`nemasus@lallianse.com` a **deux rôles** : l'adresse affichée aux clients, et
la boîte qui reçoit toutes les alertes de l'équipe. Elle doit être lue.

## Étape 3 — Vercel : la plateforme en ligne (bloquant)

Le détail est dans [vercel.md](./vercel.md). En bref :

1. **Projet Vercel** (`sta-x-platform`, à renommer `nemasus`) : racine
   `apps/platform`, « Include files outside the Root Directory » activé,
   région Paris (`cdg1`, déjà dans `apps/platform/vercel.json`). **Offre Pro
   obligatoire** (20 $/mois par membre) : les conditions de l'offre Hobby la
   réservent à un usage personnel et non commercial.
2. **Settings → Environment Variables** (Production) : `NEMASUS_ENV`,
   `PLATFORM_URL` et `NEXT_PUBLIC_PLATFORM_URL`, les variables Supabase,
   `SUPABASE_SERVICE_ROLE_KEY` et `NEMASUS_SECRET_KEY` (secrets), `LEGAL_PHONE`,
   `SITES_DOMAIN`.
3. **Settings → Domains** : le domaine de la plateforme.
4. **Cloudflare → Workers & Pages → `stax`** : *Settings → Build →
   Disconnect*, puis supprimez ce Worker. Il a servi la plateforme quelques
   jours ; le dépôt n'en contient plus la configuration.
5. Redéployez, puis vérifiez `/tarifs`, `/mentions-legales`, `/inscription` et
   `/admin/sante`.

**Supabase reste sur l'offre gratuite** : pas de sauvegarde automatique
téléchargeable, et un projet sans activité pendant 7 jours peut être mis en
pause. Faites un export chaque semaine (voir
[backup-recovery.md](./backup-recovery.md)) ; la tâche de fond qui tourne
toutes les 5 minutes empêche la mise en pause.

**Acceptez les accords de traitement (DPA)** de chaque prestataire
(Vercel, Cloudflare, Supabase, GitHub, Resend ; Stripe l'inclut) et gardez-en une
copie : la page `/sous-traitants` et le registre y renvoient.

## Étape 4 — E-mails (sans eux, le produit paraît cassé)

Deux choses distinctes, toutes deux nécessaires :

1. **E-mails de Nemasus** (propositions, livraison, réponses de l'équipe,
   alertes). Créez un compte **Resend** (ou Postmark), vérifiez votre domaine
   d'envoi (enregistrements SPF et DKIM chez votre registrar), puis dans les
   variables Vercel (étape 3) :
   ```
   EMAIL_PROVIDER=resend
   EMAIL_API_KEY=re_…                          (secret)
   EMAIL_FROM=Nemasus <nemasus@lallianse.com>
   EMAIL_REPLY_TO=nemasus@lallianse.com
   ```
   Le domaine d'envoi à vérifier chez Resend est donc `lallianse.com`.
2. **E-mails de connexion** (confirmation d'inscription, mot de passe
   oublié), envoyés par Supabase. Dans **Supabase → Authentication** :
   - *SMTP Settings* : activez un SMTP personnalisé (Resend fournit des
     identifiants SMTP). Le SMTP par défaut de Supabase est limité à quelques
     messages par heure : un client ne recevrait pas son lien ;
   - *URL Configuration* : **Site URL** = `https://votre-domaine` ;
     **Redirect URLs** = `https://votre-domaine/auth/confirmation` ;
   - *Password security* : activez la **protection contre les mots de passe
     compromis** (signalée par l'analyseur de sécurité Supabase).

**Vérifier :** créez un compte avec une adresse à vous, cliquez le lien reçu :
vous devez arriver **connecté** dans votre espace. Puis « Mot de passe oublié »
jusqu'au bout.

## Étape 5 — Stripe (encaisser)

1. Activez le compte Stripe (identité, IBAN).
2. Clé **live** dans les variables Vercel : `STRIPE_SECRET_KEY`.
3. **Développeurs → Webhooks → Ajouter un point de terminaison** :
   `https://votre-domaine/api/webhooks/stripe`, événements
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, `customer.subscription.*`, `invoice.*`,
   `charge.refunded`. Copiez le secret de signature dans
   `STRIPE_WEBHOOK_SECRET`.
4. (Facultatif, offres avec paiement en ligne sur le site du client)
   Stripe Connect : voir [stripe-connect.md](./stripe-connect.md).

**Vérifier :** faites d'abord tout le parcours en **mode test** (carte
`4242 4242 4242 4242`) — voir l'étape 9.

**Téléphone de l'éditeur (bloquant, obligatoire — LCEN art. 6 III).** La
variable `LEGAL_PHONE` n'est pas posée sur Vercel : les mentions légales en
ligne affichent « Identité de l'éditeur non configurée ». Ajoutez-la
(*Vercel → Settings → Environment Variables*), puis redéployez.

## Étape 5 bis — Sauvegardes (bloquant avant le premier client)

Supabase gratuit n'en fournit pas ; la page Infrastructure et les CGV en
annoncent une par jour. L'export quotidien chiffré est prêt
(`.github/workflows/backup.yml`) : posez dans *GitHub → Settings → Secrets and
variables → Actions* `SUPABASE_DB_URL` (Supabase → Connect → **Session
pooler**) et `BACKUP_PASSPHRASE` (`openssl rand -base64 32`, gardée aussi dans
votre gestionnaire de mots de passe), puis lancez-le une fois à la main
(*Actions → Sauvegarde de la base → Run workflow*). Détail :
[backup-recovery.md](./backup-recovery.md).

## Étape 6 — GitHub, Cloudflare, tâche de fond (publier les sites)

**Administration → Intégrations** crée l'application GitHub en un clic et
affiche les valeurs à copier ; le jeton Cloudflare se crée en deux minutes
dans votre tableau de bord. Pas à pas : [integrations.md](./integrations.md).
Variables Vercel :
`GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`,
`GITHUB_APP_WEBHOOK_SECRET`, `CLOUDFLARE_SITES_API_TOKEN`,
`CLOUDFLARE_SITES_ACCOUNT_ID`, `CLOUDFLARE_WEBHOOK_SECRET`, `CRON_SECRET`, et
les deux secrets Vault (`nemasus_platform_url`, `nemasus_cron_secret`) qui déclenchent
la tâche de fond toutes les 5 minutes.

La tâche de fond fait aussi la **reprise des livraisons automatiques** et la
**surveillance** des sites livrés : sans elle, un paiement dont la livraison a
échoué n'est pas retenté.

**Constaté le 2026-09-30 : ces deux secrets Vault n'existent pas en
production.** La tâche `nemasus-site-operations` tourne toutes les 5 minutes
mais ne fait rien ; seule la tâche quotidienne de Vercel passe. Dans Supabase →
*SQL Editor*, une fois :

```sql
select vault.create_secret('https://sta-x-platform.vercel.app', 'nemasus_platform_url');
select vault.create_secret('<valeur exacte de CRON_SECRET sur Vercel>', 'nemasus_cron_secret');
```

(Remplacez l'adresse par votre domaine quand il sera branché.)
*Administration → État des services → Tâches planifiées par la base* dit si
ces secrets sont présents — jamais leur valeur.

**API des sites :** posez `SITES_API_URL` (adresse du Worker `nemasus-sites`,
par exemple `https://api.nemasus.fr`) : l'écran de livraison affiche alors la
ligne exacte de mesure d'audience à ajouter dans chaque site.

**Vérifier :** `/admin/sante` : « Application GitHub », « API Cloudflare des
sites », « Suivi des déploiements » et « Surveillance » au vert.

## Étape 7 — Anti-spam (formulaires publics)

Cloudflare **Turnstile** : `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
`TURNSTILE_SECRET_KEY`. Sans lui, les formulaires restent protégés par la
limitation de débit et le champ piège, mais moins bien.

La limitation de débit lit l'adresse IP du visiteur dans l'en-tête que
Vercel pose lui-même (`x-real-ip`), détecté automatiquement : rien à
configurer. `NEMASUS_CLIENT_IP_HEADER` ne sert que si
un autre mandataire est placé devant la plateforme.

## Étape 8 — Comptes de l'équipe (et double facteur : bloquant)

`pnpm admin:bootstrap` (voir [admin-bootstrap.md](./admin-bootstrap.md)),
puis connexion, **double facteur**, changement du mot de passe. Chaque
personne de l'équipe a son propre compte ; le rôle `platform_admin` suffit pour
envoyer des propositions et livrer.

**À faire maintenant sur le compte propriétaire existant.** Le 2026-09-27, le
seul compte de l'équipe en production (`platform_owner`) avait
`mfa_enforced = false` : **son mot de passe seul ouvre le back-office, donc les
données de tous les clients.** Depuis la migration 0056, la base exige le
second facteur de tout compte qui porte `mfa_enforced` — encore faut-il le
porter :

1. connectez-vous, ouvrez **Mot de passe et sécurité** (`/app/securite`) → **Activer la
   double authentification** (application Google Authenticator, 1Password…) ;
2. puis, dans Supabase → *SQL Editor* :
   `update public.profiles set mfa_enforced = true where platform_role is not null;`

**Vérifier :** déconnectez-vous, reconnectez-vous : le code à 6 chiffres est
demandé avant l'administration.

## Étape 9 — Répétition générale (1 heure, avant le premier client)

En **mode test Stripe**, avec votre propre adresse comme « prospect » :

1. *Sites → Créer un site* ; rattachez un petit site de test (dépôt + projet
   Cloudflare), importez son manifeste, faites la checklist.
2. *Fiche du site → Proposer ce site à un prospect* → votre adresse.
3. Dans votre boîte : l'e-mail « Le site de … est prêt ». Cliquez
   « Récupérer mon site », créez le compte, confirmez l'adresse.
4. Vérifiez : votre site s'affiche, le prix est juste, l'éditeur est fermé.
   Écrivez un message ; répondez depuis *Messages clients* ; vérifiez l'e-mail.
5. Payez avec `4242 4242 4242 4242`. En quelques secondes : « Merci ! Votre
   site est à vous », l'éditeur s'ouvre, l'e-mail de livraison arrive,
   l'abonnement de maintenance apparaît dans Stripe.
6. Modifiez un titre, publiez, vérifiez le site en ligne.
7. Refaites un paiement en **annulant** sur la page Stripe : retour sur
   l'espace, « Paiement interrompu », rien de débité.

Si une étape bloque, `/admin/sante` et `/admin/taches` disent pourquoi.

## Étape 10 — Juridique et administratif (avant d'encaisser)

Les textes ont été revus et renforcés le 2026-09-28, puis le 2026-09-29
après un audit externe (version `2026-09-29` des CGV, CGU, confidentialité et
accord de traitement : hébergeur Vercel, fin de contrat au choix du client,
données de santé, TVA et autoliquidation, droits sur le code, signalements ;
détail dans [GAP_AUDIT.md § 16](./GAP_AUDIT.md)) : collaboration et
réception du site, garantie contre les réclamations de tiers, responsabilité
d'hébergeur, absence de garantie de résultat en référencement, plafond et
délai d'action d'un an entre professionnels, effets du remboursement, sous-
traitance, confidentialité, références clients avec accord, prospection B2B
(base légale, source des données, droit d'opposition dans chaque e-mail).

Ce sont des **modèles soignés, pas un avis juridique**, et aucun texte ne rend
« inattaquable » : un juge écarte toute clause qui crée un déséquilibre
significatif ou prive le contrat de sa substance. Ce qui protège vraiment,
c'est la cohérence entre les textes et ce que le produit fait — c'est le
principe suivi ici. Reste à faire :

1. **Relecture par un avocat** (compter 500 à 1 500 € pour ce périmètre), en
   particulier : CGV **articles 5** (commande après un appel), **8** (client
   inactif pendant 90 jours), **9** (réception), **11** (résiliation par le
   Prestataire avec préavis de 3 mois), **18** (effets du remboursement),
   **21** (plafond de responsabilité, délai d'un an), **25** (rétractation : à
   revoir si vous vendez **en rendez-vous physique** à de très petites
   entreprises), **6** (TVA, autoliquidation), **16** (droits sur le code) ;
   l'accord de traitement (**articles 9 et 13** : fin de contrat, données de
   santé) ; la politique de confidentialité (prospection, § 3 et 4) et le
   registre [REGISTRE_TRAITEMENTS.md](./REGISTRE_TRAITEMENTS.md) (§ A8, A9).
   Après relecture, passez `LEGAL_REVIEW_REQUIRED` à `false` dans
   `packages/config/src/legal.ts`.
2. **Assurance responsabilité civile professionnelle** (RC Pro, avec volet
   cyber si possible) : le plafond de responsabilité des CGV ne joue pas en
   cas de faute lourde, et ne protège pas contre un client consommateur.
3. **Médiateur de la consommation** : obligatoire dès que vous vendez à un
   consommateur. Vos offres sont réservées aux professionnels et aux
   associations, mais une association peut en invoquer le bénéfice ; une
   adhésion à un médiateur agréé (liste officielle sur
   [economie.gouv.fr/mediation-conso](https://www.economie.gouv.fr/mediation-conso),
   quelques centaines d'euros par an au plus) supprime le risque. Renseignez
   ensuite `LEGAL_MEDIATOR` (nom et site du médiateur).
4. **Démarchage** : faites lire à chaque personne qui appelle les règles de
   [vente-par-telephone.md § 6](./vente-par-telephone.md) — depuis le
   11 août 2026, appeler un particulier sans son accord préalable est
   interdit ; le démarchage des entreprises reste permis.
5. **Suppression de compte** : elle se fait à la main, sur demande (voir
   `/admin/confidentialite`). Conservez alors les données d'identification que
   la loi impose aux hébergeurs (décret n° 2021-1362) — les factures y
   suffisent pour le client titulaire du contrat.

---

## Au quotidien : où regarder

| Écran | Pour quoi faire |
| --- | --- |
| **Propositions** (`/admin/propositions`) | Envoyer, relancer, retirer ; voir qui a créé son compte, qui a payé |
| **Messages clients** (`/admin/messages`) | Répondre aux clients et prospects (pastille = en attente) |
| **Tickets** (`/admin/support`) | Demandes d'assistance ouvertes depuis « Aide & support » |
| **Production** (`/admin/production`) | Chaque projet dans son étape, les retards, ce qui attend le client, les sites en panne |
| **Sites** → fiche → *Infrastructure & livraison* | Checklist, livraison, domaine, ligne de mesure d'audience |
| **État des services** (`/admin/sante`) | Ce qui n'est pas configuré ou ne répond pas |

Toutes les alertes arrivent aussi par e-mail sur `SUPPORT_EMAIL`.

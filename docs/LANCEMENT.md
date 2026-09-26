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

Preuves : 525 assertions SQL, 340 tests unitaires et d'intégration, 62 tests
navigateur (ordinateur + téléphone), 19 parcours complets contre une vraie
pile, dont le parcours « vente par téléphone » de bout en bout.

---

## Étape 1 — Base de données : ✅ fait le 2026-09-26

Les migrations **0054** (propositions) et **0055** (messagerie, invitations)
sont appliquées sur le projet Supabase « StaX », chacune dans une transaction,
et inscrites dans `app.schema_migrations` avec l'empreinte de leur fichier
(`pnpm db:migrate` les voit comme passées). La production a été comparée au
dépôt : corps des 37 fonctions concernées, colonnes, contraintes, index et
règles de sécurité **identiques**.

Pour une future migration : `DATABASE_URL="postgresql://…" pnpm db:migrate`.

## Étape 2 — Identité légale de la société (bloquant)

Sans ces valeurs, la production refuse de démarrer (c'est volontaire :
publier un site commercial sans mentions légales est une infraction).
Dans **Vercel → Settings → Environment Variables** :

```
LEGAL_COMPANY_NAME   LEGAL_FORM      LEGAL_CAPITAL   LEGAL_ADDRESS
LEGAL_SIREN          LEGAL_RCS       LEGAL_VAT       LEGAL_DIRECTOR
LEGAL_HOST           LEGAL_HOST_ADDRESS              LEGAL_DPO_CONTACT
LEGAL_MEDIATOR       SUPPORT_EMAIL   SUPPORT_PHONE
```

`SUPPORT_EMAIL` a **deux rôles** : l'adresse affichée aux clients, et la boîte
qui reçoit toutes les alertes de l'équipe. Mettez une boîte que vous lisez.

**Vérifier :** `pnpm legal:check` (avec ces variables) ne signale rien ; les
pages `/mentions-legales` et `/cgv` n'affichent plus de `[À CONFIGURER]`.

## Étape 3 — E-mails (sans eux, le produit paraît cassé)

Deux choses distinctes, toutes deux nécessaires :

1. **E-mails de StaX** (propositions, livraison, réponses de l'équipe,
   alertes). Créez un compte **Resend** (ou Postmark), vérifiez votre domaine
   d'envoi (enregistrements SPF et DKIM chez votre registrar), puis dans Vercel :
   ```
   EMAIL_PROVIDER=resend
   EMAIL_API_KEY=re_…
   EMAIL_FROM=StaX <bonjour@votre-domaine.fr>
   EMAIL_REPLY_TO=bonjour@votre-domaine.fr
   ```
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

## Étape 4 — Stripe (encaisser)

1. Activez le compte Stripe (identité, IBAN).
2. Clés **live** dans Vercel : `STRIPE_SECRET_KEY`.
3. **Développeurs → Webhooks → Ajouter un point de terminaison** :
   `https://votre-domaine/api/webhooks/stripe`, événements
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, `customer.subscription.*`, `invoice.*`,
   `charge.refunded`. Copiez le secret de signature dans
   `STRIPE_WEBHOOK_SECRET`.
4. (Facultatif, offres avec paiement en ligne sur le site du client)
   Stripe Connect : voir [stripe-connect.md](./stripe-connect.md).

**Vérifier :** faites d'abord tout le parcours en **mode test** (carte
`4242 4242 4242 4242`) — voir l'étape 8.

## Étape 5 — GitHub, Cloudflare, tâche de fond (publier les sites)

Voir [deployment.md § 7 à 9](./deployment.md) :
`GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`,
`GITHUB_APP_WEBHOOK_SECRET`, `CLOUDFLARE_SITES_API_TOKEN`,
`CLOUDFLARE_SITES_ACCOUNT_ID`, `CLOUDFLARE_WEBHOOK_SECRET`, `CRON_SECRET`, et
les deux secrets Vault (`stax_platform_url`, `stax_cron_secret`) qui déclenchent
la tâche de fond toutes les 5 minutes.

La tâche de fond fait aussi la **reprise des livraisons automatiques** et la
**surveillance** des sites livrés : sans elle, un paiement dont la livraison a
échoué n'est pas retenté.

**Vérifier :** `/admin/sante` : « Application GitHub », « API Cloudflare des
sites », « Suivi des déploiements » et « Surveillance » au vert.

## Étape 6 — Anti-spam (formulaires publics)

Cloudflare **Turnstile** : `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
`TURNSTILE_SECRET_KEY`. Sans lui, les formulaires restent protégés par la
limitation de débit et le champ piège, mais moins bien.

## Étape 7 — Comptes de l'équipe

`pnpm admin:bootstrap` (voir [admin-bootstrap.md](./admin-bootstrap.md)),
puis connexion, **double facteur**, changement du mot de passe. Chaque
personne de l'équipe a son propre compte ; le rôle `platform_admin` suffit pour
envoyer des propositions et livrer.

## Étape 8 — Répétition générale (1 heure, avant le premier client)

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

## Étape 9 — Relecture juridique (avant d'encaisser)

Les textes sont des **modèles rédigés avec soin, pas un avis juridique**. À
faire relire par un avocat, en particulier :

- CGV **article 5** (commande après un échange téléphonique), **article 8**
  (livraison immédiate d'un site proposé), **article 21** (rétractation : la
  vente à distance entre professionnels n'en ouvre pas ; vérifiez votre cas si
  vous vendez **en rendez-vous physique** à de très petites entreprises) ;
- la politique de confidentialité (données des prospects) et le registre
  [REGISTRE_TRAITEMENTS.md](./REGISTRE_TRAITEMENTS.md) (§ A8) ;
- le médiateur de la consommation (`LEGAL_MEDIATOR`) si vous vendez à des
  associations.

---

## Au quotidien : où regarder

| Écran | Pour quoi faire |
| --- | --- |
| **Propositions** (`/admin/propositions`) | Envoyer, relancer, retirer ; voir qui a créé son compte, qui a payé |
| **Messages clients** (`/admin/messages`) | Répondre aux clients et prospects (pastille = en attente) |
| **Tickets** (`/admin/support`) | Demandes d'assistance ouvertes depuis « Aide & support » |
| **Sites** → fiche → *Infrastructure & livraison* | Checklist, livraison, domaine |
| **État des services** (`/admin/sante`) | Ce qui n'est pas configuré ou ne répond pas |

Toutes les alertes arrivent aussi par e-mail sur `SUPPORT_EMAIL`.

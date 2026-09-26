# Audit d'écart — exigences contre code réel

Audit conduit **dans le code**, pas dans le README. Chaque ligne a été vérifiée
par lecture de fichier, requête SQL ou exécution. Un écran présent sans backend
complet est compté **non terminé**, comme demandé.

Date : 2026-09-21 · Branche : `claude/saas-web-builder-platform-lsbygs`
Mise à jour : 2026-09-22 (éditeur visuel, comptes internes, parcours réels —
§ 2 et § 11) · Branche : `claude/busy-turing-xwqbpn`
Mise à jour : 2026-09-24 (**sites développés hors de StaX**, contrat
d’édition, publication GitHub + Cloudflare, cinq offres mensuelles — § 12, qui
remplace § 1 et § 2 là où ils se contredisent) · Branche :
`claude/clever-maxwell-syg8wd`
Mise à jour : 2026-09-26 (**vente par téléphone**, messagerie de l’équipe,
pannes de lancement — § 13) · Branche : `claude/upbeat-goldberg-rfm9uz`

Légende : **OK** = fonctionne et testé · **PARTIEL** = utilisable mais incomplet ·
**MANQUE** = absent ou factice.

---

## 0. Pannes trouvées et corrigées pendant cet audit

Ces trois défauts rendaient le produit inutilisable. Ils expliquent
« les offres ne sont pas affichées », « connexion impossible », « rien ne
fonctionne ».

| # | Défaut | Cause | Correction | Fichiers |
|---|---|---|---|---|
| 1 | Catalogue vide, création de site impossible | Six migrations **déjà appliquées** modifiées en place. Le lanceur vérifie l'empreinte et refuse de tourner ; la base restait sur l'ancien schéma pendant que le code interrogeait `maintenance_price_cents` et `billing_interval`, inexistants | Migrations restaurées à l'octet près ; changement porté par une migration avant. Les deux chemins (installation neuve / base existante) produisent un schéma **identique**, vérifié par `pg_dump` | `supabase/migrations/20260101000003,05,09,10,11,16`, `…20_annual_maintenance.sql` |
| 2 | **Tous** les formulaires rejetaient leur propre soumission | Next.js injecte `$ACTION_REF_1`, `$ACTION_KEY`… dans le FormData ; `formDataToObject` les passait à des schémas `.strict()` → « Unrecognized keys ». Plus : une case HTML envoie `'on'`, donc `z.literal(true)` sur les CGV était insatisfiable depuis un navigateur | Filtrage des champs du framework au point unique ; `checkboxSchema` / `consentCheckbox` | `packages/validation/src/common.ts`, `auth.ts`, `commerce.ts` |
| 3 | 500 anonyme à chaque envoi de formulaire | `STAX_SECRET_KEY` absent → exception non rattrapée | Clé obligatoire **en production** (refus de démarrage) ; clé éphémère marquée hors production | `packages/security/src/crypto.ts` |

**Pourquoi les tests ne les ont pas vus** : les E2E d'authentification
vérifiaient qu'« une erreur s'affiche ». L'erreur de validation les satisfaisait.
Ils passaient *à cause* du bug. `tests/unit/form-data.test.ts` reproduit
désormais le FormData réel du framework.

---

## 1. Tarifs et règles commerciales

> **Remplacé par § 12.** La maintenance est désormais **mensuelle** et
> commence à la livraison ; la grille compte cinq offres. Le tableau ci-dessous
> décrit l’état du 2026-09-22 (maintenance annuelle), conservé pour mémoire.

| Exigence | État réel | Manque | Fichiers | Correction |
|---|---|---|---|---|
| Source canonique unique | **CORRIGÉ TARDIVEMENT** — la table `plans` faisait bien foi pour les **grilles** tarifaires, mais « À partir de 300 € HT puis 22 € HT par an » était **recopié à la main** dans la bannière d'accueil, deux descriptions de page et une réponse en données structurées. Un prix écrit en dur sur une page vitrine devient faux le jour où le catalogue change — sur la page qui sert à vendre | — | `lib/catalog.ts`, `components/marketing/hero.tsx`, `(marketing)/page.tsx`, `tarifs`, `metiers/[secteur]/[metier]` | `entryPriceLabel()` calcule le libellé depuis l'offre la moins chère, et renvoie `null` si le catalogue est injoignable : mieux vaut ne rien annoncer qu'annoncer un prix périmé. Les trois pages porteuses d'un prix revalident toutes les heures au lieu d'être figées au build |
| 300 € + 22 €/an · 550 € + 32 €/an · 1099 € + 82 €/an, HT | **OK** | — | `…20_annual_maintenance.sql` | Appliqué |
| Stripe **hors** Premium | **OK** en base — `online_payments` refusé aux deux premières offres | — | `…20`, `tests/sql/rls.test.sql` | — |
| Les pages vitrines annoncent la **bonne** offre | **CORRIGÉ TARDIVEMENT** — `/fonctionnalites/paiements` et `/fonctionnalites/ecommerce` annonçaient « Premium » alors que la base les réserve à l'Ultra Premium, et le type déclarait encore des offres disparues (`classique`, `signature`). Un client pouvait acheter Premium pour une fonctionnalité qu'elle ne contient pas | — | `content/features.ts` | `tests/integration/plan-promises.test.ts` compare chaque promesse à la grille `plan_features` : il exige l'offre **la moins chère** qui accorde réellement le droit |
| Aucun `/mois`, `mensuel`, `classique`, `signature`, ancien prix | **CORRIGÉ TARDIVEMENT** — cette ligne affirmait « balayage complet » alors que **neuf écrans** affichaient encore « / mois », dont le tunnel de commande, le récapitulatif, la confirmation, la facturation et la FAQ publique. Un client lisait « 32 € / mois » pour un contrat à 32 € / an | — | `commander/`, `facturation`, `app/page`, `admin/commandes`, `content/faq`, `content/features` | `formatMaintenance(montant, devise, périodicité)` est désormais le seul endroit où la périodicité s'écrit, et `tests/unit/billing-wording.test.ts` échoue si « / mois » réapparaît ailleurs |
| Métriques : ne jamais traiter l'annuel comme du MRR | **OK** — `arrCents`, périodicité lue par contrat | — | `packages/database/src/queries/admin.ts` | Corrigé |
| Grandfathering | **OK** — anciennes offres archivées, non supprimées | — | `…20` | — |

---

## 2. Éditeur client — **OK** (réécrit, vérifié dans un vrai navigateur)

> **Ne concerne plus que les sites de l’ancien moteur** (`legacy_engine`).
> Les nouveaux sites sont développés hors de StaX et édités par leur contrat
> d’édition : voir § 12.

L’éditeur est un **éditeur visuel en trois zones** (`apps/platform/src/app/app/editeur`) :
structure de la page à gauche, **vrai rendu** au centre (le moteur public, sur
le brouillon), réglages à droite. Sur téléphone, les trois zones deviennent
des onglets et l’aperçu s’ouvre au format téléphone.

| Capacité | État réel | Où |
|---|---|---|
| Cliquer sur un élément de l’aperçu pour le modifier | **OK** — le titre, la photo ou le bouton cliqué ouvre son champ, curseur dedans | `render/editor-script.ts`, `field-editors.tsx` |
| Texte, photo (envoi ou bibliothèque), boutons et destination | **OK** — « Où mène ce bouton ? » : une page, un site, un téléphone, un e-mail | `field-editors.tsx` |
| Ajouter une section (contenu de départ réel, jamais de faux avis) | **OK** | `section-library.tsx`, `createStarterBlock` |
| Dupliquer, monter/descendre, glisser, masquer, variante d’apparence | **OK** | `properties-panel.tsx` |
| Supprimer → corbeille, restaurer, purge définitive séparée | **OK** — sections, pages et photos | `deleted_at`, `purge_trash_item` |
| Annuler / rétablir (boutons, Ctrl+Z / Ctrl+Maj+Z) | **OK** — côté serveur, par page, frappe regroupée | `editor_revisions`, `app.editor_undo/redo` |
| Enregistrement automatique + points de sauvegarde | **OK** — un point par fenêtre de 10 min, un point avant chaque restauration | `draft_checkpoints` |
| Aperçu ordinateur / tablette / téléphone | **OK** — rendu à la vraie largeur puis réduit | `preview-frame.tsx` |
| Vérification avant publication | **OK** — bloquant vs conseil, « Corriger » amène à la section | `publication-checks.ts` |
| Publication | **OK** — version immuable, atomique, purge du cache, `x-stax-version` | `app.publish_site`, `cache-purge.ts` |
| Historique : Voir, Comparer, Restaurer, Republier | **OK** — restaurer ne détruit jamais les versions suivantes | `history-panel.tsx`, `app.rollback_site` |
| Auteur de chaque version : vous, un membre, l’équipe StaX | **OK** | `actor_kind` |
| Conflit entre deux onglets | **OK** — refus explicite, rechargement | `p_base_seq`, `40001` |

**Sécurité de l’aperçu** : le contenu affiché est écrit par le client. Il est
servi avec `Content-Security-Policy: sandbox allow-scripts` (origine opaque) et
l’iframe porte `sandbox` sans `allow-same-origin` : il ne peut rien lire de la
plateforme, il ne fait qu’envoyer des messages (identifiant de section, champ
cliqué) à l’origine exacte de l’éditeur. La mesure d’audience n’y part jamais.

**Preuve** : les parcours `tests/e2e/journeys` (voir § 11) et les assertions
SQL « Editeur et versions ».

---

## 3. Modules métier

| Module | CRUD | Site public | Écart |
|---|---|---|---|
| Restaurant (carte) | **OK** | **OK** | — |
| Artisan (prestations, zones) | **OK** | **OK** | — |
| Coiffeur (réservations) | **OK** | **OK** | — |
| Immobilier (biens) | **OK** | **OK** | — |
| Hôtel (chambres) | **OK** | **OK** | — |
| Association (dons) | **OK** | **OK** | Corrigé pendant l'audit : `/api/donations` |
| **Commerce (e-commerce)** | **OK** | **OK** | Checkout complet : `/api/checkout`, `app.create_shop_order`, paiement Stripe Connect, encaissement par webhook, page de suivi `/commande` |
| Comptes clients du site final | **OK** | **OK** | Connexion **sans mot de passe** par lien à usage unique. Un compte appartient à **un site**, jamais à la plateforme. 22 assertions SQL |

### Chaîne de commande — ce qui la rend sûre

| Règle | Où elle est appliquée | Vérifiée par |
|---|---|---|
| Le navigateur n'envoie **jamais** un montant | `app.create_shop_order` relit les prix en base | « Le prix est relu en base : un panier trafiqué ne change pas le montant » |
| Le panier vient du **cookie signé**, pas du corps de la requête | `handleCheckout` | — |
| Stock décrémenté dans la **même transaction**, sous verrou de ligne | `for update` + `pg_advisory_xact_lock` | « Le dernier exemplaire part une seule fois » |
| Une commande naît `pending`, **jamais** `paid` | `app.create_shop_order` | assertion SQL |
| Le retour du navigateur ne paie rien | seul le webhook Connect signé appelle `mark_shop_order_paid` | assertion SQL |
| Un montant encaissé ≠ montant figé **ne paie pas** et laisse une trace | `app.mark_shop_order_paid` | « L'écart de montant est tracé » |
| Rejeu de webhook sans effet | idempotence + `on conflict` sur le payment intent | « Aucun paiement en double après rejeu » |
| Le commerçant ne peut pas se déclarer payé | `app.guard_shop_order_state` | assertion SQL |
| Montants d'une commande payée immuables, **pour tout le monde** | même déclencheur | assertion SQL |
| Un panier abandonné rend son stock | `app.release_expired_shop_orders` | assertion SQL |
| Le produit d'un autre client n'existe pas depuis ce site | filtre `site_id` côté serveur | assertion SQL |
| La vente en ligne est un droit d'offre | `app.has_feature(org,'ecommerce')` | assertion SQL |
| Aucune donnée bancaire ne touche StaX | Stripe Connect, page hébergée par Stripe | — |

32 assertions SQL sur cette chaîne.

**Défaut trouvé au passage** : l'ajout au panier était **cassé en production**.
Le script client postait sur `/api/cart` sans le jeton anti-CSRF, que la garde
exige — le bouton « Ajouter au panier » répondait donc toujours 403. Le jeton
est maintenant porté par le document (`<body data-stax-token>`), là où les
interactions sans formulaire peuvent le lire.

**Second défaut** : un don réussi laissait sa ligne de paiement en `pending`
pour toujours — le webhook Connect créait une ligne parallèle au lieu de
confirmer celle écrite avant l'appel à Stripe.

### Comptes client des sites — pourquoi sans mot de passe

| Décision | Conséquence |
|---|---|
| Aucun mot de passe : lien à usage unique valable une heure | Rien à stocker, rien à fuir, aucune réutilisation de mot de passe, aucun formulaire de réinitialisation à sécuriser |
| Seule l'**empreinte** du lien est stockée | Une fuite de la base ne permet de se connecter à la place de personne |
| Le compte appartient à **un site** | La même adresse chez deux commerçants donne deux comptes étrangers. Aucune identité ne traverse les tenants |
| Le cookie de session est signé **avec l'identifiant du site** | Un cookie du site A ne vaut rien sur le site B, bien que le même Worker serve les deux |
| La demande de lien répond **toujours la même chose** | Le formulaire ne peut pas servir d'annuaire de la clientèle d'un commerçant |
| Au plus 5 liens par heure et par compte | Le formulaire ne peut pas servir à inonder la boîte de quelqu'un |
| L'e-mail est signé **par le commerçant**, pas par StaX | Le destinataire est le client d'une boulangerie, pas le nôtre : un message signé par une plateforme inconnue serait pris pour de l'hameçonnage |
| Le jeton est consommé puis la page **redirige** | Le lien ne survit ni dans l'historique ni dans les référents |
| Un compte se **bloque**, il ne se supprime pas | Une commande passée doit rester rattachable |

---

## 4. Back-office `/admin`

| Écran | État |
|---|---|
| Vue d'ensemble, commandes, organisations, webhooks | **OK** |
| 13 listes (sites, utilisateurs, domaines, projets, devis, abonnements, remboursements, tickets, offres, sécurité, journal, factures, santé) | **OK** |
| Assistance client (impersonation) | **OK** — motif obligatoire, durée plafonnée, bannière, 14 opérations interdites |
| Émission de factures | **OK** — montant repris du catalogue, numérotation continue |
| **`/admin/sites/[id]`** | **OK** — fiche complète (offre, métier, dates, projet, maintenance, compteurs), domaines et état DNS réel, 15 dernières versions, codes d'activation. Actions : changement d'état limité aux transitions réellement permises par `app.guard_site_status`, remise en ligne d'une version, émission et révocation de codes. Motif obligatoire, trace nominative, rôle `platform_admin` exigé |
| Codes promotionnels | **OK** — création et désactivation. Un code déclare une règle, jamais un montant : la remise est recalculée par la base à chaque commande |
| Activations progressives | **OK** — bascule globale, distincte des droits d'offre (un drapeau déploie, il ne vend pas) |
| Demandes RGPD | **OK** — tri par échéance, compte à rebours du délai d'un mois, et **l'ordre est imposé** : une demande ne peut pas être marquée traitée sans identité vérifiée |
| Tâches de fond | **OK** — ce qui échoue là ne se voyait nulle part ailleurs |
| Modèles de site, métiers et modules | **OK, en lecture seule** — ce sont du code versionné (`@stax/business`, migrations de référence). Les modifier depuis une interface les désynchroniserait du dépôt, et c'est écrit sur l'écran |

---

## 5. Flux commercial par facture

| Étape | État |
|---|---|
| Facture créée par l'admin | **OK** |
| Saisie du numéro par le client | **OK** |
| Le numéro seul n'authentifie jamais | **OK** — l'adresse destinataire fait foi ; réponse identique pour un numéro inexistant et une facture d'autrui ; tentatives comptées |
| Rattachement atomique | **OK** — une seule commande par facture, vérifié par assertion SQL |
| Aucun « payé » déduit de la saisie | **OK** — vérifié par assertion SQL |
| E-mail de facture au client | **OK** — envoyé à l'émission, numéro prérempli dans le lien. Si l'envoi échoue, le message le dit au lieu de laisser croire que le client a reçu sa facture |

---

## 6. Sécurité

| Contrôle | État |
|---|---|
| RLS sur 100 % des tables `public` | **OK** |
| Isolation inter-tenant | **OK** — 270 assertions SQL |
| Mass assignment | **OK** — listes blanches Zod partout |
| Machines à états financières | **OK** — `payé`/`remboursé` inatteignables depuis un navigateur |
| Webhooks signés, idempotents | **OK** |
| MFA obligatoire admin (`aal2`) | **OK** |
| Secrets hors bundle | **OK** — `.env.example` sans valeurs |
| Brute-force activation / facture | **OK** — débit limité, tentatives comptées |
| **CSP sur la plateforme** | **OK** — était **totalement absente**. CSP à nonce + `strict-dynamic` sur tout ce qui porte une session (`src/proxy.ts`) ; CSP fixe sur les pages publiques prérendues |
| **E2E d'isolation inter-tenant** | **PARTIEL** — prouvé en SQL (270 assertions) et par 12 parcours d'intégration contre une vraie base. Pas encore par deux navigateurs connectés en parallèle |

---

## 7. Légal

| Élément | État |
|---|---|
| SIREN / SIRET / TVA vérifiés par clé de contrôle | **OK** — échec de démarrage si faux |
| Identité LallianSe inscrite | **OK** |
| Capital, directeur de publication | **BLOQUANT VOLONTAIRE** — aucune valeur par défaut, production refusée |
| 9 pages légales | **OK** |
| Textes « maintenance mensuelle » | **OK** — corrigés |
| **Registre des traitements (art. 30 RGPD)** | **OK** — `docs/REGISTRE_TRAITEMENTS.md`, responsable **et** sous-traitant, vérifié table par table contre le schéma réel, avec une section « ce que ce registre ne couvre pas » |
| **Registre des violations (art. 33.5)** | **OK** — table `data_breaches` + `/admin/securite/violations`. Échéance des 72 h calculée depuis la **découverte**, date de découverte non modifiable, notification inscrite non effaçable, suppression impossible, « pas de risque » refusé sans justification écrite, retard refusé sans motif (art. 33.1). 11 assertions SQL |

---

## 8. Validation

| Commande | Résultat |
|---|---|
| `format:check`, `lint`, `typecheck` | **OK** — 0 |
| Tests unitaires + sécurité + intégration | **OK** |
| Assertions SQL / RLS | **OK** — 270 |
| E2E | **OK** — 54 tests (marketing, accessibilité, auth, intégrité des liens, en-têtes de sécurité). Les 4 tests d'authentification **passaient à côté du produit** : sans `STAX_SECRET_KEY`, le build de production levait une exception et ils vérifiaient le comportement d'une plateforme mal configurée. Le serveur de test reçoit désormais des secrets jetables, régénérés à chaque exécution |
| Parcours critiques | **OK** — 12 parcours d'intégration contre une vraie base : commande → paiement → création du site → édition → publication → brouillon indépendant → retour arrière → résolution du tenant → formulaire → réservation → activation → suspension |
| Build production + Cloudflare | **OK** |

---

## 9. Cohérence commerciale — ce que le balayage final a trouvé

Le produit marchait. Ce qu'il **annonçait** ne correspondait pas toujours à ce
qu'il **fait**. Aucun de ces défauts ne lève d'exception, n'échoue au type, ni
ne casse un test : ils se contentent de mentir au client, sur les pages qui
servent à vendre.

| Défaut | Ce que lisait le client | Ce que fait la base | Verrou posé |
|---|---|---|---|
| « / mois » sur 9 écrans dont le tunnel de commande | 32 € **par mois** | 32 € par **an** | `formatMaintenance()` seul autorisé + `tests/unit/billing-wording.test.ts` |
| Encaissement en ligne et boutique annoncés « Premium » | inclus dans Premium | réservés à l'**Ultra Premium** | `tests/integration/plan-promises.test.ts` |
| Tarif d'appel recopié sur 4 pages | figé au jour de l'écriture | table `plans` | `entryPriceLabel()` + revalidation horaire |
| Quotas écrits à la main sous chaque offre | figés | `plan_features` | ligne dérivée du catalogue |
| Délai de livraison recopié à 3 endroits | figé | `deliveryPolicyConfig()` | lecture de la configuration |
| Script anti-flash lisant une clé accentuée | thème clair choisi, sombre affiché | — | `tests/unit/theme-script.test.ts` |
| Aucune CSP sur la plateforme | — | — | CSP à nonce (`src/proxy.ts`) + test d'en-têtes |
| Ajout au panier sans jeton anti-CSRF | bouton sans effet (403) | — | jeton porté par le document |
| Don réussi laissé en « pending » pour toujours | — | — | webhook confirme la ligne d'origine |

**Ce que cela dit de la méthode.** Sept de ces neuf défauts se trouvaient dans
du code qu'un audit précédent avait déclaré conforme — et la ligne
« Aucun `/mois` : balayage complet du dépôt » de ce document même était fausse
quand elle a été écrite. Un audit qui se relit lui-même ne vaut rien ; c'est
pourquoi chaque correction repart ici avec un test qui échoue si le défaut
revient.

---

## 10. Installation réelle — le défaut que seul le déploiement révèle

Le produit était testé, typé, audité… et **installé nulle part**. Aucune base
de données StaX n'existait : ni en production, ni ailleurs. Un client arrivait
donc sur « Catalogue tarifaire momentanément indisponible » et ne pouvait pas
créer de compte. Aucun test ne pouvait le voir : les tests parlent au code, pas
à une installation.

### Ce qui a été installé

| Élément | État |
|---|---|
| Projet Supabase | `eu-west-3` (Paris), actif |
| Migrations `0001` → `0025` | **25 appliquées**, tracées dans `app.schema_migrations` avec leur empreinte SHA-256 — `pnpm db:migrate` les voit déjà passées et ne les rejouera pas |
| Schéma | 83 tables, **RLS active sur 83**, 167 policies, 74 fonctions `app.`, 37 fonctions `public.`, 71 déclencheurs |
| Catalogue | 14 secteurs, 82 métiers, 22 modules, 23 fonctionnalités, 138 lignes `plan_features` |
| Offres publiées | Essentiel 300 € + 22 €/an · Premium 550 € + 32 €/an · Ultra Premium 1 099 € + 82 €/an — **HT, `billing_interval = 'year'`**. Les anciennes offres sont désactivées, pas supprimées |
| Compte `platform_owner` | Créé pour `ADMIN_EMAIL`, `mfa_enforced = true`. Le mot de passe initial a été **généré hors du dépôt**, haché en bcrypt localement, et seule l'empreinte a été écrite en base |

### Ce qui a été vérifié sur l'installation, pas sur le code

- Un visiteur **anonyme** lit le catalogue (4 offres, 14 secteurs, 82 métiers)
  et **rien d'autre** : `profiles`, `organizations`, `sites`, `orders`,
  `audit_logs`, `sales_invoices` renvoient 0 ligne.
- Une **inscription réelle** aboutit, le déclencheur crée le profil, et ce
  profil sort avec `platform_role = null` : **s'inscrire ne donne aucun droit**.
- La **connexion** du compte propriétaire aboutit, le jeton porte
  `role = authenticated`, et c'est la colonne `platform_role` — pas l'adresse
  e-mail — qui ouvre les tables réservées au staff.
- Les 20 pages publiques répondent `200`, sans message de panne.
- La page tarifaire affiche 300,00 € / 550,00 € / 1 099,00 €, les TTC
  correspondants (360,00 / 660,00 / 1 318,80) et les totaux première année
  (386,40 / 698,40 / 1 417,20). **Zéro occurrence de « mois ».**

### Le défaut de fond : la configuration n'était jamais lue

`.env.example` vit à la racine et demande de le copier en `.env.local`. Mais
Next.js ne lit les fichiers `.env*` que dans le répertoire de l'application
(`apps/platform`), et les scripts `tsx` n'en lisent **aucun** : ils se
contentent de `process.env`. En suivant la documentation à la lettre, la
configuration était donc **ignorée en silence** — `NEXT_PUBLIC_SUPABASE_URL`
retombait sur `http://127.0.0.1:54321`, la lecture du catalogue échouait, et le
`catch` de `getPlans()` transformait cet échec en section vide. Aucune
exception, aucun journal, aucun test rouge : exactement le symptôme remonté.

Ce n'est pas un détail d'environnement : c'est le chemin d'installation
documenté qui ne fonctionnait pas.

| Correction | Verrou |
|---|---|
| `@stax/config/dotenv` charge `.env.local` puis `.env` depuis la racine de l'espace de travail | `tests/unit/dotenv.test.ts` — 13 tests |
| `apps/platform/next.config.ts` et les 5 scripts d'exploitation l'appellent avant toute autre chose | — |
| Une variable déjà définie n'est **jamais** écrasée : secret Cloudflare et variable de CI gardent la priorité | test dédié |

### Durcissement relevé par l'analyseur sur la base réelle (migration `0025`)

| Constat | Réalité | Correction |
|---|---|---|
| `claim_sales_invoice` et `peek_sales_invoice` exécutables par `anon` | Supabase applique `alter default privileges … grant all on functions to anon`. Un `revoke … from public` ne retire pas ce droit : il faut nommer `anon`. Les deux fonctions refusaient déjà un appelant anonyme, mais la barrière manquait | `revoke … from anon` |
| `touch_updated_at`, `freeze_published_version`, `forbid_mutation` sans `search_path` figé | Une fonction sans `search_path` résout ses appels dans le chemin de l'appelant : `now()` pouvait être détourné | `set search_path = pg_catalog` |
| `rate_limit_counters` sans policy | Voulu — écrite seulement par `app.bump_rate_limit()` | privilège retiré en plus du RLS, et l'intention écrite dans un `comment on table` |

---

## 11. Parcours réels dans un navigateur — ce qu’ils ont révélé (2026-09-22)

Les parcours ont été déroulés contre une pile complète (base, authentification,
API, stockage, plateforme en build de production, moteur des sites), chaque
publication vérifiée par une requête HTTP sur l’adresse publique. Ils ont
trouvé des pannes qu’aucun test existant ne voyait :

| Panne | Conséquence réelle | Correction |
|---|---|---|
| Le site créé au paiement n’avait pas d’offre (`plan_id` vide) | **Un client qui payait n’avait aucun droit d’offre** : 0 Mo pour ses photos, pas de réservations… | migration `0036`, rattrapage des sites existants |
| `scripts/db-test.sh` rendait toujours un succès | Une assertion SQL en échec ne faisait **jamais** échouer la CI | statut de `psql` lu à part |
| Les messages de l’aperçu visaient l’origine interne du serveur | Cliquer sur un titre ne sélectionnait rien (risque identique derrière un mandataire) | origine prise sur la requête du navigateur |
| La boîte de publication s’ouvrait derrière l’éditeur | Impossible de publier | niveaux d’empilement |
| Le contenu par défaut de « Contenu intégré » était refusé par son propre schéma | L’éditeur plantait sur tout site qui proposait cette section | schéma et vérification avant publication |
| `/app/disponibilites` annoncé par le module Réservations, inexistant | 404, réservations impossibles à configurer | page créée |
| Echap fermait la couche du dessous | La comparaison restait à l’écran, l’historique disparaissait | pile des couches |
| Aperçu « ordinateur » rendu à la largeur de la colonne | Menu de téléphone affiché en mode ordinateur | rendu à 1 280 px puis réduit |
| Aperçu au format ordinateur sur un téléphone | Illisible | format téléphone par défaut |
| Espace client sur téléphone | Contenu comprimé par la colonne du menu | menu au-dessus |
| Animations d’apparition rejouées à chaque enregistrement | L’aperçu clignotait à chaque lettre | coupées dans l’aperçu |
| La mesure d’audience partait depuis l’aperçu | Le client comptait ses propres visites | coupée dans l’aperçu |
| Boulangerie, caviste, traiteur : textes de restaurant | « Réservez votre table », pages « Le restaurant » et « La carte » | accroches et pages par métier |
| Libellés sans accents (métiers, sections) | « Cafe / salon de the », « Horaires d ouverture » sur les sites | migration `0035`, registre |

Parcours automatisés (`pnpm test:e2e:stack`, 6 parcours) :

1. **Client, 16 étapes** : connexion → éditeur → titre modifié en cliquant sur
   l’aperçu → photo remplacée (réellement chargée) → section ajoutée → déplacée →
   supprimée puis restaurée → rendu téléphone → publication → requête HTTP sur
   l’adresse publique → nouvelle version servie (`x-stax-version`) → nouvelle
   modification non publiée → le site public montre toujours l’ancienne →
   publication → retour à la première version → requête HTTP : la première
   version est de nouveau servie, les versions intermédiaires restent dans
   l’historique.
2. **Compte interne** : commande Ultra Premium dans le tunnel, aucun paiement
   affiché, aucune requête vers Stripe, site créé immédiatement, commande
   interne à 0 € sans encaissement, édition, publication réelle, seconde
   commande sur une autre offre.
3. **Privilège vérifié par la base** : un client ordinaire est refusé et ne
   peut pas s’attribuer le statut interne.
4. **Tout est réversible** : annuler/rétablir, comparer, restaurer une version
   sans rien détruire, site en ligne inchangé.
5. **Page supprimée** puis restaurée depuis la corbeille.
6. **Équipe StaX** : refusée sans session d’assistance ; en session, son
   intervention apparaît « Équipe StaX » dans l’historique du client.

---

## 12. Sites développés hors de StaX — état au 2026-09-24

StaX ne fabrique pas de sites. Chaque site est développé dans son propre dépôt
GitHub, déployé par son propre projet Cloudflare, rattaché à StaX, vérifié,
puis livré ; le client le gère ensuite. Détails :
[site-delivery.md](./site-delivery.md).

| Exigence | État | Où | Preuve |
|---|---|---|---|
| Aucun modèle de site, nulle part | **OK** — `site_templates`, `provision_site` et `p_template` retirés ; ni l’offre, ni le métier, ni le questionnaire ne produisent de structure | `0045_no_templates.sql` | `tests/unit/product-promises.test.ts`, SQL « aucun modèle » |
| Parcours commande → paiement → compte → questionnaire | **OK** | `(commande)/commander`, `bienvenue` | parcours E2E, `tests/integration/journeys.test.ts` |
| Aucune édition avant la livraison, imposé techniquement | **OK** — `app.site_content_access` refuse le client tant que `delivered_at` est vide | `0044`, `0051` | SQL, intégration, E2E « avant la livraison » |
| Suivi de projet client en 7 étapes, validations enregistrées | **OK** | `0042`, `0050`, `/app` | E2E, intégration |
| Admin *Projet → Infrastructure & livraison* avec checklist | **OK** — dépôt, projet Cloudflare, domaine, contrat, contenu initial, contrôles automatiques et attestés, livraison | `admin/sites/[id]/livraison` | E2E « l’équipe rattache… puis livre » |
| Contrat `stax.manifest.json` | **OK** — 17 types de champs, collections, formulaires, modules, limites, contrôle de l’offre | `packages/site-contract` | `tests/unit/site-contract.test.ts` |
| Brouillon → Publier → commit `stax: publication client 0000N` → déploiement Cloudflare suivi | **OK** — avance rapide, idempotent (`Stax-Release`) | `lib/external-sites/publisher.ts` | E2E « le client publie », sécurité |
| Jamais « Publié » avant confirmation | **OK** — `published` posé uniquement par `record_site_deployment` sur le commit exact ; délai 45 min, confirmation tardive | `0044`, `0049` | SQL, intégration, E2E |
| Un échec garde la version précédente | **OK** — `production_release_id` inchangé | `0044` | E2E « déploiement en échec » |
| Historique : version, SHA, déploiement, auteur, date, état ; Voir / Restaurer / Republier | **OK** — restaurer crée une version et la redéploie réellement | `/app/site/versions` | E2E « restaurer la version 1 » |
| Offres : 300 + 12, 550 + 14, 1 099 + 16, 1 790 + 18 € HT/mois ; Sur mesure sur devis | **OK** | `0043_monthly_offers.sql` | `tests/unit/pricing.test.ts`, SQL |
| Maintenance mensuelle partout, qui démarre à la livraison | **OK** — abonnement créé à la livraison, refusé en base avant | `lib/maintenance.ts`, `0043` | SQL `site_not_delivered`, intégration |
| Droits d’offre = promesses | **OK** — quotas appliqués en base, contrat comparé à l’offre, API des sites vérifiée à chaque opération | `0046`, `0047`, `0049` | `tests/integration/plan-promises.test.ts`, SQL |
| Marketing : « Nous créons votre site. Vous le gérez ensuite. », 7 points, 6 étapes, aucun vocabulaire de générateur | **OK** | `(marketing)`, `content/process.ts` | `tests/unit/product-promises.test.ts`, E2E marketing |
| CGV, FAQ, e-mails cohérents (mensuel, début à la livraison, résiliation, suspension, export, réversibilité) | **OK** — rédaction prudente, **relecture juridique recommandée** | `content/legal.ts`, `content/faq.ts`, `packages/emails` | `tests/unit/billing-wording.test.ts` |
| Secrets GitHub/Cloudflare côté serveur ; application GitHub ; permissions minimales | **OK** | `packages/infrastructure` | `tests/security/external-sites.test.ts` |
| Webhooks authentifiés (GitHub, Cloudflare, Stripe, tâche de fond) | **OK** — 401/400 avant lecture, idempotence | `api/webhooks/*`, `api/cron/sites` | sécurité |
| Rattachement arbitraire d’un site d’une autre organisation impossible | **OK** — équipe seule, propriétaire vérifié, un dépôt = un site | `0044` | SQL, intégration, E2E |
| Actions de connexion, import, livraison, publication, restauration auditées | **OK** | `app.write_audit` | SQL |
| Site suspendu : ni édition ni publication | **OK** — trou trouvé par le test d’intégration n° 16 et corrigé | `0051_suspended_sites.sql` | SQL « Site suspendu » |

**Défaut trouvé pendant ce chantier** : un site au **statut** `suspended`
(posé par les parcours historiques) restait modifiable et publiable, car
`request_site_release` ne regardait que `suspended_at`. Corrigé par 0051, sans
modifier les migrations précédentes.

**Défauts trouvés à la revue des écrans (finitions du 2026-09-24)** :

| Défaut | Conséquence | Correction |
|---|---|---|
| L’éditeur encadrait le **domaine du client**, que la CSP de l’éditeur n’autorise pas | En production, aperçu bloqué (« This content is blocked ») pour tout site doté de son domaine | L’éditeur encadre l’adresse du projet Cloudflare (`*.pages.dev`, `*.workers.dev`), même déploiement ; test unitaire + assertion E2E |
| Après la livraison, le tableau de bord et la page Maintenance annonçaient encore « démarre à la livraison » | Message faux pour un site livré | Libellé tiré de l’état réel (`orders.maintenance_status`) : active, en cours de mise en place, incluse (compte interne), au devis |
| Le tunnel de commande proposait une adresse provisoire `xxx.sites.stax.fr` | Promesse d’une adresse que le nouveau modèle ne sert pas | « Je choisirai plus tard » : adresse technique du projet Cloudflare, communiquée à la mise en ligne |
| `public.write_audit` ouvert à toute personne connectée, pour toute organisation | Lignes d’audit injectables dans le journal d’une autre société | 0052 : restreint à sa propre organisation (8 assertions SQL) |
| `public.compute_order_pricing` exécutable sans compte | Codes promotionnels testables sans limite | 0052 : fermé à `anon` |
| Carte Exceptionnel : surtitre et badge superposés ; étape du projet affichée en valeur technique (`ordered`) dans l’administration ; apostrophes et accents manquants dans des e-mails et messages | Finition | Corrigés |

**Ce qui dépend encore de vrais identifiants** : l’application GitHub
(`GITHUB_APP_*`), le jeton et le webhook Cloudflare
(`CLOUDFLARE_SITES_API_TOKEN`, `CLOUDFLARE_WEBHOOK_SECRET`), `CRON_SECRET`,
Stripe. Le code est complet et testé contre des émulateurs qui parlent les
mêmes API (`tests/e2e/stack/providers.mjs`) ; aucun appel réel à GitHub ou
Cloudflare n’a pu être fait depuis cet environnement.

---

## 13. Prêt à commercialiser — état au 2026-09-26

### 13.1 Vente par téléphone (nouveau parcours)

Voir [vente-par-telephone.md](./vente-par-telephone.md).

| Exigence | État | Où | Preuve |
|---|---|---|---|
| Site construit et vérifié avant l’envoi ; proposition refusée sinon (domaine et compte client dispensés) | **OK** | `app.create_site_proposal` (0054) | SQL « Propositions de site » |
| Prix = offre du catalogue, sans remise, figé à l’envoi ; une offre sur devis refusée | **OK** | `compute_order_pricing(plan, null)` | SQL |
| E-mail « Votre site est prêt » : lien, code, prix HT/TTC, maintenance, date limite | **OK** | `siteProposalEmail` | `tests/unit/proposals.test.ts` |
| Code de 12 caractères, empreinte HMAC seule, valable avec l’adresse du prospect uniquement, 14 jours | **OK** | `app.claim_site_proposal` | SQL, E2E « un autre compte ne peut pas utiliser le code » |
| Compte → code prérempli → le prospect voit son site et le prix, ne modifie rien | **OK** | `/recuperer`, `ProposalDashboard`, `site_content_access` | E2E `cold-call.spec.ts` |
| Messages du prospect à l’équipe, réponse de l’équipe par e-mail | **OK** | `/app` (discussion), `/admin/messages` | E2E |
| Paiement : commande sur le site EXISTANT (jamais un second), montants de la proposition | **OK** | `app.create_proposal_order` | SQL « Le paiement ne crée ni second site ni second projet » |
| Livraison automatique au paiement confirmé (webhook signé), reprise par la tâche de fond | **OK** | `completePaidProposal`, `app.complete_paid_proposal` | SQL, E2E |
| Expiration sans effacement ; relance (nouveau code) ; retrait (accès retiré, rien d’effacé) | **OK** | `renew/withdraw_site_proposal` | SQL « expiration, relance, retrait » |
| Suivi des prospects dans l’administration | **OK** | `/admin/propositions` | E2E « l’administration voit la vente conclue » |
| Données des prospects : registre, confidentialité, anonymisation à 3 ans | **OK** | A8, `apply_retention` | SQL |

### 13.2 Pannes trouvées pendant l’audit de lancement, et corrigées

Aucune de ces pannes ne levait d’exception ni ne faisait échouer un test.

| # | Panne | Conséquence réelle | Correction |
|---|---|---|---|
| 1 | Le correctif 0053 (tâche de fond compatible Vercel Hobby) était appliqué en base mais **jamais fusionné** | La branche principale gardait une tâche planifiée toutes les 5 min, refusée par Vercel Hobby : **déploiement en échec** | Fusionné |
| 2 | Aucun écran d’administration ne lisait les messages clients (`project_messages`) ni les tickets | Un client qui écrivait n’avait **jamais de réponse** | `/admin/messages`, fiche ticket, réponse avec e-mail |
| 3 | Les policies d’insertion des messages ne vérifiaient pas le côté de l’auteur | Un client pouvait, par l’API, écrire un message affiché « Équipe StaX » | 0055 : côté imposé par la base (SQL) |
| 4 | Aucune route de retour des liens d’e-mail (échange du code PKCE) | **Mot de passe oublié impossible à terminer** ; la confirmation d’inscription ne connectait pas | `/auth/confirmation` |
| 5 | Les invitations de collaborateurs menaient à `/invitation`, page inexistante, et aucune fonction ne permettait de les accepter | Invitations **impossibles à accepter** | `/invitation`, `app.accept_organization_invitation` |
| 6 | Retour d’annulation Stripe vers `/commander/paiement` | Page **404** pour qui renonçait au paiement | Retour au récapitulatif (ou à l’espace), message « rien n’a été débité » |
| 7 | La session Stripe était inscrite sur la commande par une écriture que la policy refuse en silence | Commande jamais « paiement en cours », session introuvable pour la reprendre | `app.attach_checkout_session` |
| 8 | `stripe_customer_id` écrit avec le jeton du client, refusé par un déclencheur | Écriture perdue (le webhook la rattrapait) | Écrit avec la clé de service |
| 9 | Le modèle d’alerte « nouveau contact / devis » existait mais n’était jamais envoyé ; aucune alerte non plus pour les messages et tickets | L’équipe ne savait pas qu’on lui écrivait | Alertes e-mail (`lib/team-alerts.ts`) |
| 10 | La surveillance enregistrait les pannes des sites sans prévenir personne | Un site en panne passait inaperçu | Alerte au passage en panne |
| 11 | Navigation de l’administration masquée sur téléphone | Back-office inutilisable sur mobile | Menu repliable |

### 13.3 Espace client simplifié

Menu recentré (« Accueil », « Écrire à l’équipe », « Modifier mon site »…),
réglages rarement utiles sous « Plus d’options » (rien n’est retiré), carte
« Vos premiers pas », mode d’emploi de l’éditeur en trois lignes, surveillance
en mots simples, pastille des réponses non lues.

### 13.4 Preuves

| Contrôle | Résultat |
|---|---|
| Assertions SQL (`scripts/db-test.sh`) | toutes passées |
| Tests unitaires, intégration, sécurité (`pnpm test`) | tous passés |
| Tests navigateur (`pnpm test:e2e`, ordinateur + téléphone) | 62 passés |
| Parcours contre une vraie pile (`pnpm test:e2e:stack`) | 19 passés, dont `cold-call.spec.ts` |
| Build de production | OK |

---

## Ce qui reste non terminé, sans détour

0. ~~Migrations 0054 et 0055 à appliquer sur le projet Supabase réel~~ —
   **fait le 2026-09-26**, tracées dans `app.schema_migrations` avec
   l'empreinte de leur fichier ; production comparée au dépôt (fonctions,
   colonnes, contraintes, index, policies identiques). L'analyseur Supabase
   ne signale rien de nouveau hors du modèle voulu (fonctions `security
   definer` appelables par une personne connectée, qui vérifient elles-mêmes
   le rôle ; aucune ouverte à `anon`). Reste à activer la protection contre les
   mots de passe compromis (point 3).

0 ter. ~~Migrations à appliquer sur le projet Supabase réel~~ — **fait le
   2026-09-24** : les migrations 0042 à 0053 sont appliquées sur le projet
   « StaX » (53 au total), chacune tracée dans `app.schema_migrations` avec
   l’empreinte de son fichier. Le schéma réel a été comparé à une base locale
   construite depuis le dépôt : tables, politiques RLS, contraintes, index,
   fonctions et droits d’exécution identiques. Reste `pnpm internal:bootstrap`
   avec le mot de passe du compte interne, si ce compte doit être recréé.

0 bis. **Application GitHub, jeton Cloudflare, webhooks, tâche de fond** : à
   créer et à renseigner ([github-integration.md](./github-integration.md),
   [cloudflare.md](./cloudflare.md), [deployment.md](./deployment.md) § 7 à 9).
   Sans eux, *Infrastructure & livraison* le dit et refuse de rattacher.

1. **E2E « deux navigateurs connectés »** pour l'isolation inter-tenant. Elle
   est prouvée par 461 assertions SQL, les tests d'intégration et les parcours
   de § 11 (qui opèrent chacun sur leur propre client), mais pas encore par
   deux sessions réelles ouvertes en parallèle sur le même écran.

1 bis. **Les parcours de § 11 ne tournent pas encore en CI** : ils montent la
   pile locale (binaires GoTrue et PostgREST téléchargés par
   `tests/e2e/stack/stack.sh`, avec les faux GitHub et Cloudflare). La CI
   exécute les 461 assertions SQL, qui
   couvrent les mêmes règles côté base ; brancher les parcours est l'étape
   suivante.

2. **Envoi des e-mails.** L'inscription aboutit et Supabase accepte l'e-mail de
   confirmation, mais le serveur SMTP par défaut de Supabase est limité à
   quelques envois par heure et ne livre pas fiablement à des adresses
   extérieures. Tant qu'un fournisseur n'est pas configuré
   (`EMAIL_PROVIDER` + `EMAIL_API_KEY`, et le SMTP du projet Supabase), un
   client peut créer son compte sans jamais recevoir le lien de confirmation.
   **Le produit paraîtra cassé pour la même raison qu'avant.**

3. **Réglages Supabase hors SQL**, à faire dans le tableau de bord : protection
   contre les mots de passe compromis (HaveIBeenPwned) désactivée ; sauvegardes
   et PITR à vérifier.

4. **Clé de service.** `SUPABASE_SERVICE_ROLE_KEY` n'est pas lisible par
   l'outillage : elle doit être recopiée depuis le tableau de bord vers
   `.env.local` et les secrets Cloudflare. Sans elle, les webhooks Stripe, le
   moteur des sites clients et `pnpm admin:bootstrap` ne fonctionnent pas.

5. **Stripe, Cloudflare, Turnstile** ne sont pas configurés : les capacités
   correspondantes se déclarent indisponibles au lieu d'échouer, et
   `/admin/systeme` les affiche comme telles. Aucun paiement n'est donc
   possible en l'état.

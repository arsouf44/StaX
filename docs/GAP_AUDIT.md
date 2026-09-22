# Audit d'écart — exigences contre code réel

Audit conduit **dans le code**, pas dans le README. Chaque ligne a été vérifiée
par lecture de fichier, requête SQL ou exécution. Un écran présent sans backend
complet est compté **non terminé**, comme demandé.

Date : 2026-09-21 · Branche : `claude/saas-web-builder-platform-lsbygs`

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

| Exigence | État réel | Manque | Fichiers | Correction |
|---|---|---|---|---|
| Source canonique unique | **OK** — table `plans`, lue par `listPublicPlans`; aucun prix en dur | — | `packages/database/src/queries/catalog.ts` | — |
| 300 € + 22 €/an · 550 € + 32 €/an · 1099 € + 82 €/an, HT | **OK** | — | `…20_annual_maintenance.sql` | Appliqué |
| Stripe **hors** Premium | **OK** en base — `online_payments` refusé aux deux premières offres | — | `…20`, `tests/sql/rls.test.sql` | — |
| Les pages vitrines annoncent la **bonne** offre | **CORRIGÉ TARDIVEMENT** — `/fonctionnalites/paiements` et `/fonctionnalites/ecommerce` annonçaient « Premium » alors que la base les réserve à l'Ultra Premium, et le type déclarait encore des offres disparues (`classique`, `signature`). Un client pouvait acheter Premium pour une fonctionnalité qu'elle ne contient pas | — | `content/features.ts` | `tests/integration/plan-promises.test.ts` compare chaque promesse à la grille `plan_features` : il exige l'offre **la moins chère** qui accorde réellement le droit |
| Aucun `/mois`, `mensuel`, `classique`, `signature`, ancien prix | **CORRIGÉ TARDIVEMENT** — cette ligne affirmait « balayage complet » alors que **neuf écrans** affichaient encore « / mois », dont le tunnel de commande, le récapitulatif, la confirmation, la facturation et la FAQ publique. Un client lisait « 32 € / mois » pour un contrat à 32 € / an | — | `commander/`, `facturation`, `app/page`, `admin/commandes`, `content/faq`, `content/features` | `formatMaintenance(montant, devise, périodicité)` est désormais le seul endroit où la périodicité s'écrit, et `tests/unit/billing-wording.test.ts` échoue si « / mois » réapparaît ailleurs |
| Métriques : ne jamais traiter l'annuel comme du MRR | **OK** — `arrCents`, périodicité lue par contrat | — | `packages/database/src/queries/admin.ts` | Corrigé |
| Grandfathering | **OK** — anciennes offres archivées, non supprimées | — | `…20` | — |

---

## 2. Éditeur client — **OK**

| Capacité | État réel | Fichiers |
|---|---|---|
| Modifier le contenu d'une section | **OK** — champs dérivés des schémas Zod, revalidés serveur | `editeur/actions.ts:updateBlockAction` |
| Enregistrement automatique | **OK** — 1,2 s après la dernière frappe, plus bouton explicite et état affiché | `editeur/block-form.tsx` |
| Réordonner | **OK** — glisser-déposer **et** boutons monter/descendre (clavier, tactile) | `editeur/editor.tsx`, `reorderBlocksAction` |
| Masquer / afficher | **OK** | `toggleBlockVisibilityAction` |
| **Ajouter une section** | **OK** — sélecteur groupé par intention, limité aux modules actifs de l'offre, contenu initial pris au registre (jamais au navigateur) | `editeur/block-picker.tsx`, `addBlockAction` |
| **Choisir le type de section** | **OK** — sections uniques (bannière) désactivées si déjà présentes | idem |
| **Dupliquer** | **OK** — la copie se place juste après l'original | `duplicateBlockAction` |
| **Supprimer** | **OK** — confirmation rappelant que le site en ligne ne change pas | `deleteBlockAction` |
| **Historique des versions** | **OK** — 20 dernières publications, auteur, date, version en ligne signalée | `editeur/version-history.tsx` |
| **Retour à une version** | **OK** — `rollback_site` republie l'instantané sous un nouveau numéro. Le libellé dit ce qui se passe vraiment : le site en ligne change tout de suite, le brouillon n'est pas touché | `rollbackSiteAction` |
| **Aperçu desktop / tablette / téléphone** | **OK** — rendu par le **moteur public**, sur le snapshot du brouillon : aperçu et mise en ligne ne peuvent pas diverger | `editeur/apercu/route.ts`, `…21_draft_preview.sql` |
| Publier | **OK** — instantané figé, atomique | `publishSiteAction` |
| Brouillon séparé du publié | **OK** — structurel | `app.publish_site` |

**Sécurité de l'aperçu** : le contenu affiché est écrit par le client. Le servir
depuis l'origine de la plateforme reviendrait à offrir une exécution de script
dans la session de la personne connectée. Deux barrières : l'en-tête
`Content-Security-Policy: sandbox allow-scripts` place le document dans une
origine opaque, et l'iframe porte `sandbox` sans `allow-same-origin`.
`allow-forms` est volontairement absent. Le site prévisualisé n'est jamais
désigné par le navigateur : il vient de l'espace de travail résolu côté serveur,
et la fonction SQL exige `content.edit` (9 assertions SQL).

**Reste hors éditeur de sections** : pages et navigation se modifient depuis
`/app/site`, thème et images depuis `/app/site/apparence` et `/app/media`, SEO
depuis `/app/site/referencement`.

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

## Ce qui reste non terminé, sans détour

1. **E2E « deux navigateurs connectés »** pour l'isolation inter-tenant. Elle
   est prouvée par 270 assertions SQL et 12 parcours d'intégration, mais pas
   encore par deux sessions réelles ouvertes en parallèle.

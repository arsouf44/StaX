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
| Stripe **hors** Premium | **OK** — `online_payments` refusé par la base aux deux premières offres, vérifié par assertion SQL | — | `…20`, `tests/sql/rls.test.sql` | — |
| Aucun `/mois`, `mensuel`, `classique`, `signature`, ancien prix | **OK** — balayage complet du dépôt | — | e-mails, dashboard, marketing, seed | Corrigé |
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
| Comptes clients du site final | **MANQUE** | **MANQUE** | Droit d'offre déclaré, aucune implémentation. Le suivi de commande sans compte couvre le besoin courant (lien signé) |

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

---

## 4. Back-office `/admin`

| Écran | État |
|---|---|
| Vue d'ensemble, commandes, organisations, webhooks | **OK** |
| 13 listes (sites, utilisateurs, domaines, projets, devis, abonnements, remboursements, tickets, offres, sécurité, journal, factures, santé) | **OK** |
| Assistance client (impersonation) | **OK** — motif obligatoire, durée plafonnée, bannière, 14 opérations interdites |
| Émission de factures | **OK** — montant repris du catalogue, numérotation continue |
| **`/admin/sites/[id]`** | **OK** — fiche complète (offre, métier, dates, projet, maintenance, compteurs), domaines et état DNS réel, 15 dernières versions, codes d'activation. Actions : changement d'état limité aux transitions réellement permises par `app.guard_site_status`, remise en ligne d'une version, émission et révocation de codes. Motif obligatoire, trace nominative, rôle `platform_admin` exigé |
| Paramètres, feature flags, templates, métiers/modules, coupons, contenu | **MANQUE** — tables et logique présentes, aucune interface |

---

## 5. Flux commercial par facture

| Étape | État |
|---|---|
| Facture créée par l'admin | **OK** |
| Saisie du numéro par le client | **OK** |
| Le numéro seul n'authentifie jamais | **OK** — l'adresse destinataire fait foi ; réponse identique pour un numéro inexistant et une facture d'autrui ; tentatives comptées |
| Rattachement atomique | **OK** — une seule commande par facture, vérifié par assertion SQL |
| Aucun « payé » déduit de la saisie | **OK** — vérifié par assertion SQL |
| E-mail de facture au client | **MANQUE** — le numéro doit être transmis à la main |

---

## 6. Sécurité

| Contrôle | État |
|---|---|
| RLS sur 100 % des tables `public` | **OK** |
| Isolation inter-tenant | **OK** — 188 assertions SQL |
| Mass assignment | **OK** — listes blanches Zod partout |
| Machines à états financières | **OK** — `payé`/`remboursé` inatteignables depuis un navigateur |
| Webhooks signés, idempotents | **OK** |
| MFA obligatoire admin (`aal2`) | **OK** |
| Secrets hors bundle | **OK** — `.env.example` sans valeurs |
| Brute-force activation / facture | **OK** — débit limité, tentatives comptées |
| **E2E d'isolation inter-tenant** | **MANQUE** — prouvé en SQL, pas par un parcours navigateur |

---

## 7. Légal

| Élément | État |
|---|---|
| SIREN / SIRET / TVA vérifiés par clé de contrôle | **OK** — échec de démarrage si faux |
| Identité LallianSe inscrite | **OK** |
| Capital, directeur de publication | **BLOQUANT VOLONTAIRE** — aucune valeur par défaut, production refusée |
| 9 pages légales | **OK** |
| Textes « maintenance mensuelle » | **OK** — corrigés |
| **Registre des traitements (art. 30 RGPD)** | **MANQUE** |
| **Procédure de violation outillée (72 h CNIL)** | **MANQUE** — écrite, non outillée |

---

## 8. Validation

| Commande | Résultat |
|---|---|
| `format:check`, `lint`, `typecheck` | **OK** — 0 |
| Tests unitaires + sécurité + intégration | **OK** |
| Assertions SQL / RLS | **OK** — 188 |
| E2E | **PARTIEL** — 48 tests couvrent marketing, accessibilité, auth. **Manquent** : inscription complète, facture, commande, activation, édition, publication, rollback, réservation, e-commerce, domaine, admin, isolation |
| Build production + Cloudflare | **OK** |

---

## Ce qui reste non terminé, sans détour

1. Écrans d'administration restants (paramètres, feature flags, templates, coupons)
2. E-mail d'envoi de facture au client
3. Registre des traitements (art. 30) et outillage de violation de données
4. Comptes clients sur le site final (droit Ultra Premium déclaré, non implémenté)
5. E2E des parcours critiques

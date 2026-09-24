# Du projet au site en ligne : le cycle de livraison

**Nous créons le site. Le client le gère ensuite.** StaX n’est ni un générateur
de sites, ni un système de modèles : chaque site est un projet individuel,
conçu et développé par l’équipe dans son propre dépôt, déployé sur son propre
projet Cloudflare, puis **rattaché** à StaX pour que le client en modifie le
contenu **après** la livraison.

```
ORDER
 → BUILD EXTERNALLY        l'équipe développe le site hors de StaX
 → GITHUB                  un dépôt par site (application GitHub StaX)
 → CLOUDFLARE              un projet Pages ou Workers par site, domaine, HTTPS
 → VERIFY                  checklist : déployé, domaine, HTTPS, SEO, formulaires, responsive…
 → IMPORT INTO STAX        dépôt + projet + stax.manifest.json + contenu initial = version 1
 → DELIVER                 « Livrer le site au client » : l'éditeur s'ouvre, la maintenance démarre
 → CLIENT EDITS DRAFT      brouillon, aperçu du VRAI site (build Cloudflare de prévisualisation)
 → PUBLISH                 « Publier » : nouvelle version demandée
 → GITHUB COMMIT           commit `stax: publication client 00002` en avance rapide
 → CLOUDFLARE DEPLOYMENT   Cloudflare construit et déploie ce commit
 → LIVE                    « Publié » seulement quand Cloudflare confirme le déploiement
```

Le site public **ne dépend pas** de la plateforme StaX : il est servi par son
projet Cloudflare. Si StaX est indisponible, le site s’affiche ; seules les
interactions qui passent par l’[API des sites](#api-des-sites) (formulaires,
réservations, paiements, statistiques) sont suspendues.

---

## 1. Commande (ORDER)

| Étape | Qui | Effet |
| --- | --- | --- |
| Choix de l’offre, métier, informations, adresse | client | brouillon de commande (cookie signé) |
| Récapitulatif : prix, délai de réalisation de l’offre, ce que l’offre comprend | client | `app.create_order` fige prix et inclusions (`orders.plan_inclusions`) |
| Paiement de la **création** seulement | Stripe | webhook signé → `app.apply_order_paid` |

Au paiement : le site (`sites.architecture = 'external_repository'`) et le
projet sont créés, **vides et non livrés** (`delivered_at` nul). La maintenance
passe à `pending_delivery` : **rien n’est prélevé** avant la livraison. La
carte est mémorisée (`setup_future_usage`) pour démarrer l’abonnement mensuel
le jour de la livraison.

Le métier sert à adapter le questionnaire, à suggérer les fonctionnalités
utiles et à donner le bon vocabulaire à l’espace client. **Il ne sélectionne
jamais de modèle** : il n’en existe plus (migration 0045, aucune table ni
fonction de provisionnement ; vérifié par la suite SQL).

## 2. Pendant la construction : le client suit, il ne modifie rien

L’espace client affiche le **tableau de bord du projet** :

```
Commande validée → Informations reçues → Conception → Développement
                 → Vérifications → Mise en ligne → Livraison
```

(`PROJECT_TIMELINE`, `@stax/payments`). Le client y transmet ses informations
et ses fichiers, échange avec l’équipe, répond aux demandes de validation
(`app.respond_to_project_review`), retrouve ses factures. L’équipe fait avancer
l’étape depuis l’administration (`app.set_project_phase`).

Il **ne peut pas** modifier le site : `app.site_content_access` refuse
l’édition, l’aperçu et la publication tant que `delivered_at` est nul, et
l’interface remplace les écrans du site par le suivi du projet. L’équipe StaX,
elle, peut travailler sur le brouillon avant la livraison.

## 3. Développement hors de StaX (BUILD EXTERNALLY → GITHUB → CLOUDFLARE)

L’équipe développe le site avec les outils de son choix, dans un **dépôt
GitHub dédié** au compte sur lequel l’application GitHub StaX est installée.
Le dépôt contient :

- le code du site ;
- `stax.manifest.json` : le **contrat d’édition** (ce que le client pourra
  modifier) — voir [editable-site-contract.md](./editable-site-contract.md) ;
- le fichier de contenu déclaré par le contrat (par ex.
  `src/content/stax.content.json`), que le site lit **au build**.

Le dépôt est relié à un **projet Cloudflare** (Pages, ou Workers Builds) qui
déploie la branche de production à chaque commit. Le domaine du client pointe
vers **ce** projet — jamais vers un rendu générique de StaX.

## 4. Rattachement dans StaX (IMPORT INTO STAX)

Administration → site → **Infrastructure & livraison**
(`/admin/sites/<id>/livraison`) :

1. **Dépôt GitHub** : choisi dans la liste des dépôts de l’installation
   (lue chez GitHub). La base refuse un dépôt hors de l’application StaX,
   d’un autre compte que celui de l’installation, ou déjà rattaché à un autre
   site (`app.connect_site_repository` : `installation_unknown`,
   `owner_mismatch`, `repository_already_attached`).
2. **Projet Cloudflare** : StaX lit le projet chez Cloudflare et vérifie qu’il
   déploie **ce** dépôt, depuis **sa** branche de production, déploiements
   automatiques actifs. Un projet ne sert qu’un site (`project_already_attached`).
3. **Contrat d’édition** : « Importer le manifeste du dépôt » lit
   `stax.manifest.json` au sommet de la branche, le valide, le compare aux
   droits de l’offre, crée les formulaires déclarés (`sync_site_integrations`).
4. **Contenu initial** : le fichier de contenu **au commit actuellement
   déployé avec succès** (confirmé par l’API Cloudflare) devient la
   **version 1** (`app.initialize_site_content`). Sans déploiement confirmé :
   `deployment_not_verified`.
5. **Domaine** : ajouté au projet Cloudflare du site, suivi jusqu’à l’état actif.

Toutes ces actions sont **auditées** (`audit_logs`).

## 5. Vérifications (VERIFY)

`app.delivery_readiness` calcule la checklist ; `deliver_site` la **refuse**
incomplète.

| Contrôle | Nature | Source de la preuve |
| --- | --- | --- |
| Dépôt, projet Cloudflare | automatique | rattachements actifs |
| Site déployé | automatique | déploiement de production réussi (Cloudflare) |
| Domaine fonctionnel, HTTPS | automatique | sondes serveur (`runDeliveryProbes`) |
| SEO minimum | automatique | titre, description, pas de `noindex`, `robots.txt`, plan du site |
| Manifeste valide, éditeur compatible | automatique | contrat actif, version 1 |
| Formulaires testés, responsive vérifié | **attestés** | nom de la personne + description de ce qui a été vérifié |
| Compte client existant, offre appliquée | automatique | membres, droits de l’offre vs contrat (langues, modules) |

Un contrôle automatique ne s’atteste pas à la main ; seul le serveur
l’inscrit, avec sa preuve (`record_delivery_check`, rôle de service).

## 6. Livraison (DELIVER)

« **Livrer le site au client** » (`app.deliver_site`) :

- pose `sites.delivered_at`, passe le site `live`, le projet à « Livraison » ;
- ouvre au client l’édition, l’aperçu, la publication et l’historique ;
- notifie le client (notification + e-mail « Votre site vous est livré ») ;
- **démarre la maintenance mensuelle** (`startMaintenanceAtDelivery` →
  abonnement Stripe). La base refuse tout abonnement pour un site non livré
  (`upsert_subscription_from_stripe` → `site_not_delivered`). Un échec Stripe
  n’annule pas la livraison : la commande passe en `failed`, visible et
  relançable depuis la même page.

La garantie commerciale court à partir de la livraison.

## 7. Édition par le client (CLIENT EDITS DRAFT)

`/app/editeur` (site livré) : à gauche les **zones modifiables** du contrat, au
centre l’**aperçu du vrai site**, à droite les **champs** (titre, texte, image
à remplacer, bouton : texte + lien…). Pas de HTML, de CSS, de JSON ni de
fichier. Un clic dans l’aperçu sur un élément marqué `data-stax` ouvre son
champ (script de pont, `packages/site-contract/src/bridge.ts`).

- **Enregistrer le brouillon** : `save_site_draft`, avec contrôle de révision
  (un brouillon modifié entre-temps n’est jamais écrasé).
- **Aperçu** : un vrai build du brouillon. StaX écrit le contenu sur la branche
  `stax-preview`, **repartie du commit de production**, et Cloudflare en fait
  un déploiement de prévisualisation. L’aperçu est donc rendu par le même code
  que la production.
- Le design, la structure, le code et les intégrations ne sont pas modifiables.

## 8. Publication (PUBLISH → GITHUB COMMIT → CLOUDFLARE DEPLOYMENT → LIVE)

```
scheduled ─→ queued ─→ committing ─→ deploying ─→ published
                │            │             │
                └────────────┴─────────────┴──→ failed   (la production ne bouge pas)
```

1. **Publier** (`request_site_release`) : nouvelle version, contenu figé, une
   seule publication à la fois. La publication **programmée** n’existe que dans
   les offres qui la comprennent (`feature_unavailable` sinon).
2. **Commit** (`processRelease`) : le contenu est revalidé contre le contrat,
   le fichier de contenu et les médias nouveaux sont écrits en **un commit**
   `stax: publication client 00002` (marqueurs `Stax-Release`, `Stax-Site`,
   `Stax-Version`), en **avance rapide uniquement** : un commit poussé entre-temps
   par un développeur n’est jamais écrasé (une seule reprise au-dessus du
   nouveau sommet, sinon échec explicite).
3. **Déploiement** : Cloudflare construit ce commit. StaX relit l’état **chez
   Cloudflare** (webhook de notification, tâche de fond toutes les 5 minutes,
   suivi par l’interface) ; le webhook n’est qu’un signal.
4. **En ligne** : `record_site_deployment` + `finalize_site_release` ne
   passent la version à `published` que pour un déploiement de production
   **réussi du commit de cette version**. La version précédente devient
   `superseded` (jamais effacée).

Échecs :

| Où | Effet |
| --- | --- |
| GitHub (droits, branche, réseau) | `failed`, étape `github` ; la production ne bouge pas ; message clair au client |
| Build Cloudflare | `failed`, étape `cloudflare`, extrait du journal de build pour l’équipe |
| Pas de confirmation en 45 min | `failed`, étape `timeout` ; si Cloudflare confirme plus tard, la version passe **alors** en ligne (0049) |
| Site suspendu | la version en attente échoue à sa prise en charge (0051) |

« Publié » n’est **jamais** affiché avant la confirmation de Cloudflare.

## 9. Historique, voir, restaurer, republier

`/app/site/versions` : chaque version avec son numéro, sa date, son auteur, son
commit, l’état de son déploiement, et :

- **Voir** : l’adresse du déploiement Cloudflare de cette version ;
- **Restaurer** : une **nouvelle** version au contenu de l’ancienne,
  réellement recommitée et redéployée (commit
  `stax: restauration de la version 1 (version 5)`) ; le brouillon en cours
  n’est pas modifié ;
- **Republier** : redéploie la version en ligne à l’identique.

La page suit une restauration jusqu’à la confirmation de Cloudflare.

## 10. Après la livraison : maintenance, suspension, résiliation

- **Maintenance mensuelle**, sans durée minimale, résiliable en ligne ; elle
  prend fin au terme du mois en cours. Contenu exact : [CGV, article 9](../apps/platform/src/content/legal.ts).
- **Suspension** (impayé persistant, contenu illicite, fin de la période de
  continuité) : l’éditeur, l’aperçu, la publication et les interactions de
  l’API des sites sont interrompus ; rien n’est effacé ; le client relit son
  historique et peut exporter ses données (`app.site_is_available`).
- **Réversibilité** : export des données en libre-service ; copie du code
  source du site sur demande, en fin de contrat.

## API des sites

Un site indépendant s’appuie sur StaX pour ses interactions, via
`https://<api>/v1/sites/<clé publique>/…` (`apps/site-runtime/src/sites-api.ts`) :
formulaires, mesure d’audience sans cookie, réservations, boutique et
paiement sur le compte Stripe du commerçant, comptes clients. Le site est
identifié par sa **clé publique** (elle n’ouvre aucun droit seule) ; toute
écriture exige une **origine appartenant au site** ; chaque opération est
limitée en débit et vérifiée contre les droits de l’offre en base.

---

Voir aussi : [github-integration.md](./github-integration.md),
[editable-site-contract.md](./editable-site-contract.md),
[cloudflare.md](./cloudflare.md), [stripe.md](./stripe.md),
[security.md](./security.md).

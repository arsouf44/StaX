# Sécurité

Ce document décrit ce que StaX protège, contre quoi, et **comment cela est
vérifié**. Une défense qui n’est pas testée n’est pas une défense : c’est une
intention.

---

## Modèle de menace

| Adversaire | Ce qu’il cherche | Défense principale |
| --- | --- | --- |
| Client curieux ou malveillant | Lire les données d’un autre client | RLS PostgreSQL, testée par 175 assertions |
| Visiteur d’un site client | Obtenir un service gratuitement, fausser un prix | Prix et capacités calculés en base |
| Robot | Envoyer du pourriel, tester des codes | Limitation de débit, champ piège, Turnstile |
| Attaquant avec un mot de passe volé | Prendre un compte | Double facteur, obligatoire pour l’administration |
| Employé | Accéder à des données sans motif | Journal d’audit, prise en main tracée et limitée |
| Personne qui obtient une sauvegarde | Réutiliser des secrets | Codes et jetons stockés en HMAC, jamais en clair |

---

## 1. Isolation entre clients

**Ce n’est pas un filtre dans l’interface.** C’est PostgreSQL qui refuse la
ligne.

- Toutes les tables multi-tenant ont `row level security` activée, avec des
  politiques distinctes pour `select`, `insert`, `update` et `delete`.
- L’espace client et le back-office utilisent **exclusivement** un client
  Supabase portant le JWT de la personne.
- La clé de service, qui contourne la RLS, n’est utilisée que par les webhooks,
  le moteur des sites publics et les scripts d’exploitation — jamais par une
  page.

**Vérifié par** `tests/sql/rls.test.sql` :

- un client ne peut pas `SELECT`, `UPDATE` ni `DELETE` les données d’une autre
  organisation, même en fournissant un identifiant valide ;
- il ne peut pas non plus *déplacer* une de ses lignes vers une autre
  organisation (clause `with check`) ;
- un éditeur n’accède pas à la facturation, un lecteur ne modifie rien ;
- les mêmes vérifications s’appliquent aux fonctions appelées par le moteur
  public, qui tourne pourtant avec tous les droits.

---

## 2. Aucune escalade de privilège

`profiles.platform_role` est la **seule** source de vérité pour les droits
internes. Un déclencheur (`app.guard_platform_role`) refuse toute modification
provenant d’une session cliente : seule la clé de service peut l’écrire.

**Posséder l’adresse e-mail d’administration ne confère aucun droit.** Une
personne qui créerait un compte avec cette adresse via le formulaire public
obtient un compte ordinaire. C’est testé.

L’accès au back-office exige trois conditions cumulatives :

1. une session valide ;
2. un rôle inscrit en base ;
3. un second facteur **réellement validé** pour la session en cours (`aal2`), pas
   seulement enrôlé.

---

## 3. Intégrité financière

- **Aucun montant ne vient du navigateur.** `app.create_order` lit le prix dans
  le catalogue ; le webhook crédite le montant figé dans la commande.
- **L’argent est en centimes entiers.** Aucun flottant. Les arrondis TypeScript
  reproduisent la division entière tronquée de PostgreSQL, et un test compare
  les deux implémentations sur les prix réels du catalogue.
- **Une règle de lint interdit `xxxCents / 100`** dans tout le dépôt.
- **Un déclencheur rend immuables les montants d’une commande payée.**
- **L’éligibilité au remboursement est calculée en base**, à partir de la date
  réelle de mise en ligne. La déduction liée au domaine ne s’applique que si un
  domaine a **effectivement** été acheté — condition vérifiée sur l’état réel du
  dossier, jamais déclarée par le client.
- **La vérité vient du webhook signé.** La page de confirmation ne lit même pas
  le `session_id` renvoyé par Stripe.
- **Idempotence.** Stripe rejoue un événement jusqu’à trois jours. Chaque
  identifiant est enregistré sous contrainte d’unicité, et chaque fonction
  appliquée est idempotente — prouvé par test : un rejeu ne crée ni paiement, ni
  site, ni projet, ni abonnement en double.

---

## 4. Données de paiement

**Aucune donnée de carte n’est collectée, transmise ou stockée.** Le paiement se
fait sur les pages hébergées de Stripe. Nous ne conservons que des identifiants
Stripe, la marque de la carte et ses quatre derniers chiffres — ce que Stripe
expose explicitement à cette fin.

Les encaissements réalisés sur les sites des clients passent par **Stripe
Connect** : l’argent va directement sur le compte du client, ouvert à son nom.
StaX n’est pas dans ce circuit financier et la commission est fixée à zéro.

---

## 5. En-têtes et politique de sécurité du contenu

Deux profils, appliqués à **toutes** les réponses :

- `platform` — `frame-ancestors 'none'`, `X-Frame-Options: DENY`.
- `tenant-site` — plus permissif sur les images et les polices, aussi strict sur
  les scripts.

La CSP autorise `'self'`, le **nonce de la requête** et `'strict-dynamic'`.
Aucun site client ne peut exécuter de JavaScript arbitraire : c’est la dernière
barrière si une injection traversait la validation et l’assainissement.

`style-src` conserve `'unsafe-inline'`, et c’est un choix explicite : les jetons
de thème par tenant sont injectés en variables CSS. Aucun style ne provient de
l’utilisateur — ils sont produits à partir de valeurs validées par un schéma.

---

## 6. Contenus intégrés

Un client ne peut pas coller une `iframe` arbitraire. Le bloc « contenu
intégré » accepte un **fournisseur choisi dans une liste fermée** et un
identifiant validé par expression régulière ; l’URL est ensuite **construite**
par le moteur. Autoriser une iframe libre reviendrait à laisser exécuter du code
tiers sur le domaine du client, donc sur ses propres cookies.

---

## 7. Formulaires publics

Quatre protections, dans cet ordre :

1. **Origine** — une requête mutante dont l’origine n’est pas reconnue est
   refusée.
2. **Jeton anti-CSRF signé**, lié au nom d’hôte : un formulaire du site A ne peut
   pas être rejoué vers le site B.
3. **Limitation de débit**, comptée sur une empreinte d’IP — l’adresse complète
   n’est jamais conservée.
4. **Turnstile**, lorsqu’il est configuré.

S’y ajoute un score anti-pourriel (champ piège, délai de remplissage,
heuristiques de contenu). Un message suspect est **classé, jamais supprimé** :
un faux positif reste récupérable par le client.

La liste des champs acceptés est **blanche et fermée**, appliquée en base : une
clé non déclarée est ignorée, y compris une clé qui tenterait de forcer un champ
interne. Testé.

---

## 8. Secrets et empreintes

| Donnée | Stockage |
| --- | --- |
| Mot de passe | Supabase Auth (bcrypt) — jamais dans nos tables |
| Code d’activation | HMAC-SHA256, avec indice partiel pour le support |
| Jeton d’annulation de réservation | HMAC-SHA256 |
| Adresse IP | HMAC tronqué, jamais en clair |
| Empreinte visiteur | HMAC salé **journalier** — aucun suivi d’un jour sur l’autre |

Toute la cryptographie utilise **WebCrypto**, disponible à l’identique sur
Cloudflare Workers et Node. Aucun `node:crypto`, qui casserait le moteur edge.

Le journal d’audit retire systématiquement les clés `password`, `token`,
`secret`, `code`, `authorization`, `api_key` et `client_secret` — filet de
sécurité en base, en plus de la discipline applicative.

---

## 9. Mot de passe initial de l’administrateur

Il n’apparaît **nulle part** : ni dans le dépôt, ni dans le JavaScript, ni dans
Git, ni dans une migration, ni dans `.env.example`.

Il est fourni au moment de l’approvisionnement, via `ADMIN_BOOTSTRAP_PASSWORD`,
utilisé une fois par `scripts/bootstrap-admin.ts`, et jamais journalisé. Le
script est idempotent, refuse de s’exécuter côté navigateur, exige la clé de
service et impose l’enrôlement du second facteur.

---

## 10. Prise en main d’un compte client par le support

Encadrée strictement :

- motif obligatoire, enregistré ;
- durée bornée (60 minutes maximum) ;
- actions sensibles interdites pendant la session (paiement, suppression,
  changement de rôle) ;
- trace d’audit à l’ouverture comme à la fermeture ;
- bandeau permanent : la personne qui regarde sait qu’elle regarde.

---

## 11. Ce que nous ne prétendons pas

- **Aucun chiffre de disponibilité n’est publié** tant qu’il n’est pas mesuré et
  vérifiable. La page d’état affiche « non mesuré » quand une sonde n’a jamais
  tourné, plutôt qu’un vert rassurant.
- **Aucun audit de sécurité externe n’a été réalisé** à ce jour.
- **Aucune certification n’est revendiquée.**

---

## Signaler une faille

Écrivez à l’adresse de contact indiquée dans les mentions légales, avant toute
divulgation publique. Les recherches menées de bonne foi sont bienvenues ; les
tests de charge et les balayages automatisés demandent un accord écrit préalable.

# Registre des activités de traitement (RGPD art. 30)

Ce registre est tenu par **LallianSe SAS**, éditrice de StaX. Il décrit ce que
le code fait **réellement** : chaque finalité renvoie aux tables et aux
fichiers qui la mettent en œuvre, et se vérifie en les lisant.

> **À maintenir à jour.** L'article 30 exige un registre écrit, tenu à jour et
> communicable à l'autorité de contrôle sur demande. Toute évolution du modèle
> de données qui ajoute une donnée personnelle doit entrer ici **dans la même
> modification** que le code.

| Champ | Valeur | Source |
| --- | --- | --- |
| Responsable du traitement | LallianSe SAS | `LEGAL_COMPANY_NAME` |
| Siège | 229 rue Saint-Honoré, 75001 Paris | `LEGAL_ADDRESS` |
| SIREN / SIRET | 814 648 663 / 814 648 663 00031 | `LEGAL_SIREN`, `LEGAL_SIRET` |
| TVA intracommunautaire | FR58814648663 | `LEGAL_VAT` |
| Contact pour l'exercice des droits | `LEGAL_DPO_CONTACT` | configuration |
| Délégué à la protection des données | **Non désigné à ce jour.** `LEGAL_DPO_CONTACT` est une adresse de contact RGPD, pas la désignation d'un DPO au sens de l'article 37 — ne pas confondre les deux | — |

Les valeurs marquées « configuration » ne sont jamais inventées par le code :
`scripts/check-legal-config.ts` refuse un déploiement de production si une
mention obligatoire manque.

---

## A. StaX comme **responsable de traitement**

Traitements effectués pour notre propre compte : nos clients, nos ventes, notre
plateforme.

### A1 — Gestion des comptes et des accès

| | |
| --- | --- |
| **Finalité** | Créer et sécuriser l'accès à l'espace client |
| **Base légale** | Exécution du contrat (art. 6.1.b) |
| **Personnes** | Représentants des entreprises clientes, collaborateurs qu'elles invitent |
| **Données** | Nom, prénom, e-mail, téléphone, rôle, second facteur, horodatages de connexion |
| **Tables** | `profiles`, `organization_members`, `activation_codes`, `auth.users` (Supabase) |
| **Conservation** | Durée du contrat, puis 3 ans à compter du dernier contact |
| **Destinataires** | Supabase (hébergement et authentification) |

Le mot de passe n'est jamais stocké par StaX : l'authentification est déléguée à
Supabase, qui conserve un dérivé. Les codes d'activation ne sont stockés que
sous forme d'empreinte HMAC (`activation_codes.code_hash`) : un code perdu se
remplace, il ne se retrouve pas.

### A2 — Vente, facturation, comptabilité

| | |
| --- | --- |
| **Finalité** | Commander un site, facturer, encaisser, tenir la comptabilité |
| **Base légale** | Contrat (art. 6.1.b) et obligation légale (art. 6.1.c) |
| **Personnes** | Clients et prospects ayant reçu une facture |
| **Données** | Raison sociale, e-mail, montants, offre, références de paiement Stripe |
| **Tables** | `orders`, `sales_invoices`, `invoices`, `payments`, `subscriptions`, `quotes` |
| **Conservation** | **10 ans** pour les pièces comptables (art. L123-22 du code de commerce) |
| **Destinataires** | Stripe Payments Europe Ltd (paiement) |

**Aucune donnée bancaire n'est traitée par StaX.** Numéros de carte, CVC et
cryptogrammes ne transitent jamais par notre infrastructure : le paiement a lieu
sur une page hébergée par Stripe. Nous ne conservons qu'un identifiant de
transaction.

### A3 — Réalisation et exploitation des sites

| | |
| --- | --- |
| **Finalité** | Construire, héberger et maintenir le site du client |
| **Base légale** | Exécution du contrat (art. 6.1.b) |
| **Personnes** | Clients, et personnes dont ils publient les coordonnées (équipe, contacts) |
| **Données** | Contenus fournis par le client, images, coordonnées professionnelles publiées |
| **Tables** | `sites`, `site_pages`, `page_blocks`, `site_versions`, `media`, `team_members` |
| **Conservation** | Durée du contrat + 90 jours de rétention technique |
| **Destinataires** | Cloudflare (hébergement edge), Supabase (base et stockage) |

Le contenu publié relève de la responsabilité éditoriale du client. Quand ce
contenu comporte des données personnelles (photo d'un salarié, coordonnées d'un
membre de l'équipe), **le client en est responsable de traitement** et StaX
sous-traitant : voir la section B.

### A4 — Assistance et relation client

| | |
| --- | --- |
| **Finalité** | Répondre aux demandes, diagnostiquer les incidents |
| **Base légale** | Contrat (art. 6.1.b) et intérêt légitime (art. 6.1.f) |
| **Données** | Échanges de support, sessions d'assistance avec motif obligatoire |
| **Tables** | `support_tickets`, `support_messages`, `project_messages`, `impersonation_sessions`, `audit_logs` |
| **Conservation** | 3 ans à compter de la clôture |

La discussion « Écrire à l'équipe » (`project_messages`) est lue par l'équipe
depuis `/admin/messages` ; le côté de l'auteur (client ou StaX) est imposé par
la base (0055). Une copie de chaque réponse de l'équipe part par e-mail au
responsable du compte client.

Une session d'assistance n'emprunte jamais l'identité du client : elle est
nominative, motivée, plafonnée en durée, signalée par une bannière visible dans
l'espace du client, et quatorze opérations y restent interdites.

### A5 — Sécurité, preuve et lutte contre l'abus

| | |
| --- | --- |
| **Finalité** | Détecter les accès anormaux, limiter les abus, prouver ce qui s'est passé |
| **Base légale** | Intérêt légitime (art. 6.1.f) et obligation de sécurité (art. 32) |
| **Données** | Journaux d'audit, **empreintes** d'adresses IP, compteurs de tentatives |
| **Tables** | `audit_logs`, `rate_limit_counters`, `security_events`, `email_log` |
| **Conservation** | 12 mois pour les journaux techniques, 3 ans pour les journaux d'audit |

Aucune adresse IP n'est conservée en clair : `hashIp()` en stocke une empreinte
salée. Les journaux ne contiennent ni mot de passe, ni secret, ni code
d'activation en clair, et `email_log` ne conserve qu'une empreinte du
destinataire — assez pour diagnostiquer une non-délivrance, jamais assez pour
reconstituer un carnet d'adresses.

### A6 — Mesure d'audience

| | |
| --- | --- |
| **Finalité** | Compter les visites d'un site client, pour son propriétaire |
| **Base légale** | Intérêt légitime (art. 6.1.f) — **exemption de consentement** |
| **Données** | Chemin, référent (nom d'hôte seul), pays, empreinte visiteur **journalière et salée** |
| **Tables** | `analytics_events`, `daily_site_metrics` |
| **Conservation** | 25 mois pour les agrégats, 30 jours pour les événements unitaires |

**Aucun cookie, aucune adresse IP complète, aucun suivi d'un jour sur l'autre.**
L'empreinte visiteur change chaque jour par construction : elle ne permet pas de
reconnaître une personne d'une visite à l'autre. C'est ce qui place cette mesure
dans l'exemption de consentement prévue par la CNIL pour la mesure d'audience,
et cette propriété doit être préservée à chaque évolution.

### A7 — Signalements de contenus illicites

| | |
| --- | --- |
| **Finalité** | Recevoir et traiter les signalements de contenus illicites sur les sites hébergés |
| **Base légale** | Obligation légale (art. 6.1.c) — règlement (UE) 2022/2065, art. 16 ; LCEN, art. 6 |
| **Personnes** | Auteurs de signalements ; éditeurs des sites concernés |
| **Données** | Nom, e-mail (facultatifs pour un abus sur mineur), URL, motif, décision motivée, empreinte d'IP |
| **Tables** | `content_reports`, `audit_logs` |
| **Conservation** | 1 an après la décision (purge `app.apply_retention()`) |

L'identité de l'auteur n'est pas communiquée à l'éditeur du site, sauf
obligation légale. Seule l'équipe StaX lit les signalements (RLS), et seule
l'administration de la plateforme peut décider.

### A8 — Propositions de site (vente par téléphone)

| | |
| --- | --- |
| **Finalité** | Adresser à une entreprise, après un échange téléphonique où elle l'a accepté, le site préparé pour elle, son prix et un code pour le récupérer ; suivre la proposition |
| **Base légale** | Mesures précontractuelles prises à la demande de la personne (art. 6.1.b) |
| **Personnes** | Contacts professionnels des entreprises prospectées |
| **Données** | Nom de l'entreprise, nom, e-mail et téléphone professionnels du contact, offre et prix proposés, notes internes de l'équipe, dates d'envoi, de récupération et de paiement, nombre de saisies du code |
| **Tables** | `site_proposals`, `audit_logs`, `email_log` (empreinte du destinataire) |
| **Conservation** | Non conclue (expirée ou retirée) : coordonnées **anonymisées 3 ans** après le dernier échange (`app.apply_retention()`, 0054). Conclue : comme A1 et A2 |

Le code personnel n'est stocké que sous forme d'empreinte HMAC ; il ne vaut
qu'avec l'adresse e-mail destinataire. Le prospect ne lit jamais la table
(notes internes) : il ne voit que sa proposition, par une fonction dédiée. Le
démarchage téléphonique d'entreprises n'est pas soumis à Bloctel ; l'e-mail de
proposition n'est envoyé qu'après un appel concluant, jamais en masse.

Toutes les durées de conservation de ce registre sont **appliquées** par
`app.apply_retention()` (migration 0039), planifiée chaque jour : voir
`docs/supabase.md`.

---

## B. StaX comme **sous-traitant** (art. 28)

Pour les données que ses clients collectent via leur site, StaX agit **sur
instruction** du client, qui en est responsable de traitement.

| Traitement | Données | Tables | Conservation |
| --- | --- | --- | --- |
| Formulaires de contact | Nom, e-mail, téléphone, message | `form_submissions`, `contacts` | Fixée par le client, 3 ans par défaut |
| Réservations | Nom, coordonnées, date, nombre de personnes | `bookings` | 3 ans |
| Commandes en ligne | Nom, coordonnées, adresse de livraison, articles | `shop_orders`, `shop_order_items` | 10 ans (obligation comptable du client) |
| Dons | Nom, e-mail, montant | `payments` (scope `connect`) | 10 ans |
| Comptes visiteurs | Selon la configuration du client | — | — |

Obligations tenues au titre de l'article 28 :

- **traitement sur instruction documentée** : le client configure ses
  formulaires et ses durées ; StaX n'exploite jamais ces données pour son compte ;
- **confidentialité** : accès limité au personnel habilité, sessions
  d'assistance tracées ;
- **sécurité** (art. 32) : isolation par RLS PostgreSQL, chiffrement en transit
  et au repos, cloisonnement par organisation vérifié par assertions
  automatisées ;
- **sous-traitance ultérieure** : liste publiée et tenue à jour sur
  `/sous-traitants`, alimentée par la table `subprocessors` ;
- **assistance du client** : export et effacement outillés
  (`privacy_requests`) ;
- **restitution et effacement** en fin de contrat ;
- **mise à disposition des éléments de preuve** : ce registre et les journaux
  d'audit.

---

## C. Sous-traitants ultérieurs

| Prestataire | Rôle | Localisation | Garanties |
| --- | --- | --- | --- |
| Cloudflare, Inc. | Hébergement edge, CDN, TLS | UE (traitement edge mondial) | Clauses contractuelles types + DPA |
| Supabase, Inc. | Base PostgreSQL, authentification, stockage | UE (région configurable) | Clauses contractuelles types + DPA |
| Stripe Payments Europe, Ltd. | Paiement et facturation | Irlande (UE) | Responsable autonome pour la lutte anti-fraude |

La liste qui fait foi est celle de la table `subprocessors`, publiée sur
`/sous-traitants`. Elle est lue en direct : une page prérendue afficherait
l'état du jour de la compilation.

---

## D. Transferts hors Union européenne

Aucun transfert n'est organisé hors de l'Union. Le traitement edge de Cloudflare
peut faire transiter une requête par un point de présence hors UE ; il est
couvert par les clauses contractuelles types. Les données au repos restent dans
l'Union.

---

## E. Mesures de sécurité (art. 32)

| Mesure | Mise en œuvre |
| --- | --- |
| Cloisonnement des clients | Row Level Security PostgreSQL sur 100 % des tables ; la clé de service n'atteint jamais le navigateur |
| Chiffrement | TLS en transit, chiffrement au repos par l'hébergeur |
| Authentification | Second facteur **obligatoire** pour tout accès au back-office (`aal2` vérifié par session, pas seulement enrôlé) |
| Moindre privilège | Rôles internes hiérarchisés ; aucun droit déduit d'une adresse e-mail |
| Journalisation | Journal d'audit nominatif, sans secret ni mot de passe |
| Intégrité financière | Montants figés en base, immuables après paiement ; aucun statut « payé » déductible d'un navigateur |
| Limitation d'abus | Débit limité sur empreinte d'IP, protection anti-robot, tentatives comptées |
| Sauvegardes | Assurées par l'hébergeur ; procédure de restauration dans `docs/backup-recovery.md` |
| Violations | Registre `data_breaches`, échéance de 72 heures calculée, entrées inaltérables |

---

## F. Droits des personnes

| Droit | Mise en œuvre |
| --- | --- |
| Accès et portabilité | Export outillé via `privacy_requests` |
| Rectification | Modification directe dans l'espace client |
| Effacement | Demande outillée, sous réserve des obligations de conservation comptable |
| Opposition, limitation | Demande traitée par le contact vie privée |
| Réclamation | Auprès de la CNIL — 3 place de Fontenoy, 75007 Paris |

Délai de réponse : **un mois**, prolongeable de deux mois pour une demande
complexe, la personne étant informée de la prolongation et de son motif.

---

## G. Ce que ce registre ne couvre pas

Écrit pour être utile, pas pour rassurer :

- **Les sites clients ont leur propre registre à tenir.** Un client qui collecte
  des données via son site est responsable de traitement : ce registre-ci ne le
  remplace pas, et StaX ne le tient pas à sa place.
- **La désignation d'un DPO est à réévaluer** dès que le suivi devient
  systématique ou à grande échelle (art. 37.1.b).
- **Aucune analyse d'impact (AIPD) n'a été conduite** : aucun traitement n'entre
  aujourd'hui dans les cas de l'article 35. À reprendre avant tout ajout de
  profilage, de données sensibles ou de suivi transversal.
- **Les durées de conservation ne sont pas encore appliquées automatiquement**
  pour toutes les tables. Une purge programmée reste à mettre en place ; en
  attendant, l'effacement se fait sur demande.

Ces limites sont écrites ici parce qu'un registre qui prétend tout couvrir est
moins utile qu'un registre qui dit où il s'arrête.

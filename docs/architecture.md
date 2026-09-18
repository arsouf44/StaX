# Architecture

Ce document explique les choix structurants et, surtout, **pourquoi** ils ont
été faits. Un choix dont la raison n’est pas écrite finit par être défait par
quelqu’un qui ne la connaissait pas.

---

## 1. Un seul moteur pour tous les sites clients

**Le choix.** `apps/site-runtime` est un Worker Cloudflare unique qui sert
l’intégralité des sites publiés. Il n’existe aucun déploiement par client.

**Pourquoi.** Un déploiement par client signifierait : une pile à maintenir par
client, un correctif de sécurité à propager N fois, un coût qui croît
linéairement, et un délai de mise en ligne proportionnel au nombre de clients.
Avec un moteur unique, un correctif est déployé une fois et protège tout le
monde simultanément.

**La conséquence sur la sécurité.** Puisque tous les tenants partagent le même
processus, l’isolation ne peut pas reposer sur la séparation des déploiements.
Elle repose donc sur deux mécanismes cumulatifs :

1. **Le tenant est résolu à partir du nom d’hôte, et de rien d’autre.** Aucun
   identifiant transmis par le navigateur — paramètre de requête, en-tête, corps
   JSON, cookie — n’entre dans cette décision. Un identifiant du navigateur peut
   désigner une ressource *à l’intérieur* du tenant, jamais le tenant lui-même.
2. **Chaque lecture est filtrée par `site_id` côté serveur**, à partir du site
   ainsi résolu.

```
Requête → hostname → app.resolve_published_site() → instantané publié
                                                  → données du seul tenant
```

---

## 2. Les sites clients sont rendus en HTML, sans React

**Le choix.** Le moteur produit du HTML par concaténation de chaînes typées,
avec un script d’amélioration progressive de moins de 5 ko. Pas de rendu React
côté serveur, pas d’hydratation.

**Pourquoi.** Un site vitrine de restaurant n’a pas besoin d’embarquer un moteur
de rendu de 40 ko pour afficher une carte et des horaires. Les conséquences
mesurables : premier affichage en un seul aller-retour réseau, aucun coût
d’hydratation, fonctionnement complet sans JavaScript.

**Comment l’injection est empêchée.** Le gabarit `html` de
`packages/site-engine/src/render/html.ts` **échappe tout ce qui est interpolé**.
La seule façon d’insérer du balisage est `raw()`, ce qui rend chaque échappatoire
visible à la relecture et cherchable dans le dépôt. S’y ajoute une CSP avec
nonce, et le fait que le contenu riche n’est jamais stocké en HTML mais en blocs
structurés validés par Zod.

---

## 3. Le contenu est stocké en blocs, jamais en HTML

**Le choix.** Une page est une liste de blocs typés (`hero`, `menu`, `services`…),
chacun validé par un schéma Zod et porteur d’un numéro de version.

**Pourquoi.**

- **Sécurité.** Une injection ne peut pas survivre au cycle de vie du contenu :
  il n’existe aucun chemin où une chaîne fournie par un utilisateur serait
  interprétée comme du balisage.
- **Migration.** Le numéro de version permet de faire évoluer un bloc sans
  casser les pages existantes.
- **Rendu multiple.** Les mêmes blocs alimentent le site public, l’aperçu de
  l’éditeur et, demain, un flux ou une application mobile.

Les blocs sont **revalidés à la lecture**, pas seulement à l’écriture : un bloc
écrit par une version antérieure du schéma, ou altéré par une voie inattendue,
est ignoré au rendu plutôt qu’affiché tel quel.

---

## 4. L’instantané publié est figé et immuable

**Le choix.** Publier construit un instantané JSON complet du site
(`app.build_site_snapshot`), l’enregistre dans `site_versions` et pointe le site
dessus. Un déclencheur interdit toute modification d’une version publiée.

**Pourquoi.**

- Le brouillon peut évoluer librement sans affecter ce qui est en ligne.
- Le retour arrière est instantané : on repointe vers une version antérieure.
- Le moteur public lit **une seule ligne** au lieu de reconstituer une page à
  partir de dix tables — ce qui divise la latence et supprime toute
  incohérence de lecture partielle.

---

## 5. Toute la logique sensible vit en PostgreSQL

**Le choix.** Isolation, capacités, calcul des prix, éligibilité au
remboursement, capacité d’un créneau, machines à états : tout cela est
implémenté dans des fonctions SQL, pas dans l’application.

**Pourquoi.** L’application a plusieurs portes d’entrée : l’espace client, le
back-office, les webhooks, le moteur des sites, les scripts d’exploitation. Une
règle implémentée dans l’une d’elles ne protège pas les autres. Une règle
implémentée en base protège *toutes* les portes, y compris celles qui n’existent
pas encore.

Corollaire assumé : **ce qui est en base fait foi**. Le code TypeScript qui
reproduit une règle (le calcul de prix, la matrice RBAC) est comparé à
l’implémentation SQL par un test d’intégration. Les deux ne peuvent pas diverger
sans faire échouer l’intégration continue.

---

## 6. Trois clients de base de données, trois niveaux de confiance

| Client | Clé | RLS | Usage |
| --- | --- | --- | --- |
| `createAnonClient()` | publique | active | catalogue public, page d’état |
| `createUserClient(jwt)` | publique + JWT | **active, complète** | espace client, back-office |
| `createServiceClient()` | service | **contournée** | webhooks, moteur des sites, scripts |

L’espace client et le back-office utilisent **exclusivement** le deuxième. C’est
ce qui fait qu’un défaut applicatif — un filtre oublié, un identifiant mal
vérifié — ne peut pas franchir la frontière entre deux organisations : la base
refuserait la ligne.

Le client de service refuse de s’initialiser côté navigateur, et sa clé n’est
jamais préfixée `NEXT_PUBLIC_`.

---

## 7. Le registre métier plutôt que des conditions

**Le choix.** Secteurs, métiers, modules, pages recommandées, questions
d’accueil, vocabulaire et thème par défaut sont déclarés dans
`packages/business`. Aucun composant ne contient `if (metier === 'restaurant')`.

**Pourquoi.** Il y a 82 métiers. Avec des conditions dans les composants,
ajouter le 83ᵉ demanderait de toucher des dizaines de fichiers, et chaque oubli
produirait une incohérence visible par le client. Avec un registre, ajouter un
métier est une entrée de données.

Le vocabulaire fait partie du registre : un coiffeur lit « prestations », un
restaurateur lit « plats », un agent immobilier lit « biens ». L’interface parle
la langue du métier, jamais celle du produit.

---

## 8. Le rendu dynamique est un choix, pas un défaut

Les pages marketing sont prérendues. Sont **dynamiques**, volontairement :

- les pages légales, parce que l’identité de l’éditeur vient des secrets de
  déploiement et non du build : prérendre figerait les marqueurs
  « [A CONFIGURER — …] » dans le HTML publié ;
- la page des sous-traitants, lue directement en base ;
- la page d’état des services, qui n’aurait aucun sens mise en cache ;
- tout l’espace client et le back-office, jamais mis en cache ni indexés.

---

## 9. Ce que cette architecture ne fait pas

Dit franchement, pour éviter les mauvaises surprises :

- **Pas de multi-région pour les données.** La base est dans une seule région
  européenne. Le contenu est servi depuis le réseau mondial, mais une écriture
  traverse l’Atlantique si le visiteur est à New York.
- **Pas d’éditeur temps réel collaboratif.** Deux personnes qui modifient la
  même page au même moment : la dernière écriture gagne. Le versionnement permet
  de revenir en arrière, mais il n’y a pas de fusion automatique.
- **Pas de rendu personnalisé par visiteur** sur les sites publics. C’est ce qui
  permet le cache partagé et des pages rapides ; c’est aussi une limite.

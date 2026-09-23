# Cloudflare

## Deux Workers

| Worker | Nom | Sert |
| --- | --- | --- |
| `apps/platform` | `stax-platform` | `stax.fr` et `www.stax.fr` |
| `apps/site-runtime` | `stax-sites` | `*.sites.stax.fr` et tous les domaines clients |

`compatibility_date` : `2026-09-01`.
Indicateurs : `nodejs_compat`, `global_fetch_strictly_public`.

`global_fetch_strictly_public` interdit à un Worker d’atteindre des adresses
internes. C’est une défense contre la falsification de requête côté serveur
(SSRF) : même si une URL fournie par un utilisateur atteignait un `fetch`, elle
ne pourrait pas viser un service interne.

---

## Routage

```
stax.fr, www.stax.fr        → stax-platform
*.sites.stax.fr             → stax-sites
preview.sites.stax.fr       → stax-sites   (aperçus privés, jamais indexés)
<domaine client>            → stax-sites   (Cloudflare for SaaS)
```

Les domaines clients sont rattachés par **Cloudflare for SaaS** : le client
pointe un CNAME vers notre domaine de rattachement, Cloudflare émet le
certificat, le Worker résout le tenant à partir du nom d’hôte.

---

## Cache

| Ressource | Politique | Pourquoi |
| --- | --- | --- |
| Page publiée d’un site | `s-maxage=60, stale-while-revalidate=600` | Une modification est visible en une minute ; une panne de base laisse le cache servir |
| Aperçu privé | `no-store` | Change à chaque enregistrement et ne doit jamais fuiter |
| Espace client, back-office, API | `no-store` | Données personnelles |
| Ressource versionnée par empreinte | `immutable`, un an | Le nom change avec le contenu |

La clé de cache de Cloudflare est l’**adresse complète**, nom d’hôte compris :
deux tenants ne peuvent jamais partager une entrée.

### Ce qui se passe à la publication

1. `app.publish_site` fige une version immuable et la rend visible en une
   seule transaction : le Worker sert la nouvelle version dès la requête
   suivante qui n’est pas servie par le cache.
2. La plateforme **purge** ensuite les pages du site sur la zone
   (`packages/infrastructure/src/cache-purge.ts`) : toutes les adresses du site
   (chaque page × chaque nom d’hôte actif), par lots de 30. La purge est
   tracée dans le journal d’audit (`site.cache_purged`).
3. Chaque page porte `x-stax-version` (le numéro servi) et
   `cache-tag: stax-site-<id>` : le support voit quelle version un visiteur a
   reçue, et une offre Cloudflare qui purge par étiquette peut vider un site
   d’un coup.

Configuration de la purge :

| Variable | Rôle |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Jeton avec la permission **Zone → Cache Purge → Purge** sur la zone des sites |
| `CLOUDFLARE_SITES_ZONE_ID` | Zone qui sert `*.sites.stax.fr` (à défaut : `CLOUDFLARE_ZONE_ID`) |

Sans ces variables, la purge est **sautée et le dit** (le dialogue de
publication n’échoue pas) : une publication devient visible au plus tard à
l’expiration du cache partagé, soit une minute. Une purge qui échoue n’annule
jamais la publication : elle est journalisée, la version reste en ligne.

---

## DNS d’un client

```
Type   Nom               Valeur
A      @                 <IP fournie par Cloudflare for SaaS>
CNAME  www               <domaine de rattachement>
```

Ou, si le registrar ne gère pas les `ALIAS` à l’apex :

```
CNAME  www               <domaine de rattachement>
       @ → redirection 301 vers www
```

La vérification, la propagation et l’émission du certificat sont suivies dans
`site_domains.status` : `pending` → `verifying` → `active`. Tant que le domaine
n’est pas actif, le moteur affiche une page « connexion en cours » plutôt qu’une
erreur.

---

## Ce que Cloudflare ne fait pas ici

- **Pas de Workers KV pour les données de site.** La source de vérité est
  PostgreSQL ; un cache intermédiaire ajouterait une invalidation à gérer et une
  fenêtre d’incohérence.
- **Pas de R2 pour les médias.** Ils sont dans Supabase Storage, à côté de leurs
  métadonnées et de leur RLS.
- **Pas de Durable Objects.** Rien dans le produit n’a besoin d’un état
  fortement cohérent par entité : PostgreSQL et ses verrous suffisent.

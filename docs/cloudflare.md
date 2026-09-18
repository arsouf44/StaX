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

La clé de cache incorpore le **nom d’hôte** et l’**empreinte de la version
publiée**. Deux conséquences : deux tenants ne peuvent jamais partager une
entrée, et une publication invalide mécaniquement les entrées précédentes,
puisque l’empreinte change.

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

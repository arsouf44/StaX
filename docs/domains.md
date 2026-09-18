# Noms de domaine

## Trois cas

| Cas | `domain_handling` | Ce qui se passe |
| --- | --- | --- |
| Le client possède son domaine | `customer_owned` | Nous le connectons sans le transférer |
| Nous l’achetons pour lui | `stax_purchase` | Enregistré **à son nom**, puis connecté |
| Il choisira plus tard | `subdomain_only` | Adresse temporaire en `*.sites.stax.fr` |

Dans les trois cas, **le domaine appartient au client**. Nous ne le retenons
jamais en otage : les informations nécessaires pour en reprendre la main lui sont
transmises.

---

## Cycle de vie

```
pending → verifying → active
                   ↘ failed  (DNS incorrect, retour à pending après correction)
active  → detached  (le client déconnecte le domaine)
```

Tant qu’un domaine n’est pas `active`, le moteur affiche une page « connexion en
cours » plutôt qu’une erreur : c’est ce que le visiteur a besoin de savoir.

---

## Anti-détournement

```sql
create unique index site_domains_hostname_active_key
  on public.site_domains (hostname) where status <> 'detached';
```

Sans cet index, un client pourrait déclarer le nom d’hôte d’un autre et capter
son trafic. L’unicité est **partielle** : un domaine détaché redevient
disponible pour son propriétaire légitime.

---

## Abstraction du fournisseur

`DomainProvider` isole l’achat et la vérification derrière une interface. Deux
raisons :

1. changer de bureau d’enregistrement ne doit pas demander de réécrire le
   produit ;
2. le développement et les tests utilisent une implémentation factice, sans
   jamais acheter de domaine réel par accident.

```ts
interface DomainProvider {
  checkAvailability(hostname: string): Promise<DomainAvailability>;
  purchase(hostname: string, contact: RegistrantContact): Promise<PurchaseResult>;
  verifyDns(hostname: string): Promise<DnsVerification>;
}
```

---

## Instructions données au client

```
Type   Nom               Valeur
CNAME  www               <domaine de rattachement>
A      @                 <IP fournie par Cloudflare for SaaS>
```

La propagation prend de quelques minutes à quelques heures. L’espace client
affiche l’état réel de la vérification, jamais une barre de progression
décorative.

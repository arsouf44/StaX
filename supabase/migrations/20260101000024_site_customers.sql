-- =============================================================================
--  Comptes client des sites (offre Ultra Premium)
--
--  L'offre promet a l'acheteur d'un site de commerce que SES clients puissent
--  avoir un compte : retrouver leurs commandes, leurs reservations, leur
--  adresse. Le droit etait declare dans le catalogue ; rien ne l'implementait.
--
--  QUATRE DECISIONS STRUCTURENT CE MODULE
--
--   1. AUCUN MOT DE PASSE. La connexion se fait par lien a usage unique envoye
--      par e-mail. Il n'y a donc aucun secret a stocker, aucun a fuir, aucune
--      reutilisation de mot de passe a craindre, et aucun formulaire de
--      reinitialisation a securiser. C'est moins de fonctionnalites et
--      beaucoup moins de surface d'attaque — le bon echange pour un compte
--      dont l'enjeu est de relire une commande.
--   2. UN COMPTE APPARTIENT A UN SITE, PAS A LA PLATEFORME. La meme adresse
--      e-mail chez deux commercants donne deux comptes etrangers l'un a
--      l'autre. Aucune identite ne traverse les tenants : c'est la propriete
--      que toute l'architecture defend, et elle ne souffre pas d'exception
--      pour une commodite.
--   3. AUCUNE REPONSE NE DIT SI UNE ADRESSE EST CONNUE. Demander un lien
--      renvoie la meme chose dans tous les cas. Sinon le formulaire devient un
--      moyen de tester la clientele d'un commercant.
--   4. LE JETON N'EST JAMAIS STOCKE. Seule son empreinte l'est. Une fuite de
--      la base ne permet pas de se connecter a la place de quelqu'un.
-- =============================================================================

create table public.site_customers (
  id                uuid primary key default app.uuid_v7(),
  site_id           uuid not null references public.sites (id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete cascade,

  email             text not null,
  full_name         text,
  phone             text,
  default_address   jsonb,

  /** Renseignee au premier lien de connexion effectivement utilise. */
  email_verified_at timestamptz,
  last_login_at     timestamptz,
  /** Le commercant peut bloquer un compte sans le supprimer. */
  is_blocked        boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint site_customers_email_format
    check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- Une adresse par site, et non une adresse par plateforme : deux commercants
-- ne partagent jamais un compte.
create unique index site_customers_site_email_key
  on public.site_customers (site_id, lower(email));
create index site_customers_org_idx on public.site_customers (organization_id, created_at desc);

create trigger site_customers_touch_updated_at
  before update on public.site_customers
  for each row execute function app.touch_updated_at();

create table public.site_customer_tokens (
  id             uuid primary key default app.uuid_v7(),
  site_id        uuid not null references public.sites (id) on delete cascade,
  customer_id    uuid not null references public.site_customers (id) on delete cascade,

  /** HMAC du lien. Le jeton en clair n'existe que dans l'e-mail envoye. */
  token_hash     text not null,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  attempt_count  int not null default 0,
  ip_hash        text,
  created_at     timestamptz not null default now()
);

create unique index site_customer_tokens_hash_key on public.site_customer_tokens (token_hash);
create index site_customer_tokens_open_idx on public.site_customer_tokens (customer_id, expires_at)
  where used_at is null;

alter table public.site_customers enable row level security;
alter table public.site_customers force row level security;
alter table public.site_customer_tokens enable row level security;
alter table public.site_customer_tokens force row level security;

-- Le commercant voit SES clients. Personne d'autre, jamais.
create policy site_customers_select on public.site_customers
  for select to authenticated
  using (app.org_can(organization_id, 'commerce.view') or app.is_platform_staff());
create policy site_customers_write on public.site_customers
  for update to authenticated
  using (app.org_can(organization_id, 'commerce.manage') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'commerce.manage') or app.is_platform_admin());

-- Les jetons ne sont lisibles par personne : ni le commercant, ni nous. Ils ne
-- servent qu'aux fonctions `security definer` ci-dessous.
create policy site_customer_tokens_none on public.site_customer_tokens
  for select to authenticated using (false);

-- Les droits de table s'accordent explicitement : le `grant` global de la
-- migration RLS a eu lieu avant que ces tables n'existent.
--
-- Pas d'INSERT ni de DELETE pour un compte authentifie : un compte client
-- n'est cree que par `app.request_customer_login`, et il se bloque plutot
-- qu'il ne se supprime — une commande passee doit rester rattachable.
grant select, update on table public.site_customers to authenticated;
revoke insert, delete on table public.site_customers from authenticated;
revoke all on table public.site_customers from anon;

revoke all on table public.site_customer_tokens from anon, authenticated;

-- -----------------------------------------------------------------------------
--  Demande de lien de connexion
-- -----------------------------------------------------------------------------
create or replace function app.request_customer_login(
  p_site       uuid,
  p_email      text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_ip_hash    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site     public.sites%rowtype;
  v_customer public.site_customers%rowtype;
  v_recent   int;
begin
  select * into v_site from public.sites where id = p_site;
  if not found then
    -- Meme reponse que pour un site sans comptes clients : rien ne fuit.
    return jsonb_build_object('ok', true, 'sent', false);
  end if;

  if not app.has_feature(v_site.organization_id, 'customer_accounts') then
    return jsonb_build_object('ok', false, 'code', 'module_unavailable');
  end if;

  if coalesce(btrim(p_email), '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'code', 'email_invalid');
  end if;

  select * into v_customer
    from public.site_customers
   where site_id = p_site and lower(email) = lower(btrim(p_email));

  if not found then
    insert into public.site_customers (site_id, organization_id, email)
    values (p_site, v_site.organization_id, lower(btrim(p_email)))
    returning * into v_customer;
  end if;

  -- Un compte bloque ne recoit plus de lien, mais la reponse ne le dit pas :
  -- l'information appartient au commercant, pas au visiteur.
  if v_customer.is_blocked then
    return jsonb_build_object('ok', true, 'sent', false);
  end if;

  -- Plafond d'envoi : sans lui, le formulaire devient un moyen d'inonder la
  -- boite de quelqu'un d'autre.
  select count(*) into v_recent
    from public.site_customer_tokens
   where customer_id = v_customer.id
     and created_at > now() - interval '1 hour';

  if v_recent >= 5 then
    return jsonb_build_object('ok', true, 'sent', false);
  end if;

  insert into public.site_customer_tokens
    (site_id, customer_id, token_hash, expires_at, ip_hash)
  values (p_site, v_customer.id, p_token_hash, p_expires_at, p_ip_hash);

  return jsonb_build_object('ok', true, 'sent', true, 'customerId', v_customer.id,
                            'name', v_customer.full_name);
end;
$$;

-- -----------------------------------------------------------------------------
--  Consommation du lien
-- -----------------------------------------------------------------------------
create or replace function app.redeem_customer_login(p_site uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_token    public.site_customer_tokens%rowtype;
  v_customer public.site_customers%rowtype;
begin
  select * into v_token
    from public.site_customer_tokens
   where token_hash = p_token_hash
   for update;

  -- Toutes les issues negatives renvoient le meme code : un lien expire, deja
  -- utilise ou inexistant ne se distinguent pas de l'exterieur.
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  update public.site_customer_tokens
     set attempt_count = attempt_count + 1
   where id = v_token.id;

  -- Le jeton est lie a SON site : rejoue sur un autre domaine, il ne vaut rien.
  if v_token.site_id <> p_site then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if v_token.used_at is not null or v_token.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  select * into v_customer from public.site_customers where id = v_token.customer_id;
  if not found or v_customer.is_blocked then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  update public.site_customer_tokens set used_at = now() where id = v_token.id;

  update public.site_customers
     set email_verified_at = coalesce(email_verified_at, now()),
         last_login_at = now()
   where id = v_customer.id;

  return jsonb_build_object('ok', true, 'customerId', v_customer.id,
                            'email', v_customer.email, 'name', v_customer.full_name);
end;
$$;

-- -----------------------------------------------------------------------------
--  Contenu de l'espace client du site
-- -----------------------------------------------------------------------------
--  Le rattachement se fait par ADRESSE E-MAIL, celle qui a servi a passer la
--  commande. C'est la seule facon de retrouver une commande passee avant la
--  creation du compte, et elle ne revele rien : l'adresse a deja ete prouvee
--  par le lien de connexion.
create or replace function app.customer_account_view(p_site uuid, p_customer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_customer public.site_customers%rowtype;
begin
  select * into v_customer
    from public.site_customers
   where id = p_customer and site_id = p_site;

  if not found or v_customer.is_blocked then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  return jsonb_build_object(
    'ok', true,
    'email', v_customer.email,
    'name', v_customer.full_name,
    'phone', v_customer.phone,
    'address', v_customer.default_address,
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'reference', o.reference,
               'status', o.status,
               'totalCents', o.total_cents,
               'currency', o.currency,
               'createdAt', o.created_at
             ) order by o.created_at desc)
        from public.shop_orders o
       where o.site_id = p_site
         and lower(o.customer_email) = lower(v_customer.email)
    ), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'reference', b.reference,
               'status', b.status,
               'startsAt', b.starts_at,
               'partySize', b.party_size
             ) order by b.starts_at desc)
        from public.bookings b
       where b.site_id = p_site
         and lower(coalesce(b.customer_email, '')) = lower(v_customer.email)
    ), '[]'::jsonb)
  );
end;
$$;

/** Le site dispose-t-il du droit d'offre demande ? */
create or replace function app.site_has_feature(p_site uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select app.has_feature(s.organization_id, p_feature)
    from public.sites s where s.id = p_site;
$$;

-- -----------------------------------------------------------------------------
--  Surface publique — reservee au role de service (le Worker)
-- -----------------------------------------------------------------------------
create or replace function public.request_customer_login(
  p_site uuid, p_email text, p_token_hash text, p_expires_at timestamptz,
  p_ip_hash text default null
) returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.request_customer_login(p_site, p_email, p_token_hash, p_expires_at, p_ip_hash);
$$;

create or replace function public.redeem_customer_login(p_site uuid, p_token_hash text)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.redeem_customer_login(p_site, p_token_hash);
$$;

create or replace function public.customer_account_view(p_site uuid, p_customer uuid)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.customer_account_view(p_site, p_customer);
$$;

create or replace function public.site_has_feature(p_site uuid, p_feature text)
returns boolean language sql stable security definer
set search_path = public, app, pg_catalog as $$
  select app.site_has_feature(p_site, p_feature);
$$;

do $$
declare
  fn text;
  service_only text[] := array[
    'public.request_customer_login(uuid, text, text, timestamptz, text)',
    'public.redeem_customer_login(uuid, text)',
    'public.customer_account_view(uuid, uuid)',
    'public.site_has_feature(uuid, text)'
  ];
begin
  foreach fn in array service_only loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

comment on table public.site_customers is
  'Comptes des visiteurs sur le site d''un client. Portes par un SITE, jamais '
  'par la plateforme : la meme adresse chez deux commercants donne deux comptes '
  'etrangers l''un a l''autre. Aucun mot de passe n''est stocke.';
comment on table public.site_customer_tokens is
  'Liens de connexion a usage unique. Seule l''empreinte du jeton est stockee : '
  'une fuite de la base ne permet de se connecter a la place de personne.';

-- -----------------------------------------------------------------------------
--  Resolution du tenant : ajout du droit « comptes client »
--
--  Le Worker doit savoir si le site propose un espace client pour afficher (ou
--  non) le lien correspondant. Interroger la base une seconde fois a chaque
--  page vue couterait un aller-retour sur chaque requete du reseau edge : la
--  reponse est donc jointe a la resolution du tenant, qui a deja lieu.
--
--  La colonne est ajoutee EN FIN de liste : les appelants qui lisent les
--  colonnes par nom ne voient aucun changement.
-- -----------------------------------------------------------------------------
drop function if exists app.resolve_published_site(text);

create or replace function app.resolve_published_site(p_hostname text)
returns table (
  site_id        uuid,
  organization_id uuid,
  site_status    app.site_status,
  domain_status  app.domain_status,
  version_id     uuid,
  content_hash   text,
  snapshot       jsonb,
  enabled_modules text[],
  timezone       text,
  is_demo        boolean,
  has_customer_accounts boolean
)
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select s.id,
         s.organization_id,
         s.status,
         d.status,
         v.id,
         v.content_hash,
         v.snapshot,
         coalesce(ss.enabled_modules, '{}'),
         s.timezone,
         s.is_demo,
         app.has_feature(s.organization_id, 'customer_accounts')
    from public.site_domains d
    join public.sites s on s.id = d.site_id
    left join public.site_versions v on v.id = s.published_version_id
    left join public.site_settings ss on ss.site_id = s.id
   where d.hostname = lower(p_hostname)
     and d.status <> 'detached'
   limit 1;
$$;

revoke all on function app.resolve_published_site(text) from public, anon, authenticated;

-- Le point d'entree public suit la meme signature.
drop function if exists public.resolve_published_site(text);

create or replace function public.resolve_published_site(p_hostname text)
returns table (
  site_id        uuid,
  organization_id uuid,
  site_status    app.site_status,
  domain_status  app.domain_status,
  version_id     uuid,
  content_hash   text,
  snapshot       jsonb,
  enabled_modules text[],
  timezone       text,
  is_demo        boolean,
  has_customer_accounts boolean
)
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select * from app.resolve_published_site(p_hostname);
$$;

revoke all on function public.resolve_published_site(text) from public, anon, authenticated;
grant execute on function public.resolve_published_site(text) to service_role;

comment on function public.resolve_published_site(text) is
  'Résolution du tenant a partir du hostname. Reservee au service role : le '
  'navigateur ne designe jamais lui-meme le site a servir.';

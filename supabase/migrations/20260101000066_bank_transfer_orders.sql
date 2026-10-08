-- =============================================================================
--  Nemasus — 0066 · Commande, paiement par virement, code d'accès personnel
--
--  Le parcours commercial devient :
--
--    1. Le client COMMANDE son site (formulaire public, sans compte, sans prix).
--    2. L'équipe lui envoie les MODALITÉS DE PAIEMENT PAR VIREMENT (montant
--       convenu, IBAN, référence à rappeler dans le libellé).
--    3. À réception du virement, l'équipe CONFIRME LE PAIEMENT : l'espace du
--       client est créé (organisation, site, projet) et un CODE PERSONNEL est
--       émis, lié à l'adresse e-mail de la commande.
--    4. Le client saisit son code sur Nemasus : le serveur le vérifie, ouvre sa
--       session, et le client n'accède qu'à son propre espace.
--
--  Aucun prix public, aucun abonnement, aucun paiement par carte : le montant
--  est celui que l'équipe a convenu avec le client et inscrit sur SA commande.
--
--  Règles tenues par la base, et non par l'interface :
--
--   - Le code en clair n'est jamais stocké : seule son empreinte HMAC l'est
--     (table `activation_codes`, existante). Il est à usage unique, expire,
--     se révoque, et compte ses tentatives.
--   - Le code ne vaut que pour l'adresse de la commande, et jamais pour un
--     compte de l'équipe Nemasus (qui se connecte avec mot de passe et second
--     facteur).
--   - Aucune écriture directe sur les commandes : tout passe par les fonctions
--     ci-dessous, réservées à l'administration ou au serveur.
--   - Le jeton de réinitialisation du mot de passe n'est stocké que haché, a
--     une durée de vie d'une heure et ne sert qu'une fois.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Droits techniques des sites commandés : une formule interne, sans prix
--
--  Les quotas (pages, langues, formulaires…) et la checklist de livraison
--  lisent l'offre du site. Les offres publiques disparaissent : chaque site
--  reçoit désormais la formule interne « Site Nemasus », jamais affichée ni
--  vendue, qui reprend les droits du sur-mesure (aucune limite imposée par
--  une grille tarifaire). Les anciennes offres restent en base pour
--  l'historique, mais ne sont plus publiques.
-- -----------------------------------------------------------------------------
insert into public.plans (
  slug, version, name, tagline, description,
  setup_price_cents, maintenance_price_cents, currency, vat_rate_bps,
  is_quote_only, is_active, is_public, sort_order, billing_interval, highlight
)
select 'site-nemasus', 1, 'Site Nemasus', null,
       'Formule interne des sites commandés par virement : aucun prix public, le montant est '
         || 'convenu avec chaque client.',
       0, 0, 'EUR', 2000, false, true, false, 900, 'month', 'none'
 where not exists (select 1 from public.plans where slug = 'site-nemasus');

insert into public.plan_features (plan_id, feature_key, enabled, limit_value)
select (select id from public.plans where slug = 'site-nemasus' and version = 1),
       pf.feature_key, pf.enabled, pf.limit_value
  from public.plan_features pf
  join public.plans p on p.id = pf.plan_id
 where p.slug = 'sur-mesure' and p.is_active
on conflict (plan_id, feature_key) do nothing;

update public.plans set is_public = false where slug <> 'site-nemasus' and is_public;

create or replace function app.default_site_plan_id()
returns uuid
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select id from public.plans
   where slug = 'site-nemasus' and is_active
   order by version desc
   limit 1;
$$;

comment on function app.default_site_plan_id() is
  'Formule interne attribuée aux sites créés depuis 0066 (aucun prix public).';

-- Un site créé depuis l'administration reçoit la formule interne par défaut.
create or replace function app.admin_create_site(
  p_name          text,
  p_business_type text default null,
  p_plan_id       uuid default null,
  p_city          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor   uuid := app.current_user_id();
  v_name    text := left(btrim(coalesce(p_name, '')), 120);
  v_type    text := nullif(btrim(coalesce(p_business_type, '')), '');
  v_sector  text;
  v_plan    public.plans%rowtype;
  v_org     uuid;
  v_site    uuid;
  v_project uuid;
begin
  if v_actor is null or not app.is_platform_admin() then
    raise exception 'Creation de site reservee a l''administration de la plateforme'
      using errcode = '42501';
  end if;
  if length(v_name) < 2 then
    raise exception 'Nom du site requis' using errcode = '23514';
  end if;

  if v_type is not null then
    select sector_slug into v_sector from public.business_types where slug = v_type;
    if not found then
      raise exception 'Metier inconnu' using errcode = '23514';
    end if;
  end if;

  select * into v_plan from public.plans
   where id = coalesce(p_plan_id, app.default_site_plan_id()) and is_active;
  if p_plan_id is not null and not found then
    raise exception 'Offre introuvable' using errcode = 'P0002';
  end if;

  insert into public.organizations
    (name, slug, created_by, sector_slug, business_type_slug, city)
  values
    (v_name, app.unique_organization_slug(v_name), v_actor, v_sector, v_type,
     nullif(btrim(coalesce(p_city, '')), ''))
  returning id into v_org;

  insert into public.sites
    (organization_id, name, slug, status, business_type_slug, plan_id, plan_slug, created_by)
  values
    (v_org, v_name, app.unique_site_slug(v_name), 'building', v_type,
     v_plan.id, v_plan.slug, v_actor)
  returning id into v_site;

  insert into public.projects
    (reference, organization_id, site_id, status, title, summary, started_at)
  values
    (app.next_project_reference(), v_org, v_site, 'in_progress', 'Création de votre site',
     'Site conçu et construit par l''équipe Nemasus.', now())
  returning id into v_project;

  perform app.write_audit(
    'site.admin_created', v_org, v_site, 'site', v_site::text,
    jsonb_build_object('business_type', v_type, 'plan', v_plan.slug));

  return jsonb_build_object('ok', true, 'organizationId', v_org, 'siteId', v_site,
                            'projectId', v_project);
end;
$$;

-- -----------------------------------------------------------------------------
--  2. Les commandes
-- -----------------------------------------------------------------------------
create sequence if not exists public.site_order_reference_seq;

create or replace function app.next_site_order_reference()
returns text
language sql
volatile
set search_path = public, pg_catalog
as $$
  select 'CMD-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval('public.site_order_reference_seq')::text, 5, '0');
$$;

create table public.site_orders (
  id                      uuid primary key default app.uuid_v7(),
  reference               text not null,
  status                  text not null default 'received',

  /* --- Le client : c'est son adresse qui recevra le code --- */
  company_name            text not null,
  contact_first_name      text,
  contact_last_name       text,
  contact_email           text not null,
  contact_phone           text,
  city                    text,

  /* --- Le projet décrit à la commande --- */
  sector_slug             text,
  business_type_slug      text,
  project_description     text,
  answers                 jsonb not null default '{}'::jsonb,
  domain_handling         text not null default 'later',
  requested_domain        text,

  /* --- Preuve d'acceptation des conditions (art. 1127-2 C. civ.) --- */
  terms_version           text not null,
  terms_accepted_at       timestamptz not null default now(),
  professional_use        boolean not null default true,
  ip_hash                 text,
  /** `web` : formulaire public ; `team` : saisie par l'équipe après un appel. */
  source                  text not null default 'web',

  /* --- Paiement par virement : montant convenu, jamais un prix de catalogue --- */
  amount_cents            integer,
  currency                char(3) not null default 'EUR',
  payment_message         text,
  payment_requested_at    timestamptz,
  payment_request_count   integer not null default 0,
  paid_at                 timestamptz,
  paid_amount_cents       integer,
  payment_confirmed_by    uuid references public.profiles (id) on delete set null,

  /* --- Espace créé au paiement --- */
  organization_id         uuid references public.organizations (id) on delete set null,
  site_id                 uuid references public.sites (id) on delete set null,
  project_id              uuid references public.projects (id) on delete set null,

  /* --- Suivi des e-mails (le dernier envoi de chaque nature) --- */
  confirmation_email_status text,
  payment_email_status    text,
  access_email_status     text,
  last_email_error        text,

  cancelled_at            timestamptz,
  cancelled_by            uuid references public.profiles (id) on delete set null,
  cancel_reason           text,
  /** Notes de l'équipe. Jamais montrées au client. */
  internal_notes          text,
  created_by              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint site_orders_status_valid
    check (status in ('received', 'payment_requested', 'paid', 'cancelled')),
  constraint site_orders_source_valid check (source in ('web', 'team')),
  constraint site_orders_email_format
    check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint site_orders_company_bounded check (length(btrim(company_name)) between 2 and 160),
  constraint site_orders_description_bounded
    check (project_description is null or length(project_description) <= 4000),
  constraint site_orders_answers_object check (jsonb_typeof(answers) = 'object'),
  constraint site_orders_domain_handling_valid
    check (domain_handling in ('customer_owned', 'purchase', 'later')),
  constraint site_orders_amounts_valid
    check ((amount_cents is null or amount_cents > 0)
           and (paid_amount_cents is null or paid_amount_cents >= 0)),
  constraint site_orders_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint site_orders_payment_requested_coherent
    check (status <> 'payment_requested'
           or (amount_cents is not null and payment_requested_at is not null)),
  constraint site_orders_paid_coherent
    check (status <> 'paid'
           or (paid_at is not null and organization_id is not null and site_id is not null)),
  constraint site_orders_cancelled_coherent check (status <> 'cancelled' or cancelled_at is not null),
  constraint site_orders_email_status_valid check (
    (confirmation_email_status is null or confirmation_email_status in ('sent', 'failed', 'skipped'))
    and (payment_email_status is null or payment_email_status in ('sent', 'failed', 'skipped'))
    and (access_email_status is null or access_email_status in ('sent', 'failed', 'skipped'))),
  constraint site_orders_notes_bounded
    check (internal_notes is null or length(internal_notes) <= 4000)
);

create unique index site_orders_reference_key on public.site_orders (reference);
create index site_orders_status_idx on public.site_orders (status, created_at desc);
create index site_orders_email_idx on public.site_orders (lower(contact_email));
create index site_orders_site_idx on public.site_orders (site_id) where site_id is not null;
-- Un site n'est rattaché qu'à une seule commande payée.
create unique index site_orders_paid_site_key on public.site_orders (site_id)
  where status = 'paid' and site_id is not null;

create trigger site_orders_touch_updated_at
  before update on public.site_orders
  for each row execute function app.touch_updated_at();

comment on table public.site_orders is
  'Commandes de site réglées par virement. Aucune écriture directe : fonctions app.*_site_order. '
  'Le montant est celui convenu avec le client, jamais un prix de catalogue.';

alter table public.site_orders enable row level security;

-- Lecture : l'équipe Nemasus. Le client lit sa commande par une fonction qui
-- ne renvoie que ce qui le concerne (jamais les notes internes).
create policy site_orders_staff_read on public.site_orders
  for select to authenticated
  using (app.is_platform_staff());
revoke insert, update, delete, truncate on public.site_orders from anon, authenticated;
grant select on public.site_orders to authenticated;
revoke all on public.site_orders from anon;
grant all on public.site_orders to service_role;
revoke all on sequence public.site_order_reference_seq from anon, authenticated;

-- Le code d'accès sait de quelle commande il vient, et si son e-mail est parti.
alter table public.activation_codes
  add column if not exists site_order_id uuid references public.site_orders (id) on delete set null,
  add column if not exists email_status text,
  add column if not exists email_sent_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activation_codes_email_status_valid') then
    alter table public.activation_codes add constraint activation_codes_email_status_valid
      check (email_status is null or email_status in ('sent', 'failed', 'skipped'));
  end if;
end;
$$;

create index if not exists activation_codes_site_order_idx
  on public.activation_codes (site_order_id) where site_order_id is not null;

-- -----------------------------------------------------------------------------
--  3. Recevoir une commande (formulaire public, serveur uniquement)
-- -----------------------------------------------------------------------------
create or replace function app.submit_site_order(
  p_company        text,
  p_first_name     text,
  p_last_name      text,
  p_email          text,
  p_phone          text,
  p_city           text,
  p_sector         text,
  p_business_type  text,
  p_description    text,
  p_answers        jsonb,
  p_domain_handling text,
  p_domain         text,
  p_terms_version  text,
  p_ip_hash        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_company  text := left(btrim(coalesce(p_company, '')), 160);
  v_type     text := nullif(btrim(coalesce(p_business_type, '')), '');
  v_sector   text := nullif(btrim(coalesce(p_sector, '')), '');
  v_handling text := coalesce(nullif(btrim(coalesce(p_domain_handling, '')), ''), 'later');
  v_existing public.site_orders%rowtype;
  v_id       uuid;
  v_ref      text;
begin
  perform app.require_service_role();

  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;
  if length(v_company) < 2 then
    return jsonb_build_object('ok', false, 'code', 'company_required');
  end if;
  if coalesce(btrim(p_terms_version), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'terms_required');
  end if;
  if v_handling not in ('customer_owned', 'purchase', 'later') then
    v_handling := 'later';
  end if;
  -- Un métier inconnu n'est pas une raison de perdre la commande : il est
  -- simplement oublié, l'équipe le précisera avec le client.
  if v_type is not null and not exists (select 1 from public.business_types where slug = v_type) then
    v_type := null;
  end if;

  -- Double envoi (double clic, retour arrière) : la même commande, pas deux.
  select * into v_existing from public.site_orders
   where lower(contact_email) = v_email
     and lower(company_name) = lower(v_company)
     and status = 'received'
     and created_at > now() - interval '15 minutes'
   order by created_at desc
   limit 1;
  if found then
    return jsonb_build_object('ok', true, 'orderId', v_existing.id,
                              'reference', v_existing.reference, 'duplicate', true);
  end if;

  v_ref := app.next_site_order_reference();
  insert into public.site_orders (
    reference, company_name, contact_first_name, contact_last_name, contact_email,
    contact_phone, city, sector_slug, business_type_slug, project_description, answers,
    domain_handling, requested_domain, terms_version, ip_hash, source
  ) values (
    v_ref, v_company,
    nullif(left(btrim(coalesce(p_first_name, '')), 80), ''),
    nullif(left(btrim(coalesce(p_last_name, '')), 80), ''),
    v_email,
    nullif(left(btrim(coalesce(p_phone, '')), 40), ''),
    nullif(left(btrim(coalesce(p_city, '')), 120), ''),
    v_sector, v_type,
    nullif(left(btrim(coalesce(p_description, '')), 4000), ''),
    case when jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) = 'object'
         then coalesce(p_answers, '{}'::jsonb) else '{}'::jsonb end,
    v_handling,
    case when v_handling = 'later' then null
         else nullif(lower(left(btrim(coalesce(p_domain, '')), 253)), '') end,
    left(btrim(p_terms_version), 40),
    p_ip_hash,
    'web'
  )
  returning id into v_id;

  perform app.write_audit('site_order.received', null, null, 'site_order', v_id::text,
                          jsonb_build_object('reference', v_ref, 'business_type', v_type));

  return jsonb_build_object('ok', true, 'orderId', v_id, 'reference', v_ref, 'duplicate', false);
end;
$$;

-- Commande saisie par l'équipe (après un appel) : même table, même parcours.
create or replace function app.admin_create_site_order(
  p_company       text,
  p_first_name    text,
  p_last_name     text,
  p_email         text,
  p_phone         text,
  p_city          text,
  p_business_type text,
  p_description   text,
  p_internal_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor   uuid := app.current_user_id();
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_company text := left(btrim(coalesce(p_company, '')), 160);
  v_type    text := nullif(btrim(coalesce(p_business_type, '')), '');
  v_sector  text;
  v_id      uuid;
  v_ref     text;
begin
  if v_actor is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;
  if length(v_company) < 2 then
    return jsonb_build_object('ok', false, 'code', 'company_required');
  end if;
  if v_type is not null then
    select sector_slug into v_sector from public.business_types where slug = v_type;
    if not found then
      v_type := null;
    end if;
  end if;

  v_ref := app.next_site_order_reference();
  insert into public.site_orders (
    reference, company_name, contact_first_name, contact_last_name, contact_email,
    contact_phone, city, sector_slug, business_type_slug, project_description,
    terms_version, source, internal_notes, created_by
  ) values (
    v_ref, v_company,
    nullif(left(btrim(coalesce(p_first_name, '')), 80), ''),
    nullif(left(btrim(coalesce(p_last_name, '')), 80), ''),
    v_email,
    nullif(left(btrim(coalesce(p_phone, '')), 40), ''),
    nullif(left(btrim(coalesce(p_city, '')), 120), ''),
    v_sector, v_type,
    nullif(left(btrim(coalesce(p_description, '')), 4000), ''),
    -- Les conditions sont acceptées par le client avec son premier accès :
    -- la commande saisie par l'équipe le note explicitement.
    'saisie-equipe', 'team',
    nullif(left(btrim(coalesce(p_internal_notes, '')), 4000), ''),
    v_actor
  )
  returning id into v_id;

  perform app.write_audit('site_order.created_by_team', null, null, 'site_order', v_id::text,
                          jsonb_build_object('reference', v_ref));
  return jsonb_build_object('ok', true, 'orderId', v_id, 'reference', v_ref);
end;
$$;

-- -----------------------------------------------------------------------------
--  4. Envoyer les modalités de paiement (administration)
-- -----------------------------------------------------------------------------
create or replace function app.request_site_order_payment(
  p_order        uuid,
  p_amount_cents integer,
  p_message      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_order public.site_orders%rowtype;
begin
  if app.current_user_id() is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount');
  end if;

  select * into v_order from public.site_orders where id = p_order for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_order.status not in ('received', 'payment_requested') then
    return jsonb_build_object('ok', false, 'code', 'not_payable', 'status', v_order.status);
  end if;

  update public.site_orders
     set status = 'payment_requested',
         amount_cents = p_amount_cents,
         payment_message = nullif(left(btrim(coalesce(p_message, '')), 2000), ''),
         payment_requested_at = now(),
         payment_request_count = payment_request_count + 1,
         payment_email_status = null
   where id = p_order;

  perform app.write_audit('site_order.payment_requested', v_order.organization_id, v_order.site_id,
                          'site_order', v_order.id::text,
                          jsonb_build_object('reference', v_order.reference,
                                             'amount_cents', p_amount_cents,
                                             'count', v_order.payment_request_count + 1));
  return jsonb_build_object('ok', true, 'orderId', v_order.id);
end;
$$;

-- Résultat d'un envoi d'e-mail, inscrit après coup.
create or replace function app.record_site_order_email(
  p_order  uuid,
  p_kind   text,
  p_status text,
  p_error  text default null
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if not (app.is_platform_admin() or app.is_service_role()) then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'Statut d''envoi inconnu' using errcode = '22023';
  end if;
  if p_kind = 'confirmation' then
    update public.site_orders set confirmation_email_status = p_status where id = p_order;
  elsif p_kind = 'payment' then
    update public.site_orders set payment_email_status = p_status where id = p_order;
  elsif p_kind = 'access' then
    update public.site_orders set access_email_status = p_status where id = p_order;
  else
    raise exception 'Nature d''envoi inconnue' using errcode = '22023';
  end if;
  update public.site_orders
     set last_email_error = case when p_status = 'failed' then left(p_error, 500) else null end
   where id = p_order;
end;
$$;

create or replace function app.record_access_code_email(p_code uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if not (app.is_platform_admin() or app.is_service_role()) then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'Statut d''envoi inconnu' using errcode = '22023';
  end if;
  update public.activation_codes
     set email_status = p_status,
         email_sent_at = case when p_status = 'sent' then now() else email_sent_at end
   where id = p_code;
end;
$$;

-- -----------------------------------------------------------------------------
--  5. Virement reçu : l'espace du client est créé, un code est émis
--
--  Sans `p_site`, une organisation, un site et un projet neufs sont créés au
--  nom de l'entreprise. Avec `p_site`, la commande est rattachée à un site
--  déjà préparé par l'équipe (vente par téléphone), à condition qu'il n'ait
--  encore aucun client.
-- -----------------------------------------------------------------------------
create or replace function app.confirm_site_order_payment(
  p_order        uuid,
  p_amount_cents integer,
  p_code_hash    text,
  p_code_hint    text,
  p_valid_days   integer default 30,
  p_site         uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor   uuid := app.current_user_id();
  v_order   public.site_orders%rowtype;
  v_site    public.sites%rowtype;
  v_plan    uuid := app.default_site_plan_id();
  v_org     uuid;
  v_site_id uuid;
  v_project uuid;
  v_code    uuid;
  v_expires timestamptz;
begin
  if v_actor is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if coalesce(length(p_code_hash), 0) < 32 or coalesce(length(p_code_hint), 0) = 0 then
    raise exception 'Code invalide' using errcode = '22023';
  end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 90 then
    raise exception 'Duree de validite hors bornes' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 0 or p_amount_cents > 100000000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount');
  end if;

  select * into v_order from public.site_orders where id = p_order for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_order.status = 'paid' then
    return jsonb_build_object('ok', false, 'code', 'already_paid');
  end if;
  if v_order.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'code', 'cancelled');
  end if;
  -- Un code ne s'ouvre jamais sur un compte de l'équipe.
  if exists (select 1 from public.profiles
              where lower(email) = lower(v_order.contact_email) and platform_role is not null) then
    return jsonb_build_object('ok', false, 'code', 'staff_email');
  end if;

  if p_site is not null then
    select * into v_site from public.sites where id = p_site for update;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'site_not_found');
    end if;
    if v_site.archived_at is not null then
      return jsonb_build_object('ok', false, 'code', 'site_archived');
    end if;
    if exists (select 1 from public.organization_members m
                 join public.profiles pr on pr.id = m.user_id
                where m.organization_id = v_site.organization_id and pr.platform_role is null) then
      return jsonb_build_object('ok', false, 'code', 'site_has_client');
    end if;
    if exists (select 1 from public.site_orders o
                where o.site_id = p_site and o.status = 'paid' and o.id <> p_order) then
      return jsonb_build_object('ok', false, 'code', 'site_already_ordered');
    end if;
    v_org := v_site.organization_id;
    v_site_id := v_site.id;

    update public.organizations
       set billing_email = coalesce(billing_email, v_order.contact_email),
           phone = coalesce(phone, v_order.contact_phone),
           city = coalesce(city, v_order.city)
     where id = v_org;
    if v_site.plan_id is null and v_plan is not null then
      update public.sites
         set plan_id = v_plan, plan_slug = (select slug from public.plans where id = v_plan)
       where id = v_site_id;
    end if;

    select id into v_project from public.projects
     where site_id = v_site_id and status not in ('cancelled', 'archived')
     order by created_at asc
     limit 1;
  else
    insert into public.organizations
      (name, slug, created_by, sector_slug, business_type_slug, city, phone, billing_email)
    values
      (v_order.company_name, app.unique_organization_slug(v_order.company_name), v_actor,
       v_order.sector_slug, v_order.business_type_slug, v_order.city, v_order.contact_phone,
       v_order.contact_email)
    returning id into v_org;

    insert into public.sites
      (organization_id, name, slug, status, business_type_slug, plan_id, plan_slug, created_by)
    values
      (v_org, v_order.company_name, app.unique_site_slug(v_order.company_name), 'building',
       v_order.business_type_slug, v_plan,
       (select slug from public.plans where id = v_plan), v_actor)
    returning id into v_site_id;
  end if;

  if v_project is null then
    insert into public.projects
      (reference, organization_id, site_id, status, title, summary, started_at)
    values
      (app.next_project_reference(), v_org, v_site_id, 'ordered', 'Création de votre site',
       coalesce(left(v_order.project_description, 2000),
                'Site conçu et développé par l''équipe Nemasus.'),
       now())
    returning id into v_project;
  end if;

  insert into public.project_events (project_id, kind, title, description, is_public, actor_id)
  values (v_project, 'ordered', 'Paiement reçu, projet ouvert',
          'Nous avons bien reçu votre virement. Votre projet est ouvert : nous revenons vers vous '
            || 'pour la suite.', true, v_actor);

  v_expires := now() + make_interval(days => p_valid_days);
  insert into public.activation_codes
    (site_id, organization_id, code_hash, code_hint, granted_role, email_constraint,
     expires_at, created_by, site_order_id)
  values
    (v_site_id, v_org, p_code_hash, left(p_code_hint, 8), 'owner', lower(v_order.contact_email),
     v_expires, v_actor, v_order.id)
  returning id into v_code;

  update public.site_orders
     set status = 'paid',
         paid_at = now(),
         paid_amount_cents = p_amount_cents,
         payment_confirmed_by = v_actor,
         organization_id = v_org,
         site_id = v_site_id,
         project_id = v_project,
         access_email_status = null
   where id = v_order.id;

  perform app.write_audit('site_order.paid', v_org, v_site_id, 'site_order', v_order.id::text,
                          jsonb_build_object('reference', v_order.reference,
                                             'amount_cents', p_amount_cents,
                                             'existing_site', p_site is not null,
                                             'code_hint', left(p_code_hint, 8)));

  return jsonb_build_object('ok', true, 'orderId', v_order.id, 'organizationId', v_org,
                            'siteId', v_site_id, 'projectId', v_project, 'codeId', v_code,
                            'expiresAt', v_expires, 'email', lower(v_order.contact_email));
end;
$$;

-- Nouveau code pour une commande payée : les codes encore ouverts sont révoqués.
create or replace function app.issue_site_order_code(
  p_order      uuid,
  p_code_hash  text,
  p_code_hint  text,
  p_valid_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor   uuid := app.current_user_id();
  v_order   public.site_orders%rowtype;
  v_code    uuid;
  v_revoked integer;
  v_expires timestamptz;
begin
  if v_actor is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if coalesce(length(p_code_hash), 0) < 32 or coalesce(length(p_code_hint), 0) = 0 then
    raise exception 'Code invalide' using errcode = '22023';
  end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 90 then
    raise exception 'Duree de validite hors bornes' using errcode = '22023';
  end if;

  select * into v_order from public.site_orders where id = p_order for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_order.status <> 'paid' or v_order.organization_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_paid');
  end if;

  update public.activation_codes
     set revoked_at = now(), revoked_by = v_actor
   where site_order_id = p_order and used_at is null and revoked_at is null;
  get diagnostics v_revoked = row_count;

  v_expires := now() + make_interval(days => p_valid_days);
  insert into public.activation_codes
    (site_id, organization_id, code_hash, code_hint, granted_role, email_constraint,
     expires_at, created_by, site_order_id)
  values
    (v_order.site_id, v_order.organization_id, p_code_hash, left(p_code_hint, 8), 'owner',
     lower(v_order.contact_email), v_expires, v_actor, v_order.id)
  returning id into v_code;

  update public.site_orders set access_email_status = null where id = p_order;

  perform app.write_audit('site_order.code_issued', v_order.organization_id, v_order.site_id,
                          'activation_code', v_code::text,
                          jsonb_build_object('reference', v_order.reference,
                                             'revoked', v_revoked,
                                             'code_hint', left(p_code_hint, 8)));
  return jsonb_build_object('ok', true, 'codeId', v_code, 'expiresAt', v_expires,
                            'revoked', v_revoked, 'email', lower(v_order.contact_email));
end;
$$;

-- Désactiver un code (perdu, envoyé à la mauvaise adresse…).
create or replace function app.revoke_access_code(p_code uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor uuid := app.current_user_id();
  v_code  public.activation_codes%rowtype;
begin
  if v_actor is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  select * into v_code from public.activation_codes where id = p_code for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_code.used_at is not null then
    return jsonb_build_object('ok', false, 'code', 'already_used');
  end if;
  if v_code.revoked_at is not null then
    return jsonb_build_object('ok', true, 'code', 'already_revoked');
  end if;
  update public.activation_codes set revoked_at = now(), revoked_by = v_actor where id = p_code;
  perform app.write_audit('activation_code.revoked', v_code.organization_id, v_code.site_id,
                          'activation_code', v_code.id::text,
                          jsonb_build_object('hint', v_code.code_hint));
  return jsonb_build_object('ok', true, 'code', 'revoked');
end;
$$;

-- Annuler une commande non réglée. Rien n'est effacé.
create or replace function app.cancel_site_order(p_order uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor uuid := app.current_user_id();
  v_order public.site_orders%rowtype;
begin
  if v_actor is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  select * into v_order from public.site_orders where id = p_order for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_order.status not in ('received', 'payment_requested') then
    return jsonb_build_object('ok', false, 'code', 'not_cancellable', 'status', v_order.status);
  end if;
  update public.site_orders
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor,
         cancel_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), '')
   where id = p_order;
  perform app.write_audit('site_order.cancelled', null, null, 'site_order', v_order.id::text,
                          jsonb_build_object('reference', v_order.reference,
                                             'previousStatus', v_order.status));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function app.update_site_order_notes(p_order uuid, p_notes text)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if app.current_user_id() is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  update public.site_orders
     set internal_notes = nullif(left(btrim(coalesce(p_notes, '')), 4000), '')
   where id = p_order;
  return found;
end;
$$;

-- -----------------------------------------------------------------------------
--  6. Le client saisit son code (serveur uniquement)
--
--  Vérifie le code SANS le consommer, et compte la tentative. Renvoie
--  l'adresse à laquelle il est lié : le serveur ouvre la session de CE compte
--  (ou le crée), puis consomme le code par `redeem_activation_code`, qui
--  rattache le compte à l'organisation dans la même transaction.
--
--  Un code inconnu, un code révoqué ou expiré : chaque cas a son message, mais
--  aucune information sur un autre client ne sort jamais d'ici.
-- -----------------------------------------------------------------------------
create or replace function app.check_access_code(p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_code  public.activation_codes%rowtype;
  v_order public.site_orders%rowtype;
  v_org   text;
begin
  perform app.require_service_role();

  select * into v_code from public.activation_codes
   where code_hash = coalesce(p_code_hash, '')
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  update public.activation_codes
     set attempt_count = attempt_count + 1, last_attempt_at = now()
   where id = v_code.id;

  if v_code.attempt_count >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;
  if v_code.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if v_code.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  if v_code.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_code.email_constraint is null then
    -- Un code ancien, sans adresse : il ne peut pas ouvrir de session seul.
    return jsonb_build_object('ok', false, 'reason', 'needs_account');
  end if;
  if exists (select 1 from public.profiles
              where lower(email) = lower(v_code.email_constraint)
                and (platform_role is not null or disabled_at is not null)) then
    return jsonb_build_object('ok', false, 'reason', 'account_unavailable');
  end if;
  if exists (select 1 from public.organizations
              where id = v_code.organization_id and suspended_at is not null) then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;

  if v_code.site_order_id is not null then
    select * into v_order from public.site_orders where id = v_code.site_order_id;
  end if;
  select name into v_org from public.organizations where id = v_code.organization_id;

  return jsonb_build_object(
    'ok', true,
    'reason', 'ok',
    'codeId', v_code.id,
    'email', lower(v_code.email_constraint),
    -- Compte déjà existant pour cette adresse : c'est LUI qui est connecté.
    'userId', (select id from public.profiles
                where lower(email) = lower(v_code.email_constraint)
                order by created_at asc limit 1),
    'organizationId', v_code.organization_id,
    'siteId', v_code.site_id,
    'organizationName', v_org,
    'firstName', v_order.contact_first_name,
    'lastName', v_order.contact_last_name,
    'phone', v_order.contact_phone,
    'orderReference', v_order.reference
  );
end;
$$;

-- Ce que le client voit de sa commande (espace client) : jamais les notes.
create or replace function app.site_order_for_organization(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_order public.site_orders%rowtype;
begin
  if not (app.is_org_member(p_org) or app.is_platform_staff()) then
    return null;
  end if;
  select * into v_order from public.site_orders
   where organization_id = p_org and status = 'paid'
   order by paid_at desc
   limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'reference', v_order.reference,
    'paidAt', v_order.paid_at,
    'paidAmountCents', v_order.paid_amount_cents,
    'currency', v_order.currency,
    'createdAt', v_order.created_at,
    'description', v_order.project_description,
    'domainHandling', v_order.domain_handling,
    'requestedDomain', v_order.requested_domain
  );
end;
$$;

-- -----------------------------------------------------------------------------
--  7. Mot de passe oublié : jeton haché, une heure, usage unique
-- -----------------------------------------------------------------------------
create table public.password_reset_tokens (
  id            uuid primary key default app.uuid_v7(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  token_hash    text not null,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  revoked_at    timestamptz,
  attempt_count integer not null default 0,
  ip_hash       text,
  created_at    timestamptz not null default now(),
  constraint password_reset_tokens_hash_length check (length(token_hash) >= 32)
);

create unique index password_reset_tokens_hash_key on public.password_reset_tokens (token_hash);
create index password_reset_tokens_user_idx on public.password_reset_tokens (user_id, created_at desc);

comment on table public.password_reset_tokens is
  'Jetons de réinitialisation du mot de passe : empreinte seulement, 1 h, usage unique. '
  'Serveur uniquement.';

alter table public.password_reset_tokens enable row level security;
revoke all on public.password_reset_tokens from anon, authenticated;
grant all on public.password_reset_tokens to service_role;

create or replace function app.create_password_reset(
  p_email          text,
  p_token_hash     text,
  p_ip_hash        text default null,
  p_valid_minutes  integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_profile public.profiles%rowtype;
  v_recent  integer;
begin
  perform app.require_service_role();
  if coalesce(length(p_token_hash), 0) < 32 then
    raise exception 'Jeton invalide' using errcode = '22023';
  end if;
  if p_valid_minutes is null or p_valid_minutes < 5 or p_valid_minutes > 180 then
    raise exception 'Duree de validite hors bornes' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles
   where lower(email) = lower(btrim(coalesce(p_email, '')))
   limit 1;
  -- Aucune adresse inconnue n'est signalée à l'appelant au-delà de ce booléen,
  -- que le serveur ne répercute jamais : la réponse affichée est identique.
  if not found or v_profile.disabled_at is not null then
    return jsonb_build_object('ok', false, 'code', 'no_account');
  end if;

  select count(*) into v_recent from public.password_reset_tokens
   where user_id = v_profile.id and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    return jsonb_build_object('ok', false, 'code', 'throttled');
  end if;

  -- Un seul lien valable à la fois : le dernier envoyé.
  update public.password_reset_tokens
     set revoked_at = now()
   where user_id = v_profile.id and used_at is null and revoked_at is null;

  insert into public.password_reset_tokens (user_id, token_hash, expires_at, ip_hash)
  values (v_profile.id, p_token_hash, now() + make_interval(mins => p_valid_minutes), p_ip_hash);

  return jsonb_build_object('ok', true, 'userId', v_profile.id, 'email', v_profile.email,
                            'firstName', v_profile.first_name);
end;
$$;

create or replace function app.peek_password_reset(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_token public.password_reset_tokens%rowtype;
begin
  perform app.require_service_role();
  select * into v_token from public.password_reset_tokens
   where token_hash = coalesce(p_token_hash, '');
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if v_token.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;
  if v_token.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'replaced');
  end if;
  if v_token.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  return jsonb_build_object('ok', true, 'reason', 'ok');
end;
$$;

create or replace function app.consume_password_reset(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_token public.password_reset_tokens%rowtype;
  v_email text;
begin
  perform app.require_service_role();
  select * into v_token from public.password_reset_tokens
   where token_hash = coalesce(p_token_hash, '')
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  update public.password_reset_tokens
     set attempt_count = attempt_count + 1
   where id = v_token.id;
  if v_token.attempt_count >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;
  if v_token.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;
  if v_token.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'replaced');
  end if;
  if v_token.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  select email into v_email from public.profiles where id = v_token.user_id and disabled_at is null;
  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  update public.password_reset_tokens set used_at = now() where id = v_token.id;
  return jsonb_build_object('ok', true, 'userId', v_token.user_id, 'email', v_email,
                            'tokenId', v_token.id);
end;
$$;

-- Le changement a échoué après consommation (service d'authentification
-- injoignable) : le lien redevient utilisable, dans sa durée de vie.
create or replace function app.release_password_reset(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  perform app.require_service_role();
  update public.password_reset_tokens
     set used_at = null
   where id = p_token
     and used_at > now() - interval '5 minutes'
     and expires_at > now()
     and revoked_at is null;
end;
$$;

-- Le mot de passe a changé : plus aucun lien ouvert pour ce compte.
create or replace function app.complete_password_reset(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  perform app.require_service_role();
  update public.password_reset_tokens
     set revoked_at = now()
   where user_id = p_user and used_at is null and revoked_at is null;
  perform app.write_audit('auth.password_reset', null, null, 'profile', p_user::text, '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
--  8. Invitation d'un collaborateur sans compte : le lien suffit à le créer
--
--  Le jeton a été envoyé à l'adresse invitée : il prouve qu'on la détient. Le
--  serveur crée le compte confirmé pour CETTE adresse, puis la personne,
--  connectée, accepte l'invitation par la fonction habituelle.
-- -----------------------------------------------------------------------------
create or replace function app.invitation_signup_context(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_inv public.organization_invitations%rowtype;
  v_org text;
begin
  perform app.require_service_role();
  select * into v_inv from public.organization_invitations
   where token_hash = coalesce(p_token_hash, '');
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  select name into v_org from public.organizations where id = v_inv.organization_id;
  return jsonb_build_object(
    'ok', v_inv.revoked_at is null and v_inv.accepted_at is null and v_inv.expires_at > now(),
    'code', case when v_inv.revoked_at is not null then 'revoked'
                 when v_inv.accepted_at is not null then 'already_used'
                 when v_inv.expires_at <= now() then 'expired'
                 else 'valid' end,
    'email', lower(v_inv.email),
    'organizationName', v_org,
    'role', v_inv.role,
    'hasAccount', exists (select 1 from public.profiles where lower(email) = lower(v_inv.email)));
end;
$$;

-- -----------------------------------------------------------------------------
--  9. Ce qui attend l'équipe : les commandes à traiter
-- -----------------------------------------------------------------------------
create or replace function app.staff_work_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if not app.is_platform_staff() then
    return null;
  end if;

  return jsonb_build_object(
    'ordersReceived',
      (select count(*) from public.site_orders where status = 'received'),
    'ordersAwaitingPayment',
      (select count(*) from public.site_orders where status = 'payment_requested'),
    'codesUnused',
      (select count(*) from public.activation_codes c
        where c.site_order_id is not null and c.used_at is null and c.revoked_at is null
          and c.expires_at <= now() + interval '3 days'),
    'unreadConversations',
      (select count(distinct m.project_id) from public.project_messages m
        where m.author_side = 'client' and m.read_by_staff_at is null),
    'lateProjects',
      (select count(*) from public.projects p
        where p.due_at < now()
          and p.status not in ('delivered', 'maintenance', 'cancelled', 'archived')),
    'waitingOnClient',
      (select count(*) from public.projects p
        where p.status in ('questionnaire_pending', 'assets_pending', 'client_review')),
    'sitesDown',
      (select count(*) from public.sites s
         join lateral (select h.ok from public.site_health_checks h
                        where h.site_id = s.id order by h.checked_at desc limit 1) h on true
        where s.delivered_at is not null and s.archived_at is null and h.ok = false),
    'proposalsExpiring', 0,
    'deliveriesFailed', 0,
    'ticketsWaiting',
      (select count(*) from public.support_tickets t
        where t.status in ('open', 'waiting_support')),
    'sitesDownList',
      (select coalesce(jsonb_agg(jsonb_build_object(
                'siteId', s.id, 'name', s.name, 'organization', o.name, 'url', h.url,
                'statusCode', h.status_code, 'error', left(h.error, 160),
                'checkedAt', h.checked_at) order by h.checked_at desc), '[]'::jsonb)
         from public.sites s
         join public.organizations o on o.id = s.organization_id
         join lateral (select hc.ok, hc.url, hc.status_code, hc.error, hc.checked_at
                         from public.site_health_checks hc
                        where hc.site_id = s.id order by hc.checked_at desc limit 1) h on true
        where s.delivered_at is not null and s.archived_at is null and h.ok = false)
  );
end;
$$;

-- -----------------------------------------------------------------------------
--  10. Conservation (reprise de 0054, avec les commandes et les jetons)
-- -----------------------------------------------------------------------------
create or replace function app.apply_retention()
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_count  integer;
begin
  perform set_config('stax.retention_purge', 'on', true);

  delete from public.analytics_events where created_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('analytics_events', v_count);

  delete from public.daily_site_metrics where day < (current_date - interval '25 months');
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('daily_site_metrics', v_count);

  delete from public.security_events where created_at < now() - interval '12 months';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('security_events', v_count);

  delete from public.email_log where created_at < now() - interval '12 months';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('email_log', v_count);

  delete from public.webhook_events where received_at < now() - interval '12 months';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('webhook_events', v_count);

  delete from public.rate_limit_counters where window_start < now() - interval '1 day';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('rate_limit_counters', v_count);

  delete from public.audit_logs where created_at < now() - interval '3 years';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('audit_logs', v_count);

  delete from public.content_reports
   where status in ('actioned', 'rejected')
     and decided_at < now() - interval '1 year';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('content_reports', v_count);

  delete from public.site_health_checks where checked_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('site_health_checks', v_count);

  delete from public.site_deployments
   where environment = 'preview'
     and created_at < now() - interval '90 days'
     and status not in ('queued', 'building', 'deploying');
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('preview_deployments', v_count);

  update public.site_proposals
     set prospect_email = 'efface-' || id || '@anonymise.invalid',
         prospect_name = null,
         prospect_phone = null,
         message = null,
         internal_notes = null
   where status in ('sent', 'claimed', 'withdrawn')
     and greatest(last_sent_at, expires_at, coalesce(claimed_at, last_sent_at),
                  coalesce(withdrawn_at, last_sent_at)) < now() - interval '3 years'
     and prospect_email not like 'efface-%@anonymise.invalid';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('site_proposals_anonymized', v_count);

  -- Commandes jamais réglées (0066) : trois ans après le dernier échange, les
  -- coordonnées sont effacées. La ligne reste, anonyme.
  update public.site_orders
     set contact_email = 'efface-' || id || '@anonymise.invalid',
         contact_first_name = null,
         contact_last_name = null,
         contact_phone = null,
         project_description = null,
         answers = '{}'::jsonb,
         internal_notes = null,
         ip_hash = null
   where status in ('received', 'payment_requested', 'cancelled')
     and greatest(created_at, coalesce(payment_requested_at, created_at),
                  coalesce(cancelled_at, created_at)) < now() - interval '3 years'
     and contact_email not like 'efface-%@anonymise.invalid';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('site_orders_anonymized', v_count);

  -- Jetons de réinitialisation : inutiles une fois expirés.
  delete from public.password_reset_tokens where expires_at < now() - interval '7 days';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('password_reset_tokens', v_count);

  perform set_config('stax.retention_purge', 'off', true);
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
--  11. Surface exposée (schéma public) et privilèges
-- -----------------------------------------------------------------------------
create or replace function public.submit_site_order(
  p_company text, p_first_name text, p_last_name text, p_email text, p_phone text,
  p_city text, p_sector text, p_business_type text, p_description text, p_answers jsonb,
  p_domain_handling text, p_domain text, p_terms_version text, p_ip_hash text default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.submit_site_order(p_company, p_first_name, p_last_name, p_email, p_phone, p_city,
                               p_sector, p_business_type, p_description, p_answers,
                               p_domain_handling, p_domain, p_terms_version, p_ip_hash);
$$;

create or replace function public.admin_create_site_order(
  p_company text, p_first_name text, p_last_name text, p_email text, p_phone text,
  p_city text, p_business_type text, p_description text, p_internal_notes text default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.admin_create_site_order(p_company, p_first_name, p_last_name, p_email, p_phone,
                                     p_city, p_business_type, p_description, p_internal_notes);
$$;

create or replace function public.request_site_order_payment(
  p_order uuid, p_amount_cents integer, p_message text default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.request_site_order_payment(p_order, p_amount_cents, p_message);
$$;

create or replace function public.record_site_order_email(
  p_order uuid, p_kind text, p_status text, p_error text default null)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_site_order_email(p_order, p_kind, p_status, p_error);
$$;

create or replace function public.record_access_code_email(p_code uuid, p_status text)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_access_code_email(p_code, p_status);
$$;

create or replace function public.confirm_site_order_payment(
  p_order uuid, p_amount_cents integer, p_code_hash text, p_code_hint text,
  p_valid_days integer default 30, p_site uuid default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.confirm_site_order_payment(p_order, p_amount_cents, p_code_hash, p_code_hint,
                                        p_valid_days, p_site);
$$;

create or replace function public.issue_site_order_code(
  p_order uuid, p_code_hash text, p_code_hint text, p_valid_days integer default 30)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.issue_site_order_code(p_order, p_code_hash, p_code_hint, p_valid_days);
$$;

create or replace function public.revoke_access_code(p_code uuid)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.revoke_access_code(p_code);
$$;

create or replace function public.cancel_site_order(p_order uuid, p_reason text default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.cancel_site_order(p_order, p_reason);
$$;

create or replace function public.update_site_order_notes(p_order uuid, p_notes text)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.update_site_order_notes(p_order, p_notes);
$$;

create or replace function public.check_access_code(p_code_hash text)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.check_access_code(p_code_hash);
$$;

create or replace function public.site_order_for_organization(p_org uuid)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.site_order_for_organization(p_org);
$$;

create or replace function public.create_password_reset(
  p_email text, p_token_hash text, p_ip_hash text default null, p_valid_minutes integer default 60)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.create_password_reset(p_email, p_token_hash, p_ip_hash, p_valid_minutes);
$$;

create or replace function public.peek_password_reset(p_token_hash text)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.peek_password_reset(p_token_hash);
$$;

create or replace function public.consume_password_reset(p_token_hash text)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.consume_password_reset(p_token_hash);
$$;

create or replace function public.release_password_reset(p_token uuid)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.release_password_reset(p_token);
$$;

create or replace function public.complete_password_reset(p_user uuid)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.complete_password_reset(p_user);
$$;

create or replace function public.invitation_signup_context(p_token_hash text)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.invitation_signup_context(p_token_hash);
$$;

do $$
declare
  fn text;
  service_only text[] := array[
    'public.submit_site_order(text, text, text, text, text, text, text, text, text, jsonb, text, text, text, text)',
    'public.check_access_code(text)',
    'public.create_password_reset(text, text, text, integer)',
    'public.peek_password_reset(text)',
    'public.consume_password_reset(text)',
    'public.release_password_reset(uuid)',
    'public.complete_password_reset(uuid)',
    'public.invitation_signup_context(text)'
  ];
  user_callable text[] := array[
    'public.admin_create_site_order(text, text, text, text, text, text, text, text, text)',
    'public.request_site_order_payment(uuid, integer, text)',
    'public.record_site_order_email(uuid, text, text, text)',
    'public.record_access_code_email(uuid, text)',
    'public.confirm_site_order_payment(uuid, integer, text, text, integer, uuid)',
    'public.issue_site_order_code(uuid, text, text, integer)',
    'public.revoke_access_code(uuid)',
    'public.cancel_site_order(uuid, text)',
    'public.update_site_order_notes(uuid, text)',
    'public.site_order_for_organization(uuid)'
  ];
  internal text[] := array[
    'app.default_site_plan_id()',
    'app.next_site_order_reference()',
    'app.submit_site_order(text, text, text, text, text, text, text, text, text, jsonb, text, text, text, text)',
    'app.admin_create_site_order(text, text, text, text, text, text, text, text, text)',
    'app.request_site_order_payment(uuid, integer, text)',
    'app.record_site_order_email(uuid, text, text, text)',
    'app.record_access_code_email(uuid, text)',
    'app.confirm_site_order_payment(uuid, integer, text, text, integer, uuid)',
    'app.issue_site_order_code(uuid, text, text, integer)',
    'app.revoke_access_code(uuid)',
    'app.cancel_site_order(uuid, text)',
    'app.update_site_order_notes(uuid, text)',
    'app.check_access_code(text)',
    'app.site_order_for_organization(uuid)',
    'app.create_password_reset(text, text, text, integer)',
    'app.peek_password_reset(text)',
    'app.consume_password_reset(text)',
    'app.release_password_reset(uuid)',
    'app.complete_password_reset(uuid)',
    'app.invitation_signup_context(text)'
  ];
begin
  foreach fn in array service_only loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  foreach fn in array user_callable loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
  foreach fn in array internal loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;

-- `redeem_activation_code` ouvre l'accès à une organisation pour n'importe
-- quel compte désigné par l'appelant : depuis 0066, seul le serveur l'appelle,
-- après avoir vérifié le code et ouvert la session du compte lié à l'adresse.
revoke all on function public.redeem_activation_code(text, uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_activation_code(text, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
--  10. Ancienne vente par carte : surface retirée
--
--  Commande au prix d'une offre publique, session de paiement Stripe,
--  propositions payées par carte, rattachement de facture, demande de
--  remboursement en ligne : l'application ne les appelle plus. Les fonctions
--  restent en base (historique, scripts d'exploitation), mais aucune session
--  cliente ne peut plus les exécuter.
-- -----------------------------------------------------------------------------
do $$
declare
  fn text;
  retired text[] := array[
    'public.create_order(uuid, uuid, text, text, jsonb, text, text, text, text, text, text)',
    'public.compute_order_pricing(uuid, text)',
    'public.attach_checkout_session(uuid, text)',
    'public.request_refund(uuid, text, integer, integer)',
    'public.mark_maintenance_start_failed(uuid, text)',
    'public.claim_sales_invoice(text, uuid, text, text)',
    'public.peek_sales_invoice(text)',
    'public.create_site_proposal(uuid, uuid, text, text, text, text, text, text, text, text, integer)',
    'public.renew_site_proposal(uuid, text, text, integer)',
    'public.withdraw_site_proposal(uuid, text)',
    'public.erase_site_proposal_contact(uuid)',
    'public.record_proposal_email(uuid, text, text)',
    'public.site_proposal_for_site(uuid)',
    'public.claim_site_proposal(text)',
    'public.create_proposal_order(uuid, text, text)'
  ];
begin
  foreach fn in array retired loop
    if to_regprocedure(fn) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', fn);
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end;
$$;

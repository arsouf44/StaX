-- =============================================================================
--  StaX — 0041 · StaX construit le site, puis le confie au client
--
--  Le site d'un client est concu et construit par l'equipe StaX, de zero, sur
--  plusieurs semaines. Le client n'y a pas acces pendant ce temps : il suit
--  son projet. Quand le site est pret, l'administration le lui CONFIE — c'est
--  a ce moment, et a ce moment seulement, qu'il peut le modifier. L'equipe
--  StaX garde la main sur le site en permanence.
--
--  Ce n'est pas un masquage d'interface : `app.site_can` refuse les droits de
--  contenu d'un site non confie a tout le monde, sauf a l'equipe StaX. Toutes
--  les policies (pages, sections, reglages, theme, redirections...) et toutes
--  les fonctions de l'editeur et de la publication passent par elle.
--
--  Les sites qui existent deja ont ete crees sous l'ancien parcours, ou le
--  client avait la main des la commande : ils sont consideres comme confies.
--  Personne ne perd un acces qu'il avait.
-- =============================================================================

alter table public.sites
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by uuid references public.profiles (id) on delete set null;

comment on column public.sites.delivered_at is
  'Date a laquelle StaX a confie le site a son client. Nul : site en construction, '
  'modifiable par la seule equipe StaX (voir app.site_can).';

update public.sites
   set delivered_at = coalesce(first_published_at, created_at)
 where delivered_at is null;

create index if not exists sites_delivered_by_idx on public.sites (delivered_by);

-- -----------------------------------------------------------------------------
--  1. Droits de contenu : pas avant que le site soit confie
-- -----------------------------------------------------------------------------
create or replace function app.site_can(p_site uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(
    app.org_can(app.site_org(p_site), p_capability)
    and (
      p_capability not in ('content.edit', 'content.publish', 'domain.manage')
      or app.is_platform_site_editor()
      or exists (select 1 from public.sites s
                  where s.id = p_site and s.delivered_at is not null)
    ),
    false);
$$;

-- Seule l'equipe StaX confie un site, ou le reprend.
create or replace function app.guard_site_commercials()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if app.is_service_role() or app.is_platform_admin() then
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Un site ne peut pas changer d''organisation' using errcode = '42501';
  end if;
  if new.plan_id is distinct from old.plan_id
     or new.plan_slug is distinct from old.plan_slug then
    raise exception 'L''offre d''un site est definie par la commande, pas par le client'
      using errcode = '42501';
  end if;
  if new.is_demo is distinct from old.is_demo
     or new.suspended_at is distinct from old.suspended_at then
    raise exception 'Champ reserve a l''administration de la plateforme'
      using errcode = '42501';
  end if;
  if new.delivered_at is distinct from old.delivered_at
     or new.delivered_by is distinct from old.delivered_by then
    raise exception 'Seule l''equipe StaX confie un site a son client'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
--  2. Creer un site de zero, depuis l'administration
--
--  L'organisation est creee au nom de l'entreprise cliente ; la personne de
--  l'equipe qui la cree en devient proprietaire (declencheur
--  grant_creator_ownership) et garde donc la main sur le site, meme apres
--  l'avoir confie.
-- -----------------------------------------------------------------------------
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

  if p_plan_id is not null then
    select * into v_plan from public.plans where id = p_plan_id and is_active;
    if not found then
      raise exception 'Offre introuvable' using errcode = 'P0002';
    end if;
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
     'Site conçu et construit par l''équipe StaX.', now())
  returning id into v_project;

  perform app.write_audit(
    'site.admin_created', v_org, v_site, 'site', v_site::text,
    jsonb_build_object('business_type', v_type, 'plan', v_plan.slug));

  return jsonb_build_object('ok', true, 'organizationId', v_org, 'siteId', v_site,
                            'projectId', v_project);
end;
$$;

-- -----------------------------------------------------------------------------
--  3. Confier le site au client (et, au besoin, lui ouvrir l'acces)
--
--  Avec une adresse e-mail : le compte correspondant devient membre de
--  l'organisation du site (proprietaire par defaut). Sans adresse : le site est
--  confie aux clients deja membres. Il faut au moins un client — quelqu'un qui
--  n'est pas de l'equipe StaX — sinon il n'y a personne a qui le confier.
-- -----------------------------------------------------------------------------
create or replace function app.deliver_site(
  p_site  uuid,
  p_email text default null,
  p_role  text default 'owner'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor   uuid := app.current_user_id();
  v_site    public.sites%rowtype;
  v_email   text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_user    uuid;
  v_role    text := coalesce(nullif(btrim(coalesce(p_role, '')), ''), 'owner');
  v_clients integer;
begin
  if v_actor is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin', 'editor') then
    raise exception 'Role inconnu' using errcode = '22023';
  end if;

  select * into v_site from public.sites where id = p_site for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_email is not null then
    select id into v_user from public.profiles where lower(email) = v_email limit 1;
    if v_user is null then
      return jsonb_build_object('ok', false, 'code', 'no_account');
    end if;
    insert into public.organization_members (organization_id, user_id, role, invited_by)
    values (v_site.organization_id, v_user, v_role::app.org_role, v_actor)
    on conflict (organization_id, user_id) do nothing;
  end if;

  select count(*) into v_clients
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
   where m.organization_id = v_site.organization_id
     and p.platform_role is null;
  if v_clients = 0 then
    return jsonb_build_object('ok', false, 'code', 'no_client');
  end if;

  update public.sites
     set delivered_at = coalesce(delivered_at, now()),
         delivered_by = coalesce(delivered_by, v_actor)
   where id = p_site;

  update public.projects
     set status = case
                    when status in ('ordered', 'questionnaire_pending', 'assets_pending',
                                    'in_progress', 'internal_review')
                      then 'client_review'::app.project_status
                    else status
                  end,
         delivered_at = coalesce(delivered_at, now())
   where site_id = p_site;

  insert into public.notifications
    (recipient_id, organization_id, site_id, type, title, message, link, level)
  select m.user_id, v_site.organization_id, v_site.id, 'site.delivered',
         'Votre site est prêt',
         'L''équipe StaX vous a confié votre site : vous pouvez le découvrir et le modifier.',
         '/app/editeur', 'success'
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
   where m.organization_id = v_site.organization_id
     and p.platform_role is null;

  perform app.write_audit(
    'site.delivered', v_site.organization_id, v_site.id, 'site', v_site.id::text,
    jsonb_build_object('added_member', v_user is not null, 'role', v_role));

  return jsonb_build_object('ok', true, 'clients', v_clients);
end;
$$;

-- Reprendre un site confie (le client n'y a plus acces en modification).
-- Reversible : le confier a nouveau rend l'acces, rien n'est efface.
create or replace function app.withdraw_site(p_site uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site public.sites%rowtype;
begin
  if app.current_user_id() is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  select * into v_site from public.sites where id = p_site for update;
  if not found then
    return false;
  end if;
  update public.sites set delivered_at = null, delivered_by = null where id = p_site;
  perform app.write_audit(
    'site.withdrawn', v_site.organization_id, v_site.id, 'site', v_site.id::text, '{}'::jsonb);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
--  4. Commande interne : meme parcours qu'un client, sans paiement
--
--  Le site n'est plus prepare a partir d'un modele a la commande : l'equipe le
--  construit. Seul le resume du projet change ici ; le modele n'est applique
--  que si l'appelant en fournit un, ce que le tunnel ne fait plus.
-- -----------------------------------------------------------------------------
create or replace function app.create_internal_order(
  p_plan_id           uuid,
  p_sector_slug       text,
  p_business_type     text,
  p_organization_name text,
  p_questionnaire     jsonb default '{}'::jsonb,
  p_requested_domain  text default null,
  p_domain_handling   text default 'subdomain_only',
  p_customer_notes    text default null,
  p_terms_version     text default null,
  p_template          jsonb default null,
  p_hostname          text default null,
  p_details           jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor    uuid := app.current_user_id();
  v_profile  public.profiles%rowtype;
  v_plan     public.plans%rowtype;
  v_org      uuid;
  v_order    uuid;
  v_site     uuid;
  v_project  uuid;
  v_ref      text;
  v_name     text := left(btrim(coalesce(p_organization_name, '')), 120);
  v_setup    integer;
  v_maint    integer;
  v_internal_sites integer;
begin
  if v_actor is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_actor;
  if not found or not app.is_internal_account(v_actor) then
    raise exception 'Commande sans paiement reservee aux comptes internes StaX'
      using errcode = '42501';
  end if;

  if not v_profile.unlimited_sites then
    select count(*) into v_internal_sites
      from public.orders
     where created_by = v_actor and billing_mode = 'internal' and status = 'internal';
    if v_internal_sites >= 1 then
      raise exception 'Ce compte interne est limite a un site' using errcode = '23514';
    end if;
  end if;

  if length(v_name) < 2 then
    raise exception 'Nom d''entreprise requis' using errcode = '23514';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if not found then
    raise exception 'Offre introuvable' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.business_types
                  where slug = p_business_type and sector_slug = p_sector_slug) then
    raise exception 'Metier inconnu pour ce secteur' using errcode = '23514';
  end if;

  -- Organisation interne : une par site commande, pour qu'un site puisse
  -- ensuite etre confie a son client sans rien emporter des autres.
  insert into public.organizations
    (name, slug, created_by, billing_email, sector_slug, business_type_slug,
     account_type, billing_exempt, all_features, city, phone)
  values
    (v_name, app.unique_organization_slug(v_name), v_actor,
     coalesce(nullif(p_details ->> 'email', ''), v_profile.email),
     p_sector_slug, p_business_type, 'internal', true, true,
     nullif(p_details ->> 'city', ''), nullif(p_details ->> 'phone', ''))
  returning id into v_org;

  v_setup := v_plan.setup_price_cents;
  v_maint := v_plan.maintenance_price_cents;
  v_ref := app.next_order_reference();

  insert into public.orders (
    reference, organization_id, created_by, status, billing_mode,
    plan_id, plan_slug, plan_version,
    setup_price_cents, maintenance_price_cents, billing_interval, discount_cents,
    vat_rate_bps, vat_cents, total_cents, currency,
    sector_slug, business_type_slug, questionnaire,
    requested_domain, domain_handling, customer_notes,
    terms_version, terms_accepted_at
  ) values (
    v_ref, v_org, v_actor, 'internal', 'internal',
    v_plan.id, v_plan.slug, v_plan.version,
    v_setup, v_maint, v_plan.billing_interval, v_setup,
    0, 0, 0, v_plan.currency,
    p_sector_slug, p_business_type,
    coalesce(p_questionnaire, '{}'::jsonb) || jsonb_build_object('businessName', v_name),
    lower(nullif(p_requested_domain, '')),
    coalesce(nullif(p_domain_handling, ''), 'subdomain_only'),
    p_customer_notes,
    coalesce(p_terms_version, 'interne'), now()
  )
  returning id into v_order;

  insert into public.order_items
    (order_id, kind, label, quantity, unit_price_cents, total_cents, sort_order, metadata)
  values
    (v_order, 'plan_setup', 'Création du site — offre ' || v_plan.name,
     1, v_setup, v_setup, 10, '{}'::jsonb),
    (v_order, 'internal_waiver', 'Commande interne StaX — aucun paiement',
     1, -v_setup, -v_setup, 20, jsonb_build_object('billing_mode', 'internal'));

  insert into public.sites
    (organization_id, name, slug, status, business_type_slug, plan_id, plan_slug, created_by)
  values
    (v_org, v_name, app.unique_site_slug(v_name), 'draft', p_business_type,
     v_plan.id, v_plan.slug, v_actor)
  returning id into v_site;

  update public.orders set site_id = v_site where id = v_order;

  insert into public.projects
    (reference, organization_id, site_id, order_id, status, title, summary, started_at)
  values
    (v_ref, v_org, v_site, v_order, 'in_progress', 'Création de votre site',
     'Commande interne StaX, sans paiement : le site est conçu et construit par l''équipe '
     || 'StaX, puis confié au client depuis l''administration.', now())
  returning id into v_project;

  if p_template is not null then
    perform app.provision_site(v_site, p_template, p_hostname,
                               coalesce(p_details, '{}'::jsonb)
                               || jsonb_build_object('businessName', v_name));
  end if;

  perform app.write_audit(
    'order.internal_created', v_org, v_site, 'order', v_order::text,
    jsonb_build_object('reference', v_ref, 'plan', v_plan.slug,
                       'catalog_setup_cents', v_setup, 'billing_mode', 'internal',
                       'business_type', p_business_type));

  return jsonb_build_object(
    'ok', true, 'orderId', v_order, 'reference', v_ref, 'organizationId', v_org,
    'siteId', v_site, 'projectId', v_project);
end;
$$;

-- -----------------------------------------------------------------------------
--  5. Surface RPC
-- -----------------------------------------------------------------------------
create or replace function public.admin_create_site(
  p_name text, p_business_type text default null, p_plan_id uuid default null,
  p_city text default null
) returns jsonb language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.admin_create_site(p_name, p_business_type, p_plan_id, p_city);
$$;

create or replace function public.deliver_site(
  p_site uuid, p_email text default null, p_role text default 'owner'
) returns jsonb language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.deliver_site(p_site, p_email, p_role);
$$;

create or replace function public.withdraw_site(p_site uuid)
returns boolean language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.withdraw_site(p_site);
$$;

revoke all on function app.admin_create_site(text, text, uuid, text) from public, anon, authenticated;
revoke all on function app.deliver_site(uuid, text, text) from public, anon, authenticated;
revoke all on function app.withdraw_site(uuid) from public, anon, authenticated;
revoke all on function public.admin_create_site(text, text, uuid, text) from public, anon;
revoke all on function public.deliver_site(uuid, text, text) from public, anon;
revoke all on function public.withdraw_site(uuid) from public, anon;
grant execute on function public.admin_create_site(text, text, uuid, text) to authenticated;
grant execute on function public.deliver_site(uuid, text, text) to authenticated;
grant execute on function public.withdraw_site(uuid) to authenticated;

comment on function public.deliver_site(uuid, text, text) is
  'Confie un site construit par StaX a son client (administration de la plateforme).';

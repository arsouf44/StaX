-- =============================================================================
--  StaX — 0030 · Comptes internes, commandes internes, preparation des sites
--
--  1. COMPTES INTERNES
--     Un compte interne StaX peut commander autant de sites qu'il le souhaite,
--     avec n'importe quelle offre, sans jamais payer. Ce privilege est porte
--     par des COLONNES protegees en base — jamais par une adresse e-mail
--     comparee dans l'interface. Seule la cle de service (le script
--     d'approvisionnement) ou un `platform_owner` peut les ecrire : un
--     declencheur refuse toute autre provenance, y compris une requete
--     PostgREST forgee.
--
--  2. COMMANDES INTERNES
--     La commande suit le meme chemin que les autres (commande, projet, site)
--     pour que le reste du produit n'ait aucun cas particulier. Elle porte
--     `billing_mode = 'internal'` et le statut `internal` : prix du catalogue
--     conserve pour reference, remise integrale, total nul. Aucune ligne de
--     paiement n'est creee, aucune creance n'existe, et un declencheur interdit
--     qu'elle devienne un jour « payee ».
--
--  3. PREPARATION DU SITE
--     Un site nait avec des pages, des sections pre-remplies pour son metier,
--     un theme, un formulaire de contact qui fonctionne et une adresse en
--     sous-domaine. Le client peut le modifier immediatement.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Privileges de compte
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists account_type    text    not null default 'customer',
  add column if not exists billing_exempt  boolean not null default false,
  add column if not exists unlimited_sites boolean not null default false,
  add column if not exists all_features    boolean not null default false;

alter table public.profiles
  add constraint profiles_account_type_valid check (account_type in ('customer', 'internal')),
  add constraint profiles_privileges_internal_only
    check ((not billing_exempt and not unlimited_sites and not all_features)
           or account_type = 'internal');

comment on column public.profiles.account_type is
  'customer | internal. Ecrit uniquement par le script d''approvisionnement '
  '(cle de service) ou par un platform_owner — voir app.guard_account_privileges.';
comment on column public.profiles.billing_exempt is
  'Commandes honorees sans paiement. Verifie cote serveur par app.create_internal_order.';

alter table public.organizations
  add column if not exists account_type   text    not null default 'customer',
  add column if not exists billing_exempt boolean not null default false,
  add column if not exists all_features   boolean not null default false;

alter table public.organizations
  add constraint organizations_account_type_valid check (account_type in ('customer', 'internal')),
  add constraint organizations_privileges_internal_only
    check ((not billing_exempt and not all_features) or account_type = 'internal');

comment on column public.organizations.all_features is
  'Toutes les fonctionnalites, quotas illimites. Pris en compte par app.has_feature '
  'et app.feature_limit AVANT le catalogue : aucune derogation fonctionnalite par '
  'fonctionnalite a maintenir quand le catalogue evolue.';

/** Le compte est-il un compte interne exonere, actif ? */
create or replace function app.is_internal_account(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce((
    select p.account_type = 'internal' and p.billing_exempt and p.disabled_at is null
      from public.profiles p
     where p.id = p_user
  ), false);
$$;

create or replace function app.guard_account_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if tg_op = 'UPDATE'
     and new.account_type    is not distinct from old.account_type
     and new.billing_exempt  is not distinct from old.billing_exempt
     and new.unlimited_sites is not distinct from old.unlimited_sites
     and new.all_features    is not distinct from old.all_features then
    return new;
  end if;

  if tg_op = 'INSERT' and new.account_type = 'customer'
     and not new.billing_exempt and not new.unlimited_sites and not new.all_features then
    return new;
  end if;

  if app.is_service_role() or app.is_platform_owner() then
    return new;
  end if;

  raise exception 'Les privileges de compte interne sont attribues par l''approvisionnement serveur uniquement'
    using errcode = '42501';
end;
$$;

create trigger profiles_guard_account_privileges
  before insert or update on public.profiles
  for each row execute function app.guard_account_privileges();

create or replace function app.guard_org_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if tg_op = 'UPDATE'
     and new.account_type   is not distinct from old.account_type
     and new.billing_exempt is not distinct from old.billing_exempt
     and new.all_features   is not distinct from old.all_features then
    return new;
  end if;

  if tg_op = 'INSERT' and new.account_type = 'customer'
     and not new.billing_exempt and not new.all_features then
    return new;
  end if;

  if app.is_service_role() or app.is_platform_owner() then
    return new;
  end if;

  -- Un compte interne cree ses organisations internes (commande interne). Il
  -- ne peut pas, en revanche, rendre gratuite une organisation existante.
  if tg_op = 'INSERT' and app.is_internal_account(app.current_user_id()) then
    return new;
  end if;

  raise exception 'Seule l''administration de la plateforme peut modifier le regime de facturation'
    using errcode = '42501';
end;
$$;

create trigger organizations_guard_privileges
  before insert or update on public.organizations
  for each row execute function app.guard_org_privileges();

-- -----------------------------------------------------------------------------
--  Droits d'offre : une organisation interne a tout, sans quota
-- -----------------------------------------------------------------------------
create or replace function app.org_has_all_features(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce((select all_features from public.organizations where id = p_org), false);
$$;

create or replace function app.has_feature(p_org uuid, p_feature text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_plan uuid;
  v_enabled boolean;
  v_override boolean;
  v_expires timestamptz;
begin
  if app.org_has_all_features(p_org) then
    return true;
  end if;

  select o.enabled, o.expires_at into v_override, v_expires
    from public.organization_feature_overrides o
   where o.organization_id = p_org and o.feature_key = p_feature;

  if v_override is not null and (v_expires is null or v_expires > now()) then
    return v_override;
  end if;

  v_plan := app.organization_plan_id(p_org);
  if v_plan is null then
    return false;
  end if;

  select pf.enabled into v_enabled
    from public.plan_features pf
   where pf.plan_id = v_plan and pf.feature_key = p_feature;

  return coalesce(v_enabled, false);
end;
$$;

create or replace function app.feature_limit(p_org uuid, p_feature text)
returns integer
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_plan uuid;
  v_limit integer;
  v_has_override boolean := false;
  v_override_limit integer;
  v_expires timestamptz;
begin
  if app.org_has_all_features(p_org) then
    return null;
  end if;

  select true, o.limit_value, o.expires_at
    into v_has_override, v_override_limit, v_expires
    from public.organization_feature_overrides o
   where o.organization_id = p_org and o.feature_key = p_feature;

  if v_has_override and v_override_limit is not null
     and (v_expires is null or v_expires > now()) then
    return v_override_limit;
  end if;

  if not app.has_feature(p_org, p_feature) then
    return -1;
  end if;

  v_plan := app.organization_plan_id(p_org);
  select pf.limit_value into v_limit
    from public.plan_features pf
   where pf.plan_id = v_plan and pf.feature_key = p_feature;

  return v_limit;
end;
$$;

-- -----------------------------------------------------------------------------
--  2. Commandes : mode de facturation
-- -----------------------------------------------------------------------------
alter table public.orders
  add column if not exists billing_mode text not null default 'stripe';

alter table public.orders
  add constraint orders_billing_mode_valid check (billing_mode in ('stripe', 'invoice', 'internal')),
  -- Une commande interne ne porte AUCUN montant du, aucune trace de paiement.
  add constraint orders_internal_is_free check (
    billing_mode <> 'internal'
    or (total_cents = 0 and vat_cents = 0 and paid_at is null
        and stripe_payment_intent_id is null and stripe_checkout_session_id is null)
  ),
  add constraint orders_internal_status_coherent check (
    (status = 'internal') = (billing_mode = 'internal') or status = 'cancelled'
  );

alter table public.order_items drop constraint if exists order_items_kind_valid;
alter table public.order_items add constraint order_items_kind_valid
  check (kind in ('plan_setup', 'plan_maintenance', 'domain', 'option', 'custom', 'discount',
                  'internal_waiver'));

create or replace function app.guard_order_financials()
returns trigger
language plpgsql
set search_path = public, app, pg_catalog
as $$
begin
  if old.status in ('paid', 'refunded', 'partially_refunded', 'internal') then
    if new.setup_price_cents is distinct from old.setup_price_cents
       or new.maintenance_price_cents is distinct from old.maintenance_price_cents
       or new.discount_cents is distinct from old.discount_cents
       or new.total_cents is distinct from old.total_cents
       or new.vat_cents is distinct from old.vat_cents
       or new.currency is distinct from old.currency
       or new.plan_id is distinct from old.plan_id then
      raise exception 'Les montants d''une commande payee sont immuables'
        using errcode = '23514';
    end if;
  end if;

  -- Le regime de facturation est fixe a la creation : une commande interne ne
  -- devient jamais payante, et une commande payante ne devient jamais gratuite.
  if new.billing_mode is distinct from old.billing_mode then
    raise exception 'Le mode de facturation d''une commande ne change pas'
      using errcode = '23514';
  end if;

  if old.status = 'internal' and new.status not in ('internal', 'cancelled') then
    raise exception 'Une commande interne ne peut pas devenir payee : aucun paiement n''a eu lieu'
      using errcode = '23514';
  end if;

  -- Le passage en `paid` n'est legitime que depuis un webhook verifie.
  if new.status = 'paid' and old.status <> 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
--  3. Qui, dans l'equipe StaX, peut intervenir sur le contenu d'un site client
-- -----------------------------------------------------------------------------
create or replace function app.is_platform_site_editor()
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(app.platform_role() in ('platform_owner', 'platform_admin', 'designer', 'support'),
                  false);
$$;

comment on function app.is_platform_site_editor() is
  'Membres de l''equipe StaX autorises a creer, corriger, publier et restaurer le '
  'site d''un client. Chaque action est journalisee avec actor_type = platform_staff.';

/** Nature de l'auteur d'une action sur le site d'une organisation. */
create or replace function app.actor_kind(p_org uuid)
returns text
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select case
    when app.current_user_id() is null then 'system'
    when app.is_org_member(p_org) then 'member'
    when app.is_platform_staff() then 'stax'
    else 'system'
  end;
$$;

-- -----------------------------------------------------------------------------
--  4. Preparation d'un site a partir de son modele metier
-- -----------------------------------------------------------------------------
/**
 * Prepare le contenu initial d'un site : theme, reglages, pages, sections,
 * formulaires et adresse en sous-domaine.
 *
 * Le modele est construit par le registre TypeScript (@stax/site-engine) et
 * transmis en JSON. Ici, on n'en verifie que la STRUCTURE : le contenu de
 * chaque section est de toute facon revalide par son schema a la lecture,
 * et une section invalide n'est jamais rendue.
 *
 * Idempotent : un site qui a deja des pages garde les siennes. Relancer la
 * fonction ne duplique rien et n'ecrase aucun travail du client.
 */
create or replace function app.provision_site(
  p_site     uuid,
  p_template jsonb,
  p_hostname text default null,
  p_details  jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site      public.sites%rowtype;
  v_page      jsonb;
  v_block     jsonb;
  v_form      jsonb;
  v_field     jsonb;
  v_page_id   uuid;
  v_form_id   uuid;
  v_order     int;
  v_pages     int := 0;
  v_blocks    int := 0;
  v_hostname  text := lower(nullif(btrim(coalesce(p_hostname, '')), ''));
  v_details   jsonb := coalesce(p_details, '{}'::jsonb);
  v_email     text;
begin
  select * into v_site from public.sites where id = p_site for update;
  if not found then
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;

  if not (app.is_service_role() or app.is_platform_site_editor()
          or app.site_can(p_site, 'content.edit')) then
    raise exception 'Droit de modification requis' using errcode = '42501';
  end if;

  if jsonb_typeof(p_template) <> 'object'
     or jsonb_typeof(p_template -> 'pages') <> 'array' then
    raise exception 'Modele de site illisible' using errcode = '22023';
  end if;

  v_email := nullif(btrim(coalesce(v_details ->> 'email', '')), '');
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    v_email := null;
  end if;

  -- Theme ------------------------------------------------------------------
  insert into public.site_themes (site_id, preset, tokens, font_heading, font_body)
  values (
    p_site,
    coalesce(nullif(p_template #>> '{theme,preset}', ''), 'graphite'),
    case when p_template #>> '{theme,accent}' ~ '^#[0-9A-Fa-f]{6}$'
         then jsonb_build_object('accent', p_template #>> '{theme,accent}')
         else '{}'::jsonb end,
    coalesce(nullif(p_template #>> '{theme,fontHeading}', ''), 'geist'),
    coalesce(nullif(p_template #>> '{theme,fontBody}', ''), 'geist')
  )
  on conflict (site_id) do nothing;

  -- Reglages ---------------------------------------------------------------
  insert into public.site_settings (
    site_id, business_name, tagline, description, email, phone,
    address_line1, postal_code, city, seo_title, seo_description,
    enabled_modules, navigation, notification_emails
  ) values (
    p_site,
    coalesce(nullif(v_details ->> 'businessName', ''), v_site.name),
    nullif(v_details ->> 'tagline', ''),
    nullif(v_details ->> 'description', ''),
    v_email,
    nullif(v_details ->> 'phone', ''),
    nullif(v_details ->> 'addressLine1', ''),
    nullif(v_details ->> 'postalCode', ''),
    nullif(v_details ->> 'city', ''),
    nullif(v_details ->> 'seoTitle', ''),
    nullif(v_details ->> 'seoDescription', ''),
    coalesce(
      (select array_agg(value) from jsonb_array_elements_text(
         coalesce(p_template -> 'modules', '[]'::jsonb))),
      '{}'),
    coalesce(p_template -> 'navigation', '{"primary":[],"footer":[]}'::jsonb),
    case when v_email is null then '{}'::text[] else array[v_email] end
  )
  on conflict (site_id) do nothing;

  -- Pages et sections : uniquement pour un site encore vide ------------------
  if not exists (select 1 from public.site_pages where site_id = p_site) then
    for v_page in select value from jsonb_array_elements(p_template -> 'pages') loop
      insert into public.site_pages
        (site_id, path, title, kind, is_visible_in_nav, sort_order, is_published)
      values (
        p_site,
        v_page ->> 'path',
        left(coalesce(nullif(v_page ->> 'title', ''), 'Page'), 120),
        coalesce(nullif(v_page ->> 'kind', ''), 'standard'),
        coalesce((v_page ->> 'showInNav')::boolean, true),
        coalesce((v_page ->> 'sortOrder')::int, 100),
        true
      )
      returning id into v_page_id;
      v_pages := v_pages + 1;

      v_order := 0;
      for v_block in select value from jsonb_array_elements(
                       coalesce(v_page -> 'blocks', '[]'::jsonb)) loop
        v_order := v_order + 10;
        insert into public.page_blocks
          (page_id, site_id, type, version, props, settings, sort_order, is_visible)
        values (
          v_page_id, p_site,
          v_block ->> 'type',
          coalesce((v_block ->> 'version')::int, 1),
          coalesce(v_block -> 'props', '{}'::jsonb),
          coalesce(v_block -> 'settings', '{}'::jsonb),
          v_order,
          true
        );
        v_blocks := v_blocks + 1;
      end loop;
    end loop;
  end if;

  -- Formulaires : une section « contact » sans formulaire n'affiche rien ------
  for v_form in select value from jsonb_array_elements(
                  coalesce(p_template -> 'forms', '[]'::jsonb)) loop
    if exists (select 1 from public.forms where site_id = p_site and slug = v_form ->> 'slug') then
      continue;
    end if;
    insert into public.forms
      (site_id, organization_id, slug, name, kind, success_message, notify_emails)
    values (
      p_site, v_site.organization_id,
      v_form ->> 'slug',
      left(coalesce(nullif(v_form ->> 'name', ''), 'Formulaire'), 120),
      coalesce(nullif(v_form ->> 'kind', ''), 'contact'),
      coalesce(nullif(v_form ->> 'successMessage', ''),
               'Merci, votre message a bien été envoyé. Nous vous répondons rapidement.'),
      case when v_email is null then '{}'::text[] else array[v_email] end
    )
    returning id into v_form_id;

    v_order := 0;
    for v_field in select value from jsonb_array_elements(
                     coalesce(v_form -> 'fields', '[]'::jsonb)) loop
      v_order := v_order + 10;
      insert into public.form_fields
        (form_id, name, label, type, placeholder, is_required, options, sort_order)
      values (
        v_form_id,
        v_field ->> 'name',
        left(coalesce(nullif(v_field ->> 'label', ''), v_field ->> 'name'), 120),
        coalesce(nullif(v_field ->> 'type', ''), 'text'),
        nullif(v_field ->> 'placeholder', ''),
        coalesce((v_field ->> 'required')::boolean, false),
        coalesce(v_field -> 'options', '[]'::jsonb),
        v_order
      );
    end loop;
  end loop;

  -- Adresse en sous-domaine ---------------------------------------------------
  if v_hostname is not null
     and not exists (select 1 from public.site_domains
                      where site_id = p_site and kind = 'platform_subdomain'
                        and status <> 'detached') then
    insert into public.site_domains
      (site_id, organization_id, hostname, kind, status, is_primary,
       verified_at, ssl_status, ssl_issued_at, created_by)
    values
      (p_site, v_site.organization_id, v_hostname, 'platform_subdomain', 'active',
       not exists (select 1 from public.site_domains
                    where site_id = p_site and is_primary and status <> 'detached'),
       now(), 'active', now(), app.current_user_id());
  end if;

  update public.sites
     set status = case when status = 'draft' then 'building'::app.site_status else status end,
         template_slug = coalesce(template_slug, v_site.business_type_slug)
   where id = p_site;

  perform app.write_audit('site.provisioned', v_site.organization_id, p_site, 'site',
                          p_site::text,
                          jsonb_build_object('pages', v_pages, 'blocks', v_blocks,
                                             'hostname', v_hostname));

  return jsonb_build_object('ok', true, 'pages', v_pages, 'blocks', v_blocks,
                            'hostname', v_hostname);
end;
$$;

-- -----------------------------------------------------------------------------
--  5. Commande interne
-- -----------------------------------------------------------------------------
/**
 * Commande d'un compte interne StaX : aucun paiement, creation immediate.
 *
 * LA VERIFICATION EST ICI, PAS DANS L'INTERFACE. Un compte ordinaire qui
 * appellerait cette fonction directement — par une requete forgee — recoit
 * un refus : le privilege est relu dans `profiles`, colonne que lui-meme ne
 * peut pas ecrire.
 *
 * Dans une seule transaction : organisation interne, commande (statut
 * `internal`, total nul), lignes de commande lisibles, site, projet,
 * preparation du contenu et journal d'audit. Si une etape echoue, rien n'est
 * cree.
 */
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
     'Commande interne StaX : site créé immédiatement, sans paiement.', now())
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
--  6. Surface RPC
-- -----------------------------------------------------------------------------
create or replace function public.create_internal_order(
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
language sql
security definer
set search_path = public, app, pg_catalog
as $$
  select app.create_internal_order(p_plan_id, p_sector_slug, p_business_type,
                                   p_organization_name, p_questionnaire, p_requested_domain,
                                   p_domain_handling, p_customer_notes, p_terms_version,
                                   p_template, p_hostname, p_details);
$$;

create or replace function public.provision_site(
  p_site     uuid,
  p_template jsonb,
  p_hostname text default null,
  p_details  jsonb default '{}'::jsonb
)
returns jsonb
language sql
security definer
set search_path = public, app, pg_catalog
as $$
  select app.provision_site(p_site, p_template, p_hostname, p_details);
$$;

create or replace function public.is_internal_account()
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select app.is_internal_account(app.current_user_id());
$$;

revoke all on function app.create_internal_order(uuid, text, text, text, jsonb, text, text, text,
                                                 text, jsonb, text, jsonb) from public, anon;
revoke all on function public.create_internal_order(uuid, text, text, text, jsonb, text, text,
                                                    text, text, jsonb, text, jsonb)
  from public, anon;
grant execute on function public.create_internal_order(uuid, text, text, text, jsonb, text, text,
                                                       text, text, jsonb, text, jsonb)
  to authenticated, service_role;

revoke all on function app.provision_site(uuid, jsonb, text, jsonb) from public, anon;
revoke all on function public.provision_site(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.provision_site(uuid, jsonb, text, jsonb)
  to authenticated, service_role;

revoke all on function public.is_internal_account() from public, anon;
grant execute on function public.is_internal_account() to authenticated, service_role;

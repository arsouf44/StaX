-- =============================================================================
--  StaX — 0045 · Aucun modele de site, nulle part
--
--  StaX ne genere pas de sites. Chaque site est concu et developpe par
--  l'equipe, dans son propre depot. Ni l'offre, ni le metier, ni un
--  questionnaire ne selectionnent — ou ne fabriquent — une structure de site.
--
--  Cette migration retire les derniers mecanismes qui le permettaient encore :
--   - `provision_site`, qui ecrivait un « modele metier » (pages, sections,
--     theme) dans un site ;
--   - la table `site_templates`, catalogue de structures de depart ;
--   - le parametre `p_template` de la commande interne.
--
--  Les sites deja construits dans le moteur multi-tenant gardent leur contenu :
--  rien de ce qui existe n'est efface.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Commande interne : meme parcours qu'un client, sans modele
-- -----------------------------------------------------------------------------
drop function if exists public.create_internal_order(uuid, text, text, text, jsonb, text, text,
                                                     text, text, jsonb, text, jsonb);
drop function if exists app.create_internal_order(uuid, text, text, text, jsonb, text, text,
                                                  text, text, jsonb, text, jsonb);

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
    terms_version, terms_accepted_at, plan_inclusions
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
    coalesce(p_terms_version, 'interne'), now(),
    app.plan_inclusions_snapshot(v_plan.id)
  )
  returning id into v_order;

  insert into public.order_items
    (order_id, kind, label, quantity, unit_price_cents, total_cents, sort_order, metadata)
  values
    (v_order, 'plan_setup', 'Création du site — offre ' || v_plan.name,
     1, v_setup, v_setup, 10, '{}'::jsonb),
    (v_order, 'internal_waiver', 'Commande interne StaX — aucun paiement',
     1, -v_setup, -v_setup, 20, jsonb_build_object('billing_mode', 'internal'));

  -- Site VIDE : l'equipe le developpe dans son propre depot, puis le rattache.
  insert into public.sites
    (organization_id, name, slug, status, business_type_slug, plan_id, plan_slug, created_by,
     architecture)
  values
    (v_org, v_name, app.unique_site_slug(v_name), 'draft', p_business_type,
     v_plan.id, v_plan.slug, v_actor, 'external_repository')
  returning id into v_site;

  update public.orders set site_id = v_site where id = v_order;

  insert into public.projects
    (reference, organization_id, site_id, order_id, status, title, summary, started_at)
  values
    (v_ref, v_org, v_site, v_order, 'ordered', 'Création de votre site',
     'Commande interne StaX, sans paiement : le site est conçu et développé par l''équipe '
     || 'dans son propre dépôt, mis en ligne sur son propre projet Cloudflare, puis livré '
     || 'depuis l''administration.', now())
  returning id into v_project;

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
                                   p_details);
$$;

revoke all on function app.create_internal_order(uuid, text, text, text, jsonb, text, text, text,
                                                 text, jsonb) from public, anon, authenticated;
revoke all on function public.create_internal_order(uuid, text, text, text, jsonb, text, text,
                                                    text, text, jsonb) from public, anon;
grant execute on function public.create_internal_order(uuid, text, text, text, jsonb, text, text,
                                                       text, text, jsonb)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
--  2. Plus aucun moyen d'ecrire un « modele metier » dans un site
-- -----------------------------------------------------------------------------
drop function if exists public.provision_site(uuid, jsonb, text, jsonb);
drop function if exists app.provision_site(uuid, jsonb, text, jsonb);

drop table if exists public.site_templates cascade;

comment on column public.sites.template_slug is
  'OBSOLETE. Heritage de l''ancien moteur, qui instanciait des structures de depart. Plus '
  'aucune fonction ne l''ecrit : chaque site est concu et developpe individuellement.';

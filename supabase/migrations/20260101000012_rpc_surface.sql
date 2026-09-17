-- =============================================================================
--  StaX — 0012 · Surface RPC exposee
--
--  Le schema `app` n'est PAS publie par PostgREST : il contient les helpers de
--  securite et les fonctions de domaine. Seules les operations ci-dessous sont
--  appelables depuis l'application, via des enveloppes minces dans `public`
--  dont les droits sont accordes explicitement, role par role.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Lecture des droits — utilisable par un utilisateur authentifie
-- -----------------------------------------------------------------------------
create or replace function public.has_feature(p_org uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  -- Un utilisateur ne peut interroger que les organisations dont il est membre.
  select case
    when app.is_org_member(p_org) or app.is_platform_staff()
      then app.has_feature(p_org, p_feature)
    else false
  end;
$$;

create or replace function public.feature_limit(p_org uuid, p_feature text)
returns integer
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select case
    when app.is_org_member(p_org) or app.is_platform_staff()
      then app.feature_limit(p_org, p_feature)
    else -1
  end;
$$;

create or replace function public.feature_usage(p_org uuid, p_feature text)
returns integer
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select case
    when app.is_org_member(p_org) or app.is_platform_staff()
      then app.usage_count(p_org, p_feature)
    else 0
  end;
$$;

create or replace function public.org_can(p_org uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select app.org_can(p_org, p_capability);
$$;

/** Ensemble des droits de l'utilisateur sur une organisation, en un aller-retour. */
create or replace function public.my_capabilities(p_org uuid)
returns text[]
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(array_agg(c), '{}')
    from unnest(array[
      'org.view','org.manage','org.delete','members.manage','content.view','content.edit',
      'content.publish','inbox.view','inbox.manage','commerce.view','commerce.manage',
      'billing.view','billing.manage','analytics.view','domain.manage','media.manage',
      'payments.connect','data.export','support.manage'
    ]) as c
   where app.org_can(p_org, c);
$$;

-- -----------------------------------------------------------------------------
--  Operations metier
-- -----------------------------------------------------------------------------
create or replace function public.publish_site(p_site uuid, p_label text default null)
returns uuid
language sql
volatile
security definer
set search_path = public, app, pg_catalog
as $$
  select app.publish_site(p_site, p_label);
$$;

create or replace function public.rollback_site(p_site uuid, p_version_id uuid)
returns uuid
language sql
volatile
security definer
set search_path = public, app, pg_catalog
as $$
  select app.rollback_site(p_site, p_version_id);
$$;

create or replace function public.create_order(
  p_organization_id  uuid,
  p_plan_id          uuid,
  p_sector_slug      text,
  p_business_type    text,
  p_questionnaire    jsonb default '{}'::jsonb,
  p_requested_domain text default null,
  p_domain_handling  text default 'none',
  p_coupon_code      text default null,
  p_customer_notes   text default null,
  p_terms_version    text default null,
  p_ip_hash          text default null
)
returns uuid
language sql
volatile
security definer
set search_path = public, app, pg_catalog
as $$
  select app.create_order(
    p_organization_id, p_plan_id, p_sector_slug, p_business_type, p_questionnaire,
    p_requested_domain, p_domain_handling, p_coupon_code, p_customer_notes,
    p_terms_version, p_ip_hash
  );
$$;

create or replace function public.request_refund(
  p_order_id uuid,
  p_reason   text,
  p_window_days int default 15,
  p_domain_deduction_cents int default 1000
)
returns uuid
language sql
volatile
security definer
set search_path = public, app, pg_catalog
as $$
  select app.request_refund(p_order_id, p_reason, p_window_days, p_domain_deduction_cents);
$$;

create or replace function public.compute_order_pricing(p_plan_id uuid, p_coupon text default null)
returns app.price_breakdown
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select app.compute_order_pricing(p_plan_id, p_coupon);
$$;

create or replace function public.write_audit(
  p_action      text,
  p_org         uuid default null,
  p_site        uuid default null,
  p_target_type text default null,
  p_target_id   text default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns uuid
language sql
volatile
security definer
set search_path = public, app, pg_catalog
as $$
  select app.write_audit(p_action, p_org, p_site, p_target_type, p_target_id, p_metadata);
$$;

-- -----------------------------------------------------------------------------
--  Operations reservees au serveur (service role uniquement)
-- -----------------------------------------------------------------------------
create or replace function public.bump_rate_limit(
  p_bucket text,
  p_identifier text,
  p_window_seconds int,
  p_max int
)
returns boolean
language sql
volatile
security definer
set search_path = public, app, pg_catalog
as $$
  select app.bump_rate_limit(p_bucket, p_identifier, p_window_seconds, p_max);
$$;

create or replace function public.resolve_published_site(p_hostname text)
returns table (
  site_id         uuid,
  organization_id uuid,
  site_status     app.site_status,
  domain_status   app.domain_status,
  version_id      uuid,
  content_hash    text,
  snapshot        jsonb,
  enabled_modules text[],
  timezone        text,
  is_demo         boolean
)
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select * from app.resolve_published_site(p_hostname);
$$;

create or replace function public.redeem_activation_code(
  p_code_hash text,
  p_user_id   uuid,
  p_email     text
)
returns app.activation_result
language sql
volatile
security definer
set search_path = public, app, pg_catalog
as $$
  select app.redeem_activation_code(p_code_hash, p_user_id, p_email);
$$;

-- -----------------------------------------------------------------------------
--  Attribution stricte des droits d'execution
-- -----------------------------------------------------------------------------
do $$
declare
  fn text;
  authenticated_fns text[] := array[
    'public.has_feature(uuid, text)',
    'public.feature_limit(uuid, text)',
    'public.feature_usage(uuid, text)',
    'public.org_can(uuid, text)',
    'public.my_capabilities(uuid)',
    'public.publish_site(uuid, text)',
    'public.rollback_site(uuid, uuid)',
    'public.create_order(uuid, uuid, text, text, jsonb, text, text, text, text, text, text)',
    'public.request_refund(uuid, text, int, int)',
    'public.compute_order_pricing(uuid, text)',
    'public.write_audit(text, uuid, uuid, text, text, jsonb)'
  ];
  service_only_fns text[] := array[
    'public.bump_rate_limit(text, text, int, int)',
    'public.resolve_published_site(text)',
    'public.redeem_activation_code(text, uuid, text)'
  ];
begin
  foreach fn in array authenticated_fns loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;

  foreach fn in array service_only_fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- Le calcul tarifaire est consultable sans compte : la page /tarifs doit
-- pouvoir afficher un montant exact a un visiteur non connecte.
grant execute on function public.compute_order_pricing(uuid, text) to anon;

comment on function public.resolve_published_site(text) is
  'Résolution du tenant a partir du hostname. Reservee au service role : le '
  'navigateur ne designe jamais lui-même le site a servir.';

-- =============================================================================
--  StaX — 0002 · Identite, organisations et tenancy
--  Un site n'appartient JAMAIS a un utilisateur : il appartient a une
--  organisation. L'appartenance passe par organization_members, seule source
--  de verite des droits.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  profiles — miroir applicatif de auth.users
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  full_name         text,
  first_name        text,
  last_name         text,
  phone             text,
  avatar_url        text,
  locale            text not null default 'fr',
  timezone          text not null default 'Europe/Paris',

  -- Role INTERNE a la plateforme. NULL = simple client.
  -- Ne peut etre modifie ni par l'utilisateur, ni par une requete cliente :
  -- voir le trigger app.guard_platform_role ci-dessous.
  platform_role     app.platform_role,
  mfa_enforced      boolean not null default false,

  marketing_opt_in  boolean not null default false,
  onboarding_step   text,
  last_seen_at      timestamptz,
  disabled_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint profiles_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint profiles_locale_supported check (locale in ('fr', 'en'))
);

create unique index profiles_email_lower_key on public.profiles (lower(email));
create index profiles_platform_role_idx on public.profiles (platform_role)
  where platform_role is not null;

comment on column public.profiles.platform_role is
  'Role interne StaX. Attribue uniquement cote serveur (service role / platform_owner). '
  'Posseder ADMIN_EMAIL ne confere aucun droit : seule cette colonne fait foi.';

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  Garde-fou : escalade de privileges impossible depuis une session cliente
-- -----------------------------------------------------------------------------
create or replace function app.guard_platform_role()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor_role app.platform_role;
begin
  if new.platform_role is not distinct from old.platform_role
     and new.mfa_enforced is not distinct from old.mfa_enforced then
    return new;
  end if;

  -- Les migrations, scripts d'administration et webhooks tournent en service_role.
  if app.is_service_role() then
    return new;
  end if;

  select platform_role into v_actor_role
    from public.profiles
   where id = app.current_user_id();

  if v_actor_role in ('platform_owner', 'platform_admin') then
    -- Seul un platform_owner peut creer un autre platform_owner.
    if new.platform_role = 'platform_owner' and v_actor_role <> 'platform_owner' then
      raise exception 'Seul un platform_owner peut attribuer le role platform_owner'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Modification du role plateforme interdite'
    using errcode = '42501';
end;
$$;

create trigger profiles_guard_platform_role
  before update on public.profiles
  for each row execute function app.guard_platform_role();

-- -----------------------------------------------------------------------------
--  Creation automatique du profil a l'inscription
-- -----------------------------------------------------------------------------
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  insert into public.profiles (id, email, full_name, first_name, last_name, locale)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'fr')
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- -----------------------------------------------------------------------------
--  organizations — le tenant
-- -----------------------------------------------------------------------------
create table public.organizations (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text not null,

  -- Identite commerciale du client (jamais inventee : saisie par le client)
  legal_name            text,
  siret                 text,
  vat_number            text,
  address_line1         text,
  address_line2         text,
  postal_code           text,
  city                  text,
  country               text not null default 'FR',
  phone                 text,
  website               text,

  sector_slug           text,
  business_type_slug    text,

  billing_email         text,
  stripe_customer_id    text,

  status                text not null default 'active',
  is_demo               boolean not null default false,
  suspended_at          timestamptz,
  suspension_reason     text,

  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint organizations_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$'),
  constraint organizations_status_valid check (status in ('active', 'suspended', 'archived')),
  constraint organizations_country_iso check (country ~ '^[A-Z]{2}$')
);

create unique index organizations_slug_key on public.organizations (slug);
create unique index organizations_stripe_customer_key
  on public.organizations (stripe_customer_id) where stripe_customer_id is not null;
create index organizations_status_idx on public.organizations (status);
create index organizations_name_trgm_idx
  on public.organizations using gin (name extensions.gin_trgm_ops);

create trigger organizations_touch_updated_at
  before update on public.organizations
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  organization_members — la seule source de verite des droits
-- -----------------------------------------------------------------------------
create table public.organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  role             app.org_role not null default 'viewer',
  invited_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint organization_members_unique unique (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members (user_id);
create index organization_members_org_role_idx on public.organization_members (organization_id, role);

create trigger organization_members_touch_updated_at
  before update on public.organization_members
  for each row execute function app.touch_updated_at();

-- Une organisation garde toujours au moins un owner.
create or replace function app.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_org uuid := coalesce(old.organization_id, new.organization_id);
  v_remaining int;
begin
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  select count(*) into v_remaining
    from public.organization_members
   where organization_id = v_org
     and role = 'owner'
     and id <> old.id;

  if v_remaining = 0 then
    raise exception 'Une organisation doit conserver au moins un proprietaire'
      using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger organization_members_guard_last_owner
  before update or delete on public.organization_members
  for each row execute function app.guard_last_owner();

-- -----------------------------------------------------------------------------
--  organization_invitations — invitation nominative, a usage unique
-- -----------------------------------------------------------------------------
create table public.organization_invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  email            text not null,
  role             app.org_role not null default 'editor',
  -- Le jeton clair n'est jamais stocke : seul son HMAC-SHA256 l'est.
  token_hash       text not null,
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  accepted_by      uuid references public.profiles (id) on delete set null,
  revoked_at       timestamptz,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint organization_invitations_email_format
    check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint organization_invitations_role_not_owner
    check (role <> 'owner')
);

create unique index organization_invitations_token_key
  on public.organization_invitations (token_hash);
create unique index organization_invitations_pending_key
  on public.organization_invitations (organization_id, lower(email))
  where accepted_at is null and revoked_at is null;
create index organization_invitations_expiry_idx
  on public.organization_invitations (expires_at) where accepted_at is null;

-- =============================================================================
--  Helpers de tenancy — fondation de toutes les policies RLS
-- =============================================================================

create or replace function app.platform_role()
returns app.platform_role
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select platform_role
    from public.profiles
   where id = app.current_user_id()
     and disabled_at is null;
$$;

create or replace function app.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(app.platform_role() is not null, false);
$$;

/*
 * coalesce(..., false) est OBLIGATOIRE : sans lui, un profil sans role
 * plateforme renvoie NULL, et un controle imperatif `if not (droit or
 * is_platform_owner())` vaut alors NULL — donc ne leve aucune exception.
 * La RLS traite NULL comme un refus, mais pas le PL/pgSQL.
 */
create or replace function app.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(app.platform_role() = 'platform_owner', false);
$$;

-- Les roles habilites a administrer la donnee client depuis /admin.
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(app.platform_role() in ('platform_owner', 'platform_admin'), false);
$$;

create or replace function app.org_role(p_org uuid)
returns app.org_role
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select m.role
    from public.organization_members m
   where m.organization_id = p_org
     and m.user_id = app.current_user_id();
$$;

create or replace function app.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(app.org_role(p_org) is not null, false);
$$;

/*
 * Matrice de droits par role d'organisation.
 * Une seule fonction, utilisee identiquement par la RLS et par la couche
 * applicative, pour qu'il n'existe jamais deux definitions divergentes.
 */
create or replace function app.org_can(p_org uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(case app.org_role(p_org)
    when 'owner'   then p_capability in (
      'org.view','org.manage','org.delete','members.manage','content.view','content.edit',
      'content.publish','inbox.view','inbox.manage','commerce.view','commerce.manage',
      'billing.view','billing.manage','analytics.view','domain.manage','media.manage',
      'payments.connect','data.export','support.manage'
    )
    when 'admin'   then p_capability in (
      'org.view','org.manage','members.manage','content.view','content.edit',
      'content.publish','inbox.view','inbox.manage','commerce.view','commerce.manage',
      'billing.view','analytics.view','domain.manage','media.manage','data.export',
      'support.manage'
    )
    when 'editor'  then p_capability in (
      'org.view','content.view','content.edit','content.publish','inbox.view','inbox.manage',
      'commerce.view','commerce.manage','analytics.view','media.manage','support.manage'
    )
    when 'billing' then p_capability in (
      'org.view','billing.view','billing.manage','analytics.view','data.export'
    )
    when 'viewer'  then p_capability in (
      'org.view','content.view','inbox.view','commerce.view','analytics.view'
    )
    else false
  end, false);
$$;

comment on function app.org_can(uuid, text) is
  'Matrice RBAC canonique. Toute vérification de droit, en SQL comme en TypeScript, '
  'doit passer par cette définition unique.';

-- Organisations visibles par l'utilisateur courant (pour les jointures RLS).
create or replace function app.member_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select organization_id
    from public.organization_members
   where user_id = app.current_user_id();
$$;

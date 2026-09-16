-- =============================================================================
--  Emulation minimale de l'environnement Supabase, pour valider et tester les
--  migrations sur un PostgreSQL nu (CI, poste de developpement, conteneur).
--  Ce fichier n'est JAMAIS applique a un projet Supabase reel.
-- =============================================================================

create schema if not exists auth;
create schema if not exists extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create table if not exists auth.users (
  id                   uuid primary key default gen_random_uuid(),
  email                text unique,
  encrypted_password   text,
  email_confirmed_at   timestamptz,
  raw_user_meta_data   jsonb not null default '{}'::jsonb,
  raw_app_meta_data    jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), '')::uuid;
$$;

grant usage on schema auth, extensions to anon, authenticated, service_role;

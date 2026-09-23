-- =============================================================================
--  Pile locale des tests de bout en bout — roles et privileges « facon Supabase »
--
--  Ce fichier reproduit ce qu'un projet Supabase fournit AVANT la premiere
--  migration : les roles de l'API, le schema `auth` possede par le service
--  d'authentification, et surtout les PRIVILEGES PAR DEFAUT. Supabase accorde
--  tout a `anon`, `authenticated` et `service_role` sur ce qui est cree dans
--  `public` ; les migrations StaX retirent ensuite ce qui doit l'etre, et la
--  RLS fait le reste. Reproduire ce comportement ici garantit que les tests
--  voient la meme surface qu'en production, pas une surface plus etroite qui
--  masquerait un oubli.
--
--  Il n'est JAMAIS applique a un projet Supabase reel.
-- =============================================================================

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
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'authenticator-e2e';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login noinherit createrole password 'auth-admin-e2e';
  end if;
end;
$$;

grant anon, authenticated, service_role to authenticator;

create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists extensions;
grant usage on schema auth, extensions to anon, authenticated, service_role;
grant usage, create on schema public to anon, authenticated, service_role;
alter role supabase_auth_admin set search_path = auth;

-- Privileges par defaut de Supabase : tout objet cree dans `public` est
-- accessible aux trois roles de l'API. Les migrations resserrent ensuite.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- =============================================================================
--  StaX — 0053 · Tâche de fond des sites : planifiée par la base
--
--  `/api/cron/sites` doit tourner toutes les 5 minutes : publications
--  programmées, suivi des déploiements Cloudflare (délai de 45 minutes),
--  aperçus, surveillance HTTPS des sites livrés.
--
--  Le plan gratuit de Vercel (Hobby) n'accepte qu'une tâche planifiée par
--  jour. Plutôt que de dégrader ces fonctions, la base appelle elle-même la
--  route toutes les 5 minutes : `pg_cron` (déjà utilisé par la purge de
--  conservation, 0039) déclenche `app.trigger_site_operations()`, qui envoie
--  la requête avec `pg_net`. Vercel garde un passage quotidien de secours.
--
--  L'adresse de la plateforme et le secret (`CRON_SECRET`, le même que sur
--  Vercel) sont lus dans Supabase Vault, jamais écrits dans une migration :
--
--    select vault.create_secret('https://votre-domaine.fr', 'stax_platform_url');
--    select vault.create_secret('<valeur de CRON_SECRET>', 'stax_cron_secret');
--
--  Tant qu'ils sont absents, la fonction ne fait rien. Sur un PostgreSQL sans
--  `pg_cron`, `pg_net` ni Vault (tests, poste de développement), la migration
--  crée la fonction et ne planifie rien.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end;
$$;

create or replace function app.trigger_site_operations()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_url     text;
  v_secret  text;
  v_request bigint;
begin
  -- Requetes dynamiques : Vault et pg_net n'existent que sur Supabase.
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;

  execute $q$select decrypted_secret from vault.decrypted_secrets
              where name = 'stax_platform_url' limit 1$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets
              where name = 'stax_cron_secret' limit 1$q$ into v_secret;

  if v_url is null or v_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$'
     or v_secret is null or length(v_secret) < 16 then
    return null;
  end if;

  -- Requete asynchrone : pg_net l'envoie en arriere-plan, le planificateur
  -- n'attend pas. Le delai couvre la duree maximale de la route (60 s).
  execute $q$select net.http_get(url := $1, headers := $2, timeout_milliseconds := 60000)$q$
     into v_request
    using rtrim(v_url, '/') || '/api/cron/sites',
          jsonb_build_object('Authorization', 'Bearer ' || v_secret);
  return v_request;
end;
$$;

comment on function app.trigger_site_operations() is
  'Appelle /api/cron/sites avec CRON_SECRET, lus dans Supabase Vault (stax_platform_url, '
  'stax_cron_secret). Planifiee toutes les 5 minutes par pg_cron. Sans secrets : ne fait rien.';

revoke all on function app.trigger_site_operations() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$select cron.unschedule(jobid) from cron.job
                   where jobname = 'stax-site-operations'$cron$;
    execute $cron$select cron.schedule('stax-site-operations', '*/5 * * * *',
                                       'select app.trigger_site_operations()')$cron$;
  end if;
end;
$$;

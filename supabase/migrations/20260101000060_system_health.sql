-- =============================================================================
--  Nemasus — 0060 · État des services : chaque indicateur dit la vérité
--
--  Constat (audit du 2026-09-30) : sur les onze indicateurs de la page d'état
--  (/status, /admin/sante), cinq n'étaient JAMAIS mis à jour par aucun code :
--  « Base de données », « Webhooks Stripe », « Fournisseur d'e-mails »,
--  « Vérification des domaines », « Sauvegardes ». Ils affichaient « en
--  attente » pour toujours, et « Sauvegardes » annonçait « assurée par
--  Supabase » alors que l'offre gratuite n'en fait aucune. Les indicateurs de
--  la tâche de fond, eux, restaient « sains » des jours après son dernier
--  passage.
--
--  1. `app.refresh_system_health()` dérive l'état réel des journaux que la
--     plateforme tient déjà (événements Stripe, e-mails envoyés, domaines,
--     dernière exécution de chaque tâche) ; `pg_cron` l'exécute toutes les
--     10 minutes, sans dépendre de la plateforme.
--  2. `app.record_backup_result()` est appelée par la sauvegarde quotidienne
--     (GitHub Actions) : réussite ou échec, avec la date.
--  3. Un indicateur dont la tâche n'a plus tourné depuis trop longtemps passe
--     « dégradé » et dit depuis quand — il ne reste jamais « sain » par défaut.
-- =============================================================================

create or replace function app.refresh_system_health()
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_last     timestamptz;
  v_failed   integer;
  v_total    integer;
  v_active   integer;
  v_stale    integer;
  v_provider text;
  v_status   text;
  v_detail   text;
  v_row      record;
begin
  -- Base de données : cette fonction s'exécute dedans. Si elle ne répond plus,
  -- la page d'état le montre d'elle-même (lecture impossible).
  update public.system_health
     set status = 'healthy', detail = 'La base répond aux requêtes.', observed_at = now()
   where key = 'database';

  -- Paiements : événements Stripe reçus et leur traitement.
  select max(received_at) into v_last
    from public.webhook_events where provider in ('stripe', 'stripe_connect');
  select count(*) into v_failed
    from public.webhook_events
   where provider in ('stripe', 'stripe_connect') and status = 'failed'
     and received_at > now() - interval '24 hours';
  if v_last is null then
    v_status := 'unknown';
    v_detail := 'Aucun événement Stripe reçu pour l''instant.';
  elsif v_failed > 0 then
    v_status := 'degraded';
    v_detail := format('%s événement(s) en échec sur les dernières 24 h.', v_failed);
  else
    v_status := 'healthy';
    v_detail := 'Dernier événement reçu et traité le '
                || to_char(v_last at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI') || '.';
  end if;
  update public.system_health
     set status = v_status, detail = v_detail,
         observed_at = case when v_last is null then null else now() end
   where key = 'stripe_webhooks';

  -- E-mails : le journal de chaque envoi (gabarit, empreinte, statut).
  select provider into v_provider from public.email_log order by created_at desc limit 1;
  select count(*) filter (where status in ('failed', 'bounced')), count(*)
    into v_failed, v_total
    from public.email_log where created_at > now() - interval '24 hours';
  if v_provider is null then
    v_status := 'unknown';
    v_detail := 'Aucun envoi enregistré pour l''instant.';
  elsif v_provider = 'console' then
    v_status := 'not_configured';
    v_detail := 'Aucun fournisseur d''e-mails configuré (EMAIL_PROVIDER) : les messages ne partent pas.';
  elsif v_total > 0 and v_failed = v_total then
    v_status := 'failing';
    v_detail := format('Les %s envoi(s) des dernières 24 h ont échoué.', v_total);
  elsif v_failed > 0 then
    v_status := 'degraded';
    v_detail := format('%s envoi(s) sur %s en échec sur les dernières 24 h.', v_failed, v_total);
  else
    v_status := 'healthy';
    v_detail := case when v_total = 0
                     then 'Fournisseur configuré ; aucun envoi sur les dernières 24 h.'
                     else format('%s envoi(s) réussi(s) sur les dernières 24 h.', v_total) end;
  end if;
  update public.system_health
     set status = v_status, detail = v_detail,
         observed_at = case when v_provider is null then null else now() end
   where key = 'email_provider';

  -- Domaines des sites.
  select count(*) filter (where status = 'failed'),
         count(*) filter (where status in ('pending', 'verifying')
                            and created_at < now() - interval '48 hours'),
         count(*) filter (where status = 'active'),
         count(*)
    into v_failed, v_stale, v_active, v_total
    from public.site_domains where status not in ('detached', 'expired');
  if v_total = 0 then
    v_status := 'unknown';
    v_detail := 'Aucun domaine rattaché pour l''instant.';
  elsif v_failed > 0 then
    v_status := 'degraded';
    v_detail := format('%s domaine(s) en échec de vérification, %s actif(s).', v_failed, v_active);
  elsif v_stale > 0 then
    v_status := 'degraded';
    v_detail := format('%s domaine(s) en attente depuis plus de 48 h, %s actif(s).',
                       v_stale, v_active);
  else
    v_status := 'healthy';
    v_detail := format('%s domaine(s) actif(s), aucun en échec.', v_active);
  end if;
  update public.system_health
     set status = v_status, detail = v_detail, observed_at = now()
   where key = 'domain_verification';

  -- Sauvegarde : réussie il y a plus de 36 h, elle n'est plus « à jour ».
  update public.system_health
     set status = 'degraded',
         detail = 'Dernière sauvegarde réussie le '
                  || to_char(observed_at at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI')
                  || ' : aucune depuis plus de 36 h.'
   where key = 'backups' and status = 'healthy'
     and observed_at < now() - interval '36 hours';

  -- Tâches périodiques : un indicateur « sain » dont la tâche ne tourne plus
  -- devient « dégradé ». La date de la dernière exécution réelle est gardée.
  for v_row in
    select key, observed_at,
           case key when 'analytics_rollup' then interval '2 hours'
                    else interval '30 minutes' end as tolerance,
           case key when 'analytics_rollup' then 'toutes les heures'
                    else 'toutes les 5 minutes' end as cadence
      from public.system_health
     where key in ('scheduled_publishing', 'deployment_sync', 'site_monitoring',
                   'analytics_rollup')
       and status in ('healthy', 'not_configured')
       and observed_at is not null
  loop
    if v_row.observed_at < now() - v_row.tolerance then
      update public.system_health
         set status = 'degraded',
             detail = 'Dernière exécution le '
                      || to_char(v_row.observed_at at time zone 'Europe/Paris',
                                 'DD/MM/YYYY à HH24:MI')
                      || ' (prévue ' || v_row.cadence || ').'
       where key = v_row.key;
    end if;
  end loop;
end;
$$;

comment on function app.refresh_system_health() is
  'Derive l''etat reel des indicateurs de system_health depuis les journaux (webhooks, '
  'e-mails, domaines, dernieres executions). Planifiee toutes les 10 minutes par pg_cron.';

revoke all on function app.refresh_system_health() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
--  Sauvegarde quotidienne : son résultat, inscrit par la tâche elle-même
-- -----------------------------------------------------------------------------
create or replace function app.record_backup_result(p_ok boolean, p_detail text default null)
returns void
language sql
security definer
set search_path = public, app, pg_catalog
as $$
  update public.system_health
     set status = case when p_ok then 'healthy' else 'failing' end,
         detail = coalesce(
           nullif(left(btrim(p_detail), 300), ''),
           case when p_ok then 'Export chiffré quotidien réussi, conservé 30 jours.'
                else 'La dernière sauvegarde a échoué.' end),
         observed_at = now()
   where key = 'backups';
$$;

comment on function app.record_backup_result(boolean, text) is
  'Appelee par la sauvegarde quotidienne (.github/workflows/backup.yml) avec son resultat.';

revoke all on function app.record_backup_result(boolean, text) from public, anon, authenticated;

update public.system_health
   set label  = 'Sauvegardes de la base',
       status = case when observed_at is null then 'not_configured' else status end,
       detail = case when observed_at is null
                     then 'Export chiffré quotidien par GitHub Actions (l''offre gratuite de '
                          || 'Supabase n''en fait pas). En attente de la première exécution.'
                     else detail end
 where key = 'backups';

update public.system_health
   set label = 'Domaines des sites'
 where key = 'domain_verification';

-- -----------------------------------------------------------------------------
--  Tâches planifiées par la base : ce que l'équipe doit voir pour les réparer
-- -----------------------------------------------------------------------------
--  Réservé à l'équipe. Dit si chaque tâche `pg_cron` est active, quand elle a
--  tourné pour la dernière fois et avec quel résultat, et si les deux secrets
--  Vault de la tâche de fond existent — leur PRÉSENCE seulement, jamais leur
--  valeur. Sur un PostgreSQL sans pg_cron ni Vault : listes vides.
create or replace function app.scheduler_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_jobs  jsonb := '[]'::jsonb;
  v_url   boolean := false;
  v_secret boolean := false;
begin
  if not app.is_platform_staff() then
    return null;
  end if;

  if to_regclass('cron.job') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
               'lastStatus', r.status, 'lastRunAt', r.start_time,
               'lastMessage', left(r.return_message, 200))
             order by j.jobname), '[]'::jsonb)
        from cron.job j
        left join lateral (
          select d.status, d.start_time, d.return_message
            from cron.job_run_details d
           where d.jobid = j.jobid
           order by d.start_time desc limit 1) r on true
       where j.jobname like 'nemasus-%'$q$ into v_jobs;
  end if;

  if to_regclass('vault.decrypted_secrets') is not null then
    execute $q$select exists (select 1 from vault.secrets
                                where name in ('nemasus_platform_url', 'stax_platform_url'))$q$
       into v_url;
    execute $q$select exists (select 1 from vault.secrets
                                where name in ('nemasus_cron_secret', 'stax_cron_secret'))$q$
       into v_secret;
  end if;

  return jsonb_build_object(
    'jobs', v_jobs,
    'vault', jsonb_build_object('platformUrl', v_url, 'cronSecret', v_secret),
    'vaultAvailable', to_regclass('vault.decrypted_secrets') is not null,
    'cronAvailable', to_regclass('cron.job') is not null);
end;
$$;

revoke all on function app.scheduler_overview() from public, anon, authenticated;

create or replace function public.scheduler_overview()
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.scheduler_overview();
$$;

revoke all on function public.scheduler_overview() from public, anon;
grant execute on function public.scheduler_overview() to authenticated;

select app.refresh_system_health();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$select cron.unschedule(jobid) from cron.job
                   where jobname = 'nemasus-system-health'$cron$;
    execute $cron$select cron.schedule('nemasus-system-health', '*/10 * * * *',
                                       'select app.refresh_system_health()')$cron$;
  end if;
end;
$$;

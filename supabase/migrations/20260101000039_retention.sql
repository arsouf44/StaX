-- =============================================================================
--  StaX — 0039 · Durees de conservation appliquees, pas seulement annoncees
--
--  La politique de confidentialite et le registre des traitements annoncent des
--  durees de conservation (RGPD, article 5.1.e). Jusqu'ici, rien ne les
--  appliquait : les journaux grossissaient indefiniment. Cette fonction purge
--  ce qui a depasse sa duree, table par table, avec les durees exactes du
--  registre (docs/REGISTRE_TRAITEMENTS.md) :
--
--    analytics_events       30 jours     (evenements unitaires de mesure)
--    daily_site_metrics     25 mois      (agregats)
--    security_events        12 mois      (journaux techniques)
--    email_log              12 mois
--    webhook_events         12 mois
--    rate_limit_counters    1 jour       (compteurs de fenetre glissante)
--    audit_logs             3 ans        (journal d'audit)
--    content_reports        1 an apres la decision
--
--  Les pieces comptables (10 ans) et les donnees des sites clients ne sont PAS
--  concernees : les premieres relevent d'une obligation legale, les secondes
--  appartiennent au client.
-- =============================================================================

-- Les journaux append-only restent immuables pour tout le monde. La seule
-- exception est la purge de conservation, qui l'annonce explicitement pour la
-- duree de SA transaction.
create or replace function app.forbid_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('stax.retention_purge', true), '') = 'on' then
    return old;
  end if;
  raise exception 'Table append-only : % interdit sur %', tg_op, tg_table_name
    using errcode = '42501';
end;
$$;

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

  perform set_config('stax.retention_purge', 'off', true);
  return v_result;
end;
$$;

create or replace function public.apply_retention()
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.apply_retention();
$$;

revoke all on function app.apply_retention() from public, anon, authenticated;
revoke all on function public.apply_retention() from public, anon, authenticated;
grant execute on function public.apply_retention() to service_role;

comment on function public.apply_retention() is
  'Purge quotidienne des donnees ayant depasse leur duree de conservation (registre RGPD).';

-- Planification quotidienne quand pg_cron est disponible (Supabase : extension
-- a activer dans le tableau de bord). Sans lui, la fonction reste appelable par
-- la cle de service, et docs/supabase.md explique comment la planifier.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$select cron.schedule('stax-retention', '17 3 * * *', 'select app.apply_retention()')$cron$;
  end if;
end;
$$;

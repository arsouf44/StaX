-- =============================================================================
--  StaX — 0048 · Surveillance des sites livres, et conservation
--
--  La maintenance mensuelle annonce une surveillance : elle doit exister. Une
--  tache de fond (`/api/cron/sites`) interroge regulierement l'adresse de
--  chaque site livre, en HTTPS, et consigne le resultat ici. Deux echecs
--  consecutifs previennent l'equipe StaX.
--
--  Les journaux de surveillance et les apercus techniques ne sont pas gardes
--  indefiniment : ils rejoignent la purge de conservation (0039).
-- =============================================================================

create table if not exists public.site_health_checks (
  id          uuid primary key default app.uuid_v7(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  url         text not null,
  ok          boolean not null,
  status_code int,
  response_ms int,
  error       text,
  checked_at  timestamptz not null default now(),

  constraint site_health_checks_url_format check (url ~ '^https://'),
  constraint site_health_checks_ms_sane check (response_ms is null or response_ms >= 0)
);

create index if not exists site_health_checks_site_idx
  on public.site_health_checks (site_id, checked_at desc);

alter table public.site_health_checks enable row level security;
alter table public.site_health_checks force row level security;

drop policy if exists site_health_checks_read on public.site_health_checks;
create policy site_health_checks_read on public.site_health_checks
  for select to authenticated
  using (app.is_platform_staff() or app.site_can(site_id, 'content.view'));

revoke insert, update, delete, truncate on public.site_health_checks from anon, authenticated;
grant select on public.site_health_checks to authenticated;
revoke all on public.site_health_checks from anon;

-- Sites livres a verifier : jamais controles, ou pas depuis dix minutes.
create or replace function app.sites_due_for_health_check(p_limit int default 50)
returns table (site_id uuid, url text)
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select s.id,
         coalesce(
           (select 'https://' || d.hostname || '/' from public.site_domains d
             where d.site_id = s.id and d.is_primary and d.status = 'active'
               and d.served_by = 'cloudflare_project' limit 1),
           (select h.production_url from public.site_hosting h
             where h.site_id = s.id and h.status <> 'disconnected' limit 1))
    from public.sites s
   where app.is_service_role()
     and s.architecture = 'external_repository'
     and s.delivered_at is not null
     and s.archived_at is null
     and s.suspended_at is null
     and exists (select 1 from public.site_hosting h
                  where h.site_id = s.id and h.status <> 'disconnected')
     and not exists (select 1 from public.site_health_checks c
                      where c.site_id = s.id and c.checked_at > now() - interval '10 minutes')
   order by (select max(c.checked_at) from public.site_health_checks c where c.site_id = s.id)
            nulls first
   limit greatest(1, least(p_limit, 500));
$$;

create or replace function app.record_site_health(
  p_site        uuid,
  p_url         text,
  p_ok          boolean,
  p_status_code int default null,
  p_response_ms int default null,
  p_error       text default null
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_previous boolean;
  v_site     public.sites%rowtype;
begin
  perform app.require_service_role();
  select ok into v_previous from public.site_health_checks
   where site_id = p_site order by checked_at desc limit 1;

  insert into public.site_health_checks (site_id, url, ok, status_code, response_ms, error)
  values (p_site, p_url, p_ok, p_status_code, p_response_ms, left(p_error, 500));

  -- Deux echecs consecutifs : l'equipe StaX est prevenue, une seule fois par
  -- incident (le premier echec peut etre un simple aleas reseau).
  if not p_ok and v_previous is false then
    if not exists (select 1 from public.site_health_checks
                    where site_id = p_site and checked_at > now() - interval '1 hour'
                      and ok is false
                    offset 2) then
      select * into v_site from public.sites where id = p_site;
      insert into public.notifications
        (recipient_id, organization_id, site_id, type, title, message, link, level)
      select p.id, v_site.organization_id, v_site.id, 'site.health_down',
             'Site injoignable : ' || v_site.name,
             'Deux vérifications consécutives ont échoué sur ' || p_url
               || coalesce(' (' || nullif(left(p_error, 150), '') || ')', '') || '.',
             '/admin/sites/' || v_site.id || '/livraison', 'danger'
        from public.profiles p
       where p.platform_role in ('platform_owner', 'platform_admin', 'support')
         and p.disabled_at is null;
      perform app.write_audit('site.health_down', v_site.organization_id, v_site.id, 'site',
                              v_site.id::text,
                              jsonb_build_object('url', p_url, 'status', p_status_code));
    end if;
  end if;
end;
$$;

create or replace function public.sites_due_for_health_check(p_limit int default 50)
returns table (site_id uuid, url text)
language sql stable security definer set search_path = public, app, pg_catalog as $$
  select * from app.sites_due_for_health_check(p_limit);
$$;

create or replace function public.record_site_health(
  p_site uuid, p_url text, p_ok boolean, p_status_code int default null,
  p_response_ms int default null, p_error text default null)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_site_health(p_site, p_url, p_ok, p_status_code, p_response_ms, p_error);
$$;

revoke all on function app.sites_due_for_health_check(int) from public, anon, authenticated;
revoke all on function app.record_site_health(uuid, text, boolean, int, int, text)
  from public, anon, authenticated;
revoke all on function public.sites_due_for_health_check(int) from public, anon, authenticated;
revoke all on function public.record_site_health(uuid, text, boolean, int, int, text)
  from public, anon, authenticated;
grant execute on function public.sites_due_for_health_check(int) to service_role;
grant execute on function public.record_site_health(uuid, text, boolean, int, int, text)
  to service_role;

-- -----------------------------------------------------------------------------
--  Conservation (reprise de 0039, completee)
-- -----------------------------------------------------------------------------
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

  -- Surveillance : 90 jours d'historique suffisent a documenter un incident.
  delete from public.site_health_checks where checked_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('site_health_checks', v_count);

  -- Apercus : un build d'apercu n'a plus d'interet apres 90 jours. Les
  -- deploiements de PRODUCTION sont conserves : ils documentent les versions.
  delete from public.site_deployments
   where environment = 'preview'
     and created_at < now() - interval '90 days'
     and status not in ('queued', 'building', 'deploying');
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('preview_deployments', v_count);

  perform set_config('stax.retention_purge', 'off', true);
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
--  Indicateurs de sante : etat reel uniquement, « inconnu » tant que non mesure
-- -----------------------------------------------------------------------------
insert into public.system_health (key, label, status, detail) values
  ('github_app', 'Application GitHub', 'unknown', 'En attente de la première vérification.'),
  ('cloudflare_sites', 'API Cloudflare des sites', 'unknown',
   'En attente de la première vérification.'),
  ('deployment_sync', 'Suivi des déploiements', 'unknown', 'En attente de la première exécution.'),
  ('site_monitoring', 'Surveillance des sites livrés', 'unknown',
   'En attente de la première exécution.')
on conflict (key) do nothing;

update public.system_health
   set label = 'Publications programmées',
       detail = 'Exécutées par la tâche de fond /api/cron/sites. En attente de la première exécution.'
 where key = 'scheduled_publishing';

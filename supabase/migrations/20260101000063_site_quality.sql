-- =============================================================================
--  Nemasus — 0063 · Bilan de santé des sites livrés
--
--  La maintenance mensuelle promet « hébergement, sauvegardes, surveillance ».
--  La surveillance vérifiait qu'un site répond ; le client n'en voyait qu'une
--  ligne (« répond normalement »). Il voit désormais ce qui justifie ce qu'il
--  paie, chiffres réels à l'appui :
--
--  1. Disponibilité sur 30 jours, calculée sur les vérifications réelles
--     (toutes les 10 minutes quand la tâche de fond tourne), jour par jour,
--     avec le temps de réponse moyen. `site_availability()` ne renvoie rien
--     à qui ne peut pas voir le site.
--  2. Bilan qualité hebdomadaire de la page d'accueil (HTTPS, référencement,
--     mobile, partage social, accessibilité, ressources non chiffrées) :
--     `site_quality_reports`, écrit par la tâche de fond (clé de service),
--     lisible par le client et l'équipe. Les 26 derniers bilans (six mois)
--     sont conservés par site.
-- =============================================================================

create table if not exists public.site_quality_reports (
  id          uuid primary key default app.uuid_v7(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  url         text not null,
  final_url   text,
  score       smallint not null,
  max_score   smallint not null,
  response_ms int,
  page_bytes  int,
  checks      jsonb not null default '[]'::jsonb,
  checked_at  timestamptz not null default now(),

  constraint site_quality_reports_url_format check (url ~ '^https://'),
  constraint site_quality_reports_score_range check (score >= 0 and score <= max_score
                                                     and max_score between 1 and 200),
  constraint site_quality_reports_checks_array check (jsonb_typeof(checks) = 'array')
);

create index if not exists site_quality_reports_site_idx
  on public.site_quality_reports (site_id, checked_at desc);

alter table public.site_quality_reports enable row level security;
alter table public.site_quality_reports force row level security;

drop policy if exists site_quality_reports_read on public.site_quality_reports;
create policy site_quality_reports_read on public.site_quality_reports
  for select to authenticated
  using (app.is_platform_staff() or app.site_can(site_id, 'content.view'));

revoke all on public.site_quality_reports from anon;
revoke insert, update, delete, truncate on public.site_quality_reports from authenticated;
grant select on public.site_quality_reports to authenticated;

comment on table public.site_quality_reports is
  'Bilans qualite de la page d''accueil des sites livres (HTTPS, referencement, mobile, '
  'partage, accessibilite). Ecrits par la tache de fond, lus par le client et l''equipe.';

-- -----------------------------------------------------------------------------
--  Sites à contrôler : livrés, joignables, sans bilan depuis sept jours
-- -----------------------------------------------------------------------------
create or replace function app.sites_due_for_quality_audit(p_limit int default 5)
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
     and not exists (select 1 from public.site_quality_reports r
                      where r.site_id = s.id and r.checked_at > now() - interval '7 days')
   order by (select max(r.checked_at) from public.site_quality_reports r where r.site_id = s.id)
            nulls first
   limit greatest(1, least(p_limit, 50));
$$;

create or replace function app.record_site_quality(
  p_site        uuid,
  p_url         text,
  p_final_url   text,
  p_score       int,
  p_max_score   int,
  p_response_ms int,
  p_page_bytes  int,
  p_checks      jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_id uuid;
begin
  perform app.require_service_role();

  insert into public.site_quality_reports
    (site_id, url, final_url, score, max_score, response_ms, page_bytes, checks)
  values (p_site, p_url, left(p_final_url, 500), p_score, p_max_score, p_response_ms,
          p_page_bytes, coalesce(p_checks, '[]'::jsonb))
  returning id into v_id;

  -- Six mois d'historique par site suffisent pour voir une tendance.
  delete from public.site_quality_reports
   where site_id = p_site
     and id not in (select id from public.site_quality_reports
                     where site_id = p_site order by checked_at desc limit 26);
  return v_id;
end;
$$;

create or replace function public.sites_due_for_quality_audit(p_limit int default 5)
returns table (site_id uuid, url text)
language sql stable security definer set search_path = public, app, pg_catalog as $$
  select * from app.sites_due_for_quality_audit(p_limit);
$$;

create or replace function public.record_site_quality(
  p_site uuid, p_url text, p_final_url text, p_score int, p_max_score int,
  p_response_ms int, p_page_bytes int, p_checks jsonb)
returns uuid language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_site_quality(p_site, p_url, p_final_url, p_score, p_max_score,
                                 p_response_ms, p_page_bytes, p_checks);
$$;

revoke all on function app.sites_due_for_quality_audit(int) from public, anon, authenticated;
revoke all on function app.record_site_quality(uuid, text, text, int, int, int, int, jsonb)
  from public, anon, authenticated;
revoke all on function public.sites_due_for_quality_audit(int) from public, anon, authenticated;
revoke all on function public.record_site_quality(uuid, text, text, int, int, int, int, jsonb)
  from public, anon, authenticated;
grant execute on function public.sites_due_for_quality_audit(int) to service_role;
grant execute on function public.record_site_quality(uuid, text, text, int, int, int, int, jsonb)
  to service_role;

-- -----------------------------------------------------------------------------
--  Disponibilité d'un site : jour par jour, sur les vérifications réelles
-- -----------------------------------------------------------------------------
create or replace function app.site_availability(p_site uuid, p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_days   int := greatest(1, least(coalesce(p_days, 30), 90));
  v_tz     text;
  v_result jsonb;
begin
  if not (app.is_platform_staff() or app.site_can(p_site, 'content.view')) then
    return null;
  end if;

  select case when exists (select 1 from pg_timezone_names n where n.name = s.timezone)
              then s.timezone else 'Europe/Paris' end
    into v_tz
    from public.sites s where s.id = p_site;
  if v_tz is null then
    return null;
  end if;

  with checks as (
    select (c.checked_at at time zone v_tz)::date as day, c.ok, c.response_ms, c.checked_at
      from public.site_health_checks c
     where c.site_id = p_site
       and c.checked_at > now() - make_interval(days => v_days)
  ),
  per_day as (
    select day, count(*) as total, count(*) filter (where ok) as up
      from checks group by day
  )
  select jsonb_build_object(
           'days', v_days,
           'checks', (select count(*) from checks),
           'up', (select count(*) filter (where ok) from checks),
           'uptimeBps', (select case when count(*) = 0 then null
                                     else round(10000.0 * count(*) filter (where ok) / count(*))::int
                                end from checks),
           'avgResponseMs', (select round(avg(response_ms))::int from checks where ok),
           'lastDownAt', (select max(checked_at) from checks where not ok),
           'series', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'total', total,
                                                                   'up', up) order by day)
                                 from per_day), '[]'::jsonb))
    into v_result;
  return v_result;
end;
$$;

comment on function app.site_availability(uuid, int) is
  'Disponibilite reelle d''un site (verifications HTTPS), jour par jour dans son fuseau. '
  'null pour qui ne peut pas voir le site.';

revoke all on function app.site_availability(uuid, int) from public, anon, authenticated;

create or replace function public.site_availability(p_site uuid, p_days int default 30)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.site_availability(p_site, p_days);
$$;

revoke all on function public.site_availability(uuid, int) from public, anon;
grant execute on function public.site_availability(uuid, int) to authenticated;

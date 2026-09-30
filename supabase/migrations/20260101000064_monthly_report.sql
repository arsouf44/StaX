-- =============================================================================
--  Nemasus — 0064 · Le bilan mensuel du site, envoyé au client
--
--  Un client qui paie une maintenance chaque mois doit voir, chaque mois, ce
--  qu'elle lui apporte — sans avoir à se connecter. Le 1er du mois, la tâche
--  de fond envoie aux responsables de chaque site livré (propriétaires et
--  administrateurs de l'organisation) le bilan du mois écoulé : visiteurs,
--  prises de contact, commandes, disponibilité, bilan qualité, pages et
--  sources principales, avec la comparaison au mois précédent.
--
--  - Chaque personne peut refuser ce bilan (`profiles.monthly_report_opt_in`,
--    dans « Mon compte ») ; il est activé par défaut : c'est l'information
--    sur un service payé, pas de la prospection.
--  - `site_monthly_reports` rend l'envoi idempotent (un bilan par site et par
--    mois, jamais deux) et en garde la trace, lisible par le client.
--  - Les chiffres sont ceux de la base (statistiques agrégées, vérifications
--    HTTPS, bilans qualité) : rien n'est estimé.
-- =============================================================================

alter table public.profiles
  add column if not exists monthly_report_opt_in boolean not null default true;

comment on column public.profiles.monthly_report_opt_in is
  'Recevoir le bilan mensuel des sites dont on est proprietaire ou administrateur.';

create table if not exists public.site_monthly_reports (
  id          uuid primary key default app.uuid_v7(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  month       date not null,
  status      text not null,
  recipients  int not null default 0,
  summary     jsonb not null default '{}'::jsonb,
  error       text,
  created_at  timestamptz not null default now(),

  constraint site_monthly_reports_one_per_month unique (site_id, month),
  constraint site_monthly_reports_month_start check (month = date_trunc('month', month)::date),
  constraint site_monthly_reports_status_valid check (status in ('sent', 'skipped', 'failed'))
);

alter table public.site_monthly_reports enable row level security;
alter table public.site_monthly_reports force row level security;

drop policy if exists site_monthly_reports_read on public.site_monthly_reports;
create policy site_monthly_reports_read on public.site_monthly_reports
  for select to authenticated
  using (app.is_platform_staff() or app.site_can(site_id, 'content.view'));

revoke all on public.site_monthly_reports from anon;
revoke insert, update, delete, truncate on public.site_monthly_reports from authenticated;
grant select on public.site_monthly_reports to authenticated;

-- -----------------------------------------------------------------------------
--  Sites dont le bilan du mois n'est pas encore parti
-- -----------------------------------------------------------------------------
create or replace function app.sites_due_for_monthly_report(p_month date, p_limit int default 10)
returns table (site_id uuid)
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select s.id
    from public.sites s
   where app.is_service_role()
     and p_month = date_trunc('month', p_month)::date
     and s.delivered_at is not null
     and s.delivered_at < (p_month + interval '1 month')
     and s.archived_at is null
     and s.suspended_at is null
     and not s.is_demo
     and not exists (select 1 from public.site_monthly_reports r
                      where r.site_id = s.id and r.month = p_month)
   order by s.delivered_at
   limit greatest(1, least(p_limit, 100));
$$;

-- -----------------------------------------------------------------------------
--  Contenu du bilan : chiffres du mois, du mois précédent, destinataires
-- -----------------------------------------------------------------------------
create or replace function app.monthly_report_payload(p_site uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site     public.sites%rowtype;
  v_org      text;
  v_end      date := (p_month + interval '1 month')::date;
  v_previous date := (p_month - interval '1 month')::date;
  v_current  jsonb;
  v_before   jsonb;
  v_health   jsonb;
  v_quality  jsonb;
  v_pages    jsonb;
  v_sources  jsonb;
  v_people   jsonb;
begin
  perform app.require_service_role();
  select * into v_site from public.sites where id = p_site;
  if not found then
    return null;
  end if;
  select name into v_org from public.organizations where id = v_site.organization_id;

  select jsonb_build_object(
           'visitors', coalesce(sum(visitors), 0), 'pageviews', coalesce(sum(pageviews), 0),
           'contacts', coalesce(sum(form_submissions + bookings + orders), 0),
           'orders', coalesce(sum(orders), 0), 'revenueCents', coalesce(sum(revenue_cents), 0),
           'days', count(*))
    into v_current
    from public.daily_site_metrics
   where site_id = p_site and day >= p_month and day < v_end;

  select jsonb_build_object(
           'visitors', coalesce(sum(visitors), 0),
           'contacts', coalesce(sum(form_submissions + bookings + orders), 0),
           'days', count(*))
    into v_before
    from public.daily_site_metrics
   where site_id = p_site and day >= v_previous and day < p_month;

  select jsonb_build_object(
           'checks', count(*),
           'uptimeBps', case when count(*) = 0 then null
                             else round(10000.0 * count(*) filter (where ok) / count(*))::int end,
           'avgResponseMs', round(avg(response_ms) filter (where ok))::int)
    into v_health
    from public.site_health_checks
   where site_id = p_site and checked_at >= p_month and checked_at < v_end;

  select jsonb_build_object('score', score, 'maxScore', max_score, 'checkedAt', checked_at)
    into v_quality
    from public.site_quality_reports
   where site_id = p_site and checked_at < v_end
   order by checked_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', views)
                            order by views desc, path), '[]'::jsonb)
    into v_pages
    from (select page ->> 'path' as path, sum((page ->> 'views')::int) as views
            from public.daily_site_metrics m,
                 jsonb_array_elements(case when jsonb_typeof(m.breakdown -> 'top_pages') = 'array'
                                           then m.breakdown -> 'top_pages' else '[]' end) page
           where m.site_id = p_site and m.day >= p_month and m.day < v_end
           group by 1 order by 2 desc, 1 limit 3) t;

  select coalesce(jsonb_agg(jsonb_build_object('source', source, 'visits', visits)
                            order by visits desc, source), '[]'::jsonb)
    into v_sources
    from (select src ->> 'source' as source, sum((src ->> 'visits')::int) as visits
            from public.daily_site_metrics m,
                 jsonb_array_elements(case when jsonb_typeof(m.breakdown -> 'sources') = 'array'
                                           then m.breakdown -> 'sources' else '[]' end) src
           where m.site_id = p_site and m.day >= p_month and m.day < v_end
           group by 1 order by 2 desc, 1 limit 3) t;

  select coalesce(jsonb_agg(jsonb_build_object('email', p.email, 'firstName', p.first_name)
                            order by p.email), '[]'::jsonb)
    into v_people
    from public.organization_members om
    join public.profiles p on p.id = om.user_id
   where om.organization_id = v_site.organization_id
     and om.role in ('owner', 'admin')
     and p.disabled_at is null
     and p.monthly_report_opt_in
     and p.email is not null
     and p.platform_role is null;

  return jsonb_build_object(
    'siteId', v_site.id, 'siteName', v_site.name, 'organizationName', v_org,
    'month', p_month, 'deliveredAt', v_site.delivered_at,
    'current', v_current, 'previous', v_before, 'health', v_health, 'quality', v_quality,
    'topPages', v_pages, 'topSources', v_sources, 'recipients', v_people);
end;
$$;

create or replace function app.record_monthly_report(
  p_site uuid, p_month date, p_status text, p_recipients int, p_summary jsonb, p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  perform app.require_service_role();
  insert into public.site_monthly_reports (site_id, month, status, recipients, summary, error)
  values (p_site, p_month, p_status, greatest(coalesce(p_recipients, 0), 0),
          coalesce(p_summary, '{}'::jsonb), left(p_error, 500))
  on conflict (site_id, month) do nothing;
  return found;
end;
$$;

create or replace function public.sites_due_for_monthly_report(p_month date, p_limit int default 10)
returns table (site_id uuid)
language sql stable security definer set search_path = public, app, pg_catalog as $$
  select * from app.sites_due_for_monthly_report(p_month, p_limit);
$$;

create or replace function public.monthly_report_payload(p_site uuid, p_month date)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.monthly_report_payload(p_site, p_month);
$$;

create or replace function public.record_monthly_report(
  p_site uuid, p_month date, p_status text, p_recipients int, p_summary jsonb, p_error text)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_monthly_report(p_site, p_month, p_status, p_recipients, p_summary, p_error);
$$;

revoke all on function app.sites_due_for_monthly_report(date, int) from public, anon, authenticated;
revoke all on function app.monthly_report_payload(uuid, date) from public, anon, authenticated;
revoke all on function app.record_monthly_report(uuid, date, text, int, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.sites_due_for_monthly_report(date, int)
  from public, anon, authenticated;
revoke all on function public.monthly_report_payload(uuid, date) from public, anon, authenticated;
revoke all on function public.record_monthly_report(uuid, date, text, int, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.sites_due_for_monthly_report(date, int) to service_role;
grant execute on function public.monthly_report_payload(uuid, date) to service_role;
grant execute on function public.record_monthly_report(uuid, date, text, int, jsonb, text)
  to service_role;

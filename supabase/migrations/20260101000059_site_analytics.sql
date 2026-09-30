-- =============================================================================
--  Nemasus — 0059 · Statistiques des sites : des chiffres réellement calculés
--
--  Constat (audit du 2026-09-30) : chaque page vue incrémentait
--  `daily_site_metrics.pageviews`, mais RIEN ne calculait le reste. Les
--  visiteurs, les pages les plus consultées, les sources, les commandes et le
--  chiffre encaissé restaient à zéro pour toujours : la page Statistiques du
--  client affichait « 0 visiteur » à côté de centaines de pages vues. La
--  fonction d'agrégation existait en TypeScript (`rollupDay`) et n'était
--  appelée nulle part ; l'indicateur « Agrégation des statistiques » de la page
--  d'état restait « en attente de la première exécution ».
--
--  1. `app.rollup_site_metrics(jour)` recalcule, pour chaque site actif ce
--     jour-là (dans SON fuseau horaire) : visiteurs distincts, pages vues,
--     pages les plus vues, sources, appareils, pays, messages reçus (hors
--     indésirables), réservations, commandes payées et montant encaissé.
--     Idempotente : la relancer donne le même résultat.
--  2. `app.rollup_recent_site_metrics()` le fait pour les jours encore
--     ouverts ; `pg_cron` l'exécute chaque heure. L'état réel est inscrit dans
--     `system_health` (réussite comme échec).
--  3. La mesure enregistre désormais le type d'appareil (téléphone, tablette,
--     ordinateur) — jamais le navigateur exact ni l'agent utilisateur.
--
--  Aucun cookie, aucune adresse IP : rien ne change à ce que la mesure
--  collecte sur le visiteur, seulement à ce qu'on en calcule.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Enregistrement d'une vue : type d'appareil en plus
-- -----------------------------------------------------------------------------
--  Le nouveau paramètre a une valeur par défaut : le moteur des sites déjà
--  déployé, qui appelle la fonction avec six arguments nommés, continue de
--  fonctionner sans être redéployé.
drop function if exists public.record_page_view(uuid, text, text, text, char, text);
drop function if exists app.record_page_view(uuid, text, text, text, char, text);

create function app.record_page_view(
  p_site          uuid,
  p_path          text,
  p_visitor_hash  text,
  p_referrer_host text default null,
  p_country       char(2) default null,
  p_kind          text default 'pageview',
  p_device        text default null
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_enabled boolean;
begin
  select coalesce(ss.analytics_enabled, true) into v_enabled
    from public.site_settings ss where ss.site_id = p_site;

  -- Un client qui a desactive la mesure d'audience n'en collecte aucune.
  if v_enabled is distinct from true then
    return;
  end if;

  insert into public.analytics_events
    (site_id, visitor_hash, kind, path, referrer_host, country, device)
  values (
    p_site, p_visitor_hash, p_kind, left(p_path, 512),
    nullif(left(regexp_replace(lower(btrim(p_referrer_host)), '^www\.', ''), 120), ''),
    upper(p_country),
    case when p_device in ('mobile', 'tablet', 'desktop') then p_device end
  );

  insert into public.daily_site_metrics (site_id, day, pageviews, form_submissions, bookings)
  values (
    p_site,
    (now() at time zone coalesce((select timezone from public.sites where id = p_site), 'Europe/Paris'))::date,
    case when p_kind = 'pageview' then 1 else 0 end,
    case when p_kind = 'form_submit' then 1 else 0 end,
    case when p_kind = 'booking' then 1 else 0 end
  )
  on conflict (site_id, day) do update set
    pageviews        = public.daily_site_metrics.pageviews + excluded.pageviews,
    form_submissions = public.daily_site_metrics.form_submissions + excluded.form_submissions,
    bookings         = public.daily_site_metrics.bookings + excluded.bookings,
    updated_at       = now();
end;
$$;

revoke all on function app.record_page_view(uuid, text, text, text, char, text, text)
  from public, anon, authenticated;

create function public.record_page_view(
  p_site uuid, p_path text, p_visitor_hash text,
  p_referrer_host text default null, p_country char(2) default null,
  p_kind text default 'pageview', p_device text default null
) returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_page_view(p_site, p_path, p_visitor_hash, p_referrer_host, p_country,
                              p_kind, p_device);
$$;

revoke all on function public.record_page_view(uuid, text, text, text, char, text, text)
  from public, anon, authenticated;
grant execute on function public.record_page_view(uuid, text, text, text, char, text, text)
  to service_role;

-- -----------------------------------------------------------------------------
--  2. Agrégation d'une journée
-- -----------------------------------------------------------------------------
create or replace function app.rollup_site_metrics(p_day date)
returns integer
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_count integer := 0;
begin
  -- Les événements bruts sont purgés à 30 jours (apply_retention) : recalculer
  -- une journée plus ancienne effacerait des chiffres justes. On s'y refuse.
  if p_day is null or p_day < current_date - 28 or p_day > current_date + 1 then
    return 0;
  end if;

  with zone as (
    -- Fuseau du site ; un fuseau inconnu retombe sur Paris plutôt que d'échouer.
    select s.id as site_id,
           case when exists (select 1 from pg_timezone_names n where n.name = s.timezone)
                then s.timezone else 'Europe/Paris' end as tz
      from public.sites s
  ),
  ev as (
    select e.site_id, e.kind, e.path, e.visitor_hash, e.session_hash, e.device, e.country,
           nullif(regexp_replace(lower(coalesce(e.utm_source, e.referrer_host, '')),
                                 '^www\.', ''), '') as source
      from public.analytics_events e
      join zone z on z.site_id = e.site_id
     where e.created_at >= (p_day - 1)::timestamptz
       and e.created_at <  (p_day + 2)::timestamptz
       and (e.created_at at time zone z.tz)::date = p_day
  ),
  traffic as (
    select site_id,
           count(*) filter (where kind = 'pageview') as pageviews,
           count(distinct visitor_hash) filter (where kind = 'pageview') as visitors,
           count(distinct session_hash)
             filter (where kind = 'pageview' and session_hash is not null) as sessions
      from ev
     group by site_id
  ),
  page_rank as (
    select site_id, path, count(*) as views,
           row_number() over (partition by site_id order by count(*) desc, path) as rn
      from ev where kind = 'pageview'
     group by site_id, path
  ),
  pages as (
    select site_id,
           jsonb_agg(jsonb_build_object('path', path, 'views', views) order by views desc, path)
             as top_pages
      from page_rank where rn <= 10
     group by site_id
  ),
  source_rank as (
    select site_id, source, count(*) as visits,
           row_number() over (partition by site_id order by count(*) desc, source) as rn
      from ev where kind = 'pageview' and source is not null
     group by site_id, source
  ),
  sources as (
    select site_id,
           jsonb_agg(jsonb_build_object('source', source, 'visits', visits)
                     order by visits desc, source) as sources
      from source_rank where rn <= 10
     group by site_id
  ),
  device_count as (
    select site_id, device, count(distinct visitor_hash) as n
      from ev where kind = 'pageview' and device is not null
     group by site_id, device
  ),
  devices as (
    select site_id, jsonb_object_agg(device, n) as devices from device_count group by site_id
  ),
  country_rank as (
    select site_id, country, count(distinct visitor_hash) as n,
           row_number() over (partition by site_id order by count(distinct visitor_hash) desc,
                              country) as rn
      from ev where kind = 'pageview' and country is not null
     group by site_id, country
  ),
  countries as (
    select site_id,
           jsonb_agg(jsonb_build_object('country', country, 'visitors', n)
                     order by n desc, country) as countries
      from country_rank where rn <= 10
     group by site_id
  ),
  -- Prises de contact lues dans leurs tables : c'est la source de vérité,
  -- y compris pour les sites dont la mesure d'audience est désactivée.
  submissions as (
    select f.site_id, count(*) as n
      from public.form_submissions f join zone z on z.site_id = f.site_id
     where f.created_at >= (p_day - 1)::timestamptz and f.created_at < (p_day + 2)::timestamptz
       and (f.created_at at time zone z.tz)::date = p_day
       and f.status <> 'spam'
     group by f.site_id
  ),
  booked as (
    select b.site_id, count(*) as n
      from public.bookings b join zone z on z.site_id = b.site_id
     where b.created_at >= (p_day - 1)::timestamptz and b.created_at < (p_day + 2)::timestamptz
       and (b.created_at at time zone z.tz)::date = p_day
     group by b.site_id
  ),
  sold as (
    select o.site_id, count(*) as n, coalesce(sum(o.total_cents), 0) as revenue
      from public.shop_orders o join zone z on z.site_id = o.site_id
     where o.paid_at >= (p_day - 1)::timestamptz and o.paid_at < (p_day + 2)::timestamptz
       and (o.paid_at at time zone z.tz)::date = p_day
       and o.status in ('paid', 'preparing', 'fulfilled')
     group by o.site_id
  ),
  candidates as (
    select site_id from traffic
    union select site_id from submissions
    union select site_id from booked
    union select site_id from sold
    union select site_id from public.daily_site_metrics where day = p_day
  )
  insert into public.daily_site_metrics as m
    (site_id, day, pageviews, visitors, sessions, form_submissions, bookings, orders,
     revenue_cents, breakdown, updated_at)
  select c.site_id, p_day,
         coalesce(t.pageviews, 0), coalesce(t.visitors, 0), coalesce(t.sessions, 0),
         coalesce(s.n, 0), coalesce(b.n, 0), coalesce(o.n, 0), coalesce(o.revenue, 0),
         jsonb_build_object(
           'top_pages', coalesce(p.top_pages, '[]'::jsonb),
           'sources',   coalesce(so.sources, '[]'::jsonb),
           'devices',   coalesce(d.devices, '{}'::jsonb),
           'countries', coalesce(co.countries, '[]'::jsonb),
           'computed_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         ),
         now()
    from candidates c
    left join traffic t      on t.site_id = c.site_id
    left join pages p        on p.site_id = c.site_id
    left join sources so     on so.site_id = c.site_id
    left join devices d      on d.site_id = c.site_id
    left join countries co   on co.site_id = c.site_id
    left join submissions s  on s.site_id = c.site_id
    left join booked b       on b.site_id = c.site_id
    left join sold o         on o.site_id = c.site_id
  on conflict (site_id, day) do update set
    -- Une vue enregistrée PENDANT le calcul a déjà incrémenté le compteur :
    -- on ne la perd pas. Les événements n'étant jamais supprimés dans la
    -- fenêtre recalculée, le recomptage ne peut pas être inférieur au réel.
    pageviews        = greatest(m.pageviews, excluded.pageviews),
    visitors         = excluded.visitors,
    sessions         = excluded.sessions,
    form_submissions = excluded.form_submissions,
    bookings         = excluded.bookings,
    orders           = excluded.orders,
    revenue_cents    = excluded.revenue_cents,
    breakdown        = excluded.breakdown,
    updated_at       = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function app.rollup_site_metrics(date) is
  'Recalcule daily_site_metrics pour une journee (fuseau de chaque site) : visiteurs '
  'distincts, pages, sources, appareils, pays, contacts, commandes, encaissements. '
  'Idempotente ; refuse les journees dont les evenements bruts sont purges.';

revoke all on function app.rollup_site_metrics(date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
--  3. Les journées encore ouvertes, chaque heure, avec un état observable
-- -----------------------------------------------------------------------------
create or replace function app.rollup_recent_site_metrics()
returns integer
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_total integer := 0;
  v_day   date;
begin
  -- De J-2 à J+1 (UTC) : couvre « hier » et « aujourd'hui » dans tous les
  -- fuseaux, de la Polynésie à la Nouvelle-Calédonie.
  for v_day in
    select generate_series(current_date - 2, current_date + 1, interval '1 day')::date
  loop
    v_total := v_total + app.rollup_site_metrics(v_day);
  end loop;

  update public.system_health
     set status = 'healthy',
         detail = format('Calcul horaire réussi : %s journée(s) de site recalculée(s).', v_total),
         observed_at = now()
   where key = 'analytics_rollup';
  return v_total;
exception when others then
  update public.system_health
     set status = 'failing',
         detail = left('Le calcul des statistiques a échoué : ' || sqlerrm, 500),
         observed_at = now()
   where key = 'analytics_rollup';
  return -1;
end;
$$;

comment on function app.rollup_recent_site_metrics() is
  'Agrege les journees encore ouvertes (J-2 a J+1) et inscrit le resultat dans '
  'system_health.analytics_rollup. Planifiee chaque heure par pg_cron.';

revoke all on function app.rollup_recent_site_metrics() from public, anon, authenticated;

update public.system_health
   set label  = 'Agrégation des statistiques',
       detail = 'Calculée chaque heure par la base. En attente de la première exécution.'
 where key = 'analytics_rollup';

-- Rattrapage : toutes les journées dont les événements bruts sont conservés.
select app.rollup_site_metrics(d::date)
  from generate_series(current_date - 28, current_date + 1, interval '1 day') d;
select app.rollup_recent_site_metrics();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$select cron.unschedule(jobid) from cron.job
                   where jobname = 'nemasus-analytics-rollup'$cron$;
    execute $cron$select cron.schedule('nemasus-analytics-rollup', '7 * * * *',
                                       'select app.rollup_recent_site_metrics()')$cron$;
  end if;
end;
$$;

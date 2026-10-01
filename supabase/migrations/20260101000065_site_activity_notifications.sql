-- =============================================================================
--  Nemasus — 0065 · Le commerçant est prévenu de ce qui arrive par son site
--
--  Audit du 2026-10-01 : un message laissé par le formulaire d'un site, une
--  demande de réservation, une commande payée n'étaient signalés à personne.
--  Les modèles d'e-mail existaient, mais rien ne les envoyait ; les adresses
--  « Prévenir ces adresses » (réglages du site) et celles d'un formulaire
--  n'étaient lues nulle part. Le commerçant ne l'apprenait qu'en ouvrant son
--  espace.
--
--  - `owner_notified_at` marque chaque message, réservation et commande dont
--    le commerçant a été prévenu : jamais deux fois.
--  - `site_activity_to_notify` liste ce qui reste à signaler (48 heures au
--    plus : au-delà, l'information a perdu son utilité), avec les
--    destinataires : adresses du formulaire, sinon celles des réglages du
--    site, sinon propriétaires et administrateurs de l'organisation.
--  - Le moteur des sites prévient aussitôt après l'enregistrement ; la tâche
--    de fond de la plateforme rattrape ce qui n'a pas pu partir.
--  - Les messages classés indésirables, les sites de démonstration, suspendus
--    ou archivés ne déclenchent rien.
-- =============================================================================

alter table public.form_submissions add column if not exists owner_notified_at timestamptz;
alter table public.bookings add column if not exists owner_notified_at timestamptz;
alter table public.shop_orders add column if not exists owner_notified_at timestamptz;

comment on column public.form_submissions.owner_notified_at is
  'Le commerçant a été prévenu par e-mail de ce message (null : pas encore).';
comment on column public.bookings.owner_notified_at is
  'Le commerçant a été prévenu par e-mail de cette réservation (null : pas encore).';
comment on column public.shop_orders.owner_notified_at is
  'Le commerçant a été prévenu par e-mail de cette commande payée (null : pas encore).';

-- Ce qui précède cette migration n'est pas signalé après coup.
update public.form_submissions set owner_notified_at = created_at
 where owner_notified_at is null and created_at > now() - interval '3 days';
update public.bookings set owner_notified_at = created_at
 where owner_notified_at is null and created_at > now() - interval '3 days';
update public.shop_orders set owner_notified_at = coalesce(paid_at, created_at)
 where owner_notified_at is null and created_at > now() - interval '3 days';

create index if not exists form_submissions_owner_pending_idx
  on public.form_submissions (created_at) where owner_notified_at is null;
create index if not exists bookings_owner_pending_idx
  on public.bookings (created_at) where owner_notified_at is null;
create index if not exists shop_orders_owner_pending_idx
  on public.shop_orders (paid_at) where owner_notified_at is null and paid_at is not null;

-- -----------------------------------------------------------------------------
--  Destinataires des notifications d'un site
-- -----------------------------------------------------------------------------
create or replace function app.site_owner_recipients(p_site uuid, p_form_emails text[] default null)
returns text[]
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_emails text[];
begin
  perform app.require_service_role();
  v_emails := array(select distinct lower(trim(e)) from unnest(coalesce(p_form_emails, '{}')) e
                     where trim(e) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  if coalesce(array_length(v_emails, 1), 0) = 0 then
    select array(select distinct lower(trim(e)) from unnest(coalesce(ss.notification_emails, '{}')) e
                  where trim(e) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
      into v_emails
      from public.site_settings ss
     where ss.site_id = p_site;
  end if;
  if coalesce(array_length(v_emails, 1), 0) = 0 then
    select array(select distinct lower(p.email)
                   from public.sites s
                   join public.organization_members om on om.organization_id = s.organization_id
                   join public.profiles p on p.id = om.user_id
                  where s.id = p_site
                    and om.role in ('owner', 'admin')
                    and p.disabled_at is null
                    and p.platform_role is null
                    and p.email is not null)
      into v_emails;
  end if;
  return coalesce(v_emails[1:5], '{}');
end;
$$;

-- -----------------------------------------------------------------------------
--  Ce qui reste à signaler
-- -----------------------------------------------------------------------------
create or replace function app.site_activity_to_notify(
  p_site uuid default null,
  p_limit int default 20,
  p_min_age_seconds int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_until  timestamptz := now() - make_interval(secs => greatest(coalesce(p_min_age_seconds, 0), 0));
  v_since  timestamptz := now() - interval '48 hours';
  v_limit  int := greatest(1, least(coalesce(p_limit, 20), 100));
  v_items  jsonb;
begin
  perform app.require_service_role();

  with eligible_sites as (
    select s.id, s.name, s.organization_id, s.timezone
      from public.sites s
     where (p_site is null or s.id = p_site)
       and not s.is_demo
       and s.suspended_at is null
       and s.archived_at is null
  ),
  messages as (
    select 'message'::text as kind, fs.id, fs.created_at as happened_at, es.id as site_id,
           es.name as site_name, es.organization_id, es.timezone,
           jsonb_build_object(
             'senderName', coalesce(
               nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
               nullif(trim(concat_ws(' ', fs.data ->> 'prenom', fs.data ->> 'nom')), ''),
               nullif(trim(fs.data ->> 'name'), ''),
               'Un visiteur'),
             'replyTo', coalesce(c.email, (select lower(fs.data ->> ff.name)
                                             from public.form_fields ff
                                            where ff.form_id = fs.form_id and ff.type = 'email'
                                            order by ff.sort_order limit 1)),
             'formName', f.name,
             'excerpt', left(coalesce(
               nullif(trim(fs.data ->> 'message'), ''),
               (select string_agg(fs.data ->> ff.name, ' · ' order by ff.sort_order)
                  from public.form_fields ff
                 where ff.form_id = fs.form_id
                   and ff.type not in ('email', 'tel', 'consent', 'hidden')
                   and nullif(trim(fs.data ->> ff.name), '') is not null),
               ''), 500)
           ) as detail,
           app.site_owner_recipients(es.id, f.notify_emails) as recipients
      from public.form_submissions fs
      join eligible_sites es on es.id = fs.site_id
      join public.forms f on f.id = fs.form_id
      left join public.contacts c on c.id = fs.contact_id
     where fs.owner_notified_at is null
       and fs.status <> 'spam'
       and fs.created_at > v_since
       and fs.created_at <= v_until
  ),
  reservations as (
    select 'booking'::text, b.id, b.created_at, es.id, es.name, es.organization_id, es.timezone,
           jsonb_build_object(
             'customerName', coalesce(nullif(trim(b.customer_name), ''), 'Un client'),
             'replyTo', b.customer_email,
             'startsAt', b.starts_at,
             'partySize', b.party_size,
             'reference', b.reference,
             'serviceName', bs.name,
             'needsAnswer', b.status = 'pending'),
           app.site_owner_recipients(es.id, null)
      from public.bookings b
      join eligible_sites es on es.id = b.site_id
      left join public.booking_services bs on bs.id = b.booking_service_id
     where b.owner_notified_at is null
       and b.status in ('pending', 'confirmed')
       and b.created_at > v_since
       and b.created_at <= v_until
  ),
  orders as (
    select 'order'::text, o.id, o.paid_at, es.id, es.name, es.organization_id, es.timezone,
           jsonb_build_object(
             'customerName', coalesce(nullif(trim(o.customer_name), ''), 'Un client'),
             'replyTo', o.customer_email,
             'reference', o.reference,
             'totalCents', o.total_cents,
             'currency', upper(o.currency)),
           app.site_owner_recipients(es.id, null)
      from public.shop_orders o
      join eligible_sites es on es.id = o.site_id
     where o.owner_notified_at is null
       and o.paid_at is not null
       and o.status in ('paid', 'preparing', 'fulfilled')
       and o.paid_at > v_since
       and o.paid_at <= v_until
  ),
  everything as (
    select * from messages
    union all select * from reservations
    union all select * from orders
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', kind, 'id', id, 'happenedAt', happened_at, 'siteId', site_id,
           'siteName', site_name, 'organizationId', organization_id, 'timezone', timezone,
           'detail', detail, 'recipients', to_jsonb(recipients))
         order by happened_at), '[]'::jsonb)
    into v_items
    from (select * from everything order by happened_at limit v_limit) t;

  return v_items;
end;
$$;

-- -----------------------------------------------------------------------------
--  Réserver l'envoi (une seule fois), le libérer s'il a échoué
--
--  L'élément est marqué AVANT l'envoi : deux envois simultanés (deux messages
--  arrivés ensemble, la tâche de fond qui passe au même moment) ne peuvent
--  pas prévenir deux fois. Un envoi qui échoue libère l'élément ; la tâche de
--  fond suivante réessaie.
-- -----------------------------------------------------------------------------
create or replace function app.mark_site_activity_notified(p_kind text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  perform app.require_service_role();
  if p_kind = 'message' then
    update public.form_submissions set owner_notified_at = now()
     where id = p_id and owner_notified_at is null;
  elsif p_kind = 'booking' then
    update public.bookings set owner_notified_at = now()
     where id = p_id and owner_notified_at is null;
  elsif p_kind = 'order' then
    update public.shop_orders set owner_notified_at = now()
     where id = p_id and owner_notified_at is null;
  else
    raise exception 'Type inconnu.' using errcode = '22023';
  end if;
  return found;
end;
$$;

create or replace function app.release_site_activity(p_kind text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  perform app.require_service_role();
  if p_kind = 'message' then
    update public.form_submissions set owner_notified_at = null where id = p_id;
  elsif p_kind = 'booking' then
    update public.bookings set owner_notified_at = null where id = p_id;
  elsif p_kind = 'order' then
    update public.shop_orders set owner_notified_at = null where id = p_id;
  else
    raise exception 'Type inconnu.' using errcode = '22023';
  end if;
  return found;
end;
$$;

create or replace function public.site_activity_to_notify(
  p_site uuid default null, p_limit int default 20, p_min_age_seconds int default 0)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.site_activity_to_notify(p_site, p_limit, p_min_age_seconds);
$$;

create or replace function public.mark_site_activity_notified(p_kind text, p_id uuid)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.mark_site_activity_notified(p_kind, p_id);
$$;

create or replace function public.release_site_activity(p_kind text, p_id uuid)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.release_site_activity(p_kind, p_id);
$$;

revoke all on function app.site_owner_recipients(uuid, text[]) from public, anon, authenticated;
revoke all on function app.release_site_activity(text, uuid) from public, anon, authenticated;
revoke all on function public.release_site_activity(text, uuid) from public, anon, authenticated;
grant execute on function public.release_site_activity(text, uuid) to service_role;
revoke all on function app.site_activity_to_notify(uuid, int, int) from public, anon, authenticated;
revoke all on function app.mark_site_activity_notified(text, uuid) from public, anon, authenticated;
revoke all on function public.site_activity_to_notify(uuid, int, int)
  from public, anon, authenticated;
revoke all on function public.mark_site_activity_notified(text, uuid)
  from public, anon, authenticated;
grant execute on function public.site_activity_to_notify(uuid, int, int) to service_role;
grant execute on function public.mark_site_activity_notified(text, uuid) to service_role;

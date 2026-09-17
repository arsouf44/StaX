-- =============================================================================
--  Reception du trafic public des sites clients
-- =============================================================================
--  Le Worker des sites publics n'a pas d'utilisateur authentifie : il agit avec
--  le role de service, qui contourne la RLS. Toute la logique qui doit rester
--  vraie quoi qu'il arrive est donc placee ICI, dans des fonctions qui :
--
--   * verifient que la ressource visee (formulaire, prestation) appartient bien
--     au site resolu par le nom d'hote — un identifiant venu du navigateur ne
--     peut jamais designer un autre tenant ;
--   * appliquent les invariants metier (champs obligatoires, capacite d'un
--     creneau, delai minimal) dans la MEME transaction que l'ecriture ;
--   * ne renvoient jamais d'information permettant d'enumerer les ressources
--     d'un autre site.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Soumission d'un formulaire public
-- -----------------------------------------------------------------------------
create or replace function app.submit_form(
  p_site         uuid,
  p_form_slug    text,
  p_data         jsonb,
  p_spam_score   numeric default 0,
  p_ip_hash      text default null,
  p_user_agent   text default null,
  p_referrer     text default null,
  p_locale       text default 'fr'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_form        public.forms%rowtype;
  v_field       record;
  v_value       text;
  v_missing     text[] := '{}';
  v_clean       jsonb := '{}'::jsonb;
  v_submission  uuid;
  v_contact     uuid;
  v_email       text;
  v_phone       text;
  v_first       text;
  v_last        text;
  v_consent     boolean := false;
  v_status      app.submission_status;
begin
  if p_site is null then
    raise exception 'Site introuvable.' using errcode = 'P0002';
  end if;

  -- Le formulaire est cherche PAR SITE : un slug d'un autre tenant ne remonte
  -- jamais, quelle que soit la valeur envoyee par le navigateur.
  select * into v_form
    from public.forms
   where site_id = p_site
     and slug = lower(p_form_slug)
     and is_active
   limit 1;

  if not found then
    raise exception 'Formulaire introuvable.' using errcode = 'P0002';
  end if;

  if jsonb_typeof(coalesce(p_data, 'null'::jsonb)) <> 'object' then
    raise exception 'Donnees invalides.' using errcode = '22023';
  end if;

  -- Liste blanche stricte : seules les cles declarees par le formulaire sont
  -- conservees. Tout champ supplementaire injecte dans la requete est ignore.
  for v_field in
    select name, label, type, is_required
      from public.form_fields
     where form_id = v_form.id
     order by sort_order
  loop
    v_value := nullif(btrim(coalesce(p_data ->> v_field.name, '')), '');

    if v_field.is_required and v_value is null then
      v_missing := v_missing || v_field.label;
      continue;
    end if;

    if v_value is null then
      continue;
    end if;

    -- Bornes de longueur : un champ de 2 Mo n'est pas une saisie legitime.
    if length(v_value) > 5000 then
      v_value := left(v_value, 5000);
    end if;

    v_clean := v_clean || jsonb_build_object(v_field.name, v_value);

    if v_field.type = 'email' and v_email is null then
      v_email := lower(v_value);
    elsif v_field.type = 'tel' and v_phone is null then
      v_phone := v_value;
    elsif v_field.type = 'consent' then
      v_consent := true;
    end if;

    if v_field.name in ('nom', 'name', 'last_name', 'lastname') and v_last is null then
      v_last := v_value;
    elsif v_field.name in ('prenom', 'first_name', 'firstname') and v_first is null then
      v_first := v_value;
    end if;
  end loop;

  if array_length(v_missing, 1) is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'missing_fields',
      'fields', to_jsonb(v_missing)
    );
  end if;

  -- Au-dela de ce seuil la soumission est conservee mais classee en indesirable :
  -- on ne la jette pas, pour qu'un faux positif reste recuperable par le client.
  v_status := case when p_spam_score >= 0.8 then 'spam'::app.submission_status
                   else 'unread'::app.submission_status end;

  insert into public.form_submissions
    (form_id, site_id, organization_id, data, status, spam_score,
     ip_hash, user_agent_family, referrer_host, locale)
  values
    (v_form.id, v_form.site_id, v_form.organization_id, v_clean, v_status,
     greatest(least(coalesce(p_spam_score, 0), 1), 0),
     p_ip_hash, left(coalesce(p_user_agent, ''), 60), left(coalesce(p_referrer, ''), 200), p_locale)
  returning id into v_submission;

  -- Creation ou mise a jour du contact dans le CRM leger, uniquement lorsque
  -- la soumission n'est pas classee indesirable.
  if v_status <> 'spam' and (v_email is not null or v_phone is not null or v_last is not null) then
    if v_email is not null then
      insert into public.contacts
        (organization_id, site_id, first_name, last_name, email, phone, source,
         marketing_consent, marketing_consent_at)
      values
        (v_form.organization_id, v_form.site_id, v_first, v_last, v_email, v_phone,
         case when v_form.kind = 'newsletter' then 'newsletter' else 'form' end,
         v_consent, case when v_consent then now() else null end)
      on conflict (organization_id, lower(email)) where email is not null
      do update set
        first_name = coalesce(public.contacts.first_name, excluded.first_name),
        last_name  = coalesce(public.contacts.last_name, excluded.last_name),
        phone      = coalesce(public.contacts.phone, excluded.phone),
        marketing_consent = public.contacts.marketing_consent or excluded.marketing_consent,
        marketing_consent_at = coalesce(
          public.contacts.marketing_consent_at, excluded.marketing_consent_at),
        updated_at = now()
      returning id into v_contact;
    else
      insert into public.contacts
        (organization_id, site_id, first_name, last_name, phone, source)
      values (v_form.organization_id, v_form.site_id, v_first, v_last, v_phone, 'form')
      returning id into v_contact;
    end if;

    update public.form_submissions set contact_id = v_contact where id = v_submission;
  end if;

  return jsonb_build_object(
    'ok', true,
    'submissionId', v_submission,
    'message', v_form.success_message,
    'spam', v_status = 'spam'
  );
end;
$$;

revoke all on function app.submit_form(uuid, text, jsonb, numeric, text, text, text, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
--  Creneaux de reservation reellement disponibles
-- -----------------------------------------------------------------------------
--  Le calcul est fait en base et nulle part ailleurs : le navigateur ne connait
--  ni les capacites, ni les reservations existantes, ni les fermetures.
create or replace function app.available_slots(
  p_site    uuid,
  p_service uuid,
  p_day     date
)
returns table (slot_start timestamptz, remaining int)
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_service public.booking_services%rowtype;
  v_tz      text;
  v_dow     smallint;
begin
  select * into v_service
    from public.booking_services
   where id = p_service and site_id = p_site and is_active
   limit 1;

  if not found then
    return;
  end if;

  select timezone into v_tz from public.sites where id = p_site;
  v_tz := coalesce(v_tz, 'Europe/Paris');

  -- Horizon et delai minimal : une demande hors fenetre ne propose aucun creneau.
  if p_day > (now() at time zone v_tz)::date + v_service.horizon_days then
    return;
  end if;

  -- Fermeture exceptionnelle bloquante : aucun creneau ce jour-la.
  if exists (
    select 1 from public.closures
     where site_id = p_site
       and blocks_booking
       and p_day between starts_on and ends_on
  ) then
    return;
  end if;

  v_dow := extract(dow from p_day)::smallint;

  return query
  with rules as (
    select r.starts_at, r.ends_at, r.slot_interval_minutes,
           coalesce(r.capacity, v_service.capacity_per_slot) as capacity
      from public.availability_rules r
     where r.site_id = p_site
       and (r.booking_service_id is null or r.booking_service_id = p_service)
       and r.day_of_week = v_dow
       and (r.valid_from is null or r.valid_from <= p_day)
       and (r.valid_until is null or r.valid_until >= p_day)
  ),
  slots as (
    select generate_series(
             (p_day + rules.starts_at) at time zone v_tz,
             (p_day + rules.ends_at) at time zone v_tz
               - make_interval(mins => v_service.duration_minutes),
             make_interval(mins => rules.slot_interval_minutes)
           ) as slot_start,
           rules.capacity
      from rules
  )
  select s.slot_start,
         (s.capacity - coalesce((
            select sum(b.party_size)::int
              from public.bookings b
             where b.site_id = p_site
               and b.booking_service_id = p_service
               and b.status in ('pending', 'confirmed', 'seated')
               and b.starts_at < s.slot_start + make_interval(
                     mins => v_service.duration_minutes + v_service.buffer_minutes)
               and b.ends_at > s.slot_start
          ), 0))::int as remaining
    from slots s
   where s.slot_start >= now() + make_interval(hours => v_service.lead_time_hours)
   order by s.slot_start;
end;
$$;

revoke all on function app.available_slots(uuid, uuid, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
--  Creation d'une reservation
-- -----------------------------------------------------------------------------
--  La verification de capacite et l'insertion se font dans la MEME transaction,
--  avec un verrou consultatif par prestation : deux visiteurs qui reservent la
--  derniere table au meme instant ne peuvent pas passer tous les deux.
create or replace function app.create_booking(
  p_site        uuid,
  p_service     uuid,
  p_starts_at   timestamptz,
  p_party_size  int,
  p_name        text,
  p_email       text,
  p_phone       text,
  p_note        text default null,
  p_token_hash  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_service   public.booking_services%rowtype;
  v_site      public.sites%rowtype;
  v_capacity  int;
  v_taken     int;
  v_booking   uuid;
  v_reference text;
  v_contact   uuid;
  v_ends      timestamptz;
begin
  select * into v_site from public.sites where id = p_site;
  if not found then
    raise exception 'Site introuvable.' using errcode = 'P0002';
  end if;

  select * into v_service
    from public.booking_services
   where id = p_service and site_id = p_site and is_active
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'service_unavailable');
  end if;

  if p_party_size is null or p_party_size < 1 then
    return jsonb_build_object('ok', false, 'code', 'invalid_party_size');
  end if;

  if p_starts_at < now() + make_interval(hours => v_service.lead_time_hours) then
    return jsonb_build_object('ok', false, 'code', 'too_soon');
  end if;

  if p_starts_at > now() + make_interval(days => v_service.horizon_days) then
    return jsonb_build_object('ok', false, 'code', 'too_far');
  end if;

  if coalesce(nullif(btrim(p_email), ''), nullif(btrim(p_phone), '')) is null then
    return jsonb_build_object('ok', false, 'code', 'contact_required');
  end if;

  v_ends := p_starts_at + make_interval(mins => v_service.duration_minutes);

  -- Verrou consultatif portant sur la prestation : serialise les reservations
  -- concurrentes sans bloquer le reste de la base.
  perform pg_advisory_xact_lock(hashtextextended(p_service::text, 0));

  select coalesce(max(coalesce(r.capacity, v_service.capacity_per_slot)), v_service.capacity_per_slot)
    into v_capacity
    from public.availability_rules r
   where r.site_id = p_site
     and (r.booking_service_id is null or r.booking_service_id = p_service)
     and r.day_of_week = extract(dow from (p_starts_at at time zone v_site.timezone))::smallint;

  select coalesce(sum(b.party_size), 0)::int into v_taken
    from public.bookings b
   where b.site_id = p_site
     and b.booking_service_id = p_service
     and b.status in ('pending', 'confirmed', 'seated')
     and b.starts_at < v_ends + make_interval(mins => v_service.buffer_minutes)
     and b.ends_at > p_starts_at;

  if v_taken + p_party_size > v_capacity then
    return jsonb_build_object('ok', false, 'code', 'slot_full');
  end if;

  if exists (
    select 1 from public.closures
     where site_id = p_site
       and blocks_booking
       and (p_starts_at at time zone v_site.timezone)::date between starts_on and ends_on
  ) then
    return jsonb_build_object('ok', false, 'code', 'closed');
  end if;

  -- Reference lisible, unique par site, sans reveler de compteur global.
  -- `gen_random_uuid()` est natif depuis PostgreSQL 13 : pas de dependance a
  -- pgcrypto, qui n'est pas garanti present sur toutes les instances.
  v_reference := upper(to_char(p_starts_at at time zone v_site.timezone, 'YYMMDD'))
                 || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  if nullif(btrim(p_email), '') is not null then
    insert into public.contacts (organization_id, site_id, last_name, email, phone, source)
    values (v_site.organization_id, p_site, p_name, lower(btrim(p_email)), p_phone, 'booking')
    on conflict (organization_id, lower(email)) where email is not null
    do update set
      phone = coalesce(public.contacts.phone, excluded.phone),
      updated_at = now()
    returning id into v_contact;
  end if;

  insert into public.bookings
    (site_id, organization_id, booking_service_id, contact_id, reference,
     starts_at, ends_at, party_size, status,
     customer_name, customer_email, customer_phone, customer_note,
     manage_token_hash, source)
  values
    (p_site, v_site.organization_id, p_service, v_contact, v_reference,
     p_starts_at, v_ends, p_party_size,
     case when v_service.requires_approval then 'pending'::app.booking_status
          else 'confirmed'::app.booking_status end,
     left(btrim(p_name), 120), nullif(lower(btrim(p_email)), ''), nullif(btrim(p_phone), ''),
     left(coalesce(p_note, ''), 1000),
     p_token_hash, 'site')
  returning id into v_booking;

  return jsonb_build_object(
    'ok', true,
    'bookingId', v_booking,
    'reference', v_reference,
    'requiresApproval', v_service.requires_approval
  );
end;
$$;

revoke all on function
  app.create_booking(uuid, uuid, timestamptz, int, text, text, text, text, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
--  Mesure d'audience
-- -----------------------------------------------------------------------------
--  Aucun cookie, aucune adresse IP complete : l'empreinte visiteur est salee et
--  journaliere, calculee par l'appelant. Elle ne permet aucun suivi d'un jour
--  sur l'autre, ce qui est precisement l'objectif.
create or replace function app.record_page_view(
  p_site          uuid,
  p_path          text,
  p_visitor_hash  text,
  p_referrer_host text default null,
  p_country       char(2) default null,
  p_kind          text default 'pageview'
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

  insert into public.analytics_events (site_id, visitor_hash, kind, path, referrer_host, country)
  values (p_site, p_visitor_hash, p_kind, left(p_path, 512), left(p_referrer_host, 120), p_country);

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

revoke all on function app.record_page_view(uuid, text, text, text, char, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
--  Enveloppes publiques — reservees au role de service
-- -----------------------------------------------------------------------------
create or replace function public.submit_form(
  p_site uuid, p_form_slug text, p_data jsonb, p_spam_score numeric default 0,
  p_ip_hash text default null, p_user_agent text default null,
  p_referrer text default null, p_locale text default 'fr'
) returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.submit_form(p_site, p_form_slug, p_data, p_spam_score,
                         p_ip_hash, p_user_agent, p_referrer, p_locale);
$$;

create or replace function public.available_slots(p_site uuid, p_service uuid, p_day date)
returns table (slot_start timestamptz, remaining int)
language sql stable security definer set search_path = public, app, pg_catalog as $$
  select * from app.available_slots(p_site, p_service, p_day);
$$;

create or replace function public.create_booking(
  p_site uuid, p_service uuid, p_starts_at timestamptz, p_party_size int,
  p_name text, p_email text, p_phone text, p_note text default null,
  p_token_hash text default null
) returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.create_booking(p_site, p_service, p_starts_at, p_party_size,
                            p_name, p_email, p_phone, p_note, p_token_hash);
$$;

create or replace function public.record_page_view(
  p_site uuid, p_path text, p_visitor_hash text,
  p_referrer_host text default null, p_country char(2) default null,
  p_kind text default 'pageview'
) returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_page_view(p_site, p_path, p_visitor_hash, p_referrer_host, p_country, p_kind);
$$;

revoke all on function
  public.submit_form(uuid, text, jsonb, numeric, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.available_slots(uuid, uuid, date) from public, anon, authenticated;
revoke all on function
  public.create_booking(uuid, uuid, timestamptz, int, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.record_page_view(uuid, text, text, text, char, text)
  from public, anon, authenticated;

grant execute on function
  public.submit_form(uuid, text, jsonb, numeric, text, text, text, text) to service_role;
grant execute on function public.available_slots(uuid, uuid, date) to service_role;
grant execute on function
  public.create_booking(uuid, uuid, timestamptz, int, text, text, text, text, text) to service_role;
grant execute on function public.record_page_view(uuid, text, text, text, char, text) to service_role;

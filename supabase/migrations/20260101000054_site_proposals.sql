-- =============================================================================
--  0054 — Propositions de site (vente par téléphone)
--
--  Parcours commercial « cold call » :
--
--    1. L'équipe appelle une entreprise. L'appel est concluant.
--    2. Le site est construit HORS de StaX (dépôt GitHub + projet Cloudflare),
--       rattaché, vérifié : il est en ligne sur l'adresse du projet
--       Cloudflare (`*.workers.dev`, `*.pages.dev`).
--    3. L'équipe envoie une PROPOSITION : un e-mail avec le lien du site et un
--       code personnel, valable 14 jours, lié à l'adresse du prospect.
--    4. Le prospect crée son compte StaX, saisit son code : il VOIT son site,
--       le prix de l'offre, et peut écrire à l'équipe. Il ne peut rien
--       modifier.
--    5. Il paie (Stripe). Au paiement confirmé par le webhook signé, le site
--       lui est LIVRÉ automatiquement : l'édition s'ouvre, la maintenance
--       mensuelle démarre.
--
--  Règles tenues ici, par la base et non par l'interface :
--
--   - Le code en clair n'est jamais stocké : seule son empreinte HMAC l'est.
--     Il ne vaut qu'avec l'adresse e-mail à laquelle il a été envoyé.
--   - Le prix est celui d'une offre du CATALOGUE, sans remise, figé à l'envoi.
--   - Le client ne peut ni lire les notes internes, ni se livrer lui-même, ni
--     payer une proposition expirée ou retirée.
--   - Rien n'est effacé à l'expiration : le code cesse d'être valable, le site
--     reste en place, l'équipe relance ou retire.
--   - La livraison automatique exige la checklist complète, SAUF le domaine :
--     le site est livré sur l'adresse de son projet Cloudflare, le client
--     branche son propre domaine ensuite. Le HTTPS reste vérifié.
-- =============================================================================

create sequence if not exists public.site_proposal_reference_seq;

create or replace function app.next_proposal_reference()
returns text
language sql
volatile
set search_path = public, pg_catalog
as $$
  select 'PRO-' || lpad(nextval('public.site_proposal_reference_seq')::text, 5, '0');
$$;

create table public.site_proposals (
  id                      uuid primary key default app.uuid_v7(),
  reference               text not null,

  site_id                 uuid not null references public.sites (id) on delete restrict,
  organization_id         uuid not null references public.organizations (id) on delete cascade,

  /* --- Offre du catalogue et montants figés à l'envoi, en centimes --- */
  plan_id                 uuid not null references public.plans (id) on delete restrict,
  plan_slug               text not null,
  plan_version            int not null,
  plan_name               text not null,
  setup_price_cents       integer not null,
  maintenance_price_cents integer not null,
  billing_interval        text not null,
  vat_rate_bps            integer not null,
  vat_cents               integer not null,
  total_cents             integer not null,
  currency                char(3) not null default 'EUR',

  /* --- Prospect : c'est son adresse qui fait foi --- */
  prospect_email          text not null,
  prospect_name           text,
  prospect_phone          text,
  company_name            text not null,
  /** Mot personnel repris dans l'e-mail et sur la page du client. */
  message                 text,
  /** Notes internes de l'équipe. Jamais montrées au client. */
  internal_notes          text,

  /* --- Code personnel : empreinte seulement --- */
  code_hash               text not null,
  code_hint               text not null,

  status                  text not null default 'sent',
  expires_at              timestamptz not null,
  sent_at                 timestamptz not null default now(),
  send_count              int not null default 1,
  last_sent_at            timestamptz not null default now(),
  email_status            text,
  email_error             text,

  claimed_at              timestamptz,
  claimed_by              uuid references public.profiles (id) on delete set null,
  order_id                uuid references public.orders (id) on delete set null,
  paid_at                 timestamptz,
  delivered_at            timestamptz,
  /** Dernier motif d'échec de la livraison automatique (contrôles manquants). */
  delivery_error          text,
  delivery_attempted_at   timestamptz,

  withdrawn_at            timestamptz,
  withdrawn_by            uuid references public.profiles (id) on delete set null,
  withdrawal_reason       text,

  /** Tentatives de saisie de code, réussies ou non. */
  attempt_count           int not null default 0,
  last_attempt_at         timestamptz,

  created_by              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint site_proposals_status_valid
    check (status in ('sent', 'claimed', 'paid', 'delivered', 'withdrawn')),
  constraint site_proposals_email_format
    check (prospect_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint site_proposals_amounts_non_negative
    check (setup_price_cents >= 0 and maintenance_price_cents >= 0
           and vat_cents >= 0 and total_cents > 0),
  constraint site_proposals_interval_valid check (billing_interval in ('month', 'year')),
  constraint site_proposals_email_status_valid
    check (email_status is null or email_status in ('sent', 'failed', 'skipped')),
  constraint site_proposals_company_bounded check (length(btrim(company_name)) between 2 and 160),
  constraint site_proposals_message_bounded check (message is null or length(message) <= 2000),
  constraint site_proposals_notes_bounded
    check (internal_notes is null or length(internal_notes) <= 4000),
  constraint site_proposals_claim_coherent
    check (status not in ('claimed', 'paid', 'delivered')
           or (claimed_at is not null and claimed_by is not null)),
  constraint site_proposals_paid_coherent
    check (status not in ('paid', 'delivered') or (paid_at is not null and order_id is not null)),
  constraint site_proposals_delivered_coherent
    check (status <> 'delivered' or delivered_at is not null)
);

create unique index site_proposals_reference_key on public.site_proposals (reference);
create unique index site_proposals_code_key on public.site_proposals (code_hash);
-- Une seule proposition ouverte par site : deux prospects ne se disputent
-- jamais le même site.
create unique index site_proposals_open_site_key on public.site_proposals (site_id)
  where status in ('sent', 'claimed', 'paid');
create index site_proposals_status_idx on public.site_proposals (status, created_at desc);
create index site_proposals_email_idx on public.site_proposals (lower(prospect_email));
create index site_proposals_order_idx on public.site_proposals (order_id) where order_id is not null;

create trigger site_proposals_touch_updated_at
  before update on public.site_proposals
  for each row execute function app.touch_updated_at();

comment on table public.site_proposals is
  'Propositions de site envoyées après un appel commercial. Le code personnel n''est '
  'stocké que sous forme d''empreinte et ne vaut qu''avec l''adresse du prospect. Le '
  'client lit sa proposition par public.site_proposal_for_site(), jamais la table : '
  'elle porte des notes internes.';

alter table public.site_proposals enable row level security;

-- Lecture : l'équipe StaX seulement. Le client passe par une fonction qui ne
-- renvoie que ce qui le concerne (ni notes internes, ni empreinte du code).
create policy site_proposals_select on public.site_proposals
  for select to authenticated
  using (app.is_platform_staff());
-- Aucune écriture directe : tout passe par les fonctions ci-dessous.
revoke insert, update, delete, truncate on public.site_proposals from anon, authenticated;
grant select on public.site_proposals to authenticated;
revoke all on public.site_proposals from anon;
grant all on public.site_proposals to service_role;

-- -----------------------------------------------------------------------------
--  1. Livraison : un seul chemin, qu'elle soit manuelle ou automatique
--
--  Le corps de `app.deliver_site` (0044) est extrait tel quel dans
--  `app.perform_site_delivery`. `deliver_site` garde exactement ses contrôles
--  (administration, compte client, checklist complète) ; la livraison
--  automatique d'une proposition payée appelle le même corps, après ses
--  propres contrôles.
-- -----------------------------------------------------------------------------
create or replace function app.perform_site_delivery(
  p_site     uuid,
  p_actor    uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site  public.sites%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_site from public.sites where id = p_site for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  update public.sites
     set delivered_at = coalesce(delivered_at, now()),
         delivered_by = coalesce(delivered_by, p_actor)
   where id = p_site;

  if v_site.architecture = 'external_repository' then
    perform app.bring_external_site_live(p_site);
    update public.projects
       set status = 'delivered',
           delivered_at = coalesce(delivered_at, now()),
           go_live_at = coalesce(go_live_at, now()),
           published_at = coalesce(published_at, now())
     where site_id = p_site
       and status not in ('cancelled', 'archived');
    insert into public.project_events (project_id, kind, title, description, is_public, actor_id)
    select id, 'delivered', 'Site livré',
           'Votre site est en ligne et vous est confié : vous pouvez désormais le modifier '
           || 'depuis StaX.', true, p_actor
      from public.projects where site_id = p_site;
  else
    update public.projects
       set status = case
                      when status in ('ordered', 'questionnaire_pending', 'assets_pending',
                                      'in_progress', 'internal_review')
                        then 'client_review'::app.project_status
                      else status
                    end,
           delivered_at = coalesce(delivered_at, now())
     where site_id = p_site;
  end if;

  perform app.notify_site_clients(
    v_site.id, 'site.delivered', 'Votre site vous est livré',
    'Il est en ligne. Vous pouvez désormais modifier son contenu depuis StaX, voir un aperçu '
      || 'et publier quand vous le souhaitez.',
    case when v_site.architecture = 'external_repository' then '/app' else '/app/editeur' end,
    'success');

  select * into v_order from public.orders
   where site_id = p_site and status in ('paid', 'partially_refunded', 'internal')
   order by paid_at desc nulls last, created_at desc
   limit 1;

  perform app.write_audit(
    'site.delivered', v_site.organization_id, v_site.id, 'site', v_site.id::text,
    jsonb_build_object('architecture', v_site.architecture,
                       'maintenance', v_order.maintenance_status)
      || coalesce(p_metadata, '{}'::jsonb));

  return jsonb_build_object('ok', true, 'orderId', v_order.id,
                            'maintenanceStatus', v_order.maintenance_status);
end;
$$;

create or replace function app.deliver_site(
  p_site  uuid,
  p_email text default null,
  p_role  text default 'owner'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor     uuid := app.current_user_id();
  v_site      public.sites%rowtype;
  v_email     text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_user      uuid;
  v_role      text := coalesce(nullif(btrim(coalesce(p_role, '')), ''), 'owner');
  v_clients   integer;
  v_readiness jsonb;
  v_missing   jsonb;
  v_result    jsonb;
begin
  if v_actor is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin', 'editor') then
    raise exception 'Role inconnu' using errcode = '22023';
  end if;

  select * into v_site from public.sites where id = p_site for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_site.archived_at is not null then
    return jsonb_build_object('ok', false, 'code', 'archived');
  end if;

  if v_email is not null then
    select id into v_user from public.profiles where lower(email) = v_email limit 1;
    if v_user is null then
      return jsonb_build_object('ok', false, 'code', 'no_account');
    end if;
    insert into public.organization_members (organization_id, user_id, role, invited_by)
    values (v_site.organization_id, v_user, v_role::app.org_role, v_actor)
    on conflict (organization_id, user_id) do nothing;
  end if;

  select count(*) into v_clients
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
   where m.organization_id = v_site.organization_id
     and p.platform_role is null;
  if v_clients = 0 then
    return jsonb_build_object('ok', false, 'code', 'no_client');
  end if;

  -- Site developpe independamment : la checklist complete est EXIGEE. Pas de
  -- livraison d'un site qui ne serait pas reellement en ligne, verifie.
  if v_site.architecture = 'external_repository' then
    v_readiness := app.delivery_readiness(p_site);
    select coalesce(jsonb_agg(c -> 'key'), '[]'::jsonb) into v_missing
      from jsonb_array_elements(v_readiness -> 'checks') c
     where c ->> 'status' <> 'passed';
    if not coalesce((v_readiness ->> 'ready')::boolean, false) then
      return jsonb_build_object('ok', false, 'code', 'checklist_incomplete',
                                'missing', v_missing);
    end if;
  end if;

  v_result := app.perform_site_delivery(
    p_site, v_actor, jsonb_build_object('added_member', v_user is not null, 'role', v_role));

  -- Une proposition ouverte sur ce site est close par la livraison manuelle.
  update public.site_proposals
     set status = 'delivered', delivered_at = coalesce(delivered_at, now()), delivery_error = null
   where site_id = p_site and status = 'paid';

  return jsonb_build_object('ok', true, 'clients', v_clients,
                            'orderId', v_result -> 'orderId',
                            'maintenanceStatus', v_result -> 'maintenanceStatus');
end;
$$;

-- -----------------------------------------------------------------------------
--  2. Contrôles de livraison d'une proposition
--
--  Contrôles de `delivery_readiness` non satisfaits, hors ceux que le parcours
--  dispense : le domaine (livré sur l'adresse Cloudflare, domaine branché
--  ensuite) et, avant la récupération par le prospect, le compte client.
-- -----------------------------------------------------------------------------
create or replace function app.proposal_missing_checks(p_site uuid, p_before_claim boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_readiness jsonb := app.delivery_readiness(p_site);
begin
  return coalesce((
    select jsonb_agg(c -> 'key')
      from jsonb_array_elements(v_readiness -> 'checks') c
     where c ->> 'status' <> 'passed'
       and c ->> 'key' <> 'domain'
       and not (p_before_claim and c ->> 'key' = 'client_account')
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
--  3. Envoyer une proposition (administration)
-- -----------------------------------------------------------------------------
create or replace function app.create_site_proposal(
  p_site           uuid,
  p_plan           uuid,
  p_email          text,
  p_company        text,
  p_name           text,
  p_phone          text,
  p_message        text,
  p_internal_notes text,
  p_code_hash      text,
  p_code_hint      text,
  p_valid_days     int default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor   uuid := app.current_user_id();
  v_site    public.sites%rowtype;
  v_plan    public.plans%rowtype;
  v_price   app.price_breakdown;
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_company text := left(btrim(coalesce(p_company, '')), 160);
  v_missing jsonb;
  v_id      uuid;
  v_ref     text;
begin
  if v_actor is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if coalesce(length(p_code_hash), 0) < 32 or coalesce(length(p_code_hint), 0) = 0 then
    raise exception 'Code invalide' using errcode = '22023';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;
  if length(v_company) < 2 then
    return jsonb_build_object('ok', false, 'code', 'company_required');
  end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 60 then
    raise exception 'Duree de validite hors bornes' using errcode = '22023';
  end if;

  select * into v_site from public.sites where id = p_site for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_site.archived_at is not null then
    return jsonb_build_object('ok', false, 'code', 'archived');
  end if;
  if v_site.delivered_at is not null then
    return jsonb_build_object('ok', false, 'code', 'already_delivered');
  end if;
  if v_site.architecture <> 'external_repository' then
    return jsonb_build_object('ok', false, 'code', 'not_external');
  end if;
  if exists (select 1 from public.site_proposals
              where site_id = p_site and status in ('sent', 'claimed', 'paid')) then
    return jsonb_build_object('ok', false, 'code', 'proposal_open');
  end if;
  -- Un site déjà rattaché à un client n'est pas proposé à un autre.
  if exists (select 1 from public.organization_members m
               join public.profiles pr on pr.id = m.user_id
              where m.organization_id = v_site.organization_id and pr.platform_role is null) then
    return jsonb_build_object('ok', false, 'code', 'site_has_client');
  end if;

  -- Une offre du catalogue, publique et payable en ligne : jamais un prix libre.
  select * into v_plan from public.plans
   where id = p_plan and is_active and is_public and not is_quote_only;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'plan_unavailable');
  end if;

  -- L'offre proposée devient celle du site : ses droits (pages, langues,
  -- modules) sont ceux que vérifie la checklist.
  update public.sites set plan_id = v_plan.id, plan_slug = v_plan.slug where id = p_site;

  v_missing := app.proposal_missing_checks(p_site, true);
  if jsonb_array_length(v_missing) > 0 then
    -- Rien n'est envoyé : l'offre du site est rétablie.
    update public.sites set plan_id = v_site.plan_id, plan_slug = v_site.plan_slug
     where id = p_site;
    return jsonb_build_object('ok', false, 'code', 'checklist_incomplete', 'missing', v_missing);
  end if;

  v_price := app.compute_order_pricing(v_plan.id, null);
  v_ref := app.next_proposal_reference();

  insert into public.site_proposals (
    reference, site_id, organization_id,
    plan_id, plan_slug, plan_version, plan_name,
    setup_price_cents, maintenance_price_cents, billing_interval,
    vat_rate_bps, vat_cents, total_cents, currency,
    prospect_email, prospect_name, prospect_phone, company_name, message, internal_notes,
    code_hash, code_hint, expires_at, created_by
  ) values (
    v_ref, p_site, v_site.organization_id,
    v_plan.id, v_plan.slug, v_plan.version, v_plan.name,
    v_price.setup_cents, v_price.maintenance_cents, v_plan.billing_interval,
    v_price.vat_rate_bps, v_price.vat_cents, v_price.total_cents, v_price.currency,
    v_email, nullif(left(btrim(coalesce(p_name, '')), 120), ''),
    nullif(left(btrim(coalesce(p_phone, '')), 40), ''), v_company,
    nullif(left(btrim(coalesce(p_message, '')), 2000), ''),
    nullif(left(btrim(coalesce(p_internal_notes, '')), 4000), ''),
    p_code_hash, left(p_code_hint, 8), now() + make_interval(days => p_valid_days), v_actor
  )
  returning id into v_id;

  perform app.write_audit(
    'proposal.created', v_site.organization_id, p_site, 'site_proposal', v_id::text,
    jsonb_build_object('reference', v_ref, 'plan', v_plan.slug, 'validDays', p_valid_days));

  return jsonb_build_object('ok', true, 'proposalId', v_id, 'reference', v_ref,
                            'expiresAt', now() + make_interval(days => p_valid_days));
end;
$$;

-- Résultat de l'envoi de l'e-mail, inscrit après coup par l'administration.
create or replace function app.record_proposal_email(p_proposal uuid, p_status text, p_error text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if not (app.is_platform_admin() or app.is_service_role()) then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'Statut d''envoi inconnu' using errcode = '22023';
  end if;
  update public.site_proposals
     set email_status = p_status, email_error = left(p_error, 500)
   where id = p_proposal;
end;
$$;

-- -----------------------------------------------------------------------------
--  4. Relancer : nouveau délai (et nouveau code tant qu'il n'a pas servi)
-- -----------------------------------------------------------------------------
create or replace function app.renew_site_proposal(
  p_proposal   uuid,
  p_code_hash  text default null,
  p_code_hint  text default null,
  p_valid_days int default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_prop public.site_proposals%rowtype;
begin
  if app.current_user_id() is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 60 then
    raise exception 'Duree de validite hors bornes' using errcode = '22023';
  end if;

  select * into v_prop from public.site_proposals where id = p_proposal for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_prop.status not in ('sent', 'claimed') then
    return jsonb_build_object('ok', false, 'code', 'not_renewable', 'status', v_prop.status);
  end if;

  if v_prop.status = 'sent' then
    -- Code pas encore utilisé : il est remplacé. L'ancien cesse de valoir.
    if coalesce(length(p_code_hash), 0) < 32 or coalesce(length(p_code_hint), 0) = 0 then
      raise exception 'Nouveau code requis' using errcode = '22023';
    end if;
    update public.site_proposals
       set code_hash = p_code_hash, code_hint = left(p_code_hint, 8)
     where id = p_proposal;
  end if;

  update public.site_proposals
     set expires_at = now() + make_interval(days => p_valid_days),
         send_count = send_count + 1,
         last_sent_at = now(),
         email_status = null,
         email_error = null
   where id = p_proposal;

  perform app.write_audit(
    'proposal.renewed', v_prop.organization_id, v_prop.site_id, 'site_proposal',
    v_prop.id::text, jsonb_build_object('status', v_prop.status, 'validDays', p_valid_days,
                                        'newCode', v_prop.status = 'sent'));

  return jsonb_build_object('ok', true, 'status', v_prop.status,
                            'newCode', v_prop.status = 'sent',
                            'expiresAt', now() + make_interval(days => p_valid_days));
end;
$$;

-- -----------------------------------------------------------------------------
--  5. Retirer : la proposition cesse, rien n'est effacé
--
--  Si le prospect avait récupéré le site, il perd l'accès à cet espace (son
--  compte reste). Le site redevient disponible pour une autre proposition.
-- -----------------------------------------------------------------------------
create or replace function app.withdraw_site_proposal(p_proposal uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor uuid := app.current_user_id();
  v_prop  public.site_proposals%rowtype;
  v_removed int := 0;
begin
  if v_actor is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;

  select * into v_prop from public.site_proposals where id = p_proposal for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_prop.status not in ('sent', 'claimed') then
    return jsonb_build_object('ok', false, 'code', 'not_withdrawable', 'status', v_prop.status);
  end if;
  -- Un paiement engagé ne se retire pas sous les pieds du client.
  if exists (select 1 from public.orders
              where id = v_prop.order_id and status in ('checkout_pending', 'paid')) then
    return jsonb_build_object('ok', false, 'code', 'payment_in_progress');
  end if;

  update public.site_proposals
     set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = v_actor,
         withdrawal_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), '')
   where id = p_proposal;

  if v_prop.status = 'claimed' and v_prop.claimed_by is not null then
    delete from public.organization_members m
     using public.profiles pr
     where m.organization_id = v_prop.organization_id
       and m.user_id = v_prop.claimed_by
       and pr.id = m.user_id
       and pr.platform_role is null;
    get diagnostics v_removed = row_count;
  end if;

  perform app.write_audit(
    'proposal.withdrawn', v_prop.organization_id, v_prop.site_id, 'site_proposal',
    v_prop.id::text, jsonb_build_object('previousStatus', v_prop.status,
                                        'accessRemoved', v_removed > 0,
                                        'reason', p_reason));
  return jsonb_build_object('ok', true, 'accessRemoved', v_removed > 0);
end;
$$;

-- -----------------------------------------------------------------------------
--  6. Récupérer son site avec son code (le prospect, connecté)
-- -----------------------------------------------------------------------------
create or replace function app.claim_site_proposal(p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor uuid := app.current_user_id();
  v_email text;
  v_prop  public.site_proposals%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  select * into v_prop from public.site_proposals
   where code_hash = coalesce(p_code_hash, '')
   for update;

  if not found then
    -- Une saisie au hasard laisse une trace : une énumération se voit.
    perform app.write_audit('proposal.claim_failed', null, null, 'site_proposal', null,
                            jsonb_build_object('reason', 'not_found'));
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  update public.site_proposals
     set attempt_count = attempt_count + 1, last_attempt_at = now()
   where id = v_prop.id;

  if v_prop.status = 'withdrawn' then
    return jsonb_build_object('ok', false, 'code', 'withdrawn');
  end if;

  if v_prop.status in ('claimed', 'paid', 'delivered') then
    -- Double clic, ou retour sur le lien : on renvoie vers le site déjà
    -- récupéré plutôt qu'une erreur.
    if v_prop.claimed_by = v_actor then
      return jsonb_build_object('ok', true, 'code', 'already_claimed',
                                'organizationId', v_prop.organization_id,
                                'siteId', v_prop.site_id, 'proposalId', v_prop.id);
    end if;
    return jsonb_build_object('ok', false, 'code', 'already_claimed');
  end if;

  if v_prop.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;

  -- LE contrôle qui compte : le code ne vaut qu'avec l'adresse du prospect.
  select email into v_email from public.profiles where id = v_actor;
  if lower(coalesce(v_email, '')) <> lower(v_prop.prospect_email) then
    perform app.write_audit('proposal.claim_failed', v_prop.organization_id, v_prop.site_id,
                            'site_proposal', v_prop.id::text,
                            jsonb_build_object('reason', 'email_mismatch'));
    return jsonb_build_object('ok', false, 'code', 'email_mismatch');
  end if;

  insert into public.organization_members (organization_id, user_id, role, invited_by)
  values (v_prop.organization_id, v_actor, 'owner', v_prop.created_by)
  on conflict (organization_id, user_id) do nothing;

  update public.organizations
     set billing_email = coalesce(billing_email, v_prop.prospect_email),
         phone = coalesce(phone, v_prop.prospect_phone)
   where id = v_prop.organization_id;

  update public.site_proposals
     set status = 'claimed', claimed_at = now(), claimed_by = v_actor
   where id = v_prop.id;

  perform app.write_audit('proposal.claimed', v_prop.organization_id, v_prop.site_id,
                          'site_proposal', v_prop.id::text,
                          jsonb_build_object('reference', v_prop.reference));

  return jsonb_build_object('ok', true, 'code', 'claimed',
                            'organizationId', v_prop.organization_id,
                            'siteId', v_prop.site_id, 'proposalId', v_prop.id);
end;
$$;

-- -----------------------------------------------------------------------------
--  7. Ce que le client voit de sa proposition
-- -----------------------------------------------------------------------------
create or replace function app.site_proposal_for_site(p_site uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_prop  public.site_proposals%rowtype;
  v_order public.orders%rowtype;
  v_url   text;
begin
  select * into v_prop from public.site_proposals
   where site_id = p_site and status <> 'sent' and status <> 'withdrawn'
   order by created_at desc
   limit 1;
  if not found then
    return null;
  end if;
  if not (app.is_org_member(v_prop.organization_id) or app.is_platform_staff()) then
    return null;
  end if;

  if v_prop.order_id is not null then
    select * into v_order from public.orders where id = v_prop.order_id;
  end if;
  select production_url into v_url from public.site_hosting
   where site_id = p_site and status = 'connected'
   order by created_at desc limit 1;

  return jsonb_build_object(
    'id', v_prop.id,
    'reference', v_prop.reference,
    'status', v_prop.status,
    'expired', v_prop.status = 'claimed' and v_prop.expires_at <= now(),
    'expiresAt', v_prop.expires_at,
    'planName', v_prop.plan_name,
    'planSlug', v_prop.plan_slug,
    'setupPriceCents', v_prop.setup_price_cents,
    'maintenancePriceCents', v_prop.maintenance_price_cents,
    'billingInterval', v_prop.billing_interval,
    'vatRateBps', v_prop.vat_rate_bps,
    'vatCents', v_prop.vat_cents,
    'totalCents', v_prop.total_cents,
    'currency', v_prop.currency,
    'companyName', v_prop.company_name,
    'message', v_prop.message,
    'siteUrl', v_url,
    'inclusions', app.plan_inclusions_snapshot(v_prop.plan_id),
    'orderId', v_prop.order_id,
    'orderStatus', v_order.status,
    'paidAt', v_prop.paid_at,
    'deliveredAt', v_prop.delivered_at,
    'deliveryPending', v_prop.status = 'paid'
  );
end;
$$;

-- -----------------------------------------------------------------------------
--  8. Commande de la proposition (au clic sur « Payer »)
--
--  La commande porte le site EXISTANT : le paiement ne crée pas de second
--  site. Les montants sont ceux figés dans la proposition. Une commande en
--  attente de paiement est réutilisée plutôt que dupliquée.
-- -----------------------------------------------------------------------------
create or replace function app.create_proposal_order(
  p_proposal      uuid,
  p_terms_version text,
  p_ip_hash       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor uuid := app.current_user_id();
  v_prop  public.site_proposals%rowtype;
  v_site  public.sites%rowtype;
  v_order public.orders%rowtype;
  v_id    uuid;
  v_ref   text;
begin
  if v_actor is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  if p_terms_version is null then
    raise exception 'Acceptation des conditions generales de vente requise'
      using errcode = '23514';
  end if;

  select * into v_prop from public.site_proposals where id = p_proposal for update;
  if not found or not app.org_can(v_prop.organization_id, 'billing.manage') then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_prop.status in ('paid', 'delivered') then
    return jsonb_build_object('ok', false, 'code', 'already_paid', 'orderId', v_prop.order_id);
  end if;
  if v_prop.status = 'withdrawn' then
    return jsonb_build_object('ok', false, 'code', 'withdrawn');
  end if;
  if v_prop.status <> 'claimed' then
    return jsonb_build_object('ok', false, 'code', 'not_claimed');
  end if;
  if v_prop.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;

  if v_prop.order_id is not null then
    select * into v_order from public.orders where id = v_prop.order_id for update;
    if found and v_order.status in ('draft', 'checkout_pending') then
      return jsonb_build_object('ok', true, 'orderId', v_order.id, 'reused', true);
    end if;
    if found and v_order.status in ('paid', 'partially_refunded') then
      return jsonb_build_object('ok', false, 'code', 'already_paid', 'orderId', v_order.id);
    end if;
  end if;

  select * into v_site from public.sites where id = v_prop.site_id;
  v_ref := app.next_order_reference();

  insert into public.orders (
    reference, organization_id, site_id, created_by, status,
    plan_id, plan_slug, plan_version,
    setup_price_cents, maintenance_price_cents, billing_interval, discount_cents,
    vat_rate_bps, vat_cents, total_cents, currency,
    sector_slug, business_type_slug, questionnaire,
    domain_handling, customer_notes,
    terms_version, terms_accepted_at, terms_accepted_ip_hash,
    plan_inclusions
  ) values (
    v_ref, v_prop.organization_id, v_prop.site_id, v_actor, 'draft',
    v_prop.plan_id, v_prop.plan_slug, v_prop.plan_version,
    v_prop.setup_price_cents, v_prop.maintenance_price_cents, v_prop.billing_interval, 0,
    v_prop.vat_rate_bps, v_prop.vat_cents, v_prop.total_cents, v_prop.currency,
    (select sector_slug from public.business_types where slug = v_site.business_type_slug),
    v_site.business_type_slug,
    jsonb_build_object('businessName', v_prop.company_name, 'proposal', v_prop.reference,
                       'acceptedDocuments', jsonb_build_object('cgv', p_terms_version,
                                                               'professionalUse', true)),
    'none', 'Site proposé et accepté — proposition ' || v_prop.reference || '.',
    p_terms_version, now(), p_ip_hash,
    app.plan_inclusions_snapshot(v_prop.plan_id)
  )
  returning id into v_id;

  insert into public.order_items (order_id, kind, label, quantity, unit_price_cents,
                                  total_cents, sort_order)
  values (v_id, 'plan_setup', 'Création du site — offre ' || v_prop.plan_name,
          1, v_prop.setup_price_cents, v_prop.setup_price_cents, 10);

  if v_prop.maintenance_price_cents > 0 then
    insert into public.order_items (order_id, kind, label, description, quantity,
                                    unit_price_cents, total_cents, sort_order, metadata)
    values (v_id, 'plan_maintenance',
            'Maintenance '
              || case when v_prop.billing_interval = 'month' then 'mensuelle' else 'annuelle' end
              || ' — offre ' || v_prop.plan_name,
            'Facturée à partir de la livraison du site, pas à la commande.',
            1, v_prop.maintenance_price_cents, v_prop.maintenance_price_cents, 30,
            jsonb_build_object('billing_interval', v_prop.billing_interval,
                               'starts', 'delivery'));
  end if;

  -- Le projet du site (créé avec lui) suit désormais cette commande : le
  -- paiement ne doit pas en ouvrir un second.
  update public.projects set order_id = v_id
   where site_id = v_prop.site_id and order_id is null;

  update public.site_proposals set order_id = v_id where id = v_prop.id;

  insert into public.consents (user_id, organization_id, kind, document_version,
                               granted, ip_hash, source)
  values (v_actor, v_prop.organization_id, 'terms', p_terms_version, true, p_ip_hash, 'proposal');

  perform app.write_audit('order.created', v_prop.organization_id, v_prop.site_id, 'order',
                          v_id::text,
                          jsonb_build_object('reference', v_ref, 'plan', v_prop.plan_slug,
                                             'proposal', v_prop.reference,
                                             'total_cents', v_prop.total_cents));

  return jsonb_build_object('ok', true, 'orderId', v_id, 'reused', false);
end;
$$;

-- -----------------------------------------------------------------------------
--  8 bis. Session de paiement ouverte pour une commande
--
--  Le tunnel inscrivait la session Stripe par une mise à jour directe de
--  `orders`, que la policy réserve à l'administration : l'écriture était
--  refusée en silence, la commande ne portait jamais sa session ni l'état
--  « paiement en cours ». Cette fonction le fait, pour une commande de sa
--  propre organisation encore impayée, et rien d'autre.
-- -----------------------------------------------------------------------------
create or replace function app.attach_checkout_session(p_order uuid, p_session text)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_order public.orders%rowtype;
begin
  if app.current_user_id() is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  if coalesce(p_session, '') !~ '^cs_[A-Za-z0-9_]{8,250}$' then
    raise exception 'Session de paiement invalide' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order for update;
  if not found
     or not (app.org_can(v_order.organization_id, 'billing.manage') or app.is_platform_admin()) then
    return false;
  end if;
  if v_order.status not in ('draft', 'checkout_pending') then
    return false;
  end if;
  update public.orders
     set status = 'checkout_pending', stripe_checkout_session_id = p_session
   where id = p_order;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
--  9. Paiement confirmé : livraison automatique (serveur uniquement)
--
--  Appelée par le webhook Stripe APRÈS `apply_order_paid`, puis rejouée par la
--  tâche de fond tant que la livraison n'a pas abouti. Idempotente.
-- -----------------------------------------------------------------------------
create or replace function app.complete_paid_proposal(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_prop    public.site_proposals%rowtype;
  v_order   public.orders%rowtype;
  v_site    public.sites%rowtype;
  v_missing jsonb;
begin
  if not app.is_service_role() then
    raise exception 'Operation reservee au serveur de la plateforme' using errcode = '42501';
  end if;

  select * into v_prop from public.site_proposals where order_id = p_order for update;
  if not found then
    return jsonb_build_object('ok', true, 'code', 'not_a_proposal');
  end if;

  select * into v_order from public.orders where id = p_order;
  if v_order.status not in ('paid', 'partially_refunded') then
    return jsonb_build_object('ok', false, 'code', 'order_not_paid');
  end if;

  if v_prop.status = 'delivered' then
    return jsonb_build_object('ok', true, 'code', 'already_delivered', 'delivered', true,
                              'siteId', v_prop.site_id, 'proposalId', v_prop.id);
  end if;

  -- Le client a payé : la proposition est payée, même retirée ou expirée
  -- entre-temps. L'argent reçu décide, pas l'état de l'écran.
  if v_prop.status <> 'paid' then
    update public.site_proposals
       set status = 'paid',
           paid_at = coalesce(v_order.paid_at, now()),
           claimed_at = coalesce(claimed_at, now()),
           claimed_by = coalesce(claimed_by, v_order.created_by)
     where id = v_prop.id;
    perform app.write_audit('proposal.paid', v_prop.organization_id, v_prop.site_id,
                            'site_proposal', v_prop.id::text,
                            jsonb_build_object('orderId', p_order,
                                               'previousStatus', v_prop.status));
  end if;

  select * into v_site from public.sites where id = v_prop.site_id;
  if v_site.delivered_at is not null then
    update public.site_proposals
       set status = 'delivered', delivered_at = coalesce(delivered_at, v_site.delivered_at),
           delivery_error = null
     where id = v_prop.id;
    return jsonb_build_object('ok', true, 'code', 'already_delivered', 'delivered', true,
                              'siteId', v_prop.site_id, 'proposalId', v_prop.id);
  end if;

  v_missing := app.proposal_missing_checks(v_prop.site_id, false);
  if jsonb_array_length(v_missing) > 0 then
    update public.site_proposals
       set delivery_error = (select string_agg(value, ', ')
                               from jsonb_array_elements_text(v_missing)),
           delivery_attempted_at = now()
     where id = v_prop.id;
    return jsonb_build_object('ok', true, 'code', 'delivery_pending', 'delivered', false,
                              'missing', v_missing, 'siteId', v_prop.site_id,
                              'proposalId', v_prop.id);
  end if;

  perform app.perform_site_delivery(
    v_prop.site_id, v_prop.created_by,
    jsonb_build_object('proposal', v_prop.reference, 'automatic', true));

  update public.site_proposals
     set status = 'delivered', delivered_at = now(), delivery_error = null,
         delivery_attempted_at = now()
   where id = v_prop.id;

  return jsonb_build_object('ok', true, 'code', 'delivered', 'delivered', true,
                            'siteId', v_prop.site_id, 'proposalId', v_prop.id);
end;
$$;

-- Propositions payées dont la livraison automatique reste à faire. Une même
-- proposition n'est retentée qu'une fois toutes les dix minutes : chaque
-- tentative interroge Cloudflare et le site lui-même.
create or replace function app.proposals_awaiting_delivery(p_limit int default 20)
returns table (order_id uuid, site_id uuid, organization_id uuid)
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select p.order_id, p.site_id, p.organization_id
    from public.site_proposals p
   where p.status = 'paid' and p.order_id is not null
     and (p.delivery_attempted_at is null
          or p.delivery_attempted_at < now() - interval '10 minutes')
   order by coalesce(p.delivery_attempted_at, p.paid_at) asc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- -----------------------------------------------------------------------------
--  10. Surface exposée (schéma public) et privilèges
-- -----------------------------------------------------------------------------
create or replace function public.create_site_proposal(
  p_site uuid, p_plan uuid, p_email text, p_company text, p_name text, p_phone text,
  p_message text, p_internal_notes text, p_code_hash text, p_code_hint text,
  p_valid_days int default 14)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.create_site_proposal(p_site, p_plan, p_email, p_company, p_name, p_phone,
                                  p_message, p_internal_notes, p_code_hash, p_code_hint,
                                  p_valid_days);
$$;

create or replace function public.record_proposal_email(p_proposal uuid, p_status text, p_error text)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_proposal_email(p_proposal, p_status, p_error);
$$;

create or replace function public.renew_site_proposal(
  p_proposal uuid, p_code_hash text default null, p_code_hint text default null,
  p_valid_days int default 14)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.renew_site_proposal(p_proposal, p_code_hash, p_code_hint, p_valid_days);
$$;

create or replace function public.withdraw_site_proposal(p_proposal uuid, p_reason text default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.withdraw_site_proposal(p_proposal, p_reason);
$$;

create or replace function public.claim_site_proposal(p_code_hash text)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.claim_site_proposal(p_code_hash);
$$;

create or replace function public.site_proposal_for_site(p_site uuid)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.site_proposal_for_site(p_site);
$$;

create or replace function public.create_proposal_order(
  p_proposal uuid, p_terms_version text, p_ip_hash text default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.create_proposal_order(p_proposal, p_terms_version, p_ip_hash);
$$;

create or replace function public.attach_checkout_session(p_order uuid, p_session text)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.attach_checkout_session(p_order, p_session);
$$;

create or replace function public.complete_paid_proposal(p_order uuid)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.complete_paid_proposal(p_order);
$$;

create or replace function public.proposals_awaiting_delivery(p_limit int default 20)
returns table (order_id uuid, site_id uuid, organization_id uuid)
language sql stable security definer set search_path = public, app, pg_catalog as $$
  select * from app.proposals_awaiting_delivery(p_limit);
$$;

do $$
declare
  fn text;
  service_only text[] := array[
    'public.complete_paid_proposal(uuid)',
    'public.proposals_awaiting_delivery(int)'
  ];
  user_callable text[] := array[
    'public.create_site_proposal(uuid, uuid, text, text, text, text, text, text, text, text, int)',
    'public.record_proposal_email(uuid, text, text)',
    'public.renew_site_proposal(uuid, text, text, int)',
    'public.withdraw_site_proposal(uuid, text)',
    'public.claim_site_proposal(text)',
    'public.site_proposal_for_site(uuid)',
    'public.create_proposal_order(uuid, text, text)',
    'public.attach_checkout_session(uuid, text)'
  ];
  internal text[] := array[
    'app.attach_checkout_session(uuid, text)',
    'app.perform_site_delivery(uuid, uuid, jsonb)',
    'app.proposal_missing_checks(uuid, boolean)',
    'app.create_site_proposal(uuid, uuid, text, text, text, text, text, text, text, text, int)',
    'app.record_proposal_email(uuid, text, text)',
    'app.renew_site_proposal(uuid, text, text, int)',
    'app.withdraw_site_proposal(uuid, text)',
    'app.claim_site_proposal(text)',
    'app.site_proposal_for_site(uuid)',
    'app.create_proposal_order(uuid, text, text)',
    'app.complete_paid_proposal(uuid)',
    'app.proposals_awaiting_delivery(int)',
    'app.next_proposal_reference()'
  ];
begin
  foreach fn in array service_only loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  foreach fn in array user_callable loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
  foreach fn in array internal loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;

revoke all on sequence public.site_proposal_reference_seq from anon, authenticated;

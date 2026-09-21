-- =============================================================================
--  StaX — 0010 · Integrite financiere
--
--  Un navigateur ne choisit jamais un montant. Toute ecriture monetaire passe
--  par une fonction SECURITY DEFINER qui relit le prix dans le catalogue,
--  applique la TVA et la remise, et verifie les droits elle-meme.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Calcul tarifaire canonique (miroir SQL de @stax/payments/pricing)
-- -----------------------------------------------------------------------------
create type app.price_breakdown as (
  setup_cents     integer,
  maintenance_cents   integer,
  discount_cents  integer,
  vat_cents       integer,
  total_cents     integer,
  vat_rate_bps    integer,
  currency        char(3)
);

create or replace function app.compute_order_pricing(
  p_plan_id uuid,
  p_coupon  text default null
)
returns app.price_breakdown
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_plan     public.plans%rowtype;
  v_coupon   public.coupons%rowtype;
  v_discount integer := 0;
  v_net      integer;
  v_vat      integer;
begin
  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if not found then
    raise exception 'Offre introuvable ou inactive' using errcode = 'P0002';
  end if;
  if v_plan.is_quote_only then
    raise exception 'Cette offre se commande uniquement sur devis' using errcode = '23514';
  end if;

  if p_coupon is not null then
    select * into v_coupon
      from public.coupons
     where upper(code) = upper(p_coupon)
       and is_active
       and valid_from <= now()
       and (valid_until is null or valid_until > now())
       and (max_redemptions is null or redeemed_count < max_redemptions)
       and (cardinality(plan_slugs) = 0 or v_plan.slug = any (plan_slugs));

    if found and v_coupon.applies_to in ('setup', 'both') then
      v_discount := case v_coupon.kind
        when 'percent' then (v_plan.setup_price_cents * v_coupon.value) / 10000
        else least(v_coupon.value, v_plan.setup_price_cents)
      end;
    end if;
  end if;

  v_net := greatest(v_plan.setup_price_cents - v_discount, 0);

  if v_plan.prices_include_vat then
    -- Les montants affiches sont TTC : on extrait la part de TVA.
    v_vat := v_net - (v_net * 10000) / (10000 + v_plan.vat_rate_bps);
    return (v_plan.setup_price_cents, v_plan.maintenance_price_cents, v_discount,
            v_vat, v_net, v_plan.vat_rate_bps, v_plan.currency)::app.price_breakdown;
  end if;

  v_vat := (v_net * v_plan.vat_rate_bps) / 10000;
  return (v_plan.setup_price_cents, v_plan.maintenance_price_cents, v_discount,
          v_vat, v_net + v_vat, v_plan.vat_rate_bps, v_plan.currency)::app.price_breakdown;
end;
$$;

-- -----------------------------------------------------------------------------
--  Creation d'une commande — prix relus dans le catalogue serveur
-- -----------------------------------------------------------------------------
create or replace function app.create_order(
  p_organization_id  uuid,
  p_plan_id          uuid,
  p_sector_slug      text,
  p_business_type    text,
  p_questionnaire    jsonb default '{}'::jsonb,
  p_requested_domain text default null,
  p_domain_handling  text default 'none',
  p_coupon_code      text default null,
  p_customer_notes   text default null,
  p_terms_version    text default null,
  p_ip_hash          text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor    uuid := app.current_user_id();
  v_plan     public.plans%rowtype;
  v_price    app.price_breakdown;
  v_order_id uuid;
  v_ref      text;
begin
  if v_actor is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  if not (app.org_can(p_organization_id, 'billing.manage') or app.is_platform_admin()) then
    raise exception 'Droit de facturation requis sur cette organisation'
      using errcode = '42501';
  end if;
  if p_terms_version is null then
    raise exception 'Acceptation des conditions generales de vente requise'
      using errcode = '23514';
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  v_price := app.compute_order_pricing(p_plan_id, p_coupon_code);
  v_ref := app.next_order_reference();

  insert into public.orders (
    reference, organization_id, created_by, status,
    plan_id, plan_slug, plan_version,
    setup_price_cents, maintenance_price_cents, billing_interval, discount_cents,
    vat_rate_bps, vat_cents, total_cents, currency, coupon_code,
    sector_slug, business_type_slug, questionnaire,
    requested_domain, domain_handling, customer_notes,
    terms_version, terms_accepted_at, terms_accepted_ip_hash
  ) values (
    v_ref, p_organization_id, v_actor, 'draft',
    v_plan.id, v_plan.slug, v_plan.version,
    v_price.setup_cents, v_price.maintenance_cents, v_plan.billing_interval,
    v_price.discount_cents,
    v_price.vat_rate_bps, v_price.vat_cents, v_price.total_cents,
    v_price.currency, upper(nullif(p_coupon_code, '')),
    p_sector_slug, p_business_type, coalesce(p_questionnaire, '{}'::jsonb),
    lower(nullif(p_requested_domain, '')), p_domain_handling, p_customer_notes,
    p_terms_version, now(), p_ip_hash
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, kind, label, quantity, unit_price_cents,
                                  total_cents, sort_order)
  values
    (v_order_id, 'plan_setup', 'Creation du site — offre ' || v_plan.name,
     1, v_price.setup_cents, v_price.setup_cents, 10);

  if v_price.discount_cents > 0 then
    insert into public.order_items (order_id, kind, label, quantity, unit_price_cents,
                                    total_cents, sort_order)
    values (v_order_id, 'discount', 'Code promotionnel ' || upper(p_coupon_code),
            1, -v_price.discount_cents, -v_price.discount_cents, 20);
  end if;

  if v_price.maintenance_cents > 0 then
    insert into public.order_items (order_id, kind, label, quantity, unit_price_cents,
                                    total_cents, sort_order)
    values (v_order_id, 'plan_maintenance',
            'Maintenance annuelle — offre ' || v_plan.name,
            1, v_price.maintenance_cents, v_price.maintenance_cents, 30);
  end if;

  insert into public.consents (user_id, organization_id, kind, document_version,
                               granted, ip_hash, source)
  values (v_actor, p_organization_id, 'terms', p_terms_version, true, p_ip_hash, 'checkout');

  perform app.write_audit('order.created', p_organization_id, null, 'order',
                          v_order_id::text,
                          jsonb_build_object('reference', v_ref,
                                             'plan', v_plan.slug,
                                             'total_cents', v_price.total_cents));
  return v_order_id;
end;
$$;

revoke all on function app.create_order(
  uuid, uuid, text, text, jsonb, text, text, text, text, text, text
) from anon;

-- -----------------------------------------------------------------------------
--  Verrou : les colonnes monetaires d'une commande payee sont figees
-- -----------------------------------------------------------------------------
create or replace function app.guard_order_financials()
returns trigger
language plpgsql
set search_path = public, app, pg_catalog
as $$
begin
  if old.status in ('paid', 'refunded', 'partially_refunded') then
    if new.setup_price_cents is distinct from old.setup_price_cents
       or new.maintenance_price_cents is distinct from old.maintenance_price_cents
       or new.discount_cents is distinct from old.discount_cents
       or new.total_cents is distinct from old.total_cents
       or new.vat_cents is distinct from old.vat_cents
       or new.currency is distinct from old.currency
       or new.plan_id is distinct from old.plan_id then
      raise exception 'Les montants d''une commande payee sont immuables'
        using errcode = '23514';
    end if;
  end if;

  -- Le passage en `paid` n'est legitime que depuis un webhook verifie.
  if new.status = 'paid' and old.status <> 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;
  return new;
end;
$$;

create trigger orders_guard_financials
  before update on public.orders
  for each row execute function app.guard_order_financials();

-- -----------------------------------------------------------------------------
--  Demande de remboursement — eligibilite calculee cote serveur
-- -----------------------------------------------------------------------------
create or replace function app.request_refund(
  p_order_id uuid,
  p_reason   text,
  p_window_days int default 15,
  p_domain_deduction_cents int default 1000
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor      uuid := app.current_user_id();
  v_order      public.orders%rowtype;
  v_project    public.projects%rowtype;
  v_payment    public.payments%rowtype;
  v_domain     public.site_domains%rowtype;
  v_go_live    timestamptz;
  v_deadline   timestamptz;
  v_paid       integer := 0;
  v_deduction  integer := 0;
  v_eligible   boolean;
  v_reason     text;
  v_request_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Commande introuvable' using errcode = 'P0002';
  end if;
  if not (app.org_can(v_order.organization_id, 'billing.manage') or app.is_platform_admin()) then
    raise exception 'Droit de facturation requis' using errcode = '42501';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'Seule une commande payee peut faire l''objet d''un remboursement'
      using errcode = '23514';
  end if;

  select * into v_project from public.projects where order_id = p_order_id limit 1;
  v_go_live := v_project.go_live_at;

  select * into v_payment
    from public.payments
   where order_id = p_order_id and scope = 'platform' and kind = 'setup'
     and status in ('succeeded', 'partially_refunded')
   order by created_at asc limit 1;

  v_paid := coalesce(v_payment.amount_cents, 0) - coalesce(v_payment.amount_refunded_cents, 0);

  -- Retenue domaine : uniquement si un domaine a REELLEMENT ete achete.
  if v_project.site_id is not null then
    select * into v_domain
      from public.site_domains
     where site_id = v_project.site_id and purchased_by_stax
     order by purchased_at asc limit 1;
  end if;

  if v_domain.id is not null then
    v_deduction := least(coalesce(p_domain_deduction_cents, 0), v_paid);
  end if;

  if v_go_live is null then
    v_eligible := null;
    v_reason := 'Le site n''a pas encore ete mis en ligne : la fenetre de '
             || 'retractation commerciale n''a pas commence.';
  else
    v_deadline := v_go_live + make_interval(days => p_window_days);
    v_eligible := now() <= v_deadline;
    v_reason := case
      when v_eligible then format(
        'Demande recue dans la fenetre de %s jours suivant la mise en ligne du %s.',
        p_window_days, to_char(v_go_live, 'DD/MM/YYYY'))
      else format(
        'Fenetre commerciale de %s jours expiree le %s.',
        p_window_days, to_char(v_deadline, 'DD/MM/YYYY'))
    end;
  end if;

  insert into public.refund_requests (
    organization_id, site_id, order_id, payment_id, requested_by, customer_reason,
    go_live_at, deadline_at, domain_purchased, domain_cost_cents,
    eligible, eligibility_reason, amount_paid_cents, deduction_cents,
    refund_amount_cents, currency, status
  ) values (
    v_order.organization_id, v_project.site_id, p_order_id, v_payment.id, v_actor, p_reason,
    v_go_live, v_deadline, v_domain.id is not null,
    coalesce(v_domain.purchase_cost_cents, 0),
    v_eligible, v_reason, v_paid, v_deduction,
    greatest(v_paid - v_deduction, 0), v_order.currency, 'requested'
  )
  returning id into v_request_id;

  perform app.write_audit('refund.requested', v_order.organization_id, v_project.site_id,
                          'refund_request', v_request_id::text,
                          jsonb_build_object('order', v_order.reference,
                                             'eligible', v_eligible,
                                             'amount_cents', greatest(v_paid - v_deduction, 0)));
  return v_request_id;
end;
$$;

revoke all on function app.request_refund(uuid, text, int, int) from anon;

comment on function app.request_refund(uuid, text, int, int) is
  'Créé une demande de remboursement avec une éligibilité calculée cote serveur. '
  'La retenue domaine n''est appliquée que si un domaine a effectivement ete acheté. '
  'Cette règle commerciale ne remplacé aucune obligation légale : le texte de '
  'reference reste configurable et doit être validé juridiquement.';

-- -----------------------------------------------------------------------------
--  Verrou : etat d'abonnement non modifiable depuis une session cliente
-- -----------------------------------------------------------------------------
create or replace function app.guard_subscription_state()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if app.is_service_role() or app.is_platform_admin() then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.maintenance_price_cents is distinct from old.maintenance_price_cents
     or new.plan_id is distinct from old.plan_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id then
    raise exception 'Le statut et le tarif d''un abonnement proviennent exclusivement de Stripe'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger subscriptions_guard_state
  before update on public.subscriptions
  for each row execute function app.guard_subscription_state();

-- -----------------------------------------------------------------------------
--  Verrou : un client ne modifie jamais son offre ni son organisation
-- -----------------------------------------------------------------------------
create or replace function app.guard_site_commercials()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if app.is_service_role() or app.is_platform_admin() then
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Un site ne peut pas changer d''organisation' using errcode = '42501';
  end if;
  if new.plan_id is distinct from old.plan_id
     or new.plan_slug is distinct from old.plan_slug then
    raise exception 'L''offre d''un site est definie par la commande, pas par le client'
      using errcode = '42501';
  end if;
  if new.is_demo is distinct from old.is_demo
     or new.suspended_at is distinct from old.suspended_at then
    raise exception 'Champ reserve a l''administration de la plateforme'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger sites_guard_commercials
  before update on public.sites
  for each row execute function app.guard_site_commercials();

-- Meme principe pour les organisations : ni suspension, ni marquage demo,
-- ni rattachement Stripe depuis une session cliente.
create or replace function app.guard_org_commercials()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if app.is_service_role() or app.is_platform_admin() then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.is_demo is distinct from old.is_demo
     or new.suspended_at is distinct from old.suspended_at
     or new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception 'Champ reserve a l''administration de la plateforme'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizations_guard_commercials
  before update on public.organizations
  for each row execute function app.guard_org_commercials();

-- -----------------------------------------------------------------------------
--  Verrou de quota : la limite d'offre est verifiee par la base
-- -----------------------------------------------------------------------------
create or replace function app.enforce_page_quota()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_org   uuid := app.site_org(new.site_id);
  v_limit integer;
  v_used  integer;
begin
  if app.is_service_role() or app.is_platform_admin() then
    return new;
  end if;
  v_limit := app.feature_limit(v_org, 'max_pages');
  if v_limit is null or v_limit < 0 then
    return new;
  end if;
  v_used := app.usage_count(v_org, 'max_pages');
  if v_used >= v_limit then
    raise exception 'Limite de % pages atteinte pour votre offre', v_limit
      using errcode = '23514',
            hint = 'Passez a une offre superieure pour ajouter davantage de pages.';
  end if;
  return new;
end;
$$;

create trigger site_pages_enforce_quota
  before insert on public.site_pages
  for each row execute function app.enforce_page_quota();

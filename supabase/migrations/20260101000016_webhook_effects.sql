-- =============================================================================
--  Effets des evenements de paiement
-- =============================================================================
--  LA VERITE SUR UN PAIEMENT VIENT DU WEBHOOK, JAMAIS DE LA REDIRECTION DU
--  NAVIGATEUR. Une personne peut atteindre la page de confirmation sans avoir
--  paye : c'est l'evenement signe par Stripe qui fait foi, et lui seul fait
--  basculer une commande en « payee ».
--
--  Chaque fonction est :
--   * IDEMPOTENTE — un meme evenement rejoue (Stripe reessaie jusqu'a 3 jours)
--     ne cree jamais de doublon et ne compte jamais deux fois ;
--   * ATOMIQUE — commande, paiement, abonnement, site et projet basculent dans
--     la meme transaction, ou pas du tout ;
--   * SOUVERAINE SUR LES MONTANTS — le montant credite est celui deja calcule
--     et fige dans la commande, jamais une valeur lue dans la charge utile.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Enregistrement d'un evenement — retourne faux si deja traite
-- -----------------------------------------------------------------------------
create or replace function app.begin_webhook_event(
  p_provider   text,
  p_event_id   text,
  p_event_type text,
  p_account_id text default null,
  p_signed_at  timestamptz default null,
  p_payload    jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_existing public.webhook_events%rowtype;
begin
  select * into v_existing
    from public.webhook_events
   where provider = p_provider and event_id = p_event_id
   for update;

  if found then
    if v_existing.status = 'processed' then
      -- Deja traite : l'appelant doit s'arreter la.
      return false;
    end if;
    update public.webhook_events
       set attempts = attempts + 1, status = 'processing', error = null
     where id = v_existing.id;
    return true;
  end if;

  insert into public.webhook_events
    (provider, event_id, event_type, account_id, status, attempts, signed_at, payload_safe)
  values
    (p_provider, p_event_id, p_event_type, p_account_id, 'processing', 1, p_signed_at, p_payload);
  return true;
end;
$$;

create or replace function app.finish_webhook_event(
  p_provider text,
  p_event_id text,
  p_status   text,
  p_error    text default null
)
returns void
language sql
security definer
set search_path = public, app, pg_catalog
as $$
  update public.webhook_events
     set status = p_status::app.webhook_status,
         processed_at = case when p_status = 'processed' then now() else processed_at end,
         error = left(p_error, 2000)
   where provider = p_provider and event_id = p_event_id;
$$;

-- -----------------------------------------------------------------------------
--  Paiement initial confirme
-- -----------------------------------------------------------------------------
create or replace function app.apply_order_paid(
  p_order_id            uuid,
  p_payment_intent_id   text,
  p_checkout_session_id text,
  p_stripe_customer_id  text default null,
  p_charge_id           text default null,
  p_brand               text default null,
  p_last4               text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_order   public.orders%rowtype;
  v_site    uuid;
  v_project uuid;
  v_payment uuid;
  v_amount  integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'order_not_found');
  end if;

  -- Rejeu : la commande est deja payee (ou remboursee), il n'y a rien a refaire.
  if v_order.status in ('paid', 'refunded', 'partially_refunded') then
    return jsonb_build_object('ok', true, 'code', 'already_applied', 'orderId', v_order.id);
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'code', 'order_cancelled');
  end if;

  -- Le montant provient de la commande, figee a la creation par
  -- app.compute_order_pricing(). Rien de ce que le navigateur ou la charge
  -- utile contiennent n'entre dans ce calcul.
  v_amount := v_order.total_cents;
  if v_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount');
  end if;

  update public.orders
     set status = 'paid',
         paid_at = coalesce(paid_at, now()),
         stripe_payment_intent_id = coalesce(p_payment_intent_id, stripe_payment_intent_id),
         stripe_checkout_session_id = coalesce(p_checkout_session_id, stripe_checkout_session_id)
   where id = v_order.id;

  -- Le paiement est unique par intention : l'index partiel garantit qu'un
  -- rejeu n'en cree pas un second.
  insert into public.payments
    (organization_id, site_id, order_id, scope, status, kind, amount_cents, currency,
     stripe_payment_intent_id, stripe_charge_id, payment_method_brand, payment_method_last4,
     description, succeeded_at)
  values
    (v_order.organization_id, v_order.site_id, v_order.id, 'platform', 'succeeded', 'setup',
     v_amount, v_order.currency, p_payment_intent_id, p_charge_id, p_brand, p_last4,
     'Création du site — commande ' || v_order.reference, now())
  on conflict (stripe_payment_intent_id) where stripe_payment_intent_id is not null
  do update set status = 'succeeded', succeeded_at = coalesce(public.payments.succeeded_at, now())
  returning id into v_payment;

  if p_stripe_customer_id is not null then
    update public.organizations
       set stripe_customer_id = coalesce(stripe_customer_id, p_stripe_customer_id)
     where id = v_order.organization_id;
  end if;

  -- Le site est cree ici, et une seule fois : la commande en garde la trace.
  v_site := v_order.site_id;
  if v_site is null then
    insert into public.sites
      (organization_id, name, slug, status, business_type_slug, plan_slug, created_by)
    values
      (v_order.organization_id,
       coalesce(nullif(v_order.questionnaire ->> 'businessName', ''), 'Mon site'),
       app.unique_site_slug(
         coalesce(nullif(v_order.questionnaire ->> 'businessName', ''), 'mon-site')),
       'draft', v_order.business_type_slug, v_order.plan_slug, v_order.created_by)
    returning id into v_site;

    update public.orders set site_id = v_site where id = v_order.id;
  end if;

  -- Projet de suivi, visible par le client des le paiement.
  select id into v_project from public.projects where order_id = v_order.id limit 1;
  if v_project is null then
    insert into public.projects
      (reference, organization_id, site_id, order_id, status, title, started_at)
    values
      (v_order.reference, v_order.organization_id, v_site, v_order.id, 'ordered',
       'Création de votre site', now())
    returning id into v_project;
  end if;

  perform app.write_audit(
    'order.paid', v_order.organization_id, v_site, 'order', v_order.id::text,
    jsonb_build_object('reference', v_order.reference, 'amount_cents', v_amount));

  return jsonb_build_object(
    'ok', true, 'code', 'applied',
    'orderId', v_order.id, 'siteId', v_site, 'projectId', v_project, 'paymentId', v_payment);
end;
$$;

-- -----------------------------------------------------------------------------
--  Abonnement de maintenance
-- -----------------------------------------------------------------------------
create or replace function app.upsert_subscription_from_stripe(
  p_stripe_subscription_id text,
  p_stripe_customer_id     text,
  p_status                 text,
  p_period_start           timestamptz,
  p_period_end             timestamptz,
  p_cancel_at_period_end   boolean,
  p_order_id               uuid default null,
  p_price_id               text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_order        public.orders%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_status       app.subscription_status;
  v_state        app.maintenance_state;
begin
  -- Correspondance explicite entre les statuts Stripe et les notres.
  -- `incomplete_expired` n'existe pas chez nous : un abonnement jamais paye
  -- est simplement resilie, il n'a jamais rendu de service.
  v_status := case p_status
                when 'trialing' then 'trialing'
                when 'active' then 'active'
                when 'past_due' then 'past_due'
                when 'unpaid' then 'unpaid'
                when 'canceled' then 'canceled'
                when 'incomplete' then 'incomplete'
                when 'incomplete_expired' then 'canceled'
                when 'paused' then 'paused'
                else 'incomplete'
              end::app.subscription_status;

  -- L'etat PRODUIT est distinct du statut Stripe : il decrit ce que le client
  -- constate (site en ligne, periode de continuite, suspension), la ou le
  -- statut Stripe ne decrit que la facturation.
  v_state := case
               when v_status in ('trialing', 'active') then 'active'
               when v_status = 'past_due' then 'grace_period'
               when v_status in ('canceled', 'unpaid') then 'maintenance_ended'
               when v_status = 'paused' then 'suspended'
               else 'active'
             end::app.maintenance_state;

  if coalesce(p_cancel_at_period_end, false) and v_status in ('trialing', 'active') then
    v_state := 'cancel_at_period_end'::app.maintenance_state;
  end if;

  select * into v_subscription
    from public.subscriptions
   where stripe_subscription_id = p_stripe_subscription_id
   for update;

  if found then
    update public.subscriptions
       set status = v_status,
           maintenance_state = v_state,
           stripe_customer_id = coalesce(p_stripe_customer_id, stripe_customer_id),
           stripe_price_id = coalesce(p_price_id, stripe_price_id),
           current_period_start = coalesce(p_period_start, current_period_start),
           current_period_end = coalesce(p_period_end, current_period_end),
           cancel_at_period_end = coalesce(p_cancel_at_period_end, cancel_at_period_end),
           canceled_at = case when v_status = 'canceled' then coalesce(canceled_at, now())
                              else canceled_at end,
           -- La periode de continuite demarre a la fin de la periode payee.
           grace_period_ends_at = case
             when v_status = 'canceled'
               then coalesce(p_period_end, now())
                    + make_interval(days => app.maintenance_grace_days())
             else grace_period_ends_at
           end
     where id = v_subscription.id;

    return jsonb_build_object('ok', true, 'code', 'updated', 'subscriptionId', v_subscription.id);
  end if;

  if p_order_id is null then
    return jsonb_build_object('ok', false, 'code', 'order_required');
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'order_not_found');
  end if;

  -- Le prix de maintenance ET sa periodicite viennent de la commande : un
  -- changement du tarif public ne modifie jamais un contrat en cours
  -- (grandfathering).
  insert into public.subscriptions
    (organization_id, site_id, order_id, status, maintenance_state, plan_id, plan_slug,
     maintenance_price_cents, billing_interval, vat_rate_bps, currency,
     stripe_subscription_id, stripe_customer_id, stripe_price_id,
     current_period_start, current_period_end, cancel_at_period_end)
  values
    (v_order.organization_id, v_order.site_id, v_order.id, v_status, v_state,
     v_order.plan_id, v_order.plan_slug, v_order.maintenance_price_cents,
     v_order.billing_interval, v_order.vat_rate_bps,
     v_order.currency, p_stripe_subscription_id, p_stripe_customer_id, p_price_id,
     p_period_start, p_period_end, coalesce(p_cancel_at_period_end, false))
  returning * into v_subscription;

  perform app.write_audit(
    'subscription.created', v_order.organization_id, v_order.site_id,
    'subscription', v_subscription.id::text,
    jsonb_build_object('plan', v_order.plan_slug, 'status', v_status));

  return jsonb_build_object('ok', true, 'code', 'created', 'subscriptionId', v_subscription.id);
end;
$$;

-- -----------------------------------------------------------------------------
--  Facture payee ou echouee
-- -----------------------------------------------------------------------------
create or replace function app.record_invoice_event(
  p_stripe_invoice_id      text,
  p_stripe_subscription_id text,
  p_status                 text,
  p_amount_cents           integer,
  p_currency               text,
  p_hosted_url             text default null,
  p_pdf_url                text default null,
  p_number                 text default null,
  p_period_start           timestamptz default null,
  p_period_end             timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_subscription public.subscriptions%rowtype;
begin
  select * into v_subscription
    from public.subscriptions
   where stripe_subscription_id = p_stripe_subscription_id;

  insert into public.invoices
    (organization_id, subscription_id, stripe_invoice_id, number, status,
     amount_due_cents, amount_paid_cents, currency, hosted_invoice_url, invoice_pdf_url,
     period_start, period_end, issued_at, paid_at)
  values
    (v_subscription.organization_id, v_subscription.id, p_stripe_invoice_id, p_number, p_status,
     greatest(p_amount_cents, 0),
     case when p_status = 'paid' then greatest(p_amount_cents, 0) else 0 end,
     upper(coalesce(p_currency, 'EUR')), p_hosted_url, p_pdf_url,
     p_period_start, p_period_end, now(),
     case when p_status = 'paid' then now() else null end)
  on conflict (stripe_invoice_id) do update set
    status = excluded.status,
    amount_paid_cents = excluded.amount_paid_cents,
    hosted_invoice_url = coalesce(excluded.hosted_invoice_url, public.invoices.hosted_invoice_url),
    invoice_pdf_url = coalesce(excluded.invoice_pdf_url, public.invoices.invoice_pdf_url),
    paid_at = coalesce(public.invoices.paid_at, excluded.paid_at);

  return jsonb_build_object('ok', true, 'subscriptionId', v_subscription.id);
end;
$$;

-- -----------------------------------------------------------------------------
--  Remboursement confirme par Stripe
-- -----------------------------------------------------------------------------
create or replace function app.apply_refund_settled(
  p_stripe_refund_id text,
  p_payment_intent_id text,
  p_amount_cents     integer,
  p_status           text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_payment public.payments%rowtype;
  v_request public.refund_requests%rowtype;
begin
  select * into v_payment
    from public.payments
   where stripe_payment_intent_id = p_payment_intent_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'payment_not_found');
  end if;

  insert into public.refunds
    (payment_id, organization_id, stripe_refund_id, amount_cents, currency, status, reason)
  values
    (v_payment.id, v_payment.organization_id, p_stripe_refund_id,
     greatest(p_amount_cents, 0), v_payment.currency, p_status, 'commercial_guarantee')
  on conflict (stripe_refund_id) do update set status = excluded.status, updated_at = now();

  if p_status = 'succeeded' then
    update public.payments
       set amount_refunded_cents = least(amount_refunded_cents + greatest(p_amount_cents, 0),
                                         amount_cents),
           status = case
             when amount_refunded_cents + greatest(p_amount_cents, 0) >= amount_cents
               then 'refunded'::app.payment_status
             else 'partially_refunded'::app.payment_status
           end
     where id = v_payment.id;

    select * into v_request
      from public.refund_requests
     where order_id = v_payment.order_id
       and status in ('approved', 'processing')
     order by created_at desc
     limit 1;

    if found then
      update public.refund_requests
         set status = 'refunded', processed_at = now(), stripe_refund_id = p_stripe_refund_id
       where id = v_request.id;
    end if;

    -- Remboursement partiel ou total : la commande reflete ce qui a vraiment
    -- ete rendu, jamais une valeur supposee.
    update public.orders
       set status = case
         when v_payment.amount_refunded_cents + greatest(p_amount_cents, 0) >= v_payment.amount_cents
           then 'refunded'::app.order_status
         else 'partially_refunded'::app.order_status
       end
     where id = v_payment.order_id;
  end if;

  return jsonb_build_object('ok', true, 'paymentId', v_payment.id);
end;
$$;

-- -----------------------------------------------------------------------------
--  Utilitaires
-- -----------------------------------------------------------------------------
create or replace function app.maintenance_grace_days()
returns int
language sql
immutable
set search_path = pg_catalog
as $$ select 30; $$;

comment on function app.maintenance_grace_days() is
  'Duree de continuite apres la fin de la periode payee. Refletee cote TypeScript '
  'par MAINTENANCE_GRACE_PERIOD_DAYS ; les deux valeurs sont comparees par un test.';

/**
 * Slug de site unique dans toute la base.
 * Un slug est un identifiant public : deux clients ne peuvent pas partager le
 * meme, sans quoi leurs sous-domaines entreraient en collision.
 */
create or replace function app.unique_site_slug(p_source text)
returns text
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_base    text;
  v_slug    text;
  v_counter int := 0;
begin
  -- La mise en minuscules precede le nettoyage : sinon chaque majuscule,
  -- absente de la classe [a-z0-9], serait remplacee par un tiret.
  v_base := trim(both '-' from regexp_replace(
              translate(lower(coalesce(p_source, '')),
                        'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
                        'aaaaaaceeeeiiiinooooouuuuyy'),
              '[^a-z0-9]+', '-', 'g'));
  if v_base is null or length(v_base) < 2 then
    v_base := 'site';
  end if;
  v_base := left(v_base, 40);
  v_slug := v_base;

  while exists (select 1 from public.sites where slug = v_slug) loop
    v_counter := v_counter + 1;
    v_slug := left(v_base, 36) || '-' || v_counter::text;
  end loop;

  return v_slug;
end;
$$;

-- -----------------------------------------------------------------------------
--  Surface publique — role de service uniquement
-- -----------------------------------------------------------------------------
create or replace function public.begin_webhook_event(
  p_provider text, p_event_id text, p_event_type text,
  p_account_id text default null, p_signed_at timestamptz default null,
  p_payload jsonb default '{}'::jsonb
) returns boolean language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.begin_webhook_event(p_provider, p_event_id, p_event_type,
                                 p_account_id, p_signed_at, p_payload);
$$;

create or replace function public.finish_webhook_event(
  p_provider text, p_event_id text, p_status text, p_error text default null
) returns void language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.finish_webhook_event(p_provider, p_event_id, p_status, p_error);
$$;

create or replace function public.apply_order_paid(
  p_order_id uuid, p_payment_intent_id text, p_checkout_session_id text,
  p_stripe_customer_id text default null, p_charge_id text default null,
  p_brand text default null, p_last4 text default null
) returns jsonb language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.apply_order_paid(p_order_id, p_payment_intent_id, p_checkout_session_id,
                              p_stripe_customer_id, p_charge_id, p_brand, p_last4);
$$;

create or replace function public.upsert_subscription_from_stripe(
  p_stripe_subscription_id text, p_stripe_customer_id text, p_status text,
  p_period_start timestamptz, p_period_end timestamptz, p_cancel_at_period_end boolean,
  p_order_id uuid default null, p_price_id text default null
) returns jsonb language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.upsert_subscription_from_stripe(p_stripe_subscription_id, p_stripe_customer_id,
           p_status, p_period_start, p_period_end, p_cancel_at_period_end, p_order_id, p_price_id);
$$;

create or replace function public.record_invoice_event(
  p_stripe_invoice_id text, p_stripe_subscription_id text, p_status text,
  p_amount_cents integer, p_currency text, p_hosted_url text default null,
  p_pdf_url text default null, p_number text default null,
  p_period_start timestamptz default null, p_period_end timestamptz default null
) returns jsonb language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.record_invoice_event(p_stripe_invoice_id, p_stripe_subscription_id, p_status,
           p_amount_cents, p_currency, p_hosted_url, p_pdf_url, p_number,
           p_period_start, p_period_end);
$$;

create or replace function public.apply_refund_settled(
  p_stripe_refund_id text, p_payment_intent_id text, p_amount_cents integer, p_status text
) returns jsonb language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.apply_refund_settled(p_stripe_refund_id, p_payment_intent_id, p_amount_cents, p_status);
$$;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.begin_webhook_event(text, text, text, text, timestamptz, jsonb)',
    'public.finish_webhook_event(text, text, text, text)',
    'public.apply_order_paid(uuid, text, text, text, text, text, text)',
    'public.upsert_subscription_from_stripe(text, text, text, timestamptz, timestamptz, boolean, uuid, text)',
    'public.record_invoice_event(text, text, text, integer, text, text, text, text, timestamptz, timestamptz)',
    'public.apply_refund_settled(text, text, integer, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$$;

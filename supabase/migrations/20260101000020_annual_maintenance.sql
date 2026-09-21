-- =============================================================================
--  Maintenance annuelle et nouvelle grille tarifaire
--
--  Cette migration remplace une modification des migrations passees, qui etait
--  une faute : le lanceur verifie l'empreinte de chaque fichier deja applique
--  et refuse de tourner si elle change. Une base deja migree restait donc
--  bloquee sur l'ancien schema pendant que le code interrogeait les nouvelles
--  colonnes. Le catalogue devenait vide, et plus rien ne fonctionnait.
--
--  Regle a ne plus jamais enfreindre : une migration appliquee est figee. Tout
--  changement passe par un nouveau fichier, comme celui-ci.
--
--  Elle est ecrite pour etre rejouable et sans effet sur une base deja a jour :
--  chaque operation teste l'etat courant avant d'agir.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. La maintenance n'est plus mensuelle
--
--  Le nom de la colonne portait la periodicite. Il devient neutre, et la
--  periodicite devient une donnee : une offre ne suppose plus son rythme de
--  facturation, elle le declare.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'plans'
       and column_name = 'monthly_price_cents'
  ) then
    alter table public.plans rename column monthly_price_cents to maintenance_price_cents;
    alter table public.plans rename column stripe_monthly_price_id to stripe_maintenance_price_id;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'orders'
       and column_name = 'monthly_price_cents'
  ) then
    alter table public.orders rename column monthly_price_cents to maintenance_price_cents;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'subscriptions'
       and column_name = 'monthly_price_cents'
  ) then
    alter table public.subscriptions rename column monthly_price_cents to maintenance_price_cents;
  end if;
end;
$$;

alter table public.plans
  add column if not exists billing_interval text not null default 'year';
alter table public.orders
  add column if not exists billing_interval text not null default 'year';
alter table public.subscriptions
  add column if not exists billing_interval text not null default 'year';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plans_billing_interval_valid'
  ) then
    alter table public.plans add constraint plans_billing_interval_valid
      check (billing_interval in ('year', 'month'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_billing_interval_valid'
  ) then
    alter table public.orders add constraint orders_billing_interval_valid
      check (billing_interval in ('year', 'month'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_billing_interval_valid'
  ) then
    alter table public.subscriptions add constraint subscriptions_billing_interval_valid
      check (billing_interval in ('year', 'month'));
  end if;
end;
$$;

comment on column public.plans.billing_interval is
  'Periodicite de la maintenance. `year` pour toutes les offres StaX. La '
  'colonne existe pour qu''aucun code n''ait a supposer le rythme de facturation.';

-- Un coupon peut viser la maintenance : le libelle suit le renommage.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'coupons_applies_to_valid'
  ) then
    alter table public.coupons drop constraint coupons_applies_to_valid;
  end if;
end;
$$;

update public.coupons set applies_to = 'maintenance' where applies_to = 'monthly';

alter table public.coupons add constraint coupons_applies_to_valid
  check (applies_to in ('setup', 'maintenance', 'both'));

-- -----------------------------------------------------------------------------
--  2. Fonctions qui nommaient la colonne
-- -----------------------------------------------------------------------------
drop type if exists app.price_breakdown cascade;

create type app.price_breakdown as (
  setup_cents       integer,
  maintenance_cents integer,
  discount_cents    integer,
  vat_cents         integer,
  total_cents       integer,
  vat_rate_bps      integer,
  currency          char(3)
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

create or replace function public.compute_order_pricing(p_plan_id uuid, p_coupon text default null)
returns app.price_breakdown
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select app.compute_order_pricing(p_plan_id, p_coupon);
$$;

revoke all on function public.compute_order_pricing(uuid, text) from public;
grant execute on function public.compute_order_pricing(uuid, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
--  3. Creation d'abonnement depuis un evenement Stripe
--
--  La periodicite est figee avec le prix : un changement de tarif public ne
--  touche jamais un contrat en cours.
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

  -- Le prix de maintenance et sa periodicite viennent de la commande : un changement du tarif public ne
  -- modifie jamais un contrat en cours (grandfathering).
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
--  4. Nouvelle grille tarifaire
--
--  Les anciennes offres ne sont PAS supprimees : des commandes et des
--  abonnements les referencent, et leurs titulaires gardent leur prix. Elles
--  sont retirees de la vente et horodatees, ce qui est exactement ce que le
--  grandfathering demande — un contrat en cours ne change pas sous son client.
-- -----------------------------------------------------------------------------
update public.plans
   set is_active = false,
       is_public = false,
       valid_until = coalesce(valid_until, now())
 where slug in ('classique', 'signature')
   and is_active;

-- L'offre « premium » change de prix : l'ancienne version est archivee et une
-- nouvelle version est creee, plutot que de reecrire un tarif deja vendu.
update public.plans
   set is_active = false,
       is_public = false,
       valid_until = coalesce(valid_until, now())
 where slug = 'premium'
   and version = 1
   and setup_price_cents <> 55000;

insert into public.plans
  (slug, version, name, tagline, description, badge, setup_price_cents, maintenance_price_cents,
   billing_interval, vat_rate_bps, prices_include_vat, is_quote_only, sort_order)
values
  ('essentiel', 1, 'Essentiel',
   'Le site vitrine professionnel, complet et rapide.',
   'Un site clair et performant pour présenter votre activité, être trouvé sur Google et recevoir vos premiers contacts. Vous le modifiez vous-même, autant de fois que vous voulez.',
   null, 30000, 2200, 'year', 2000, false, false, 10),
  ('premium', 2, 'Premium',
   'Votre site devient un outil de travail.',
   'Tout l''Essentiel, plus les réservations en ligne, les actualités, les statistiques détaillées et la publication programmée. Sans encaissement en ligne.',
   'Le plus choisi', 55000, 3200, 'year', 2000, false, false, 20),
  ('ultra-premium', 1, 'Ultra Premium',
   'Tout inclus, sans compromis.',
   'Design entièrement sur mesure, boutique et encaissement en ligne, comptes clients, multilingue, animations avancées et support prioritaire. Tout ce que StaX sait faire.',
   'Tout inclus', 109900, 8200, 'year', 2000, false, false, 30)
on conflict (slug, version) do update
   set name = excluded.name,
       tagline = excluded.tagline,
       description = excluded.description,
       badge = excluded.badge,
       setup_price_cents = excluded.setup_price_cents,
       maintenance_price_cents = excluded.maintenance_price_cents,
       billing_interval = excluded.billing_interval,
       is_active = true,
       is_public = true,
       valid_until = null,
       sort_order = excluded.sort_order;

-- L'offre sur devis existe deja : on s'assure seulement de sa periodicite.
update public.plans set billing_interval = 'year' where slug = 'sur-mesure';

-- -----------------------------------------------------------------------------
--  5. Droits par offre
--
--  L'encaissement en ligne est reserve a l'Ultra Premium. Ce n'est pas un
--  argument commercial : c'est la base qui le fait respecter, et un test le
--  verifie pour chacune des trois offres.
-- -----------------------------------------------------------------------------
do $$
declare
  v_essentiel uuid := (select id from public.plans where slug = 'essentiel' and version = 1);
  v_premium   uuid := (select id from public.plans where slug = 'premium' and version = 2);
  v_ultra     uuid := (select id from public.plans where slug = 'ultra-premium' and version = 1);
begin
  delete from public.plan_features where plan_id in (v_essentiel, v_premium, v_ultra);

  insert into public.plan_features (plan_id, feature_key, enabled, limit_value) values
    (v_essentiel, 'custom_domain', true, null),
    (v_essentiel, 'seo_tools', true, null),
    (v_essentiel, 'content_editor', true, null),
    (v_essentiel, 'version_history', true, null),
    (v_essentiel, 'scheduled_publishing', false, null),
    (v_essentiel, 'advanced_animations', false, null),
    (v_essentiel, 'custom_design', false, null),
    (v_essentiel, 'bookings', false, null),
    (v_essentiel, 'ecommerce', false, null),
    (v_essentiel, 'online_payments', false, null),
    (v_essentiel, 'customer_accounts', false, null),
    (v_essentiel, 'blog', false, null),
    (v_essentiel, 'advanced_analytics', false, null),
    (v_essentiel, 'multi_language', false, null),
    (v_essentiel, 'team_collaboration', true, null),
    (v_essentiel, 'priority_support', false, null),
    (v_essentiel, 'max_sites', true, 1),
    (v_essentiel, 'max_pages', true, 8),
    (v_essentiel, 'max_team_members', true, 2),
    (v_essentiel, 'max_products', false, 0),
    (v_essentiel, 'max_media_mb', true, 1024),
    (v_essentiel, 'max_monthly_submissions', true, 500),
    (v_essentiel, 'max_forms', true, 2);

  insert into public.plan_features (plan_id, feature_key, enabled, limit_value) values
    (v_premium, 'custom_domain', true, null),
    (v_premium, 'seo_tools', true, null),
    (v_premium, 'content_editor', true, null),
    (v_premium, 'version_history', true, null),
    (v_premium, 'scheduled_publishing', true, null),
    (v_premium, 'advanced_animations', false, null),
    (v_premium, 'custom_design', false, null),
    (v_premium, 'bookings', true, null),
    (v_premium, 'ecommerce', false, null),
    (v_premium, 'online_payments', false, null),
    (v_premium, 'customer_accounts', false, null),
    (v_premium, 'blog', true, null),
    (v_premium, 'advanced_analytics', true, null),
    (v_premium, 'multi_language', false, null),
    (v_premium, 'team_collaboration', true, null),
    (v_premium, 'priority_support', false, null),
    (v_premium, 'max_sites', true, 1),
    (v_premium, 'max_pages', true, 25),
    (v_premium, 'max_team_members', true, 6),
    (v_premium, 'max_products', false, 0),
    (v_premium, 'max_media_mb', true, 5120),
    (v_premium, 'max_monthly_submissions', true, 3000),
    (v_premium, 'max_forms', true, 8);

  insert into public.plan_features (plan_id, feature_key, enabled, limit_value) values
    (v_ultra, 'custom_domain', true, null),
    (v_ultra, 'seo_tools', true, null),
    (v_ultra, 'content_editor', true, null),
    (v_ultra, 'version_history', true, null),
    (v_ultra, 'scheduled_publishing', true, null),
    (v_ultra, 'advanced_animations', true, null),
    (v_ultra, 'custom_design', true, null),
    (v_ultra, 'bookings', true, null),
    (v_ultra, 'ecommerce', true, null),
    (v_ultra, 'online_payments', true, null),
    (v_ultra, 'customer_accounts', true, null),
    (v_ultra, 'blog', true, null),
    (v_ultra, 'advanced_analytics', true, null),
    (v_ultra, 'multi_language', true, null),
    (v_ultra, 'team_collaboration', true, null),
    (v_ultra, 'priority_support', true, null),
    (v_ultra, 'max_sites', true, 3),
    (v_ultra, 'max_pages', true, null),
    (v_ultra, 'max_team_members', true, 15),
    (v_ultra, 'max_products', true, null),
    (v_ultra, 'max_media_mb', true, 20480),
    (v_ultra, 'max_monthly_submissions', true, null),
    (v_ultra, 'max_forms', true, null);
end;
$$;

-- Les regles de deploiement progressif nommaient les anciennes offres.
update public.feature_flags
   set rules = '{"plans":["premium","ultra-premium"]}'::jsonb
 where key = 'editor.scheduled_publish';

update public.feature_flags
   set rules = '{"plans":["ultra-premium"]}'::jsonb
 where key = 'sites.multi_language';

-- -----------------------------------------------------------------------------
--  6. Gardes financieres
--
--  Ces declencheurs interdisent a un client de modifier lui-meme un prix, une
--  offre ou un etat d'abonnement. Ils nommaient la colonne renommee : sans
--  cette recreation, ils leveraient une erreur a la premiere commande payee —
--  exactement au pire moment.
--
--  Le corps est repris a l'identique de la migration d'origine ; seules les
--  references a la colonne changent.
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

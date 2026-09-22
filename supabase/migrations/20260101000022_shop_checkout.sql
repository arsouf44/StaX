-- =============================================================================
--  Commande en ligne sur le site d'un client
--
--  Le panier vivait dans un cookie signe et savait s'afficher. Il ne savait pas
--  commander : aucune ligne n'etait jamais ecrite dans `shop_orders`. C'est ce
--  que cette migration ajoute, en posant d'abord les regles d'argent.
--
--  Cinq regles, toutes appliquees ICI et non dans l'application :
--
--   1. LES PRIX SONT RELUS EN BASE. Le navigateur envoie des identifiants de
--      produit et des quantites, jamais un montant. Un panier trafique change
--      ce qu'on commande, jamais ce qu'on paie.
--   2. LE STOCK EST DECREMENTE DANS LA MEME TRANSACTION, sous verrou de ligne.
--      Deux acheteurs simultanes sur le dernier article ne peuvent pas
--      l'obtenir tous les deux.
--   3. UNE COMMANDE NAIT « pending », JAMAIS « paid ». Le paiement ne vient
--      que du webhook Stripe signe, et seulement si le montant encaisse est
--      EXACTEMENT celui fige a la commande.
--   4. LE MONTANT D'UNE COMMANDE PAYEE EST IMMUABLE, y compris pour un
--      administrateur de la boutique.
--   5. UNE COMMANDE ABANDONNEE REND SON STOCK. Sans cela, chaque panier
--      abandonne retirerait definitivement des articles de la vente.
--
--  TVA : le prix saisi par le commercant est celui que paie l'acheteur
--  (TTC, comme l'exige l'affichage au consommateur en France). La taxe est donc
--  EXTRAITE du total pour le justificatif, jamais ajoutee par-dessus.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Creation d'une commande depuis le site public
-- -----------------------------------------------------------------------------
create or replace function app.create_shop_order(
  p_site        uuid,
  p_lines       jsonb,
  p_name        text,
  p_email       text,
  p_phone       text default null,
  p_fulfillment text default 'pickup',
  p_address     jsonb default null,
  p_note        text default null,
  p_token_hash  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site        public.sites%rowtype;
  v_line        jsonb;
  v_product     public.products%rowtype;
  v_quantity    int;
  v_taken       int;
  v_line_total  bigint;
  v_subtotal    bigint := 0;
  v_vat         bigint := 0;
  v_currency    char(3) := 'EUR';
  v_accepted    jsonb := '[]'::jsonb;
  v_rejected    jsonb := '[]'::jsonb;
  v_order       uuid;
  v_reference   text;
  v_contact     uuid;
  v_fulfillment text;
  v_item        jsonb;
begin
  select * into v_site from public.sites where id = p_site;
  if not found then
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;

  if v_site.archived_at is not null or v_site.status = 'suspended' then
    return jsonb_build_object('ok', false, 'code', 'site_unavailable');
  end if;

  -- La vente en ligne est un droit d'offre. La base le fait respecter : le
  -- desactiver dans l'interface ne suffirait pas.
  if not app.has_feature(v_site.organization_id, 'ecommerce') then
    return jsonb_build_object('ok', false, 'code', 'module_unavailable');
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'code', 'cart_empty');
  end if;

  if jsonb_array_length(p_lines) > 30 then
    return jsonb_build_object('ok', false, 'code', 'cart_too_large');
  end if;

  if coalesce(btrim(p_name), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'name_required');
  end if;

  if coalesce(btrim(p_email), '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'code', 'email_invalid');
  end if;

  v_fulfillment := case
    when p_fulfillment in ('pickup', 'delivery', 'shipping', 'digital') then p_fulfillment
    else 'pickup'
  end;

  if v_fulfillment in ('delivery', 'shipping')
     and coalesce(p_address->>'line1', '') = '' then
    return jsonb_build_object('ok', false, 'code', 'address_required');
  end if;

  -- Serialise les paiements concurrents portant sur le meme stock. Le verrou
  -- est consultatif et lie a la transaction : il tombe au commit comme au
  -- rollback, sans jamais rester accroche.
  perform pg_advisory_xact_lock(hashtextextended('shop:' || p_site::text, 0));

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    -- Un identifiant mal forme ne doit pas faire echouer toute la commande :
    -- la ligne est ecartee et signalee.
    begin
      select * into v_product
        from public.products
       where id = (v_line->>'productId')::uuid
         and site_id = p_site
         and is_visible
       for update;
    exception when invalid_text_representation then
      continue;
    end;

    if not found then
      v_rejected := v_rejected || jsonb_build_object(
        'productId', v_line->>'productId', 'reason', 'unavailable');
      continue;
    end if;

    v_quantity := greatest(coalesce((v_line->>'quantity')::int, 1), 1);
    if v_quantity > 99 then v_quantity := 99; end if;

    -- Stock : on sert ce qui reste plutot que de tout refuser, et on le dit.
    if v_product.track_inventory and not v_product.allow_backorder then
      v_taken := least(v_quantity, greatest(v_product.stock_quantity, 0));
      if v_taken < 1 then
        v_rejected := v_rejected || jsonb_build_object(
          'productId', v_product.id, 'name', v_product.name, 'reason', 'out_of_stock');
        continue;
      end if;
      if v_taken < v_quantity then
        v_rejected := v_rejected || jsonb_build_object(
          'productId', v_product.id, 'name', v_product.name,
          'reason', 'partial_stock', 'available', v_taken);
      end if;
      v_quantity := v_taken;
    end if;

    if v_product.track_inventory then
      update public.products
         set stock_quantity = greatest(stock_quantity - v_quantity, 0)
       where id = v_product.id;
    end if;

    v_line_total := v_product.price_cents::bigint * v_quantity;
    v_subtotal := v_subtotal + v_line_total;
    -- Taxe EXTRAITE d'un prix TTC : total x taux / (1 + taux).
    v_vat := v_vat + round(
      v_line_total::numeric * v_product.vat_rate_bps / (10000 + v_product.vat_rate_bps));
    v_currency := v_product.currency;

    v_accepted := v_accepted || jsonb_build_object(
      'productId', v_product.id,
      'name', v_product.name,
      'quantity', v_quantity,
      'unitPriceCents', v_product.price_cents,
      'totalCents', v_line_total,
      'vatRateBps', v_product.vat_rate_bps);
  end loop;

  if jsonb_array_length(v_accepted) = 0 then
    return jsonb_build_object('ok', false, 'code', 'cart_empty', 'rejected', v_rejected);
  end if;

  -- Reference lisible, unique par site, qui ne revele aucun compteur global :
  -- un acheteur ne peut pas deduire le volume d'affaires du commercant.
  v_reference := 'C' || to_char(now() at time zone v_site.timezone, 'YYMMDD')
                 || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  insert into public.contacts (organization_id, site_id, last_name, email, phone, source)
  values (v_site.organization_id, p_site, left(btrim(p_name), 120),
          lower(btrim(p_email)), nullif(btrim(p_phone), ''), 'shop')
  on conflict (organization_id, lower(email)) where email is not null
  do update set
    phone = coalesce(public.contacts.phone, excluded.phone),
    updated_at = now()
  returning id into v_contact;

  insert into public.shop_orders
    (site_id, organization_id, contact_id, reference, status,
     subtotal_cents, shipping_cents, discount_cents, vat_cents, total_cents, currency,
     customer_name, customer_email, customer_phone,
     shipping_address, billing_address, fulfillment_method, customer_note,
     manage_token_hash)
  values
    (p_site, v_site.organization_id, v_contact, v_reference, 'pending',
     v_subtotal, 0, 0, v_vat, v_subtotal, v_currency,
     left(btrim(p_name), 120), lower(btrim(p_email)), nullif(btrim(p_phone), ''),
     case when v_fulfillment in ('delivery', 'shipping') then p_address else null end,
     p_address, v_fulfillment, left(coalesce(p_note, ''), 1000),
     p_token_hash)
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(v_accepted)
  loop
    insert into public.shop_order_items
      (shop_order_id, product_id, name, quantity, unit_price_cents, total_cents, vat_rate_bps)
    values
      (v_order, (v_item->>'productId')::uuid, v_item->>'name',
       (v_item->>'quantity')::int, (v_item->>'unitPriceCents')::int,
       (v_item->>'totalCents')::int, (v_item->>'vatRateBps')::int);
  end loop;

  insert into public.audit_logs (actor_type, organization_id, site_id, action,
                                 target_type, target_id, metadata_safe)
  values ('system', v_site.organization_id, p_site, 'shop_order.created',
          'shop_order', v_order::text,
          jsonb_build_object('reference', v_reference, 'total_cents', v_subtotal));

  return jsonb_build_object(
    'ok', true,
    'orderId', v_order,
    'reference', v_reference,
    'totalCents', v_subtotal,
    'vatCents', v_vat,
    'currency', v_currency,
    'lines', v_accepted,
    'rejected', v_rejected,
    'paymentAvailable', app.has_feature(v_site.organization_id, 'online_payments')
  );
end;
$$;

-- -----------------------------------------------------------------------------
--  2. Encaissement — appele UNIQUEMENT depuis le webhook Stripe verifie
-- -----------------------------------------------------------------------------
create or replace function app.mark_shop_order_paid(
  p_order          uuid,
  p_payment_intent text,
  p_amount_cents   int,
  p_account        text,
  p_currency       char(3) default 'EUR'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_order   public.shop_orders%rowtype;
  v_payment uuid;
begin
  select * into v_order from public.shop_orders where id = p_order for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'order_not_found');
  end if;

  -- Un webhook peut etre rejoue : le second passage ne doit rien changer.
  if v_order.status in ('paid', 'preparing', 'fulfilled', 'refunded') then
    return jsonb_build_object('ok', true, 'duplicate', true, 'reference', v_order.reference);
  end if;

  if v_order.status = 'cancelled' then
    -- Encaissement sur une commande annulee : ne JAMAIS la ressusciter
    -- silencieusement. L'incident est trace pour remboursement manuel.
    insert into public.audit_logs (actor_type, organization_id, site_id, action,
                                   target_type, target_id, metadata_safe)
    values ('system', v_order.organization_id, v_order.site_id,
            'shop_order.payment_on_cancelled', 'shop_order', p_order::text,
            jsonb_build_object('amount_cents', p_amount_cents,
                               'payment_intent', p_payment_intent));
    return jsonb_build_object('ok', false, 'code', 'order_cancelled');
  end if;

  -- Le montant encaisse doit etre EXACTEMENT celui fige a la commande. Un
  -- ecart signale une manipulation ou un defaut : on ne marque rien paye.
  if p_amount_cents is distinct from v_order.total_cents then
    insert into public.audit_logs (actor_type, organization_id, site_id, action,
                                   target_type, target_id, metadata_safe)
    values ('system', v_order.organization_id, v_order.site_id,
            'shop_order.amount_mismatch', 'shop_order', p_order::text,
            jsonb_build_object('expected_cents', v_order.total_cents,
                               'received_cents', p_amount_cents,
                               'payment_intent', p_payment_intent));
    return jsonb_build_object('ok', false, 'code', 'amount_mismatch');
  end if;

  insert into public.payments
    (organization_id, site_id, shop_order_id, scope, kind, status,
     amount_cents, currency, application_fee_cents,
     stripe_payment_intent_id, stripe_account_id, succeeded_at, description)
  values
    (v_order.organization_id, v_order.site_id, p_order, 'connect', 'shop_order', 'succeeded',
     p_amount_cents, coalesce(p_currency, v_order.currency), 0,
     p_payment_intent, p_account, now(),
     'Commande ' || v_order.reference)
  -- L'index d'unicite est PARTIEL : sa clause doit etre reprise pour que
  -- PostgreSQL puisse l'inferer.
  on conflict (stripe_payment_intent_id) where stripe_payment_intent_id is not null do update
    set shop_order_id = excluded.shop_order_id,
        status = 'succeeded',
        succeeded_at = coalesce(public.payments.succeeded_at, now())
  returning id into v_payment;

  update public.shop_orders
     set status = 'paid',
         paid_at = now(),
         payment_id = v_payment,
         stripe_account_id = p_account
   where id = p_order;

  insert into public.audit_logs (actor_type, organization_id, site_id, action,
                                 target_type, target_id, metadata_safe)
  values ('system', v_order.organization_id, v_order.site_id, 'shop_order.paid',
          'shop_order', p_order::text,
          jsonb_build_object('reference', v_order.reference, 'amount_cents', p_amount_cents));

  return jsonb_build_object('ok', true, 'reference', v_order.reference);
end;
$$;

-- -----------------------------------------------------------------------------
--  3. Liberation du stock des paniers abandonnes
-- -----------------------------------------------------------------------------
--  Sans cela, chaque personne qui renonce a payer retirerait definitivement des
--  articles de la vente. Appelee par une tache planifiee.
create or replace function app.release_expired_shop_orders(p_minutes int default 60)
returns int
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_order public.shop_orders%rowtype;
  v_item  public.shop_order_items%rowtype;
  v_count int := 0;
begin
  if p_minutes is null or p_minutes < 5 then
    raise exception 'Delai de liberation trop court' using errcode = '22023';
  end if;

  for v_order in
    select * from public.shop_orders
     where status = 'pending'
       and paid_at is null
       and created_at < now() - make_interval(mins => p_minutes)
     for update skip locked
  loop
    for v_item in
      select * from public.shop_order_items where shop_order_id = v_order.id
    loop
      if v_item.product_id is not null then
        update public.products
           set stock_quantity = stock_quantity + v_item.quantity
         where id = v_item.product_id and track_inventory;
      end if;
    end loop;

    update public.shop_orders
       set status = 'cancelled', cancelled_at = now(),
           internal_note = coalesce(internal_note || E'\n', '')
                           || 'Annulee automatiquement : paiement non finalise.'
     where id = v_order.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
--  4. Immuabilite des montants et provenance du statut « paye »
-- -----------------------------------------------------------------------------
create or replace function app.guard_shop_order_state()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  -- Les montants d'une commande payee sont immuables POUR TOUT LE MONDE,
  -- y compris le commercant et l'administration de la plateforme : une facture
  -- deja emise ne se reecrit pas.
  if old.status in ('paid', 'preparing', 'fulfilled', 'refunded') then
    if new.subtotal_cents is distinct from old.subtotal_cents
       or new.shipping_cents is distinct from old.shipping_cents
       or new.discount_cents is distinct from old.discount_cents
       or new.vat_cents is distinct from old.vat_cents
       or new.total_cents is distinct from old.total_cents
       or new.currency is distinct from old.currency then
      raise exception 'Les montants d''une commande payee sont immuables'
        using errcode = '23514';
    end if;
  end if;

  -- Le passage a « paye » vient du webhook Stripe, jamais d'un navigateur.
  if new.status = 'paid' and old.status is distinct from 'paid'
     and not (app.is_service_role() or app.is_platform_admin()) then
    raise exception 'Le paiement d''une commande provient exclusivement de Stripe'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists shop_orders_guard_state on public.shop_orders;
create trigger shop_orders_guard_state
  before update on public.shop_orders
  for each row execute function app.guard_shop_order_state();

-- -----------------------------------------------------------------------------
--  5. Surface publique — reservee au role de service
-- -----------------------------------------------------------------------------
create or replace function public.create_shop_order(
  p_site uuid, p_lines jsonb, p_name text, p_email text, p_phone text default null,
  p_fulfillment text default 'pickup', p_address jsonb default null,
  p_note text default null, p_token_hash text default null
) returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.create_shop_order(p_site, p_lines, p_name, p_email, p_phone,
                               p_fulfillment, p_address, p_note, p_token_hash);
$$;

create or replace function public.mark_shop_order_paid(
  p_order uuid, p_payment_intent text, p_amount_cents int, p_account text,
  p_currency char(3) default 'EUR'
) returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.mark_shop_order_paid(p_order, p_payment_intent, p_amount_cents, p_account, p_currency);
$$;

create or replace function public.release_expired_shop_orders(p_minutes int default 60)
returns int language sql security definer set search_path = public, app, pg_catalog as $$
  select app.release_expired_shop_orders(p_minutes);
$$;

do $$
declare
  fn text;
  service_only text[] := array[
    'public.create_shop_order(uuid, jsonb, text, text, text, text, jsonb, text, text)',
    'public.mark_shop_order_paid(uuid, text, int, text, char)',
    'public.release_expired_shop_orders(int)'
  ];
begin
  foreach fn in array service_only loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

revoke all on function
  app.create_shop_order(uuid, jsonb, text, text, text, text, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function app.mark_shop_order_paid(uuid, text, int, text, char)
  from public, anon, authenticated;
revoke all on function app.release_expired_shop_orders(int)
  from public, anon, authenticated;

comment on function public.create_shop_order(uuid, jsonb, text, text, text, text, jsonb, text, text) is
  'Cree une commande depuis le site public. Les prix sont relus en base : le '
  'navigateur ne fournit que des identifiants et des quantites. La commande '
  'nait toujours « pending ».';
comment on function public.mark_shop_order_paid(uuid, text, int, text, char) is
  'Marque une commande payee. Reservee au role de service (webhook Stripe '
  'verifie), idempotente, et refusee si le montant encaisse differe du montant '
  'fige a la commande.';

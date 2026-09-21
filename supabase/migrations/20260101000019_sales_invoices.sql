-- =============================================================================
--  Factures de vente et rattachement d'une commande conclue hors ligne
--
--  Une partie des ventes StaX ne passe pas par le tunnel de commande du site :
--  un appel, une demonstration en visioconference, un accord verbal, puis une
--  facture envoyee par e-mail. Le client cree ensuite son compte et saisit le
--  numero de facture pour retrouver sa commande.
--
--  Trois regles gouvernent cette table :
--
--   1. Un numero de facture n'est PAS un secret. Il est sequentiel, imprime, et
--      transite par e-mail. Il ne peut donc pas suffire a revendiquer une
--      commande : la facture est liee a l'ADRESSE a laquelle elle a ete
--      envoyee, et seule cette adresse peut la rattacher.
--   2. Les montants sont figes a l'emission, exactement comme pour une commande
--      du tunnel. Un changement de tarif public ne modifie jamais une facture
--      deja envoyee.
--   3. Chaque tentative est comptee. Une enumeration de numeros se voit.
-- =============================================================================

create table public.sales_invoices (
  id                      uuid primary key default app.uuid_v7(),

  /** Numero imprime sur la facture, unique et communique au client. */
  number                  text not null,

  /** Renseignee une fois la facture rattachee a un compte. */
  organization_id         uuid references public.organizations (id) on delete set null,

  plan_id                 uuid not null references public.plans (id) on delete restrict,
  plan_slug               text not null,
  plan_version            int not null default 1,

  /* --- Montants figes a l'emission, en centimes entiers --- */
  setup_price_cents       integer not null,
  maintenance_price_cents integer not null default 0,
  billing_interval        text not null default 'year',
  discount_cents          integer not null default 0,
  vat_rate_bps            integer not null default 2000,
  vat_cents               integer not null default 0,
  total_cents             integer not null,
  currency                char(3) not null default 'EUR',

  /* --- Destinataire : c'est LUI qui pourra rattacher la facture --- */
  customer_email          text not null,
  customer_name           text,
  company_name            text,

  /* --- Contexte commercial --- */
  sector_slug             text,
  business_type_slug      text,
  /** Notes internes de l'equipe commerciale. Jamais montrees au client. */
  internal_notes          text,

  status                  text not null default 'issued',
  issued_at               timestamptz not null default now(),
  due_at                  timestamptz,
  paid_at                 timestamptz,
  claimed_at              timestamptz,
  claimed_by              uuid references public.profiles (id) on delete set null,
  order_id                uuid references public.orders (id) on delete set null,
  cancelled_at            timestamptz,
  cancellation_reason     text,

  /** Tentatives de rattachement, reussies ou non. Revele une enumeration. */
  attempt_count           int not null default 0,
  last_attempt_at         timestamptz,

  created_by              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint sales_invoices_status_valid
    check (status in ('issued', 'claimed', 'paid', 'cancelled')),
  constraint sales_invoices_amounts_non_negative
    check (setup_price_cents >= 0 and maintenance_price_cents >= 0
           and discount_cents >= 0 and vat_cents >= 0 and total_cents >= 0),
  constraint sales_invoices_discount_bounded check (discount_cents <= setup_price_cents),
  constraint sales_invoices_billing_interval_valid
    check (billing_interval in ('year', 'month')),
  constraint sales_invoices_email_format
    check (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint sales_invoices_number_format check (number ~ '^[A-Z0-9][A-Z0-9-]{3,31}$'),
  constraint sales_invoices_claim_coherent
    check ((status <> 'claimed' and status <> 'paid')
           or (organization_id is not null and claimed_at is not null))
);

-- La comparaison se fait toujours en majuscules : le client recopie son numero
-- comme il le lit, avec ou sans casse.
create unique index sales_invoices_number_key on public.sales_invoices (upper(number));
create index sales_invoices_email_idx on public.sales_invoices (lower(customer_email));
create index sales_invoices_status_idx on public.sales_invoices (status, issued_at desc);
create index sales_invoices_org_idx on public.sales_invoices (organization_id)
  where organization_id is not null;

create trigger sales_invoices_touch_updated_at
  before update on public.sales_invoices
  for each row execute function app.touch_updated_at();

comment on table public.sales_invoices is
  'Factures emises hors tunnel de commande (vente par telephone puis demonstration). '
  'Le numero seul ne suffit jamais a rattacher une commande : l''adresse e-mail '
  'destinataire fait foi.';

alter table public.sales_invoices enable row level security;

-- Le client ne voit QUE les factures de son organisation, une fois rattachees.
-- Avant rattachement, une facture n'est visible que de l'equipe StaX : sinon
-- n'importe qui pourrait lister les ventes en cours.
create policy sales_invoices_select on public.sales_invoices
  for select to authenticated
  using (
    app.is_platform_staff()
    or (organization_id is not null and app.is_org_member(organization_id))
  );

create policy sales_invoices_write on public.sales_invoices
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- =============================================================================
--  Rattachement d'une facture a une organisation
-- =============================================================================
create or replace function app.claim_sales_invoice(
  p_number          text,
  p_organization_id uuid,
  p_terms_version   text,
  p_ip_hash         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_actor   uuid := app.current_user_id();
  v_email   text;
  v_invoice public.sales_invoices%rowtype;
  v_order   uuid;
  v_ref     text;
  v_number  text := upper(trim(coalesce(p_number, '')));
begin
  if v_actor is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  if not (app.org_can(p_organization_id, 'billing.manage') or app.is_platform_admin()) then
    raise exception 'Droit de facturation requis sur cette organisation' using errcode = '42501';
  end if;

  if p_terms_version is null then
    raise exception 'Acceptation des conditions generales de vente requise' using errcode = '23514';
  end if;

  select email into v_email from public.profiles where id = v_actor;

  select * into v_invoice
    from public.sales_invoices
   where upper(number) = v_number
   for update;

  -- Compte la tentative meme quand le numero n'existe pas : une enumeration
  -- de numeros doit laisser une trace, pas disparaitre silencieusement.
  if not found then
    perform app.write_audit('invoice.claim_failed', p_organization_id, null,
                            'sales_invoice', v_number,
                            jsonb_build_object('reason', 'not_found'));
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  update public.sales_invoices
     set attempt_count = attempt_count + 1, last_attempt_at = now()
   where id = v_invoice.id;

  if v_invoice.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'code', 'cancelled');
  end if;

  if v_invoice.status in ('claimed', 'paid') then
    -- Deja rattachee a CETTE organisation : on renvoie la commande existante
    -- plutot qu'une erreur, pour qu'un double clic ne bloque personne.
    if v_invoice.organization_id = p_organization_id then
      return jsonb_build_object('ok', true, 'code', 'already_claimed',
                                'orderId', v_invoice.order_id);
    end if;
    return jsonb_build_object('ok', false, 'code', 'already_claimed');
  end if;

  -- LE controle qui compte : le numero ne suffit pas, l'adresse doit
  -- correspondre a celle a laquelle la facture a ete envoyee.
  if lower(coalesce(v_email, '')) <> lower(v_invoice.customer_email) then
    perform app.write_audit('invoice.claim_failed', p_organization_id, null,
                            'sales_invoice', v_invoice.id::text,
                            jsonb_build_object('reason', 'email_mismatch'));
    return jsonb_build_object('ok', false, 'code', 'email_mismatch');
  end if;

  v_ref := app.next_order_reference();

  insert into public.orders (
    reference, organization_id, created_by, status,
    plan_id, plan_slug, plan_version,
    setup_price_cents, maintenance_price_cents, billing_interval, discount_cents,
    vat_rate_bps, vat_cents, total_cents, currency,
    sector_slug, business_type_slug,
    customer_notes,
    terms_version, terms_accepted_at, terms_accepted_ip_hash
  ) values (
    v_ref, p_organization_id, v_actor,
    -- La commande n'est PAS payee : le reglement de la facture se constate
    -- hors de ce site, et c'est l'equipe qui le marque.
    case when v_invoice.status = 'paid' then 'paid'::app.order_status
         else 'draft'::app.order_status end,
    v_invoice.plan_id, v_invoice.plan_slug, v_invoice.plan_version,
    v_invoice.setup_price_cents, v_invoice.maintenance_price_cents,
    v_invoice.billing_interval, v_invoice.discount_cents,
    v_invoice.vat_rate_bps, v_invoice.vat_cents, v_invoice.total_cents, v_invoice.currency,
    v_invoice.sector_slug, v_invoice.business_type_slug,
    'Commande rattachée à la facture ' || v_invoice.number || '.',
    p_terms_version, now(), p_ip_hash
  )
  returning id into v_order;

  insert into public.order_items (order_id, kind, label, quantity, unit_price_cents,
                                  total_cents, sort_order)
  values (v_order, 'plan_setup', 'Création du site — facture ' || v_invoice.number,
          1, v_invoice.setup_price_cents, v_invoice.setup_price_cents, 10);

  if v_invoice.maintenance_price_cents > 0 then
    insert into public.order_items (order_id, kind, label, quantity, unit_price_cents,
                                    total_cents, sort_order)
    values (v_order, 'plan_maintenance',
            'Maintenance annuelle — facture ' || v_invoice.number,
            1, v_invoice.maintenance_price_cents, v_invoice.maintenance_price_cents, 30);
  end if;

  update public.sales_invoices
     set status = 'claimed',
         organization_id = p_organization_id,
         claimed_at = now(),
         claimed_by = v_actor,
         order_id = v_order
   where id = v_invoice.id;

  insert into public.consents (user_id, organization_id, kind, document_version,
                               granted, ip_hash, source)
  values (v_actor, p_organization_id, 'terms', p_terms_version, true, p_ip_hash, 'invoice');

  perform app.write_audit('invoice.claimed', p_organization_id, null,
                          'sales_invoice', v_invoice.id::text,
                          jsonb_build_object('number', v_invoice.number,
                                             'orderId', v_order,
                                             'plan', v_invoice.plan_slug));

  return jsonb_build_object('ok', true, 'code', 'claimed', 'orderId', v_order);
end;
$$;

create or replace function public.claim_sales_invoice(
  p_number          text,
  p_organization_id uuid,
  p_terms_version   text,
  p_ip_hash         text default null
)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.claim_sales_invoice(p_number, p_organization_id, p_terms_version, p_ip_hash);
$$;

revoke all on function public.claim_sales_invoice(text, uuid, text, text) from public;
grant execute on function public.claim_sales_invoice(text, uuid, text, text) to authenticated;

-- =============================================================================
--  Consultation AVANT rattachement
--
--  Le client doit pouvoir verifier qu'il a bien saisi son numero sans devoir
--  deja tout accepter. Cette fonction ne renvoie donc QUE ce qui figure deja
--  sur la facture qu'il a entre les mains, et uniquement si son adresse
--  correspond : elle ne peut rien apprendre a quelqu'un d'autre.
-- =============================================================================
create or replace function public.peek_sales_invoice(p_number text)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_actor   uuid := app.current_user_id();
  v_email   text;
  v_invoice public.sales_invoices%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  select email into v_email from public.profiles where id = v_actor;

  select * into v_invoice
    from public.sales_invoices
   where upper(number) = upper(trim(coalesce(p_number, '')));

  if not found or lower(coalesce(v_email, '')) <> lower(v_invoice.customer_email) then
    -- Reponse IDENTIQUE dans les deux cas : ni l'existence du numero, ni
    -- l'adresse a laquelle il a ete envoye ne doivent fuiter.
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  if v_invoice.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'code', 'cancelled');
  end if;

  if v_invoice.status in ('claimed', 'paid') and v_invoice.claimed_at is not null then
    return jsonb_build_object('ok', false, 'code', 'already_claimed');
  end if;

  return jsonb_build_object(
    'ok', true,
    'number', v_invoice.number,
    'planSlug', v_invoice.plan_slug,
    'setupPriceCents', v_invoice.setup_price_cents,
    'maintenancePriceCents', v_invoice.maintenance_price_cents,
    'billingInterval', v_invoice.billing_interval,
    'vatCents', v_invoice.vat_cents,
    'totalCents', v_invoice.total_cents,
    'currency', v_invoice.currency,
    'companyName', v_invoice.company_name,
    'issuedAt', v_invoice.issued_at,
    'dueAt', v_invoice.due_at
  );
end;
$$;

revoke all on function public.peek_sales_invoice(text) from public;
grant execute on function public.peek_sales_invoice(text) to authenticated;

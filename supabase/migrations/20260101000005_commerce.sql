-- =============================================================================
--  StaX — 0005 · Commerce plateforme
--  Commande (transaction commerciale) et projet (travail de creation) sont
--  deux entites distinctes. L'argent est toujours en centimes entiers.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  orders — vente d'un site par StaX
-- -----------------------------------------------------------------------------
create table public.orders (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null,
  organization_id       uuid references public.organizations (id) on delete set null,
  site_id               uuid references public.sites (id) on delete set null,
  created_by            uuid references public.profiles (id) on delete set null,

  status                app.order_status not null default 'draft',

  /* --- Snapshot tarifaire : fige au moment de l'achat (grandfathering) --- */
  plan_id               uuid references public.plans (id) on delete restrict,
  plan_slug             text,
  plan_version          int,
  setup_price_cents     integer not null default 0,
  monthly_price_cents   integer not null default 0,
  discount_cents        integer not null default 0,
  vat_rate_bps          integer not null default 2000,
  vat_cents             integer not null default 0,
  total_cents           integer not null default 0,
  currency              char(3) not null default 'EUR',
  coupon_code           text,

  /* --- Contexte de la commande --- */
  sector_slug           text,
  business_type_slug    text,
  /** Questionnaire metier, valide par le schema Zod du metier choisi. */
  questionnaire         jsonb not null default '{}'::jsonb,
  requested_domain      text,
  domain_handling       text not null default 'none',
  customer_notes        text,

  /* --- Consentement CGV : preuve d'acceptation --- */
  terms_version         text,
  terms_accepted_at     timestamptz,
  terms_accepted_ip_hash text,

  /* --- Stripe --- */
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  idempotency_key       text,

  paid_at               timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint orders_amounts_non_negative check (
    setup_price_cents >= 0 and monthly_price_cents >= 0
    and discount_cents >= 0 and vat_cents >= 0 and total_cents >= 0
  ),
  constraint orders_discount_bounded check (discount_cents <= setup_price_cents),
  constraint orders_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint orders_domain_handling_valid
    check (domain_handling in ('none', 'customer_owned', 'stax_purchase', 'subdomain_only')),
  constraint orders_paid_requires_terms
    check (status <> 'paid' or (terms_accepted_at is not null and terms_version is not null)),
  constraint orders_questionnaire_object check (jsonb_typeof(questionnaire) = 'object')
);

create unique index orders_reference_key on public.orders (reference);
create unique index orders_checkout_session_key
  on public.orders (stripe_checkout_session_id) where stripe_checkout_session_id is not null;
create unique index orders_idempotency_key
  on public.orders (idempotency_key) where idempotency_key is not null;
create index orders_org_idx on public.orders (organization_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);

create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function app.touch_updated_at();

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  kind          text not null,
  label         text not null,
  description   text,
  quantity      integer not null default 1,
  unit_price_cents integer not null,
  total_cents   integer not null,
  metadata      jsonb not null default '{}'::jsonb,
  sort_order    int not null default 100,

  constraint order_items_kind_valid
    check (kind in ('plan_setup', 'plan_maintenance', 'domain', 'option', 'custom', 'discount')),
  constraint order_items_quantity_positive check (quantity > 0)
);

create index order_items_order_idx on public.order_items (order_id, sort_order);

-- Numerotation lisible : STX-2026-000123
create sequence if not exists public.order_reference_seq;

create or replace function app.next_order_reference()
returns text
language sql
volatile
set search_path = public, pg_catalog
as $$
  select 'STX-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval('public.order_reference_seq')::text, 6, '0');
$$;

-- -----------------------------------------------------------------------------
--  projects — le travail de creation, distinct de la transaction
-- -----------------------------------------------------------------------------
create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  site_id           uuid references public.sites (id) on delete set null,
  order_id          uuid references public.orders (id) on delete set null,
  quote_id          uuid,

  status            app.project_status not null default 'ordered',
  title             text not null,
  summary           text,

  assigned_to       uuid references public.profiles (id) on delete set null,
  /** Notes internes StaX — jamais exposees au client (policies RLS dediees). */
  internal_notes    text,

  /** Etapes de la timeline client, chacune adossee a un etat backend reel. */
  checklist         jsonb not null default '[]'::jsonb,
  due_at            timestamptz,
  started_at        timestamptz,
  delivered_at      timestamptz,
  published_at      timestamptz,
  /** Depart de la fenetre de retractation commerciale. */
  go_live_at        timestamptz,
  cancelled_at      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint projects_checklist_array check (jsonb_typeof(checklist) = 'array')
);

create unique index projects_reference_key on public.projects (reference);
create index projects_org_idx on public.projects (organization_id, created_at desc);
create index projects_status_idx on public.projects (status, updated_at desc);
create index projects_assigned_idx on public.projects (assigned_to) where assigned_to is not null;

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function app.touch_updated_at();

create table public.project_events (
  id          uuid primary key default app.uuid_v7(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  kind        text not null,
  title       text not null,
  description text,
  /** true = visible par le client dans sa timeline. */
  is_public   boolean not null default true,
  actor_id    uuid references public.profiles (id) on delete set null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index project_events_project_idx on public.project_events (project_id, created_at desc);

create table public.project_files (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  media_id      uuid references public.media (id) on delete set null,
  storage_bucket text not null default 'project-files',
  storage_path  text not null,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint not null,
  kind          text not null default 'asset',
  /** Fichier fourni par le client ou livrable produit par StaX. */
  direction     text not null default 'inbound',
  uploaded_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint project_files_direction_valid check (direction in ('inbound', 'outbound')),
  constraint project_files_kind_valid
    check (kind in ('logo','photo','document','menu','brochure','deliverable','asset')),
  constraint project_files_size_positive check (size_bytes > 0)
);

create index project_files_project_idx on public.project_files (project_id, created_at desc);

create table public.project_messages (
  id            uuid primary key default app.uuid_v7(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  author_id     uuid references public.profiles (id) on delete set null,
  /** `client` ou `stax` — determine l'affichage et les notifications. */
  author_side   text not null,
  body          text not null,
  attachments   jsonb not null default '[]'::jsonb,
  read_by_client_at timestamptz,
  read_by_staff_at  timestamptz,
  created_at    timestamptz not null default now(),

  constraint project_messages_side_valid check (author_side in ('client', 'stax')),
  constraint project_messages_body_not_empty check (length(trim(body)) > 0),
  constraint project_messages_body_bounded check (length(body) <= 20000)
);

create index project_messages_project_idx on public.project_messages (project_id, created_at asc);

-- -----------------------------------------------------------------------------
--  quotes — projets sur mesure
-- -----------------------------------------------------------------------------
create table public.quotes (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null,
  organization_id   uuid references public.organizations (id) on delete set null,
  /** Prospect non encore inscrit : coordonnees saisies dans le formulaire. */
  contact_name      text not null,
  contact_email     text not null,
  contact_phone     text,
  company_name      text,

  sector_slug       text,
  business_type_slug text,
  /** Reponses du configurateur de devis. */
  brief             jsonb not null default '{}'::jsonb,

  status            app.quote_status not null default 'draft',
  subtotal_cents    integer not null default 0,
  discount_cents    integer not null default 0,
  vat_rate_bps      integer not null default 2000,
  vat_cents         integer not null default 0,
  total_cents       integer not null default 0,
  monthly_price_cents integer not null default 0,
  currency          char(3) not null default 'EUR',

  notes             text,
  internal_notes    text,
  /** Jeton de consultation publique du devis (HMAC stocke, jamais le clair). */
  access_token_hash text,
  expires_at        timestamptz,
  sent_at           timestamptz,
  viewed_at         timestamptz,
  accepted_at       timestamptz,
  rejected_at       timestamptz,
  rejection_reason  text,

  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quotes_email_format check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint quotes_amounts_non_negative check (
    subtotal_cents >= 0 and discount_cents >= 0 and vat_cents >= 0 and total_cents >= 0
  ),
  constraint quotes_brief_object check (jsonb_typeof(brief) = 'object')
);

create unique index quotes_reference_key on public.quotes (reference);
create unique index quotes_token_key on public.quotes (access_token_hash)
  where access_token_hash is not null;
create index quotes_status_idx on public.quotes (status, created_at desc);
create index quotes_org_idx on public.quotes (organization_id);

create trigger quotes_touch_updated_at
  before update on public.quotes
  for each row execute function app.touch_updated_at();

alter table public.projects
  add constraint projects_quote_fk foreign key (quote_id)
    references public.quotes (id) on delete set null;

create table public.quote_items (
  id               uuid primary key default gen_random_uuid(),
  quote_id         uuid not null references public.quotes (id) on delete cascade,
  label            text not null,
  description      text,
  quantity         numeric(10,2) not null default 1,
  unit_price_cents integer not null,
  total_cents      integer not null,
  kind             text not null default 'one_time',
  sort_order       int not null default 100,

  constraint quote_items_kind_valid check (kind in ('one_time', 'recurring', 'discount')),
  constraint quote_items_quantity_positive check (quantity > 0)
);

create index quote_items_quote_idx on public.quote_items (quote_id, sort_order);

create sequence if not exists public.quote_reference_seq;

create or replace function app.next_quote_reference()
returns text
language sql
volatile
set search_path = public, pg_catalog
as $$
  select 'DEV-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval('public.quote_reference_seq')::text, 5, '0');
$$;

create sequence if not exists public.project_reference_seq;

create or replace function app.next_project_reference()
returns text
language sql
volatile
set search_path = public, pg_catalog
as $$
  select 'PRJ-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval('public.project_reference_seq')::text, 5, '0');
$$;

-- -----------------------------------------------------------------------------
--  subscriptions — maintenance mensuelle (independante de l'achat initial)
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete cascade,
  site_id                 uuid references public.sites (id) on delete set null,
  order_id                uuid references public.orders (id) on delete set null,

  status                  app.subscription_status not null default 'incomplete',
  /** Etat produit du contrat, distinct du statut Stripe. */
  maintenance_state       app.maintenance_state not null default 'active',

  plan_id                 uuid references public.plans (id) on delete restrict,
  plan_slug               text,
  /** Prix fige : un changement de tarif public n'affecte pas ce contrat. */
  monthly_price_cents     integer not null,
  vat_rate_bps            integer not null default 2000,
  currency                char(3) not null default 'EUR',

  stripe_subscription_id  text,
  stripe_customer_id      text,
  stripe_price_id         text,

  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  cancel_requested_at     timestamptz,
  cancel_requested_by     uuid references public.profiles (id) on delete set null,
  cancel_reason           text,
  canceled_at             timestamptz,
  ended_at                timestamptz,
  grace_period_ends_at    timestamptz,
  paused_at               timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint subscriptions_price_non_negative check (monthly_price_cents >= 0)
);

create unique index subscriptions_stripe_key on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;
create unique index subscriptions_active_site_key on public.subscriptions (site_id)
  where site_id is not null and status in ('trialing','active','past_due','cancel_at_period_end');
create index subscriptions_org_idx on public.subscriptions (organization_id);
create index subscriptions_status_idx on public.subscriptions (status);
create index subscriptions_period_end_idx on public.subscriptions (current_period_end)
  where status in ('active', 'cancel_at_period_end');

create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  payments — plateforme ET sites clients (Stripe Connect)
-- -----------------------------------------------------------------------------
create table public.payments (
  id                    uuid primary key default app.uuid_v7(),
  organization_id       uuid references public.organizations (id) on delete set null,
  site_id               uuid references public.sites (id) on delete set null,
  order_id              uuid references public.orders (id) on delete set null,
  subscription_id       uuid references public.subscriptions (id) on delete set null,
  shop_order_id         uuid,

  /** `platform` = revenu StaX. `connect` = encaissement du client final. */
  scope                 text not null default 'platform',
  status                app.payment_status not null default 'pending',
  kind                  text not null default 'setup',

  amount_cents          integer not null,
  amount_refunded_cents integer not null default 0,
  currency              char(3) not null default 'EUR',
  /** Commission plateforme. Nulle aujourd'hui : l'architecture la prevoit. */
  application_fee_cents integer not null default 0,

  /* Identifiants Stripe uniquement. Aucune donnee de carte n'est stockee. */
  stripe_payment_intent_id text,
  stripe_charge_id         text,
  stripe_invoice_id        text,
  stripe_account_id        text,
  payment_method_brand     text,
  payment_method_last4     char(4),

  failure_code          text,
  failure_message       text,
  description           text,
  metadata              jsonb not null default '{}'::jsonb,

  succeeded_at          timestamptz,
  failed_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint payments_scope_valid check (scope in ('platform', 'connect')),
  constraint payments_kind_valid
    check (kind in ('setup','maintenance','domain','custom','shop_order','deposit','donation')),
  constraint payments_amount_positive check (amount_cents > 0),
  constraint payments_refund_bounded
    check (amount_refunded_cents >= 0 and amount_refunded_cents <= amount_cents),
  constraint payments_connect_has_account
    check (scope <> 'connect' or stripe_account_id is not null)
);

create unique index payments_intent_key on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index payments_org_idx on public.payments (organization_id, created_at desc);
create index payments_status_idx on public.payments (status, created_at desc);
create index payments_scope_idx on public.payments (scope, created_at desc);

create trigger payments_touch_updated_at
  before update on public.payments
  for each row execute function app.touch_updated_at();

comment on table public.payments is
  'Aucun numero de carte, aucun CVC, aucune donnee PCI sensible n''est stocke ici : '
  'uniquement des identifiants Stripe, un montant et un statut.';

-- -----------------------------------------------------------------------------
--  refunds — remboursements effectifs
-- -----------------------------------------------------------------------------
create table public.refunds (
  id                uuid primary key default app.uuid_v7(),
  payment_id        uuid not null references public.payments (id) on delete restrict,
  organization_id   uuid references public.organizations (id) on delete set null,
  refund_request_id uuid,

  amount_cents      integer not null,
  currency          char(3) not null default 'EUR',
  reason            text,
  status            app.payment_status not null default 'pending',
  stripe_refund_id  text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint refunds_amount_positive check (amount_cents > 0)
);

create unique index refunds_stripe_key on public.refunds (stripe_refund_id)
  where stripe_refund_id is not null;
create index refunds_payment_idx on public.refunds (payment_id);

create trigger refunds_touch_updated_at
  before update on public.refunds
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  refund_requests — demande de remboursement client + workflow admin
-- -----------------------------------------------------------------------------
create table public.refund_requests (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  site_id             uuid references public.sites (id) on delete set null,
  order_id            uuid references public.orders (id) on delete set null,
  payment_id          uuid references public.payments (id) on delete set null,

  requested_by        uuid references public.profiles (id) on delete set null,
  requested_at        timestamptz not null default now(),
  customer_reason     text,

  /** Date de mise en ligne initiale : point de depart de la fenetre. */
  go_live_at          timestamptz,
  deadline_at         timestamptz,

  /** Retenue appliquee UNIQUEMENT si un domaine a reellement ete achete. */
  domain_purchased    boolean not null default false,
  domain_cost_cents   integer not null default 0,

  eligible            boolean,
  eligibility_reason  text,
  amount_paid_cents   integer not null default 0,
  deduction_cents     integer not null default 0,
  refund_amount_cents integer not null default 0,
  currency            char(3) not null default 'EUR',

  status              app.refund_request_status not null default 'requested',
  stripe_refund_id    text,
  admin_notes         text,
  reviewed_by         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  processed_at        timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint refund_requests_amounts_non_negative check (
    amount_paid_cents >= 0 and deduction_cents >= 0 and refund_amount_cents >= 0
    and domain_cost_cents >= 0
  ),
  constraint refund_requests_refund_bounded
    check (refund_amount_cents <= amount_paid_cents),
  -- La retenue domaine n'existe que si un domaine a effectivement ete achete.
  constraint refund_requests_deduction_requires_domain
    check (deduction_cents = 0 or domain_purchased)
);

create index refund_requests_org_idx on public.refund_requests (organization_id, created_at desc);
create index refund_requests_status_idx on public.refund_requests (status, created_at desc);
create unique index refund_requests_open_per_order_key
  on public.refund_requests (order_id)
  where order_id is not null and status in ('requested','under_review','approved','processing');

create trigger refund_requests_touch_updated_at
  before update on public.refund_requests
  for each row execute function app.touch_updated_at();

alter table public.refunds
  add constraint refunds_request_fk foreign key (refund_request_id)
    references public.refund_requests (id) on delete set null;

-- -----------------------------------------------------------------------------
--  connected_accounts — Stripe Connect des clients
-- -----------------------------------------------------------------------------
create table public.connected_accounts (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  stripe_account_id     text not null,
  status                app.connect_status not null default 'not_started',
  country               char(2) not null default 'FR',
  default_currency      char(3) not null default 'EUR',

  charges_enabled       boolean not null default false,
  payouts_enabled       boolean not null default false,
  details_submitted     boolean not null default false,
  /** Exigences Stripe restantes (jamais de donnee KYC brute cote StaX). */
  requirements_due      text[] not null default '{}',
  disabled_reason       text,

  onboarding_started_at timestamptz,
  activated_at          timestamptz,
  last_synced_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index connected_accounts_org_key on public.connected_accounts (organization_id);
create unique index connected_accounts_stripe_key on public.connected_accounts (stripe_account_id);

create trigger connected_accounts_touch_updated_at
  before update on public.connected_accounts
  for each row execute function app.touch_updated_at();

comment on table public.connected_accounts is
  'Les encaissements des sites clients transitent par leur propre compte Stripe '
  'connecte : ils ne sont jamais melanges aux revenus de la plateforme.';

-- -----------------------------------------------------------------------------
--  webhook_events — idempotence et protection anti-rejeu
-- -----------------------------------------------------------------------------
create table public.webhook_events (
  id            uuid primary key default app.uuid_v7(),
  provider      text not null default 'stripe',
  /** Identifiant d'evenement du fournisseur : contrainte d'unicite = idempotence. */
  event_id      text not null,
  event_type    text not null,
  account_id    text,
  api_version   text,
  status        app.webhook_status not null default 'received',
  attempts      int not null default 0,
  /** Horodatage signe par le fournisseur, pour rejeter les rejeux tardifs. */
  signed_at     timestamptz,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text,
  /** Charge utile expurgee : aucun secret, aucune donnee de carte. */
  payload_safe  jsonb not null default '{}'::jsonb,

  constraint webhook_events_provider_valid
    check (provider in ('stripe', 'stripe_connect', 'supabase', 'cloudflare'))
);

create unique index webhook_events_provider_event_key
  on public.webhook_events (provider, event_id);
create index webhook_events_status_idx on public.webhook_events (status, received_at desc);
create index webhook_events_type_idx on public.webhook_events (event_type, received_at desc);

-- -----------------------------------------------------------------------------
--  invoices — miroir local des factures Stripe
-- -----------------------------------------------------------------------------
create table public.invoices (
  id                uuid primary key default app.uuid_v7(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  subscription_id   uuid references public.subscriptions (id) on delete set null,
  stripe_invoice_id text not null,
  number            text,
  status            text not null default 'draft',
  amount_due_cents  integer not null default 0,
  amount_paid_cents integer not null default 0,
  currency          char(3) not null default 'EUR',
  hosted_invoice_url text,
  invoice_pdf_url   text,
  period_start      timestamptz,
  period_end        timestamptz,
  issued_at         timestamptz,
  paid_at           timestamptz,
  created_at        timestamptz not null default now()
);

create unique index invoices_stripe_key on public.invoices (stripe_invoice_id);
create index invoices_org_idx on public.invoices (organization_id, issued_at desc);

-- =============================================================================
--  StaX — 0003 · Catalogue : metiers, modules, offres, fonctionnalites
--  Aucun prix, aucun module, aucun metier n'est code en dur dans un composant.
--  Tout provient de ce catalogue, dont le registre TypeScript est le miroir.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Secteurs et metiers
-- -----------------------------------------------------------------------------
create table public.business_sectors (
  slug         text primary key,
  label        text not null,
  description  text,
  icon         text not null default 'briefcase',
  sort_order   int  not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint business_sectors_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$')
);

create trigger business_sectors_touch_updated_at
  before update on public.business_sectors
  for each row execute function app.touch_updated_at();

create table public.business_types (
  slug              text primary key,
  sector_slug       text not null references public.business_sectors (slug) on delete restrict,
  label             text not null,
  plural_label      text,
  description       text,
  icon              text not null default 'store',
  /** Type Schema.org utilise pour les donnees structurees du site public. */
  schema_org_type   text not null default 'LocalBusiness',
  sort_order        int  not null default 100,
  is_active         boolean not null default true,
  /**
   * Configuration declarative : pages recommandees, questions d'onboarding,
   * defauts SEO, recommandations de theme. Miroir du registre TypeScript.
   */
  config            jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint business_types_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$')
);

create index business_types_sector_idx on public.business_types (sector_slug, sort_order);
create index business_types_label_trgm_idx
  on public.business_types using gin (label extensions.gin_trgm_ops);

create trigger business_types_touch_updated_at
  before update on public.business_types
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  Modules metier
-- -----------------------------------------------------------------------------
create table public.business_modules (
  slug            text primary key,
  label           text not null,
  description     text,
  icon            text not null default 'puzzle',
  category        text not null default 'content',
  /** Fonctionnalite d'offre requise pour activer ce module (cf. features). */
  required_feature text,
  sort_order      int not null default 100,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint business_modules_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  constraint business_modules_category_valid
    check (category in ('content', 'commerce', 'booking', 'crm', 'marketing', 'operations'))
);

create trigger business_modules_touch_updated_at
  before update on public.business_modules
  for each row execute function app.touch_updated_at();

create table public.business_type_modules (
  business_type_slug text not null references public.business_types (slug) on delete cascade,
  module_slug        text not null references public.business_modules (slug) on delete cascade,
  is_default         boolean not null default true,
  sort_order         int not null default 100,
  primary key (business_type_slug, module_slug)
);

-- -----------------------------------------------------------------------------
--  Fonctionnalites et offres
-- -----------------------------------------------------------------------------
create table public.features (
  key          text primary key,
  label        text not null,
  description  text,
  category     text not null default 'general',
  /** `boolean` = activee ou non. `limit` = quota numerique (NULL = illimite). */
  kind         text not null default 'boolean',
  unit         text,
  created_at   timestamptz not null default now(),

  constraint features_kind_valid check (kind in ('boolean', 'limit')),
  constraint features_key_format check (key ~ '^[a-z0-9][a-z0-9_]{1,48}$')
);

create table public.plans (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null,
  /** Versionne pour le grandfathering : un client garde la version achetee. */
  version                int  not null default 1,
  name                   text not null,
  tagline                text,
  description            text,
  badge                  text,

  -- Argent : toujours en unites mineures entieres, jamais en flottant.
  setup_price_cents      integer not null,
  /** Frais d'entretien recurrents, preleves selon `billing_interval`. */
  maintenance_price_cents integer not null,
  /**
   * Periodicite de la maintenance. `year` aujourd'hui : la colonne existe pour
   * que basculer une offre au mois ne demande pas de migration de schema, et
   * pour qu'aucun ecran ne suppose une periodicite qui ne serait pas ecrite.
   */
  billing_interval       text not null default 'year',
  currency               char(3) not null default 'EUR',
  /** Taux de TVA en points de base : 2000 = 20,00 %. */
  vat_rate_bps           integer not null default 2000,
  /** true = les montants affiches incluent deja la TVA. */
  prices_include_vat     boolean not null default false,

  /** NULL = offre sur devis, sans prix public. */
  is_quote_only          boolean not null default false,
  is_active              boolean not null default true,
  is_public              boolean not null default true,
  sort_order             int not null default 100,

  stripe_setup_price_id   text,
  stripe_maintenance_price_id text,
  stripe_product_id       text,

  valid_from             timestamptz not null default now(),
  valid_until            timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint plans_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  constraint plans_prices_non_negative
    check (setup_price_cents >= 0 and maintenance_price_cents >= 0),
  constraint plans_billing_interval_valid check (billing_interval in ('year', 'month')),
  constraint plans_vat_sane check (vat_rate_bps between 0 and 10000),
  constraint plans_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint plans_quote_has_no_price
    check (not is_quote_only or (setup_price_cents = 0 and maintenance_price_cents = 0))
);

create unique index plans_slug_version_key on public.plans (slug, version);
-- Une seule version active et publique par offre.
create unique index plans_active_slug_key on public.plans (slug)
  where is_active and valid_until is null;
create index plans_public_idx on public.plans (is_public, sort_order) where is_active;

create trigger plans_touch_updated_at
  before update on public.plans
  for each row execute function app.touch_updated_at();

comment on table public.plans is
  'Catalogue tarifaire canonique. Les montants sont en centimes. Les commandes et '
  'abonnements copient le prix au moment de l''achat (grandfathering).';

create table public.plan_features (
  plan_id      uuid not null references public.plans (id) on delete cascade,
  feature_key  text not null references public.features (key) on delete cascade,
  enabled      boolean not null default true,
  /** Quota. NULL avec kind=limit signifie « illimite ». */
  limit_value  integer,
  primary key (plan_id, feature_key),
  constraint plan_features_limit_non_negative check (limit_value is null or limit_value >= 0)
);

-- Derogation commerciale accordee a un client precis, tracee et reversible.
create table public.organization_feature_overrides (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  feature_key      text not null references public.features (key) on delete cascade,
  enabled          boolean,
  limit_value      integer,
  reason           text not null,
  expires_at       timestamptz,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint organization_feature_overrides_unique unique (organization_id, feature_key),
  constraint organization_feature_overrides_has_effect
    check (enabled is not null or limit_value is not null)
);

-- -----------------------------------------------------------------------------
--  Codes promotionnels
-- -----------------------------------------------------------------------------
create table public.coupons (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  label            text,
  kind             text not null default 'percent',
  /** percent : points de base (1000 = 10 %). amount : centimes. */
  value            integer not null,
  applies_to       text not null default 'setup',
  plan_slugs       text[] not null default '{}',
  max_redemptions  integer,
  redeemed_count   integer not null default 0,
  valid_from       timestamptz not null default now(),
  valid_until      timestamptz,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint coupons_kind_valid check (kind in ('percent', 'amount')),
  constraint coupons_applies_to_valid check (applies_to in ('setup', 'maintenance', 'both')),
  constraint coupons_value_positive check (value > 0),
  constraint coupons_percent_range check (kind <> 'percent' or value <= 10000),
  constraint coupons_redemptions_sane
    check (max_redemptions is null or redeemed_count <= max_redemptions)
);

create unique index coupons_code_key on public.coupons (upper(code));

create trigger coupons_touch_updated_at
  before update on public.coupons
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  Feature flags — deploiement progressif
-- -----------------------------------------------------------------------------
create table public.feature_flags (
  key               text primary key,
  label             text not null,
  description       text,
  enabled_globally  boolean not null default false,
  /**
   * Regles de ciblage additives :
   * { "plans": ["premium"], "business_types": ["restaurant"],
   *   "organizations": ["uuid"], "sites": ["uuid"], "rollout_percent": 25 }
   */
  rules             jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint feature_flags_key_format check (key ~ '^[a-z0-9][a-z0-9_.-]{1,60}$')
);

create trigger feature_flags_touch_updated_at
  before update on public.feature_flags
  for each row execute function app.touch_updated_at();

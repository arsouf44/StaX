-- =============================================================================
--  StaX — 0004 · Moteur de sites : sites, domaines, themes, pages, blocs,
--  versions, medias, redirections.
--  Le contenu publie est un SNAPSHOT immuable (site_versions) : l'edition
--  du brouillon ne peut jamais alterer ce qui est deja en ligne.
-- =============================================================================

create table public.sites (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,

  name                text not null,
  slug                text not null,
  status              app.site_status not null default 'draft',

  business_type_slug  text references public.business_types (slug) on delete set null,
  plan_id             uuid references public.plans (id) on delete restrict,
  /** Snapshot du slug d'offre au moment de la vente (grandfathering lisible). */
  plan_slug           text,
  template_slug       text,

  /** Version actuellement servie au public. NULL = jamais publie. */
  published_version_id uuid,
  first_published_at  timestamptz,
  last_published_at   timestamptz,

  default_locale      text not null default 'fr',
  enabled_locales     text[] not null default array['fr'],
  timezone            text not null default 'Europe/Paris',

  is_demo             boolean not null default false,
  suspended_at        timestamptz,
  suspension_reason   text,
  archived_at         timestamptz,

  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint sites_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$'),
  constraint sites_locale_in_enabled check (default_locale = any (enabled_locales))
);

create unique index sites_slug_key on public.sites (slug);
create index sites_org_idx on public.sites (organization_id);
create index sites_status_idx on public.sites (status) where archived_at is null;
create index sites_plan_idx on public.sites (plan_id);
create index sites_name_trgm_idx on public.sites using gin (name extensions.gin_trgm_ops);

create trigger sites_touch_updated_at
  before update on public.sites
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  Machine a etats du site — les transitions incoherentes sont refusees
-- -----------------------------------------------------------------------------
create or replace function app.guard_site_status()
returns trigger
language plpgsql
set search_path = public, app, pg_catalog
as $$
declare
  v_allowed app.site_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'draft'     then array['building','archived']::app.site_status[]
    when 'building'  then array['draft','review','ready','archived']::app.site_status[]
    when 'review'    then array['building','ready','archived']::app.site_status[]
    when 'ready'     then array['building','review','live','archived']::app.site_status[]
    when 'live'      then array['suspended','archived','ready']::app.site_status[]
    when 'suspended' then array['live','ready','archived']::app.site_status[]
    when 'archived'  then array['draft']::app.site_status[]
  end;

  if not (new.status = any (v_allowed)) then
    raise exception 'Transition de statut de site interdite : % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  if new.status = 'live' and new.published_version_id is null then
    raise exception 'Un site ne peut passer en ligne sans version publiee'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger sites_guard_status
  before update of status on public.sites
  for each row execute function app.guard_site_status();

-- -----------------------------------------------------------------------------
--  site_domains — routage multi-tenant par hostname
-- -----------------------------------------------------------------------------
create table public.site_domains (
  id                  uuid primary key default gen_random_uuid(),
  site_id             uuid not null references public.sites (id) on delete cascade,
  organization_id     uuid not null references public.organizations (id) on delete cascade,

  hostname            text not null,
  kind                app.domain_kind not null default 'custom',
  status              app.domain_status not null default 'pending',
  is_primary          boolean not null default false,

  /** Jeton de preuve de propriete, publie en TXT sur le DNS du client. */
  verification_token  text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  verification_method text not null default 'txt',
  verified_at         timestamptz,
  last_checked_at     timestamptz,
  check_attempts      int not null default 0,
  last_error          text,

  ssl_status          app.ssl_status not null default 'none',
  ssl_issued_at       timestamptz,

  /** Identifiant Cloudflare for SaaS du custom hostname. */
  cf_hostname_id      text,
  /** Le domaine a-t-il ete achete par StaX pour le compte du client ? */
  purchased_by_stax   boolean not null default false,
  purchase_cost_cents integer,
  purchased_at        timestamptz,
  registrar           text,
  expires_at          timestamptz,

  detached_at         timestamptz,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint site_domains_hostname_format
    check (hostname ~ '^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$'),
  constraint site_domains_hostname_lower check (hostname = lower(hostname)),
  constraint site_domains_purchase_coherent
    check (not purchased_by_stax or (purchase_cost_cents is not null and purchased_at is not null))
);

/*
 * Anti-detournement : un hostname ne peut etre rattache qu'a UN SEUL site
 * actif a la fois. Un domaine detache libere la place, l'historique reste.
 */
create unique index site_domains_hostname_active_key
  on public.site_domains (hostname)
  where status <> 'detached';

create index site_domains_site_idx on public.site_domains (site_id);
create index site_domains_status_idx on public.site_domains (status);
create unique index site_domains_primary_key
  on public.site_domains (site_id) where is_primary and status <> 'detached';

create trigger site_domains_touch_updated_at
  before update on public.site_domains
  for each row execute function app.touch_updated_at();

comment on index public.site_domains_hostname_active_key is
  'Protection contre le domain hijacking : un hostname actif ne peut appartenir '
  'qu''a un seul site.';

-- -----------------------------------------------------------------------------
--  Themes et reglages
-- -----------------------------------------------------------------------------
create table public.site_themes (
  site_id        uuid primary key references public.sites (id) on delete cascade,
  preset         text not null default 'graphite',
  /**
   * Jetons de design valides cote serveur (couleurs, rayons, densite,
   * polices choisies dans une liste sure). Jamais de CSS arbitraire.
   */
  tokens         jsonb not null default '{}'::jsonb,
  font_heading   text not null default 'geist',
  font_body      text not null default 'geist',
  logo_media_id  uuid,
  favicon_media_id uuid,
  updated_at     timestamptz not null default now(),

  constraint site_themes_font_allowlist
    check (font_heading in ('geist','inter','sora','fraunces','instrument-serif','ibm-plex-sans')
       and font_body    in ('geist','inter','sora','fraunces','instrument-serif','ibm-plex-sans'))
);

create trigger site_themes_touch_updated_at
  before update on public.site_themes
  for each row execute function app.touch_updated_at();

create table public.site_settings (
  site_id             uuid primary key references public.sites (id) on delete cascade,

  -- Identite publique
  business_name       text,
  tagline             text,
  description         text,
  email               text,
  phone               text,
  address_line1       text,
  address_line2       text,
  postal_code         text,
  city                text,
  country             text not null default 'FR',
  latitude            numeric(9,6),
  longitude           numeric(9,6),
  social_links        jsonb not null default '{}'::jsonb,

  -- SEO
  seo_title           text,
  seo_description     text,
  seo_keywords        text[],
  og_image_media_id   uuid,
  robots_indexable    boolean not null default true,
  google_site_verification text,

  -- Modules actives sur ce site (sous-ensemble de business_modules)
  enabled_modules     text[] not null default '{}',

  -- Navigation : entetes/pieds gerés en JSON valide par un schema Zod
  navigation          jsonb not null default '{"primary":[],"footer":[]}'::jsonb,

  -- Formulaires et notifications
  notification_emails text[] not null default '{}',

  -- Consentement cookies affiche sur le site public
  cookie_banner_enabled boolean not null default true,
  analytics_enabled     boolean not null default true,

  updated_at          timestamptz not null default now(),

  constraint site_settings_country_iso check (country ~ '^[A-Z]{2}$')
);

create trigger site_settings_touch_updated_at
  before update on public.site_settings
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  Pages et blocs (brouillon vivant)
-- -----------------------------------------------------------------------------
create table public.site_pages (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites (id) on delete cascade,
  parent_id       uuid references public.site_pages (id) on delete set null,

  path            text not null,
  title           text not null,
  /** Page speciale : home, contact, legal… — utilise par le moteur de rendu. */
  kind            text not null default 'standard',
  locale          text not null default 'fr',

  seo_title       text,
  seo_description text,
  og_image_media_id uuid,
  robots_indexable boolean not null default true,

  is_visible_in_nav boolean not null default true,
  sort_order      int not null default 100,
  is_published    boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint site_pages_path_format check (path ~ '^/([a-z0-9]+(?:[-/][a-z0-9]+)*)?$'),
  constraint site_pages_kind_valid
    check (kind in ('home','standard','contact','legal','menu','services','products',
                    'booking','gallery','team','blog','listing'))
);

create unique index site_pages_path_key on public.site_pages (site_id, locale, path);
create index site_pages_site_order_idx on public.site_pages (site_id, sort_order);

create trigger site_pages_touch_updated_at
  before update on public.site_pages
  for each row execute function app.touch_updated_at();

create table public.page_blocks (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.site_pages (id) on delete cascade,
  site_id     uuid not null references public.sites (id) on delete cascade,

  /** Type de bloc : hero, features, menu, booking… valide par un schema Zod. */
  type        text not null,
  /** Version du schema du bloc : permet des migrations de contenu sures. */
  version     int not null default 1,
  /** Contenu du bloc, valide a l'ecriture ET a la lecture. */
  props       jsonb not null default '{}'::jsonb,
  /** Reglages de presentation (fond, espacement, largeur, animation). */
  settings    jsonb not null default '{}'::jsonb,

  sort_order  int not null default 100,
  is_visible  boolean not null default true,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint page_blocks_type_format check (type ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  constraint page_blocks_props_object check (jsonb_typeof(props) = 'object'),
  constraint page_blocks_settings_object check (jsonb_typeof(settings) = 'object')
);

create index page_blocks_page_order_idx on public.page_blocks (page_id, sort_order);
create index page_blocks_site_idx on public.page_blocks (site_id);

create trigger page_blocks_touch_updated_at
  before update on public.page_blocks
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  Versions publiees — snapshots immuables
-- -----------------------------------------------------------------------------
create table public.site_versions (
  id              uuid primary key default app.uuid_v7(),
  site_id         uuid not null references public.sites (id) on delete cascade,
  version_number  int not null,
  label           text,
  /**
   * Snapshot complet et autonome du site au moment de la publication :
   * theme, reglages, navigation, pages, blocs. Le runtime public ne lit
   * QUE cette colonne — il ne touche jamais aux tables de brouillon.
   */
  snapshot        jsonb not null,
  /** Empreinte du snapshot, utilisee comme cle de cache edge. */
  content_hash    text not null,

  published_at    timestamptz,
  published_by    uuid references public.profiles (id) on delete set null,
  scheduled_for   timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint site_versions_snapshot_object check (jsonb_typeof(snapshot) = 'object')
);

create unique index site_versions_number_key on public.site_versions (site_id, version_number);
create index site_versions_site_created_idx on public.site_versions (site_id, created_at desc);
create index site_versions_scheduled_idx on public.site_versions (scheduled_for)
  where scheduled_for is not null and published_at is null;

alter table public.sites
  add constraint sites_published_version_fk
  foreign key (published_version_id) references public.site_versions (id) on delete set null;

-- Un snapshot publie ne se modifie jamais : il se remplace.
create or replace function app.freeze_published_version()
returns trigger
language plpgsql
as $$
begin
  if old.published_at is not null then
    raise exception 'Une version publiee est immuable (site_versions.%)', old.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger site_versions_freeze
  before update on public.site_versions
  for each row execute function app.freeze_published_version();

-- Historique fin, par page, pour l'annulation ciblee dans l'editeur.
create table public.page_versions (
  id             uuid primary key default app.uuid_v7(),
  page_id        uuid not null references public.site_pages (id) on delete cascade,
  site_id        uuid not null references public.sites (id) on delete cascade,
  version_number int not null,
  snapshot       jsonb not null,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create unique index page_versions_number_key on public.page_versions (page_id, version_number);
create index page_versions_page_idx on public.page_versions (page_id, created_at desc);

-- -----------------------------------------------------------------------------
--  Medias
-- -----------------------------------------------------------------------------
create table public.media (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  site_id          uuid references public.sites (id) on delete set null,

  storage_bucket   text not null default 'site-media',
  storage_path     text not null,
  file_name        text not null,
  mime_type        text not null,
  size_bytes       bigint not null,
  width            int,
  height           int,
  checksum         text,

  alt_text         text,
  caption          text,
  folder           text not null default '/',
  /** Un media prive n'est jamais servi par une URL publique. */
  is_public        boolean not null default true,

  uploaded_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint media_size_positive check (size_bytes > 0),
  constraint media_mime_allowlist check (
    mime_type in (
      'image/jpeg','image/png','image/webp','image/avif','image/gif','image/svg+xml',
      'application/pdf','video/mp4','video/webm'
    )
  ),
  constraint media_folder_format check (folder ~ '^/([a-z0-9-]+/)*$')
);

create unique index media_storage_path_key on public.media (storage_bucket, storage_path);
create index media_org_idx on public.media (organization_id, created_at desc);
create index media_site_idx on public.media (site_id);

create trigger media_touch_updated_at
  before update on public.media
  for each row execute function app.touch_updated_at();

alter table public.site_themes
  add constraint site_themes_logo_fk foreign key (logo_media_id)
    references public.media (id) on delete set null,
  add constraint site_themes_favicon_fk foreign key (favicon_media_id)
    references public.media (id) on delete set null;

alter table public.site_settings
  add constraint site_settings_og_image_fk foreign key (og_image_media_id)
    references public.media (id) on delete set null;

alter table public.site_pages
  add constraint site_pages_og_image_fk foreign key (og_image_media_id)
    references public.media (id) on delete set null;

-- -----------------------------------------------------------------------------
--  Redirections 301 administrables
-- -----------------------------------------------------------------------------
create table public.site_redirects (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  source_path text not null,
  target_path text not null,
  status_code int not null default 301,
  hit_count   bigint not null default 0,
  created_at  timestamptz not null default now(),

  constraint site_redirects_status_valid check (status_code in (301, 302, 307, 308)),
  constraint site_redirects_source_format check (source_path ~ '^/'),
  constraint site_redirects_no_loop check (source_path <> target_path)
);

create unique index site_redirects_source_key on public.site_redirects (site_id, source_path);

-- -----------------------------------------------------------------------------
--  Templates de sites (instanciation d'un nouveau site)
-- -----------------------------------------------------------------------------
create table public.site_templates (
  slug                   text primary key,
  name                   text not null,
  description            text,
  thumbnail_url          text,
  supported_business_types text[] not null default '{}',
  recommended_modules    text[] not null default '{}',
  /** Theme + pages + blocs + navigation, au meme format qu'un snapshot. */
  definition             jsonb not null,
  is_active              boolean not null default true,
  sort_order             int not null default 100,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint site_templates_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  constraint site_templates_definition_object check (jsonb_typeof(definition) = 'object')
);

create trigger site_templates_touch_updated_at
  before update on public.site_templates
  for each row execute function app.touch_updated_at();

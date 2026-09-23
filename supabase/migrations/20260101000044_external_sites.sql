-- =============================================================================
--  StaX — 0044 · Des sites developpes independamment, geres par StaX
--
--  Le modele cible, en une phrase : chaque site est un VRAI projet, code par
--  l'equipe dans son propre depot GitHub, deploye sur son propre projet
--  Cloudflare (Pages ou Workers), en ligne sur son domaine ; StaX le rattache
--  ensuite et devient son plan de controle — CMS, publication, historique,
--  livraison. Le site public ne depend pas de StaX pour etre servi.
--
--  Ce que StaX enregistre, et rien de plus (aucun secret) :
--
--    github_installations   installations de l'application GitHub StaX
--    site_repositories      le depot du site (identifiant GitHub, branche…)
--    site_hosting           le projet Cloudflare (Pages ou Worker)
--    site_manifests         le contrat d'edition `stax.manifest.json` importe
--    site_content_drafts    le BROUILLON du client (jamais en ligne)
--    site_releases          les versions PUBLIEES : commit + deploiement
--    site_deployments       chaque deploiement Cloudflare observe
--    site_delivery_checks   la checklist de livraison, avec preuves
--
--  Regles tenues par la base :
--   - un depot, un projet Cloudflare et un nom de domaine ne peuvent etre
--     rattaches qu'a UN site actif : impossible de brancher le site d'une
--     autre organisation ;
--   - seule l'administration rattache un depot ou un projet, et seulement un
--     depot appartenant a une installation connue de l'application StaX ;
--   - une version n'est « publiee » que sur confirmation d'un deploiement
--     Cloudflare reussi ; un echec laisse la version precedente en production ;
--   - le client n'edite et ne publie qu'apres la livraison (`app.site_can`) ;
--   - toute operation sensible est journalisee.
--
--  Les sites existants, rendus par le moteur multi-tenant, restent servis tels
--  quels : ils sont marques `legacy_engine`. Tout nouveau site est
--  `external_repository`.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Architecture de chaque site
-- -----------------------------------------------------------------------------
alter table public.sites
  add column if not exists architecture text not null default 'external_repository',
  add column if not exists public_key text not null
    default 'pk_site_' || encode(extensions.gen_random_bytes(16), 'hex'),
  -- Contrainte de cle etrangere posee plus bas, une fois les versions creees.
  add column if not exists production_release_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sites_architecture_valid') then
    alter table public.sites add constraint sites_architecture_valid
      check (architecture in ('external_repository', 'legacy_engine'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sites_public_key_format') then
    alter table public.sites add constraint sites_public_key_format
      check (public_key ~ '^pk_site_[0-9a-f]{32}$');
  end if;
end;
$$;

create unique index if not exists sites_public_key_key on public.sites (public_key);

comment on column public.sites.architecture is
  '`external_repository` : site developpe dans son propre depot et deploye sur son propre '
  'projet Cloudflare, gere par StaX (modele cible). `legacy_engine` : site anterieur, rendu '
  'par le moteur multi-tenant de StaX, conserve pour compatibilite.';
comment on column public.sites.public_key is
  'Identifiant PUBLIC du site pour l''API des sites (formulaires, reservations, boutique, '
  'mesure d''audience). Ce n''est pas un secret : il figure dans le code du site. Les '
  'appels sont en outre limites aux origines du site.';

-- Les sites qui ont deja un contenu dans le moteur multi-tenant restent servis
-- par lui : rien ne change pour eux.
update public.sites s
   set architecture = 'legacy_engine'
 where s.architecture = 'external_repository'
   and (s.published_version_id is not null
        or exists (select 1 from public.site_pages p where p.site_id = s.id)
        or exists (select 1 from public.site_versions v where v.site_id = s.id));

-- Garde des champs commerciaux (reprise de 0041) : l'architecture et la cle
-- publique ne se changent pas depuis l'espace client.
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
  if new.delivered_at is distinct from old.delivered_at
     or new.delivered_by is distinct from old.delivered_by then
    raise exception 'Seule l''equipe StaX confie un site a son client'
      using errcode = '42501';
  end if;
  if new.architecture is distinct from old.architecture
     or new.public_key is distinct from old.public_key
     or new.production_release_id is distinct from old.production_release_id then
    raise exception 'Champ reserve a la plateforme' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Un site externe ne recoit JAMAIS d'instantane du moteur multi-tenant : son
-- rendu appartient a son propre depot. La garde est posee au point d'ecriture,
-- pour tous les chemins (editeur, publication, scripts).
create or replace function app.forbid_engine_snapshot_for_external()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if exists (select 1 from public.sites
              where id = new.site_id and architecture = 'external_repository') then
    raise exception 'Ce site est developpe dans son propre depot : il se publie par StaX vers '
                    'GitHub et Cloudflare, pas par le moteur de rendu' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists site_versions_external_guard on public.site_versions;
create trigger site_versions_external_guard
  before insert on public.site_versions
  for each row execute function app.forbid_engine_snapshot_for_external();

-- -----------------------------------------------------------------------------
--  2. Installations de l'application GitHub StaX
--
--  Alimentees par le serveur (webhooks signes, synchronisation), jamais par
--  un navigateur. Un depot ne peut etre rattache que s'il releve d'une de ces
--  installations.
-- -----------------------------------------------------------------------------
create table if not exists public.github_installations (
  installation_id      bigint primary key,
  account_login        text not null,
  account_id           bigint not null,
  account_type         text not null,
  repository_selection text,
  suspended_at         timestamptz,
  removed_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint github_installations_account_type_valid
    check (account_type in ('Organization', 'User')),
  constraint github_installations_login_format
    check (account_login ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$')
);

drop trigger if exists github_installations_touch on public.github_installations;
create trigger github_installations_touch
  before update on public.github_installations
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  3. Depot GitHub du site
-- -----------------------------------------------------------------------------
create table if not exists public.site_repositories (
  id                   uuid primary key default gen_random_uuid(),
  site_id              uuid not null references public.sites (id) on delete cascade,
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  provider             text not null default 'github',
  installation_id      bigint not null references public.github_installations (installation_id),
  /** Identifiant numerique GitHub : stable, meme si le depot est renomme. */
  repository_id        bigint not null,
  owner_login          text not null,
  owner_id             bigint not null,
  name                 text not null,
  full_name            text not null,
  html_url             text not null,
  default_branch       text not null,
  production_branch    text not null,
  /** Branche technique ou StaX pousse les apercus : jamais la production. */
  preview_branch       text not null default 'stax-preview',
  manifest_path        text not null default 'stax.manifest.json',
  delivery_commit_sha  text,
  head_commit_sha      text,
  head_committed_at    timestamptz,
  last_stax_commit_sha text,
  sync_status          text not null default 'unknown',
  status               text not null default 'connected',
  last_error           text,
  last_synced_at       timestamptz,
  connected_by         uuid references public.profiles (id) on delete set null,
  connected_at         timestamptz not null default now(),
  disconnected_at      timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint site_repositories_provider_valid check (provider = 'github'),
  constraint site_repositories_status_valid check (status in ('connected', 'disconnected', 'error')),
  constraint site_repositories_sync_valid
    check (sync_status in ('unknown', 'in_sync', 'developer_changes', 'error')),
  constraint site_repositories_branch_format
    check (production_branch ~ '^[A-Za-z0-9._/-]{1,200}$' and production_branch !~ '\.\.'
       and preview_branch ~ '^[A-Za-z0-9._/-]{1,200}$' and preview_branch !~ '\.\.'
       and preview_branch <> production_branch),
  constraint site_repositories_manifest_path_format
    check (manifest_path ~ '^[A-Za-z0-9._/-]{1,200}\.json$' and manifest_path !~ '\.\.'
       and manifest_path !~ '^/'),
  constraint site_repositories_full_name_format
    check (full_name ~ '^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$'),
  constraint site_repositories_html_url_format check (html_url ~ '^https://github\.com/'),
  constraint site_repositories_sha_format check (
        (delivery_commit_sha is null or delivery_commit_sha ~ '^[0-9a-f]{40}$')
    and (head_commit_sha is null or head_commit_sha ~ '^[0-9a-f]{40}$')
    and (last_stax_commit_sha is null or last_stax_commit_sha ~ '^[0-9a-f]{40}$'))
);

-- Un site, un depot actif. Un depot, un site actif : c'est ce qui empeche de
-- rattacher le depot d'un client au site d'un autre.
create unique index if not exists site_repositories_active_site_key
  on public.site_repositories (site_id) where status <> 'disconnected';
create unique index if not exists site_repositories_active_repo_key
  on public.site_repositories (provider, repository_id) where status <> 'disconnected';
create index if not exists site_repositories_installation_idx
  on public.site_repositories (installation_id);

drop trigger if exists site_repositories_touch on public.site_repositories;
create trigger site_repositories_touch
  before update on public.site_repositories
  for each row execute function app.touch_updated_at();

comment on table public.site_repositories is
  'Depot GitHub d''un site. Aucun jeton n''est stocke : l''acces passe par l''application '
  'GitHub StaX, dont les secrets vivent cote serveur uniquement.';

-- -----------------------------------------------------------------------------
--  4. Projet Cloudflare du site
-- -----------------------------------------------------------------------------
create table if not exists public.site_hosting (
  id                 uuid primary key default gen_random_uuid(),
  site_id            uuid not null references public.sites (id) on delete cascade,
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  provider           text not null,
  account_id         text not null,
  /** Nom du projet Pages, ou nom du script Worker. */
  project_name       text not null,
  /** Identifiant du projet Pages, ou etiquette immuable (« tag ») du Worker. */
  project_id         text,
  production_branch  text not null,
  production_url     text not null,
  /** Declencheur Workers Builds de production (relance d'un build). */
  workers_trigger_id text,
  status             text not null default 'connected',
  last_error         text,
  last_synced_at     timestamptz,
  connected_by       uuid references public.profiles (id) on delete set null,
  connected_at       timestamptz not null default now(),
  disconnected_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint site_hosting_provider_valid
    check (provider in ('cloudflare_pages', 'cloudflare_workers')),
  constraint site_hosting_status_valid check (status in ('connected', 'disconnected', 'error')),
  constraint site_hosting_account_format check (account_id ~ '^[0-9a-f]{32}$'),
  constraint site_hosting_project_format check (project_name ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  constraint site_hosting_url_format check (production_url ~ '^https://[a-z0-9.-]+(/.*)?$'),
  constraint site_hosting_branch_format
    check (production_branch ~ '^[A-Za-z0-9._/-]{1,200}$' and production_branch !~ '\.\.')
);

create unique index if not exists site_hosting_active_site_key
  on public.site_hosting (site_id) where status <> 'disconnected';
create unique index if not exists site_hosting_active_project_key
  on public.site_hosting (provider, account_id, project_name) where status <> 'disconnected';

drop trigger if exists site_hosting_touch on public.site_hosting;
create trigger site_hosting_touch
  before update on public.site_hosting
  for each row execute function app.touch_updated_at();

comment on table public.site_hosting is
  'Projet Cloudflare (Pages ou Worker) qui sert le site. Le jeton d''API Cloudflare reste '
  'dans les secrets du serveur ; seuls des identifiants non sensibles sont stockes ici.';

-- -----------------------------------------------------------------------------
--  5. Contrat d'edition importe (stax.manifest.json)
-- -----------------------------------------------------------------------------
create table if not exists public.site_manifests (
  id               uuid primary key default app.uuid_v7(),
  site_id          uuid not null references public.sites (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  repository_id    uuid references public.site_repositories (id) on delete set null,
  commit_sha       text not null,
  path             text not null,
  contract_version int not null,
  manifest         jsonb not null,
  manifest_hash    text not null,
  status           text not null,
  errors           jsonb not null default '[]'::jsonb,
  warnings         jsonb not null default '[]'::jsonb,
  /** Comptes utiles aux quotas : pages, langues, formulaires, collections. */
  summary          jsonb not null default '{}'::jsonb,
  is_active        boolean not null default false,
  imported_by      uuid references public.profiles (id) on delete set null,
  imported_at      timestamptz not null default now(),

  constraint site_manifests_status_valid check (status in ('valid', 'invalid')),
  constraint site_manifests_active_is_valid check (not is_active or status = 'valid'),
  constraint site_manifests_sha_format check (commit_sha ~ '^[0-9a-f]{40}$'),
  constraint site_manifests_object check (jsonb_typeof(manifest) = 'object'),
  constraint site_manifests_contract_supported check (contract_version between 1 and 1)
);

create unique index if not exists site_manifests_active_key
  on public.site_manifests (site_id) where is_active;
create index if not exists site_manifests_site_idx
  on public.site_manifests (site_id, imported_at desc);

-- Un manifeste importe est une piece : il ne se reecrit pas. Seul son statut
-- « actif » bascule.
create or replace function app.freeze_site_manifest()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if row(new.site_id, new.commit_sha, new.path, new.contract_version, new.manifest,
         new.manifest_hash, new.status, new.errors, new.summary, new.imported_at)
     is distinct from
     row(old.site_id, old.commit_sha, old.path, old.contract_version, old.manifest,
         old.manifest_hash, old.status, old.errors, old.summary, old.imported_at) then
    raise exception 'Un manifeste importe est immuable' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists site_manifests_freeze on public.site_manifests;
create trigger site_manifests_freeze
  before update on public.site_manifests
  for each row execute function app.freeze_site_manifest();

-- -----------------------------------------------------------------------------
--  6. Brouillon du client
-- -----------------------------------------------------------------------------
create table if not exists public.site_content_drafts (
  site_id          uuid primary key references public.sites (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  manifest_id      uuid not null references public.site_manifests (id),
  content          jsonb not null default '{}'::jsonb,
  revision         int not null default 1,
  base_release_id  uuid,
  updated_by       uuid references public.profiles (id) on delete set null,
  updated_by_kind  text not null default 'system',
  updated_at       timestamptz not null default now(),

  constraint site_content_drafts_object check (jsonb_typeof(content) = 'object'),
  constraint site_content_drafts_size check (pg_column_size(content) <= 2097152),
  constraint site_content_drafts_actor_valid
    check (updated_by_kind in ('member', 'stax', 'system'))
);

-- -----------------------------------------------------------------------------
--  7. Versions publiees
-- -----------------------------------------------------------------------------
create table if not exists public.site_releases (
  id                uuid primary key default app.uuid_v7(),
  site_id           uuid not null references public.sites (id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  version_number    int not null,
  kind              text not null,
  status            text not null,
  manifest_id       uuid not null references public.site_manifests (id),
  content           jsonb not null,
  content_hash      text not null,
  source_release_id uuid references public.site_releases (id) on delete set null,
  repository_id     uuid references public.site_repositories (id) on delete set null,
  hosting_id        uuid references public.site_hosting (id) on delete set null,
  branch            text,
  base_commit_sha   text,
  commit_sha        text,
  commit_url        text,
  deployment_id     uuid,
  scheduled_for     timestamptz,
  note              text,
  error_stage       text,
  error_code        text,
  error_message     text,
  created_by        uuid references public.profiles (id) on delete set null,
  actor_kind        text not null default 'member',
  created_at        timestamptz not null default now(),
  committed_at      timestamptz,
  deploy_started_at timestamptz,
  published_at      timestamptz,
  failed_at         timestamptz,
  superseded_at     timestamptz,
  updated_at        timestamptz not null default now(),

  constraint site_releases_kind_valid check (kind in ('import', 'publish', 'rollback')),
  constraint site_releases_status_valid check (status in
    ('scheduled', 'queued', 'committing', 'deploying', 'published', 'failed', 'superseded',
     'cancelled')),
  constraint site_releases_actor_valid check (actor_kind in ('member', 'stax', 'system')),
  constraint site_releases_content_object check (jsonb_typeof(content) = 'object'),
  constraint site_releases_size check (pg_column_size(content) <= 2097152),
  constraint site_releases_rollback_has_source check (kind <> 'rollback' or source_release_id is not null),
  constraint site_releases_sha_format check (
        (commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$')
    and (base_commit_sha is null or base_commit_sha ~ '^[0-9a-f]{40}$')),
  constraint site_releases_published_has_commit check (status not in ('published', 'superseded')
                                                        or commit_sha is not null),
  constraint site_releases_error_stage_valid check (error_stage is null or error_stage in
    ('validation', 'github', 'cloudflare', 'timeout', 'configuration')),
  constraint site_releases_note_bounded check (note is null or length(note) <= 200),
  constraint site_releases_scheduled_coherent check (status <> 'scheduled' or scheduled_for is not null)
);

create unique index if not exists site_releases_number_key
  on public.site_releases (site_id, version_number);
-- Une seule publication en cours par site : deux publications concurrentes
-- ecriraient l'une sur l'autre dans le depot.
create unique index if not exists site_releases_in_flight_key
  on public.site_releases (site_id) where status in ('queued', 'committing', 'deploying');
create unique index if not exists site_releases_scheduled_key
  on public.site_releases (site_id) where status = 'scheduled';
create index if not exists site_releases_site_idx
  on public.site_releases (site_id, version_number desc);
create index if not exists site_releases_due_idx
  on public.site_releases (scheduled_for) where status = 'scheduled';

drop trigger if exists site_releases_touch on public.site_releases;
create trigger site_releases_touch
  before update on public.site_releases
  for each row execute function app.touch_updated_at();

-- Machine a etats : une version ne devient « publiee » qu'en passant par le
-- commit PUIS le deploiement. Son contenu ne change jamais.
create or replace function app.guard_site_release()
returns trigger
language plpgsql
set search_path = public, app, pg_catalog
as $$
declare
  v_allowed text[];
begin
  if tg_op = 'INSERT' then
    if new.status in ('scheduled', 'queued') then
      return new;
    end if;
    if new.kind = 'import' and new.status = 'published' then
      return new;
    end if;
    raise exception 'Une version commence en attente de publication' using errcode = '23514';
  end if;

  if row(new.site_id, new.organization_id, new.version_number, new.kind, new.manifest_id,
         new.content, new.content_hash, new.source_release_id, new.created_by, new.actor_kind,
         new.created_at)
     is distinct from
     row(old.site_id, old.organization_id, old.version_number, old.kind, old.manifest_id,
         old.content, old.content_hash, old.source_release_id, old.created_by, old.actor_kind,
         old.created_at) then
    raise exception 'Le contenu d''une version est immuable' using errcode = '23514';
  end if;

  if old.commit_sha is not null and new.commit_sha is distinct from old.commit_sha then
    raise exception 'Le commit d''une version ne change pas' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    v_allowed := case old.status
      when 'scheduled'  then array['queued', 'cancelled']
      when 'queued'     then array['committing', 'failed', 'cancelled']
      when 'committing' then array['deploying', 'failed', 'queued']
      when 'deploying'  then array['published', 'failed']
      when 'published'  then array['superseded']
      else array[]::text[]
    end;
    if not (new.status = any (v_allowed)) then
      raise exception 'Transition de version interdite : % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists site_releases_guard on public.site_releases;
create trigger site_releases_guard
  before insert or update on public.site_releases
  for each row execute function app.guard_site_release();

-- -----------------------------------------------------------------------------
--  8. Deploiements Cloudflare observes
-- -----------------------------------------------------------------------------
create table if not exists public.site_deployments (
  id                     uuid primary key default app.uuid_v7(),
  site_id                uuid not null references public.sites (id) on delete cascade,
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  hosting_id             uuid not null references public.site_hosting (id) on delete cascade,
  release_id             uuid references public.site_releases (id) on delete set null,
  provider               text not null,
  environment            text not null,
  /** Identifiant du deploiement Pages, ou du build Workers. */
  provider_deployment_id text,
  commit_sha             text,
  branch                 text,
  url                    text,
  status                 text not null default 'queued',
  stage                  text,
  trigger                text not null default 'unknown',
  /** Brouillon affiche par un apercu : revision et empreinte du contenu. */
  draft_revision         int,
  content_hash           text,
  error_message          text,
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  started_at             timestamptz,
  finished_at            timestamptz,
  last_synced_at         timestamptz,
  updated_at             timestamptz not null default now(),

  constraint site_deployments_provider_valid
    check (provider in ('cloudflare_pages', 'cloudflare_workers')),
  constraint site_deployments_environment_valid check (environment in ('production', 'preview')),
  constraint site_deployments_status_valid check (status in
    ('queued', 'building', 'deploying', 'success', 'failure', 'canceled', 'skipped')),
  constraint site_deployments_trigger_valid check (trigger in
    ('stax_publish', 'stax_rollback', 'stax_preview', 'stax_restore', 'developer_push',
     'admin_retry', 'import', 'unknown')),
  constraint site_deployments_sha_format check (commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$'),
  constraint site_deployments_url_format check (url is null or url ~ '^https://')
);

create unique index if not exists site_deployments_provider_key
  on public.site_deployments (hosting_id, provider_deployment_id)
  where provider_deployment_id is not null;
create index if not exists site_deployments_site_idx
  on public.site_deployments (site_id, created_at desc);
create index if not exists site_deployments_release_idx
  on public.site_deployments (release_id) where release_id is not null;
create index if not exists site_deployments_pending_idx
  on public.site_deployments (status) where status in ('queued', 'building', 'deploying');
-- Un seul apercu en preparation a la fois par site : un build Cloudflare n'est
-- pas gratuit, et deux apercus concurrents se remplaceraient l'un l'autre.
create unique index if not exists site_deployments_preview_in_flight_key
  on public.site_deployments (site_id)
  where trigger = 'stax_preview' and status in ('queued', 'building', 'deploying');

drop trigger if exists site_deployments_touch on public.site_deployments;
create trigger site_deployments_touch
  before update on public.site_deployments
  for each row execute function app.touch_updated_at();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_releases_deployment_fk') then
    alter table public.site_releases add constraint site_releases_deployment_fk
      foreign key (deployment_id) references public.site_deployments (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_content_drafts_base_fk') then
    alter table public.site_content_drafts add constraint site_content_drafts_base_fk
      foreign key (base_release_id) references public.site_releases (id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sites_production_release_fk') then
    alter table public.sites add constraint sites_production_release_fk
      foreign key (production_release_id) references public.site_releases (id) on delete set null;
  end if;
end;
$$;

comment on column public.sites.production_release_id is
  'Version du contenu REELLEMENT en production : posee uniquement quand Cloudflare a confirme '
  'le deploiement. Un echec la laisse inchangee.';

-- Machine a etats du site (reprise de 0004) : un site externe passe en ligne
-- avec une version confirmee en production, un site du moteur avec son
-- instantane publie.
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

  if new.status = 'live' then
    if new.architecture = 'external_repository' and new.production_release_id is null then
      raise exception 'Un site ne peut passer en ligne sans version confirmee en production'
        using errcode = '23514';
    end if;
    if new.architecture = 'legacy_engine' and new.published_version_id is null then
      raise exception 'Un site ne peut passer en ligne sans version publiee'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
--  9. Checklist de livraison
-- -----------------------------------------------------------------------------
create table if not exists public.site_delivery_checks (
  site_id     uuid not null references public.sites (id) on delete cascade,
  check_key   text not null,
  status      text not null default 'pending',
  method      text not null,
  evidence    jsonb not null default '{}'::jsonb,
  note        text,
  checked_by  uuid references public.profiles (id) on delete set null,
  checked_at  timestamptz,
  updated_at  timestamptz not null default now(),

  primary key (site_id, check_key),
  constraint site_delivery_checks_key_valid
    check (check_key in ('deployed', 'domain', 'https', 'seo', 'forms', 'responsive')),
  constraint site_delivery_checks_status_valid check (status in ('pending', 'passed', 'failed')),
  constraint site_delivery_checks_method_valid check (method in ('automatic', 'manual')),
  constraint site_delivery_checks_manual_note
    check (method <> 'manual' or status = 'pending' or length(btrim(coalesce(note, ''))) >= 10)
);

drop trigger if exists site_delivery_checks_touch on public.site_delivery_checks;
create trigger site_delivery_checks_touch
  before update on public.site_delivery_checks
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  10. Domaines servis par le projet Cloudflare du site
-- -----------------------------------------------------------------------------
alter table public.site_domains
  add column if not exists served_by text not null default 'stax_runtime',
  add column if not exists dns_managed_by_stax boolean not null default false,
  add column if not exists provider_status text,
  add column if not exists dns_target text,
  add column if not exists https_ok boolean,
  add column if not exists https_checked_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_domains_served_by_valid') then
    alter table public.site_domains add constraint site_domains_served_by_valid
      check (served_by in ('stax_runtime', 'cloudflare_project'));
  end if;
end;
$$;

comment on column public.site_domains.served_by is
  '`cloudflare_project` : le domaine pointe vers le projet Cloudflare PROPRE au site (modele '
  'cible). `stax_runtime` : domaine d''un site servi par le moteur multi-tenant (historique).';

-- Le domaine d'un site externe se rattache a SON projet Cloudflare : seule
-- l'administration le declare, apres l'avoir ajoute au projet.
create or replace function app.guard_external_domain()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if app.is_service_role() or app.is_platform_admin() then
    return new;
  end if;
  if exists (select 1 from public.sites
              where id = new.site_id and architecture = 'external_repository') then
    raise exception 'Le domaine de ce site est rattache a son projet Cloudflare par l''equipe '
                    'StaX : ecrivez-nous pour le modifier' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists site_domains_external_guard on public.site_domains;
create trigger site_domains_external_guard
  before insert or update on public.site_domains
  for each row execute function app.guard_external_domain();

-- -----------------------------------------------------------------------------
--  11. Webhooks : GitHub rejoint les fournisseurs traces
-- -----------------------------------------------------------------------------
alter table public.webhook_events drop constraint if exists webhook_events_provider_valid;
alter table public.webhook_events add constraint webhook_events_provider_valid
  check (provider in ('stripe', 'stripe_connect', 'supabase', 'cloudflare', 'github'));

-- -----------------------------------------------------------------------------
--  12. Securite des lignes
--
--  Lecture : l'equipe StaX lit tout ; le client lit le contrat, son brouillon,
--  ses versions et ses deploiements — jamais les details d'infrastructure
--  (depot, compte Cloudflare), qui ne lui servent a rien.
--  Ecriture : AUCUNE ecriture directe. Tout passe par les fonctions
--  ci-dessous, qui verifient les droits, les etats et journalisent.
-- -----------------------------------------------------------------------------
alter table public.github_installations enable row level security;
alter table public.github_installations force row level security;
alter table public.site_repositories enable row level security;
alter table public.site_repositories force row level security;
alter table public.site_hosting enable row level security;
alter table public.site_hosting force row level security;
alter table public.site_manifests enable row level security;
alter table public.site_manifests force row level security;
alter table public.site_content_drafts enable row level security;
alter table public.site_content_drafts force row level security;
alter table public.site_releases enable row level security;
alter table public.site_releases force row level security;
alter table public.site_deployments enable row level security;
alter table public.site_deployments force row level security;
alter table public.site_delivery_checks enable row level security;
alter table public.site_delivery_checks force row level security;

drop policy if exists github_installations_staff on public.github_installations;
create policy github_installations_staff on public.github_installations
  for select to authenticated using (app.is_platform_staff());

drop policy if exists site_repositories_staff on public.site_repositories;
create policy site_repositories_staff on public.site_repositories
  for select to authenticated using (app.is_platform_staff());

drop policy if exists site_hosting_staff on public.site_hosting;
create policy site_hosting_staff on public.site_hosting
  for select to authenticated using (app.is_platform_staff());

drop policy if exists site_manifests_read on public.site_manifests;
create policy site_manifests_read on public.site_manifests
  for select to authenticated
  using (app.is_platform_staff() or app.site_can(site_id, 'content.view'));

drop policy if exists site_content_drafts_read on public.site_content_drafts;
create policy site_content_drafts_read on public.site_content_drafts
  for select to authenticated
  using (app.is_platform_staff() or app.site_can(site_id, 'content.view'));

drop policy if exists site_releases_read on public.site_releases;
create policy site_releases_read on public.site_releases
  for select to authenticated
  using (app.is_platform_staff() or app.site_can(site_id, 'content.view'));

drop policy if exists site_deployments_read on public.site_deployments;
create policy site_deployments_read on public.site_deployments
  for select to authenticated
  using (app.is_platform_staff() or app.site_can(site_id, 'content.view'));

drop policy if exists site_delivery_checks_staff on public.site_delivery_checks;
create policy site_delivery_checks_staff on public.site_delivery_checks
  for select to authenticated using (app.is_platform_staff());

revoke insert, update, delete, truncate on
  public.github_installations, public.site_repositories, public.site_hosting,
  public.site_manifests, public.site_content_drafts, public.site_releases,
  public.site_deployments, public.site_delivery_checks
  from anon, authenticated;
grant select on
  public.github_installations, public.site_repositories, public.site_hosting,
  public.site_manifests, public.site_content_drafts, public.site_releases,
  public.site_deployments, public.site_delivery_checks
  to authenticated;
revoke all on
  public.github_installations, public.site_repositories, public.site_hosting,
  public.site_manifests, public.site_content_drafts, public.site_releases,
  public.site_deployments, public.site_delivery_checks
  from anon;

-- -----------------------------------------------------------------------------
--  13. Droits sur le contenu d'un site externe
--
--  Avant la livraison, l'equipe StaX (roles qui construisent les sites)
--  travaille sur le projet sans session d'assistance : le site est encore le
--  sien. Apres, elle passe par une session d'assistance, visible du client —
--  comme pour tout le reste de l'espace client. Le client, lui, n'a les
--  droits d'edition et de publication qu'une fois le site livre
--  (`app.site_can`, 0041).
-- -----------------------------------------------------------------------------
create or replace function app.site_content_access(p_site uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(
    app.site_can(p_site, p_capability)
    or (app.is_platform_site_editor()
        and exists (select 1 from public.sites s
                     where s.id = p_site and s.delivered_at is null and s.archived_at is null)),
    false);
$$;

create or replace function app.notify_site_clients(
  p_site    uuid,
  p_type    text,
  p_title   text,
  p_message text,
  p_link    text,
  p_level   text default 'info'
)
returns void
language sql
security definer
set search_path = public, app, pg_catalog
as $$
  insert into public.notifications
    (recipient_id, organization_id, site_id, type, title, message, link, level)
  select m.user_id, s.organization_id, s.id, p_type, p_title, p_message, p_link, p_level
    from public.sites s
    join public.organization_members m on m.organization_id = s.organization_id
    join public.profiles pr on pr.id = m.user_id
   where s.id = p_site
     and pr.platform_role is null;
$$;

-- -----------------------------------------------------------------------------
--  14. Installations GitHub (serveur uniquement)
-- -----------------------------------------------------------------------------
create or replace function app.require_service_role()
returns void
language plpgsql
set search_path = public, app, pg_catalog
as $$
begin
  if not app.is_service_role() then
    raise exception 'Operation reservee au serveur de la plateforme' using errcode = '42501';
  end if;
end;
$$;

create or replace function app.upsert_github_installation(
  p_installation_id      bigint,
  p_account_login        text,
  p_account_id           bigint,
  p_account_type         text,
  p_repository_selection text default null,
  p_suspended            boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  perform app.require_service_role();
  insert into public.github_installations
    (installation_id, account_login, account_id, account_type, repository_selection,
     suspended_at, removed_at)
  values
    (p_installation_id, p_account_login, p_account_id, p_account_type, p_repository_selection,
     case when p_suspended then now() end, null)
  on conflict (installation_id) do update
     set account_login = excluded.account_login,
         account_id = excluded.account_id,
         account_type = excluded.account_type,
         repository_selection = excluded.repository_selection,
         suspended_at = case when p_suspended
                             then coalesce(public.github_installations.suspended_at, now())
                             else null end,
         removed_at = null;
  perform app.write_audit('github.installation_synced', null, null, 'github_installation',
                          p_installation_id::text,
                          jsonb_build_object('account', p_account_login, 'suspended', p_suspended));
end;
$$;

create or replace function app.remove_github_installation(p_installation_id bigint)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  perform app.require_service_role();
  update public.github_installations
     set removed_at = coalesce(removed_at, now())
   where installation_id = p_installation_id;
  update public.site_repositories
     set status = 'error',
         last_error = 'L''application GitHub StaX a ete retiree de ce compte : la publication '
                      || 'est impossible tant qu''elle n''est pas reinstallee.'
   where installation_id = p_installation_id and status = 'connected';
  perform app.write_audit('github.installation_removed', null, null, 'github_installation',
                          p_installation_id::text, '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
--  15. Rattacher le depot et le projet Cloudflare (administration)
-- -----------------------------------------------------------------------------
create or replace function app.connect_site_repository(
  p_site              uuid,
  p_installation_id   bigint,
  p_repository_id     bigint,
  p_owner_login       text,
  p_owner_id          bigint,
  p_name              text,
  p_full_name         text,
  p_html_url          text,
  p_default_branch    text,
  p_production_branch text,
  p_manifest_path     text default 'stax.manifest.json',
  p_head_commit_sha   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site         public.sites%rowtype;
  v_installation public.github_installations%rowtype;
  v_other        uuid;
  v_id           uuid;
begin
  if app.current_user_id() is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;

  select * into v_site from public.sites where id = p_site for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'site_not_found');
  end if;
  if v_site.architecture <> 'external_repository' then
    return jsonb_build_object('ok', false, 'code', 'legacy_site');
  end if;

  -- Le depot doit relever d'une installation de l'application StaX, active,
  -- et appartenir au compte GitHub de cette installation.
  select * into v_installation
    from public.github_installations
   where installation_id = p_installation_id;
  if not found or v_installation.removed_at is not null
     or v_installation.suspended_at is not null then
    return jsonb_build_object('ok', false, 'code', 'installation_unknown');
  end if;
  if v_installation.account_id <> p_owner_id
     or lower(v_installation.account_login) <> lower(p_owner_login) then
    return jsonb_build_object('ok', false, 'code', 'owner_mismatch');
  end if;
  if lower(p_full_name) <> lower(p_owner_login || '/' || p_name) then
    return jsonb_build_object('ok', false, 'code', 'name_mismatch');
  end if;

  -- Un depot deja rattache a un autre site est refuse, quelle que soit
  -- l'organisation : c'est la garantie qu'un client ne recupere jamais le
  -- site d'un autre.
  select site_id into v_other
    from public.site_repositories
   where provider = 'github' and repository_id = p_repository_id and status <> 'disconnected';
  if v_other is not null and v_other <> p_site then
    perform app.write_audit('site.repository_refused', v_site.organization_id, v_site.id,
                            'github_repository', p_repository_id::text,
                            jsonb_build_object('reason', 'already_attached'));
    return jsonb_build_object('ok', false, 'code', 'repository_already_attached');
  end if;

  update public.site_repositories
     set status = 'disconnected', disconnected_at = now()
   where site_id = p_site and status <> 'disconnected'
     and repository_id <> p_repository_id;

  insert into public.site_repositories
    (site_id, organization_id, installation_id, repository_id, owner_login, owner_id, name,
     full_name, html_url, default_branch, production_branch, manifest_path, head_commit_sha,
     status, sync_status, connected_by)
  values
    (p_site, v_site.organization_id, p_installation_id, p_repository_id, p_owner_login,
     p_owner_id, p_name, p_full_name, p_html_url, p_default_branch, p_production_branch,
     coalesce(nullif(btrim(p_manifest_path), ''), 'stax.manifest.json'), p_head_commit_sha,
     'connected', 'unknown', app.current_user_id())
  on conflict (site_id) where status <> 'disconnected' do update
     set installation_id = excluded.installation_id,
         owner_login = excluded.owner_login,
         owner_id = excluded.owner_id,
         name = excluded.name,
         full_name = excluded.full_name,
         html_url = excluded.html_url,
         default_branch = excluded.default_branch,
         production_branch = excluded.production_branch,
         manifest_path = excluded.manifest_path,
         head_commit_sha = coalesce(excluded.head_commit_sha, public.site_repositories.head_commit_sha),
         status = 'connected',
         last_error = null,
         connected_by = excluded.connected_by,
         connected_at = now()
  returning id into v_id;

  perform app.write_audit('site.repository_connected', v_site.organization_id, v_site.id,
                          'github_repository', p_repository_id::text,
                          jsonb_build_object('full_name', p_full_name,
                                             'branch', p_production_branch,
                                             'installation', p_installation_id));
  return jsonb_build_object('ok', true, 'repositoryId', v_id);
end;
$$;

create or replace function app.disconnect_site_repository(p_site uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_repo public.site_repositories%rowtype;
begin
  if app.current_user_id() is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Motif requis' using errcode = '23514';
  end if;
  select * into v_repo from public.site_repositories
   where site_id = p_site and status <> 'disconnected' for update;
  if not found then
    return false;
  end if;
  update public.site_repositories
     set status = 'disconnected', disconnected_at = now()
   where id = v_repo.id;
  perform app.write_audit('site.repository_disconnected', v_repo.organization_id, p_site,
                          'github_repository', v_repo.repository_id::text,
                          jsonb_build_object('full_name', v_repo.full_name,
                                             'reason', left(p_reason, 300)));
  return true;
end;
$$;

-- Etat du depot, observe par le serveur (webhook « push » signe ou lecture de
-- l'API GitHub). Un changement du developpeur est signale, jamais ecrase.
create or replace function app.record_repository_state(
  p_repository     uuid,
  p_head_sha       text,
  p_committed_at   timestamptz default null,
  p_sync_status    text default null,
  p_error          text default null,
  p_full_name      text default null,
  p_default_branch text default null
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  perform app.require_service_role();
  update public.site_repositories
     set head_commit_sha = coalesce(p_head_sha, head_commit_sha),
         head_committed_at = coalesce(p_committed_at, head_committed_at),
         sync_status = coalesce(p_sync_status, sync_status),
         full_name = coalesce(p_full_name, full_name),
         default_branch = coalesce(p_default_branch, default_branch),
         status = case when p_error is not null then 'error'
                       when status = 'error' then 'connected' else status end,
         last_error = p_error,
         last_synced_at = now()
   where id = p_repository and status <> 'disconnected';
end;
$$;

create or replace function app.connect_site_hosting(
  p_site               uuid,
  p_provider           text,
  p_account_id         text,
  p_project_name       text,
  p_project_id         text,
  p_production_branch  text,
  p_production_url     text,
  p_workers_trigger_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site  public.sites%rowtype;
  v_other uuid;
  v_id    uuid;
begin
  if app.current_user_id() is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  select * into v_site from public.sites where id = p_site for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'site_not_found');
  end if;
  if v_site.architecture <> 'external_repository' then
    return jsonb_build_object('ok', false, 'code', 'legacy_site');
  end if;

  select site_id into v_other
    from public.site_hosting
   where provider = p_provider and account_id = p_account_id and project_name = p_project_name
     and status <> 'disconnected';
  if v_other is not null and v_other <> p_site then
    perform app.write_audit('site.hosting_refused', v_site.organization_id, v_site.id,
                            'cloudflare_project', p_project_name,
                            jsonb_build_object('reason', 'already_attached'));
    return jsonb_build_object('ok', false, 'code', 'project_already_attached');
  end if;

  update public.site_hosting
     set status = 'disconnected', disconnected_at = now()
   where site_id = p_site and status <> 'disconnected'
     and not (provider = p_provider and account_id = p_account_id
              and project_name = p_project_name);

  insert into public.site_hosting
    (site_id, organization_id, provider, account_id, project_name, project_id,
     production_branch, production_url, workers_trigger_id, status, connected_by)
  values
    (p_site, v_site.organization_id, p_provider, p_account_id, p_project_name, p_project_id,
     p_production_branch, p_production_url, p_workers_trigger_id, 'connected',
     app.current_user_id())
  on conflict (site_id) where status <> 'disconnected' do update
     set provider = excluded.provider,
         account_id = excluded.account_id,
         project_name = excluded.project_name,
         project_id = excluded.project_id,
         production_branch = excluded.production_branch,
         production_url = excluded.production_url,
         workers_trigger_id = excluded.workers_trigger_id,
         status = 'connected',
         last_error = null,
         connected_by = excluded.connected_by,
         connected_at = now()
  returning id into v_id;

  perform app.write_audit('site.hosting_connected', v_site.organization_id, v_site.id,
                          'cloudflare_project', p_project_name,
                          jsonb_build_object('provider', p_provider,
                                             'production_url', p_production_url,
                                             'branch', p_production_branch));
  return jsonb_build_object('ok', true, 'hostingId', v_id);
end;
$$;

create or replace function app.disconnect_site_hosting(p_site uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_hosting public.site_hosting%rowtype;
begin
  if app.current_user_id() is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Motif requis' using errcode = '23514';
  end if;
  select * into v_hosting from public.site_hosting
   where site_id = p_site and status <> 'disconnected' for update;
  if not found then
    return false;
  end if;
  update public.site_hosting set status = 'disconnected', disconnected_at = now()
   where id = v_hosting.id;
  perform app.write_audit('site.hosting_disconnected', v_hosting.organization_id, p_site,
                          'cloudflare_project', v_hosting.project_name,
                          jsonb_build_object('reason', left(p_reason, 300)));
  return true;
end;
$$;

create or replace function app.record_hosting_state(p_hosting uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  perform app.require_service_role();
  update public.site_hosting
     set status = case when p_error is not null then 'error'
                       when status = 'error' then 'connected' else status end,
         last_error = p_error,
         last_synced_at = now()
   where id = p_hosting and status <> 'disconnected';
end;
$$;

-- -----------------------------------------------------------------------------
--  16. Contrat d'edition : import, activation, contenu initial
-- -----------------------------------------------------------------------------
create or replace function app.record_site_manifest(
  p_site             uuid,
  p_commit_sha       text,
  p_path             text,
  p_contract_version int,
  p_manifest         jsonb,
  p_manifest_hash    text,
  p_status           text,
  p_errors           jsonb default '[]'::jsonb,
  p_warnings         jsonb default '[]'::jsonb,
  p_summary          jsonb default '{}'::jsonb,
  p_activate         boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site public.sites%rowtype;
  v_repo uuid;
  v_id   uuid;
begin
  if app.current_user_id() is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  select * into v_site from public.sites where id = p_site for update;
  if not found or v_site.architecture <> 'external_repository' then
    return jsonb_build_object('ok', false, 'code', 'site_not_found');
  end if;
  select id into v_repo from public.site_repositories
   where site_id = p_site and status = 'connected';

  insert into public.site_manifests
    (site_id, organization_id, repository_id, commit_sha, path, contract_version, manifest,
     manifest_hash, status, errors, warnings, summary, is_active, imported_by)
  values
    (p_site, v_site.organization_id, v_repo, p_commit_sha, p_path, p_contract_version,
     p_manifest, p_manifest_hash, p_status, coalesce(p_errors, '[]'::jsonb),
     coalesce(p_warnings, '[]'::jsonb), coalesce(p_summary, '{}'::jsonb), false,
     app.current_user_id())
  returning id into v_id;

  if p_activate and p_status = 'valid' then
    update public.site_manifests set is_active = false
     where site_id = p_site and is_active and id <> v_id;
    update public.site_manifests set is_active = true where id = v_id;
  end if;

  perform app.write_audit('site.manifest_imported', v_site.organization_id, v_site.id,
                          'site_manifest', v_id::text,
                          jsonb_build_object('commit', p_commit_sha, 'status', p_status,
                                             'activated', p_activate and p_status = 'valid',
                                             'summary', p_summary));
  return jsonb_build_object('ok', true, 'manifestId', v_id,
                            'active', p_activate and p_status = 'valid');
end;
$$;

-- Contenu initial : ce que le site contient deja au moment ou il est
-- rattache. Il devient la version 1, publiee, adossee au commit et au
-- deploiement de production VERIFIES par le serveur.
create or replace function app.initialize_site_content(
  p_site          uuid,
  p_manifest      uuid,
  p_content       jsonb,
  p_content_hash  text,
  p_commit_sha    text,
  p_deployment    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site       public.sites%rowtype;
  v_manifest   public.site_manifests%rowtype;
  v_repo       public.site_repositories%rowtype;
  v_hosting    public.site_hosting%rowtype;
  v_release    uuid;
  v_deployment uuid;
begin
  if app.current_user_id() is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  select * into v_site from public.sites where id = p_site for update;
  if not found or v_site.architecture <> 'external_repository' then
    return jsonb_build_object('ok', false, 'code', 'site_not_found');
  end if;
  if exists (select 1 from public.site_releases where site_id = p_site) then
    return jsonb_build_object('ok', false, 'code', 'already_initialized');
  end if;
  select * into v_manifest from public.site_manifests
   where id = p_manifest and site_id = p_site and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'manifest_not_active');
  end if;
  select * into v_repo from public.site_repositories
   where site_id = p_site and status = 'connected';
  select * into v_hosting from public.site_hosting
   where site_id = p_site and status = 'connected';
  if v_repo.id is null or v_hosting.id is null then
    return jsonb_build_object('ok', false, 'code', 'infrastructure_missing');
  end if;
  if coalesce(p_deployment ->> 'status', '') <> 'success' then
    return jsonb_build_object('ok', false, 'code', 'deployment_not_verified');
  end if;

  insert into public.site_releases
    (site_id, organization_id, version_number, kind, status, manifest_id, content,
     content_hash, repository_id, hosting_id, branch, commit_sha, commit_url,
     created_by, actor_kind, committed_at, deploy_started_at, published_at, note)
  values
    (p_site, v_site.organization_id, 1, 'import', 'published', v_manifest.id, p_content,
     p_content_hash, v_repo.id, v_hosting.id, v_repo.production_branch, p_commit_sha,
     v_repo.html_url || '/commit/' || p_commit_sha, app.current_user_id(), 'stax',
     now(), now(), now(), 'Mise en ligne initiale par StaX')
  returning id into v_release;

  insert into public.site_deployments
    (site_id, organization_id, hosting_id, release_id, provider, environment,
     provider_deployment_id, commit_sha, branch, url, status, stage, trigger,
     created_by, started_at, finished_at, last_synced_at)
  values
    (p_site, v_site.organization_id, v_hosting.id, v_release, v_hosting.provider, 'production',
     nullif(p_deployment ->> 'providerDeploymentId', ''), p_commit_sha, v_repo.production_branch,
     nullif(p_deployment ->> 'url', ''), 'success', nullif(p_deployment ->> 'stage', ''),
     'import', app.current_user_id(),
     nullif(p_deployment ->> 'startedAt', '')::timestamptz,
     nullif(p_deployment ->> 'finishedAt', '')::timestamptz, now())
  on conflict (hosting_id, provider_deployment_id) where provider_deployment_id is not null
  do update set release_id = excluded.release_id, status = 'success', last_synced_at = now()
  returning id into v_deployment;

  update public.site_releases set deployment_id = v_deployment where id = v_release;

  insert into public.site_content_drafts
    (site_id, organization_id, manifest_id, content, revision, base_release_id, updated_by,
     updated_by_kind)
  values
    (p_site, v_site.organization_id, v_manifest.id, p_content, 1, v_release,
     app.current_user_id(), 'stax')
  on conflict (site_id) do update
     set manifest_id = excluded.manifest_id, content = excluded.content,
         revision = public.site_content_drafts.revision + 1,
         base_release_id = excluded.base_release_id, updated_by = excluded.updated_by,
         updated_by_kind = 'stax', updated_at = now();

  update public.sites
     set production_release_id = v_release,
         first_published_at = coalesce(first_published_at, now()),
         last_published_at = now()
   where id = p_site;

  update public.site_repositories
     set delivery_commit_sha = coalesce(delivery_commit_sha, p_commit_sha),
         head_commit_sha = coalesce(head_commit_sha, p_commit_sha),
         sync_status = 'in_sync'
   where id = v_repo.id;

  perform app.write_audit('site.content_initialized', v_site.organization_id, v_site.id,
                          'site_release', v_release::text,
                          jsonb_build_object('commit', p_commit_sha,
                                             'deployment', p_deployment ->> 'providerDeploymentId'));
  return jsonb_build_object('ok', true, 'releaseId', v_release, 'deploymentId', v_deployment);
end;
$$;

-- -----------------------------------------------------------------------------
--  17. Brouillon : enregistrement avec controle de version optimiste
-- -----------------------------------------------------------------------------
create or replace function app.save_site_draft(
  p_site              uuid,
  p_content           jsonb,
  p_expected_revision int
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site     public.sites%rowtype;
  v_draft    public.site_content_drafts%rowtype;
  v_manifest uuid;
  v_kind     text;
begin
  if app.current_user_id() is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  if not app.site_content_access(p_site, 'content.edit') then
    raise exception 'Modification reservee aux personnes habilitees, une fois le site livre'
      using errcode = '42501';
  end if;
  select * into v_site from public.sites where id = p_site;
  if v_site.architecture <> 'external_repository' then
    raise exception 'Ce site ne s''edite pas par contrat d''edition' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_content, 'null'::jsonb)) <> 'object' then
    raise exception 'Contenu invalide' using errcode = '22023';
  end if;
  select id into v_manifest from public.site_manifests where site_id = p_site and is_active;
  if v_manifest is null then
    return jsonb_build_object('ok', false, 'code', 'no_manifest');
  end if;

  select * into v_draft from public.site_content_drafts where site_id = p_site for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_initialized');
  end if;
  if p_expected_revision is not null and v_draft.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'conflict', 'revision', v_draft.revision);
  end if;

  v_kind := case when app.org_role(v_site.organization_id) is not null then 'member'
                 else 'stax' end;

  update public.site_content_drafts
     set content = p_content,
         manifest_id = v_manifest,
         revision = revision + 1,
         updated_by = app.current_user_id(),
         updated_by_kind = v_kind,
         updated_at = now()
   where site_id = p_site
  returning * into v_draft;

  update public.sites set draft_updated_at = now() where id = p_site;

  return jsonb_build_object('ok', true, 'revision', v_draft.revision,
                            'updatedAt', v_draft.updated_at);
end;
$$;

-- -----------------------------------------------------------------------------
--  18. Demande de publication, de restauration ou de programmation
-- -----------------------------------------------------------------------------
create or replace function app.request_site_release(
  p_site              uuid,
  p_kind              text,
  p_source_release    uuid default null,
  p_expected_revision int default null,
  p_scheduled_for     timestamptz default null,
  p_note              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site     public.sites%rowtype;
  v_draft    public.site_content_drafts%rowtype;
  v_source   public.site_releases%rowtype;
  v_repo     public.site_repositories%rowtype;
  v_hosting  public.site_hosting%rowtype;
  v_number   int;
  v_release  uuid;
  v_content  jsonb;
  v_hash     text;
  v_manifest uuid;
  v_kind     text;
begin
  if app.current_user_id() is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  if not app.site_content_access(p_site, 'content.publish') then
    raise exception 'Publication reservee aux personnes habilitees, une fois le site livre'
      using errcode = '42501';
  end if;
  if p_kind not in ('publish', 'rollback') then
    raise exception 'Type de publication inconnu' using errcode = '22023';
  end if;

  select * into v_site from public.sites where id = p_site for update;
  if v_site.architecture <> 'external_repository' then
    raise exception 'Ce site se publie par le moteur de rendu' using errcode = '23514';
  end if;
  if v_site.suspended_at is not null or v_site.archived_at is not null then
    return jsonb_build_object('ok', false, 'code', 'site_unavailable');
  end if;

  select * into v_repo from public.site_repositories
   where site_id = p_site and status = 'connected';
  select * into v_hosting from public.site_hosting
   where site_id = p_site and status = 'connected';
  if v_repo.id is null or v_hosting.id is null then
    return jsonb_build_object('ok', false, 'code', 'infrastructure_missing');
  end if;

  if p_scheduled_for is not null then
    if not app.has_feature(v_site.organization_id, 'scheduled_publishing') then
      return jsonb_build_object('ok', false, 'code', 'feature_unavailable');
    end if;
    if p_scheduled_for < now() + interval '5 minutes'
       or p_scheduled_for > now() + interval '1 year' then
      return jsonb_build_object('ok', false, 'code', 'schedule_out_of_range');
    end if;
  end if;

  if p_kind = 'publish' then
    select * into v_draft from public.site_content_drafts where site_id = p_site;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_initialized');
    end if;
    -- On publie EXACTEMENT le brouillon que la personne avait sous les yeux.
    if p_expected_revision is not null and v_draft.revision <> p_expected_revision then
      return jsonb_build_object('ok', false, 'code', 'conflict', 'revision', v_draft.revision);
    end if;
    v_content := v_draft.content;
    v_manifest := v_draft.manifest_id;
  else
    select * into v_source from public.site_releases
     where id = p_source_release and site_id = p_site
       and status in ('published', 'superseded');
    if not found then
      return jsonb_build_object('ok', false, 'code', 'source_not_found');
    end if;
    v_content := v_source.content;
    select id into v_manifest from public.site_manifests where site_id = p_site and is_active;
    v_manifest := coalesce(v_manifest, v_source.manifest_id);
  end if;

  v_hash := encode(extensions.digest(convert_to(v_content::text, 'UTF8'), 'sha256'), 'hex');
  select coalesce(max(version_number), 0) + 1 into v_number
    from public.site_releases where site_id = p_site;
  v_kind := case when app.org_role(v_site.organization_id) is not null then 'member'
                 else 'stax' end;

  begin
    insert into public.site_releases
      (site_id, organization_id, version_number, kind, status, manifest_id, content,
       content_hash, source_release_id, repository_id, hosting_id, branch, scheduled_for,
       note, created_by, actor_kind)
    values
      (p_site, v_site.organization_id, v_number, p_kind,
       case when p_scheduled_for is null then 'queued' else 'scheduled' end,
       v_manifest, v_content, v_hash, v_source.id, v_repo.id, v_hosting.id,
       v_repo.production_branch, p_scheduled_for, nullif(left(btrim(coalesce(p_note, '')), 200), ''),
       app.current_user_id(), v_kind)
    returning id into v_release;
  exception when unique_violation then
    return jsonb_build_object('ok', false,
      'code', case when p_scheduled_for is null then 'release_in_progress'
                   else 'schedule_exists' end);
  end;

  perform app.write_audit(
    case when p_kind = 'rollback' then 'site.rollback_requested' else 'site.release_requested' end,
    v_site.organization_id, v_site.id, 'site_release', v_release::text,
    jsonb_build_object('version', v_number, 'kind', p_kind,
                       'source', v_source.version_number,
                       'scheduled_for', p_scheduled_for));

  return jsonb_build_object('ok', true, 'releaseId', v_release, 'version', v_number,
                            'scheduled', p_scheduled_for is not null);
end;
$$;

create or replace function app.cancel_site_release(p_release uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_release public.site_releases%rowtype;
begin
  select * into v_release from public.site_releases where id = p_release for update;
  if not found or not app.site_content_access(v_release.site_id, 'content.publish') then
    raise exception 'Version introuvable' using errcode = 'P0002';
  end if;
  if v_release.status <> 'scheduled' then
    return false;
  end if;
  update public.site_releases set status = 'cancelled' where id = p_release;
  perform app.write_audit('site.release_cancelled', v_release.organization_id, v_release.site_id,
                          'site_release', p_release::text,
                          jsonb_build_object('version', v_release.version_number));
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
--  19. Cycle de publication, pilote par le serveur (cle de service)
--
--  Aucune de ces fonctions n'est appelable depuis un navigateur : c'est ce qui
--  garantit qu'une version ne peut pas se declarer « publiee » elle-meme. Le
--  serveur n'y passe qu'apres avoir ecrit le commit (GitHub) puis observe le
--  deploiement (Cloudflare).
-- -----------------------------------------------------------------------------
create or replace function app.claim_site_release(p_release uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_release public.site_releases%rowtype;
begin
  perform app.require_service_role();
  select * into v_release from public.site_releases where id = p_release for update skip locked;
  if not found or v_release.status <> 'queued' then
    return jsonb_build_object('ok', false, 'code', 'not_claimable');
  end if;
  update public.site_releases set status = 'committing' where id = p_release;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function app.record_release_commit(
  p_release    uuid,
  p_base_sha   text,
  p_commit_sha text,
  p_commit_url text,
  p_branch     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_release    public.site_releases%rowtype;
  v_hosting    public.site_hosting%rowtype;
  v_deployment uuid;
begin
  perform app.require_service_role();
  select * into v_release from public.site_releases where id = p_release for update;
  if not found or v_release.status <> 'committing' then
    return jsonb_build_object('ok', false, 'code', 'not_committing');
  end if;
  select * into v_hosting from public.site_hosting where id = v_release.hosting_id;

  insert into public.site_deployments
    (site_id, organization_id, hosting_id, release_id, provider, environment, commit_sha,
     branch, status, trigger, created_by)
  values
    (v_release.site_id, v_release.organization_id, v_hosting.id, v_release.id,
     v_hosting.provider, 'production', p_commit_sha, p_branch, 'queued',
     case when v_release.kind = 'rollback' then 'stax_rollback' else 'stax_publish' end,
     v_release.created_by)
  returning id into v_deployment;

  update public.site_releases
     set status = 'deploying',
         base_commit_sha = p_base_sha,
         commit_sha = p_commit_sha,
         commit_url = p_commit_url,
         branch = p_branch,
         deployment_id = v_deployment,
         committed_at = now(),
         deploy_started_at = now()
   where id = p_release;

  update public.site_repositories
     set last_stax_commit_sha = p_commit_sha,
         head_commit_sha = p_commit_sha,
         head_committed_at = now(),
         sync_status = 'in_sync'
   where id = v_release.repository_id;

  perform app.write_audit('site.release_committed', v_release.organization_id, v_release.site_id,
                          'site_release', v_release.id::text,
                          jsonb_build_object('version', v_release.version_number,
                                             'commit', p_commit_sha, 'branch', p_branch));
  return jsonb_build_object('ok', true, 'deploymentId', v_deployment);
end;
$$;

create or replace function app.fail_site_release(
  p_release uuid,
  p_stage   text,
  p_code    text,
  p_message text
)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_release public.site_releases%rowtype;
begin
  perform app.require_service_role();
  select * into v_release from public.site_releases where id = p_release for update;
  if not found or v_release.status not in ('queued', 'committing', 'deploying') then
    return false;
  end if;
  update public.site_releases
     set status = 'failed',
         error_stage = p_stage,
         error_code = left(p_code, 80),
         error_message = left(p_message, 500),
         failed_at = now()
   where id = p_release;

  perform app.notify_site_clients(
    v_release.site_id, 'site.release_failed',
    'La publication n’a pas abouti',
    'Votre site en ligne n’a pas changé : la version précédente reste affichée. '
      || left(coalesce(p_message, ''), 300),
    '/app/editeur', 'danger');

  perform app.write_audit('site.release_failed', v_release.organization_id, v_release.site_id,
                          'site_release', v_release.id::text,
                          jsonb_build_object('version', v_release.version_number,
                                             'stage', p_stage, 'code', p_code));
  return true;
end;
$$;

-- Passage en production, sur confirmation de Cloudflare UNIQUEMENT.
create or replace function app.finalize_site_release(p_release uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_release public.site_releases%rowtype;
begin
  select * into v_release from public.site_releases where id = p_release for update;
  if not found or v_release.status <> 'deploying' then
    return false;
  end if;

  update public.site_releases
     set status = 'superseded', superseded_at = now()
   where site_id = v_release.site_id and status = 'published' and id <> v_release.id;

  update public.site_releases
     set status = 'published', published_at = now()
   where id = p_release;

  update public.sites
     set production_release_id = v_release.id,
         first_published_at = coalesce(first_published_at, now()),
         last_published_at = now()
   where id = v_release.site_id;

  perform app.notify_site_clients(
    v_release.site_id, 'site.release_published',
    'Votre site est à jour',
    'La version ' || v_release.version_number || ' est en ligne : Cloudflare a confirmé le '
      || 'déploiement.',
    '/app/editeur', 'success');

  perform app.write_audit('site.release_published', v_release.organization_id,
                          v_release.site_id, 'site_release', v_release.id::text,
                          jsonb_build_object('version', v_release.version_number,
                                             'commit', v_release.commit_sha,
                                             'kind', v_release.kind));
  return true;
end;
$$;

-- Etat d'un deploiement, tel que Cloudflare le rapporte (API ou webhook
-- verifie puis relu a la source). C'est ICI, et nulle part ailleurs, qu'une
-- version devient publiee ou echoue a l'etape Cloudflare.
create or replace function app.record_site_deployment(
  p_hosting                uuid,
  p_provider_deployment_id text,
  p_environment            text,
  p_status                 text,
  p_commit_sha             text default null,
  p_branch                 text default null,
  p_url                    text default null,
  p_stage                  text default null,
  p_error                  text default null,
  p_started_at             timestamptz default null,
  p_finished_at            timestamptz default null,
  p_deployment             uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_hosting    public.site_hosting%rowtype;
  v_deployment public.site_deployments%rowtype;
  v_release    public.site_releases%rowtype;
  v_final      boolean := p_status in ('success', 'failure', 'canceled', 'skipped');
begin
  perform app.require_service_role();
  select * into v_hosting from public.site_hosting where id = p_hosting;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'hosting_not_found');
  end if;

  -- 1. Le deploiement est deja connu par son identifiant Cloudflare.
  if p_provider_deployment_id is not null then
    select * into v_deployment from public.site_deployments
     where hosting_id = p_hosting and provider_deployment_id = p_provider_deployment_id
     for update;
  end if;
  -- 2. Sinon, le deploiement attendu (cree au commit) est retrouve par son id
  --    ou par son commit.
  if v_deployment.id is null and p_deployment is not null then
    select * into v_deployment from public.site_deployments
     where id = p_deployment and hosting_id = p_hosting for update;
  end if;
  if v_deployment.id is null and p_commit_sha is not null then
    select * into v_deployment from public.site_deployments
     where hosting_id = p_hosting and commit_sha = p_commit_sha
       and environment = p_environment and provider_deployment_id is null
     order by created_at desc limit 1
     for update;
  end if;

  if v_deployment.id is null then
    insert into public.site_deployments
      (site_id, organization_id, hosting_id, provider, environment, provider_deployment_id,
       commit_sha, branch, url, status, stage, trigger, error_message, started_at, finished_at,
       last_synced_at)
    values
      (v_hosting.site_id, v_hosting.organization_id, v_hosting.id, v_hosting.provider,
       p_environment, p_provider_deployment_id, p_commit_sha, p_branch, p_url, p_status,
       p_stage, 'developer_push', left(p_error, 1000), p_started_at, p_finished_at, now())
    returning * into v_deployment;
  else
    -- Un etat final ne revient jamais en arriere (un evenement tardif ou rejoue
    -- ne peut pas « depublier »).
    if v_deployment.status in ('success', 'failure', 'canceled', 'skipped')
       and v_deployment.status <> p_status then
      return jsonb_build_object('ok', true, 'code', 'already_final',
                                'deploymentId', v_deployment.id);
    end if;
    update public.site_deployments
       set provider_deployment_id = coalesce(provider_deployment_id, p_provider_deployment_id),
           commit_sha = coalesce(commit_sha, p_commit_sha),
           branch = coalesce(p_branch, branch),
           url = coalesce(p_url, url),
           status = p_status,
           stage = coalesce(p_stage, stage),
           error_message = case when p_status in ('failure', 'canceled')
                                then left(coalesce(p_error, error_message), 1000)
                                else error_message end,
           started_at = coalesce(started_at, p_started_at),
           finished_at = coalesce(p_finished_at, finished_at,
                                  case when v_final then now() end),
           last_synced_at = now()
     where id = v_deployment.id
    returning * into v_deployment;
  end if;

  if v_deployment.release_id is not null and v_final then
    select * into v_release from public.site_releases where id = v_deployment.release_id;
    if v_release.status = 'deploying' then
      if p_status = 'success' then
        perform app.finalize_site_release(v_release.id);
      elsif p_status in ('failure', 'canceled') then
        perform app.fail_site_release(
          v_release.id, 'cloudflare',
          case when p_status = 'canceled' then 'deployment_canceled' else 'deployment_failed' end,
          'Le déploiement Cloudflare a échoué'
            || coalesce(' (' || nullif(left(p_error, 200), '') || ')', '') || '.');
      elsif p_status = 'skipped' then
        perform app.fail_site_release(
          v_release.id, 'cloudflare', 'deployment_skipped',
          'Cloudflare n’a pas déployé ce commit (déploiement ignoré par la configuration du projet).');
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'deploymentId', v_deployment.id,
                            'status', v_deployment.status, 'releaseId', v_deployment.release_id);
end;
$$;

-- Versions a faire avancer par la tache de fond : programmees arrivees a
-- echeance, publications bloquees (serveur interrompu), deploiements a suivre.
create or replace function app.promote_due_site_releases()
returns int
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_release record;
  v_count   int := 0;
begin
  perform app.require_service_role();
  for v_release in
    select r.id from public.site_releases r
     where r.status = 'scheduled' and r.scheduled_for <= now()
       and not exists (select 1 from public.site_releases o
                        where o.site_id = r.site_id
                          and o.status in ('queued', 'committing', 'deploying'))
     order by r.scheduled_for
     for update skip locked
  loop
    update public.site_releases set status = 'queued' where id = v_release.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function app.site_releases_to_process(p_limit int default 25)
returns table (release_id uuid, site_id uuid, status text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select r.id, r.site_id, r.status, r.updated_at
    from public.site_releases r
   where app.is_service_role()
     and ((r.status = 'queued' and r.updated_at < now() - interval '30 seconds')
       or (r.status = 'committing' and r.updated_at < now() - interval '5 minutes')
       or r.status = 'deploying')
   order by r.updated_at
   limit greatest(1, least(p_limit, 200));
$$;

-- -----------------------------------------------------------------------------
--  20. Apercu : un vrai build Cloudflare du brouillon, sur une branche technique
-- -----------------------------------------------------------------------------
create or replace function app.begin_site_preview(p_site uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site     public.sites%rowtype;
  v_draft    public.site_content_drafts%rowtype;
  v_hosting  public.site_hosting%rowtype;
  v_recent   int;
  v_id       uuid;
begin
  if app.current_user_id() is null
     or not app.site_content_access(p_site, 'content.edit') then
    raise exception 'Apercu reserve aux personnes habilitees, une fois le site livre'
      using errcode = '42501';
  end if;
  select * into v_site from public.sites where id = p_site;
  if v_site.architecture <> 'external_repository' then
    raise exception 'Apercu indisponible pour ce site' using errcode = '23514';
  end if;
  select * into v_draft from public.site_content_drafts where site_id = p_site;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_initialized');
  end if;
  select * into v_hosting from public.site_hosting where site_id = p_site and status = 'connected';
  if v_hosting.id is null
     or not exists (select 1 from public.site_repositories
                     where site_id = p_site and status = 'connected') then
    return jsonb_build_object('ok', false, 'code', 'infrastructure_missing');
  end if;

  -- Un build a un cout : vingt apercus par heure et par site suffisent
  -- largement a une personne qui travaille.
  select count(*) into v_recent from public.site_deployments
   where site_id = p_site and trigger = 'stax_preview'
     and created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  begin
    insert into public.site_deployments
      (site_id, organization_id, hosting_id, provider, environment, status, trigger,
       draft_revision, created_by)
    values
      (p_site, v_site.organization_id, v_hosting.id, v_hosting.provider, 'preview', 'queued',
       'stax_preview', v_draft.revision, app.current_user_id())
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'preview_in_progress');
  end;

  return jsonb_build_object('ok', true, 'deploymentId', v_id, 'revision', v_draft.revision);
end;
$$;

create or replace function app.record_preview_commit(
  p_deployment   uuid,
  p_commit_sha   text,
  p_branch       text,
  p_content_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  perform app.require_service_role();
  update public.site_deployments
     set commit_sha = p_commit_sha, branch = p_branch, content_hash = p_content_hash,
         status = 'building', started_at = now(), last_synced_at = now()
   where id = p_deployment and trigger = 'stax_preview' and status = 'queued';
  return found;
end;
$$;

create or replace function app.fail_site_preview(p_deployment uuid, p_message text)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  perform app.require_service_role();
  update public.site_deployments
     set status = 'failure', error_message = left(p_message, 1000), finished_at = now(),
         last_synced_at = now()
   where id = p_deployment and trigger = 'stax_preview'
     and status in ('queued', 'building', 'deploying');
  return found;
end;
$$;

-- -----------------------------------------------------------------------------
--  21. Checklist de livraison
-- -----------------------------------------------------------------------------
create or replace function app.record_delivery_check(
  p_site     uuid,
  p_key      text,
  p_passed   boolean,
  p_evidence jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  perform app.require_service_role();
  if p_key not in ('deployed', 'domain', 'https', 'seo') then
    raise exception 'Controle automatique inconnu : %', p_key using errcode = '22023';
  end if;
  insert into public.site_delivery_checks
    (site_id, check_key, status, method, evidence, checked_at)
  values
    (p_site, p_key, case when p_passed then 'passed' else 'failed' end, 'automatic',
     coalesce(p_evidence, '{}'::jsonb), now())
  on conflict (site_id, check_key) do update
     set status = excluded.status, method = 'automatic', evidence = excluded.evidence,
         checked_at = now(), checked_by = null, note = null;
end;
$$;

create or replace function app.attest_delivery_check(
  p_site   uuid,
  p_key    text,
  p_passed boolean,
  p_note   text
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_org uuid;
begin
  if app.current_user_id() is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  if p_key not in ('forms', 'responsive') then
    raise exception 'Ce controle est automatique : il ne s''atteste pas a la main'
      using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'Decrivez ce qui a ete verifie (10 caracteres minimum)' using errcode = '23514';
  end if;
  select organization_id into v_org from public.sites where id = p_site;
  if v_org is null then
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;
  insert into public.site_delivery_checks
    (site_id, check_key, status, method, note, checked_by, checked_at)
  values
    (p_site, p_key, case when p_passed then 'passed' else 'failed' end, 'manual',
     left(btrim(p_note), 1000), app.current_user_id(), now())
  on conflict (site_id, check_key) do update
     set status = excluded.status, method = 'manual', note = excluded.note,
         checked_by = excluded.checked_by, checked_at = now(), evidence = '{}'::jsonb;
  perform app.write_audit('site.delivery_check_attested', v_org, p_site, 'site', p_site::text,
                          jsonb_build_object('check', p_key, 'passed', p_passed));
end;
$$;

-- Etat complet de preparation a la livraison. Les controles qui dependent
-- d'un appel exterieur (deploiement, domaine, HTTPS, SEO) viennent de la
-- derniere verification du serveur, et ne valent que 24 heures ; ceux que la
-- base peut etablir seule sont recalcules a chaque lecture.
create or replace function app.delivery_readiness(p_site uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site      public.sites%rowtype;
  v_manifest  public.site_manifests%rowtype;
  v_checks    jsonb := '[]'::jsonb;
  v_ready     boolean := true;
  v_row       record;
  v_limit     int;
  v_count     int;
  v_plan_ok   boolean := true;
  v_plan_msg  text[] := '{}';
  v_clients   int;
  v_ok        boolean;
begin
  if not (app.is_platform_staff() or app.is_service_role()) then
    raise exception 'Reserve a l''equipe StaX' using errcode = '42501';
  end if;
  select * into v_site from public.sites where id = p_site;
  if not found then
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;
  select * into v_manifest from public.site_manifests where site_id = p_site and is_active;

  -- Infrastructure
  v_ok := exists (select 1 from public.site_repositories
                   where site_id = p_site and status = 'connected');
  v_checks := v_checks || jsonb_build_object('key', 'repository', 'label', 'Dépôt GitHub connecté',
                            'status', case when v_ok then 'passed' else 'failed' end,
                            'method', 'computed');
  v_ready := v_ready and v_ok;

  v_ok := exists (select 1 from public.site_hosting
                   where site_id = p_site and status = 'connected');
  v_checks := v_checks || jsonb_build_object('key', 'hosting', 'label', 'Projet Cloudflare connecté',
                            'status', case when v_ok then 'passed' else 'failed' end,
                            'method', 'computed');
  v_ready := v_ready and v_ok;

  -- Controles verifies par le serveur (preuve jointe, 24 h de validite)
  for v_row in
    select k.key, k.label, k.method, c.status, c.evidence, c.note, c.checked_at, c.checked_by
      from (values ('deployed', 'Site déployé', 'automatic', 1),
                   ('domain', 'Domaine fonctionnel', 'automatic', 2),
                   ('https', 'HTTPS valide', 'automatic', 3),
                   ('forms', 'Formulaires testés', 'manual', 5),
                   ('responsive', 'Responsive vérifié', 'manual', 6),
                   ('seo', 'SEO minimum vérifié', 'automatic', 7)) as k(key, label, method, ord)
      left join public.site_delivery_checks c on c.site_id = p_site and c.check_key = k.key
     order by k.ord
  loop
    v_ok := v_row.status = 'passed'
            and (v_row.method = 'manual' or v_row.checked_at > now() - interval '24 hours');
    v_checks := v_checks || jsonb_build_object(
      'key', v_row.key, 'label', v_row.label, 'method', v_row.method,
      'status', case when v_ok then 'passed'
                     when v_row.status = 'failed' then 'failed'
                     else 'pending' end,
      'stale', v_row.status = 'passed' and v_row.method = 'automatic'
               and v_row.checked_at <= now() - interval '24 hours',
      'evidence', coalesce(v_row.evidence, '{}'::jsonb),
      'note', v_row.note, 'checkedAt', v_row.checked_at, 'checkedBy', v_row.checked_by);
    v_ready := v_ready and v_ok;
  end loop;

  -- Contrat d'edition
  v_ok := v_manifest.id is not null and v_manifest.status = 'valid';
  v_checks := v_checks || jsonb_build_object('key', 'manifest', 'label', 'Manifest valide',
                            'status', case when v_ok then 'passed' else 'failed' end,
                            'method', 'computed',
                            'evidence', case when v_manifest.id is null then '{}'::jsonb
                                             else jsonb_build_object('commit', v_manifest.commit_sha,
                                                                     'summary', v_manifest.summary) end);
  v_ready := v_ready and v_ok;

  v_ok := v_site.production_release_id is not null
          and exists (select 1 from public.site_content_drafts where site_id = p_site);
  v_checks := v_checks || jsonb_build_object('key', 'editor', 'label', 'Éditeur compatible',
                            'status', case when v_ok then 'passed' else 'failed' end,
                            'method', 'computed');
  v_ready := v_ready and v_ok;

  -- Compte client
  select count(*) into v_clients
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
   where m.organization_id = v_site.organization_id and p.platform_role is null;
  v_checks := v_checks || jsonb_build_object('key', 'client_account', 'label', 'Compte client existant',
                            'status', case when v_clients > 0 then 'passed' else 'failed' end,
                            'method', 'computed',
                            'evidence', jsonb_build_object('clients', v_clients));
  v_ready := v_ready and v_clients > 0;

  -- Offre : le site porte l'offre achetee, et le contrat d'edition la respecte
  if v_site.plan_id is null then
    v_plan_ok := false;
    v_plan_msg := array_append(v_plan_msg, ('Aucune offre rattachée au site.')::text);
  end if;
  if exists (select 1 from public.orders o
              where o.site_id = p_site and o.status in ('paid', 'partially_refunded', 'internal')
                and o.plan_id is distinct from v_site.plan_id) then
    v_plan_ok := false;
    v_plan_msg := array_append(v_plan_msg, ('L’offre du site diffère de celle de la commande.')::text);
  end if;
  if v_manifest.id is not null then
    v_limit := app.feature_limit(v_site.organization_id, 'max_pages');
    v_count := coalesce((v_manifest.summary ->> 'pages')::int, 0);
    if v_limit is not null and (v_limit < 0 or v_count > v_limit) then
      v_plan_ok := false;
      v_plan_msg := array_append(v_plan_msg, (format('%s pages déclarées, %s incluses.', v_count,
                                         greatest(v_limit, 0)))::text);
    end if;
    v_limit := app.feature_limit(v_site.organization_id, 'max_locales');
    v_count := coalesce((v_manifest.summary ->> 'locales')::int, 1);
    if v_limit is not null and (v_limit < 0 or v_count > v_limit) then
      v_plan_ok := false;
      v_plan_msg := array_append(v_plan_msg, (format('%s langues déclarées, %s incluses.', v_count,
                                         greatest(v_limit, 0)))::text);
    end if;
    v_limit := app.feature_limit(v_site.organization_id, 'max_forms');
    v_count := coalesce((v_manifest.summary ->> 'forms')::int, 0);
    if v_limit is not null and (v_limit < 0 or v_count > v_limit) then
      v_plan_ok := false;
      v_plan_msg := array_append(v_plan_msg, (format('%s formulaires déclarés, %s inclus.', v_count,
                                         greatest(v_limit, 0)))::text);
    end if;
    if coalesce((v_manifest.summary ->> 'collections')::int, 0) > 0
       and not app.has_feature(v_site.organization_id, 'blog') then
      v_plan_ok := false;
      v_plan_msg := array_append(v_plan_msg, ('Collections de contenus non incluses dans l’offre.')::text);
    end if;
    if coalesce((v_manifest.summary ->> 'advancedForms')::boolean, false)
       and not app.has_feature(v_site.organization_id, 'advanced_forms') then
      v_plan_ok := false;
      v_plan_msg := array_append(v_plan_msg, ('Formulaires avancés non inclus dans l’offre.')::text);
    end if;
  end if;
  v_checks := v_checks || jsonb_build_object('key', 'plan', 'label', 'Offre correctement appliquée',
                            'status', case when v_plan_ok then 'passed' else 'failed' end,
                            'method', 'computed',
                            'evidence', jsonb_build_object('problems', to_jsonb(v_plan_msg),
                                                           'plan', v_site.plan_slug));
  v_ready := v_ready and v_plan_ok;

  return jsonb_build_object('ready', v_ready,
                            'architecture', v_site.architecture,
                            'delivered', v_site.delivered_at is not null,
                            'checks', v_checks);
end;
$$;

-- -----------------------------------------------------------------------------
--  22. Livraison : l'editeur ne s'ouvre qu'ici
-- -----------------------------------------------------------------------------
create or replace function app.bring_external_site_live(p_site uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_status app.site_status;
begin
  select status into v_status from public.sites where id = p_site;
  if v_status = 'draft' then
    update public.sites set status = 'building' where id = p_site;
    v_status := 'building';
  end if;
  if v_status in ('building', 'review') then
    update public.sites set status = 'ready' where id = p_site;
    v_status := 'ready';
  end if;
  if v_status in ('ready', 'suspended') then
    update public.sites set status = 'live' where id = p_site;
  end if;
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
  v_order     public.orders%rowtype;
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

  update public.sites
     set delivered_at = coalesce(delivered_at, now()),
         delivered_by = coalesce(delivered_by, v_actor)
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
           || 'depuis StaX.', true, v_actor
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
    jsonb_build_object('added_member', v_user is not null, 'role', v_role,
                       'architecture', v_site.architecture,
                       'maintenance', v_order.maintenance_status));

  return jsonb_build_object('ok', true, 'clients', v_clients,
                            'orderId', v_order.id,
                            'maintenanceStatus', v_order.maintenance_status);
end;
$$;

-- -----------------------------------------------------------------------------
--  23. Etapes du projet, visibles par le client
-- -----------------------------------------------------------------------------
create or replace function app.set_project_phase(p_site uuid, p_status text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_project public.projects%rowtype;
  v_title   text;
begin
  if app.current_user_id() is null or not app.is_platform_site_editor() then
    raise exception 'Reserve a l''equipe StaX' using errcode = '42501';
  end if;
  if p_status not in ('ordered', 'questionnaire_pending', 'assets_pending', 'design',
                      'client_review', 'changes_requested', 'development', 'verification',
                      'deploying') then
    raise exception 'Etape inconnue ou reservee a la livraison' using errcode = '22023';
  end if;
  select * into v_project from public.projects where site_id = p_site
   order by created_at desc limit 1 for update;
  if not found then
    return false;
  end if;
  if v_project.status in ('delivered', 'cancelled', 'archived') then
    raise exception 'Ce projet est clos' using errcode = '23514';
  end if;

  update public.projects set status = p_status::app.project_status where id = v_project.id;

  v_title := case p_status
    when 'ordered' then 'Commande validée'
    when 'questionnaire_pending' then 'Informations attendues'
    when 'assets_pending' then 'Éléments attendus'
    when 'design' then 'Conception en cours'
    when 'client_review' then 'Votre validation est attendue'
    when 'changes_requested' then 'Corrections en cours'
    when 'development' then 'Développement en cours'
    when 'verification' then 'Vérifications en cours'
    when 'deploying' then 'Mise en ligne en cours'
  end;
  insert into public.project_events (project_id, kind, title, description, is_public, actor_id)
  values (v_project.id, 'phase', v_title, nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
          true, app.current_user_id());

  perform app.write_audit('project.phase_changed', v_project.organization_id, p_site, 'project',
                          v_project.id::text,
                          jsonb_build_object('from', v_project.status, 'to', p_status));
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
--  24. Vue d'ensemble pour le client : ce qui lui sert, sans l'infrastructure
-- -----------------------------------------------------------------------------
create or replace function app.site_management_overview(p_site uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select case when app.site_can(p_site, 'content.view') or app.is_platform_staff() then
    jsonb_build_object(
      'architecture', s.architecture,
      'deliveredAt', s.delivered_at,
      'productionUrl', (select h.production_url from public.site_hosting h
                         where h.site_id = s.id and h.status <> 'disconnected' limit 1),
      'primaryDomain', (select d.hostname from public.site_domains d
                         where d.site_id = s.id and d.is_primary and d.status <> 'detached'
                         limit 1),
      'connected', exists (select 1 from public.site_repositories r
                            where r.site_id = s.id and r.status = 'connected')
                   and exists (select 1 from public.site_hosting h
                                where h.site_id = s.id and h.status = 'connected'),
      'productionRelease', (select jsonb_build_object('id', r.id, 'version', r.version_number,
                                                      'publishedAt', r.published_at,
                                                      'commit', r.commit_sha)
                              from public.site_releases r where r.id = s.production_release_id),
      'lastDeployment', (select jsonb_build_object('status', d.status, 'environment', d.environment,
                                                   'finishedAt', d.finished_at,
                                                   'createdAt', d.created_at)
                           from public.site_deployments d
                          where d.site_id = s.id and d.environment = 'production'
                          order by d.created_at desc limit 1))
  end
    from public.sites s where s.id = p_site;
$$;

-- -----------------------------------------------------------------------------
--  25. Surface RPC
-- -----------------------------------------------------------------------------
create or replace function public.upsert_github_installation(
  p_installation_id bigint, p_account_login text, p_account_id bigint, p_account_type text,
  p_repository_selection text default null, p_suspended boolean default false)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.upsert_github_installation(p_installation_id, p_account_login, p_account_id,
                                        p_account_type, p_repository_selection, p_suspended);
$$;

create or replace function public.remove_github_installation(p_installation_id bigint)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.remove_github_installation(p_installation_id);
$$;

create or replace function public.connect_site_repository(
  p_site uuid, p_installation_id bigint, p_repository_id bigint, p_owner_login text,
  p_owner_id bigint, p_name text, p_full_name text, p_html_url text, p_default_branch text,
  p_production_branch text, p_manifest_path text default 'stax.manifest.json',
  p_head_commit_sha text default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.connect_site_repository(p_site, p_installation_id, p_repository_id, p_owner_login,
                                     p_owner_id, p_name, p_full_name, p_html_url,
                                     p_default_branch, p_production_branch, p_manifest_path,
                                     p_head_commit_sha);
$$;

create or replace function public.disconnect_site_repository(p_site uuid, p_reason text)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.disconnect_site_repository(p_site, p_reason);
$$;

create or replace function public.record_repository_state(
  p_repository uuid, p_head_sha text, p_committed_at timestamptz default null,
  p_sync_status text default null, p_error text default null, p_full_name text default null,
  p_default_branch text default null)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_repository_state(p_repository, p_head_sha, p_committed_at, p_sync_status,
                                     p_error, p_full_name, p_default_branch);
$$;

create or replace function public.connect_site_hosting(
  p_site uuid, p_provider text, p_account_id text, p_project_name text, p_project_id text,
  p_production_branch text, p_production_url text, p_workers_trigger_id text default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.connect_site_hosting(p_site, p_provider, p_account_id, p_project_name, p_project_id,
                                  p_production_branch, p_production_url, p_workers_trigger_id);
$$;

create or replace function public.disconnect_site_hosting(p_site uuid, p_reason text)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.disconnect_site_hosting(p_site, p_reason);
$$;

create or replace function public.record_hosting_state(p_hosting uuid, p_error text default null)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_hosting_state(p_hosting, p_error);
$$;

create or replace function public.record_site_manifest(
  p_site uuid, p_commit_sha text, p_path text, p_contract_version int, p_manifest jsonb,
  p_manifest_hash text, p_status text, p_errors jsonb default '[]'::jsonb,
  p_warnings jsonb default '[]'::jsonb, p_summary jsonb default '{}'::jsonb,
  p_activate boolean default false)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_site_manifest(p_site, p_commit_sha, p_path, p_contract_version, p_manifest,
                                  p_manifest_hash, p_status, p_errors, p_warnings, p_summary,
                                  p_activate);
$$;

create or replace function public.initialize_site_content(
  p_site uuid, p_manifest uuid, p_content jsonb, p_content_hash text, p_commit_sha text,
  p_deployment jsonb)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.initialize_site_content(p_site, p_manifest, p_content, p_content_hash, p_commit_sha,
                                     p_deployment);
$$;

create or replace function public.save_site_draft(
  p_site uuid, p_content jsonb, p_expected_revision int)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.save_site_draft(p_site, p_content, p_expected_revision);
$$;

create or replace function public.request_site_release(
  p_site uuid, p_kind text, p_source_release uuid default null,
  p_expected_revision int default null, p_scheduled_for timestamptz default null,
  p_note text default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.request_site_release(p_site, p_kind, p_source_release, p_expected_revision,
                                  p_scheduled_for, p_note);
$$;

create or replace function public.cancel_site_release(p_release uuid)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.cancel_site_release(p_release);
$$;

create or replace function public.claim_site_release(p_release uuid)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.claim_site_release(p_release);
$$;

create or replace function public.record_release_commit(
  p_release uuid, p_base_sha text, p_commit_sha text, p_commit_url text, p_branch text)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_release_commit(p_release, p_base_sha, p_commit_sha, p_commit_url, p_branch);
$$;

create or replace function public.fail_site_release(
  p_release uuid, p_stage text, p_code text, p_message text)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.fail_site_release(p_release, p_stage, p_code, p_message);
$$;

create or replace function public.record_site_deployment(
  p_hosting uuid, p_provider_deployment_id text, p_environment text, p_status text,
  p_commit_sha text default null, p_branch text default null, p_url text default null,
  p_stage text default null, p_error text default null, p_started_at timestamptz default null,
  p_finished_at timestamptz default null, p_deployment uuid default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_site_deployment(p_hosting, p_provider_deployment_id, p_environment, p_status,
                                    p_commit_sha, p_branch, p_url, p_stage, p_error,
                                    p_started_at, p_finished_at, p_deployment);
$$;

create or replace function public.promote_due_site_releases()
returns int language sql security definer set search_path = public, app, pg_catalog as $$
  select app.promote_due_site_releases();
$$;

create or replace function public.site_releases_to_process(p_limit int default 25)
returns table (release_id uuid, site_id uuid, status text, updated_at timestamptz)
language sql stable security definer set search_path = public, app, pg_catalog as $$
  select * from app.site_releases_to_process(p_limit);
$$;

create or replace function public.begin_site_preview(p_site uuid)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.begin_site_preview(p_site);
$$;

create or replace function public.record_preview_commit(
  p_deployment uuid, p_commit_sha text, p_branch text, p_content_hash text)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_preview_commit(p_deployment, p_commit_sha, p_branch, p_content_hash);
$$;

create or replace function public.fail_site_preview(p_deployment uuid, p_message text)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.fail_site_preview(p_deployment, p_message);
$$;

create or replace function public.record_delivery_check(
  p_site uuid, p_key text, p_passed boolean, p_evidence jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.record_delivery_check(p_site, p_key, p_passed, p_evidence);
$$;

create or replace function public.attest_delivery_check(
  p_site uuid, p_key text, p_passed boolean, p_note text)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.attest_delivery_check(p_site, p_key, p_passed, p_note);
$$;

create or replace function public.delivery_readiness(p_site uuid)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.delivery_readiness(p_site);
$$;

create or replace function public.set_project_phase(p_site uuid, p_status text, p_note text default null)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.set_project_phase(p_site, p_status, p_note);
$$;

create or replace function public.site_management_overview(p_site uuid)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.site_management_overview(p_site);
$$;

create or replace function public.can_edit_site_content(p_site uuid)
returns boolean language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.site_content_access(p_site, 'content.edit');
$$;

create or replace function public.can_publish_site_content(p_site uuid)
returns boolean language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.site_content_access(p_site, 'content.publish');
$$;

-- Privileges : chaque fonction n'est executable que par qui doit l'appeler.
do $$
declare
  fn text;
  service_only text[] := array[
    'public.upsert_github_installation(bigint, text, bigint, text, text, boolean)',
    'public.remove_github_installation(bigint)',
    'public.record_repository_state(uuid, text, timestamptz, text, text, text, text)',
    'public.record_hosting_state(uuid, text)',
    'public.claim_site_release(uuid)',
    'public.record_release_commit(uuid, text, text, text, text)',
    'public.fail_site_release(uuid, text, text, text)',
    'public.record_site_deployment(uuid, text, text, text, text, text, text, text, text, timestamptz, timestamptz, uuid)',
    'public.promote_due_site_releases()',
    'public.site_releases_to_process(int)',
    'public.record_preview_commit(uuid, text, text, text)',
    'public.fail_site_preview(uuid, text)',
    'public.record_delivery_check(uuid, text, boolean, jsonb)'
  ];
  user_callable text[] := array[
    'public.connect_site_repository(uuid, bigint, bigint, text, bigint, text, text, text, text, text, text, text)',
    'public.disconnect_site_repository(uuid, text)',
    'public.connect_site_hosting(uuid, text, text, text, text, text, text, text)',
    'public.disconnect_site_hosting(uuid, text)',
    'public.record_site_manifest(uuid, text, text, int, jsonb, text, text, jsonb, jsonb, jsonb, boolean)',
    'public.initialize_site_content(uuid, uuid, jsonb, text, text, jsonb)',
    'public.save_site_draft(uuid, jsonb, int)',
    'public.request_site_release(uuid, text, uuid, int, timestamptz, text)',
    'public.cancel_site_release(uuid)',
    'public.begin_site_preview(uuid)',
    'public.attest_delivery_check(uuid, text, boolean, text)',
    'public.delivery_readiness(uuid)',
    'public.set_project_phase(uuid, text, text)',
    'public.site_management_overview(uuid)',
    'public.can_edit_site_content(uuid)',
    'public.can_publish_site_content(uuid)'
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
end;
$$;

revoke all on function app.site_content_access(uuid, text) from public, anon;
revoke all on function app.notify_site_clients(uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function app.finalize_site_release(uuid) from public, anon, authenticated;
revoke all on function app.bring_external_site_live(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
--  26. Sous-traitant : GitHub heberge le code et le contenu publie des sites
-- -----------------------------------------------------------------------------
insert into public.subprocessors
  (name, purpose, location, transfer_safeguards, privacy_url, category, sort_order)
select 'GitHub, Inc.',
       'Hébergement du code source de chaque site et des contenus publiés (dépôt dédié par site).',
       'États-Unis',
       'Clauses contractuelles types + Data Protection Agreement GitHub.',
       'https://docs.github.com/fr/site-policy/privacy-policies/github-general-privacy-statement',
       'infrastructure', 25
 where not exists (select 1 from public.subprocessors where name = 'GitHub, Inc.');

update public.subprocessors
   set purpose = 'Hébergement et diffusion de chaque site sur son propre projet (Pages ou '
                 || 'Workers), CDN, protection réseau et certificats TLS.'
 where name = 'Cloudflare, Inc.';

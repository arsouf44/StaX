-- =============================================================================
--  StaX — 0031 · Tout est reversible
--
--  Un client qui ne connait rien a l'informatique doit pouvoir TOUT essayer
--  sans jamais rien casser. Cette migration pose quatre filets, tous cote base
--  pour qu'aucun chemin — interface, requete forgee, equipe StaX — ne puisse
--  les contourner :
--
--   1. CORBEILLE. Supprimer une section, une page ou un fichier le place dans
--      une corbeille (`deleted_at`). La suppression definitive est une action
--      separee, reservee aux personnes qui peuvent publier.
--
--   2. ANNULER / RETABLIR. Chaque modification d'une page enregistre l'etat
--      complet de ses sections (`editor_revisions`). Annuler rejoue l'etat
--      precedent ; une nouvelle modification apres une annulation ecarte la
--      branche « retablir » sans l'effacer.
--
--   3. POINTS DE SAUVEGARDE. Le brouillon complet du site est photographie
--      pendant l'edition (`draft_checkpoints`), et avant chaque restauration.
--      L'historique montre ces points a cote des publications.
--
--   4. VERSIONS PUBLIEES IMMUABLES. Chaque publication fige un instantane du
--      site ET de chaque page (`site_versions`, `page_versions`), avec son
--      auteur, sa nature (client, equipe StaX) et l'etat de brouillon exact
--      qui permet de le restaurer sans perte. Restaurer une version ne detruit
--      jamais les suivantes : on cree une nouvelle version.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Corbeille
-- -----------------------------------------------------------------------------
alter table public.page_blocks
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id) on delete set null;

alter table public.site_pages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id) on delete set null;

alter table public.media
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id) on delete set null;

-- Une page dans la corbeille libere son adresse : on peut en recreer une a la
-- meme adresse, et la restauration choisit une adresse libre si besoin.
drop index if exists public.site_pages_path_key;
create unique index site_pages_path_key
  on public.site_pages (site_id, locale, path) where deleted_at is null;

create index if not exists page_blocks_trash_idx
  on public.page_blocks (site_id, deleted_at desc) where deleted_at is not null;
create index if not exists site_pages_trash_idx
  on public.site_pages (site_id, deleted_at desc) where deleted_at is not null;
create index if not exists media_trash_idx
  on public.media (organization_id, deleted_at desc) where deleted_at is not null;

/** Derniere modification du brouillon : « modifications non publiees ». */
alter table public.sites add column if not exists draft_updated_at timestamptz;

-- -----------------------------------------------------------------------------
--  2. Historique fin de chaque page
-- -----------------------------------------------------------------------------
create table public.editor_revisions (
  id              uuid primary key default app.uuid_v7(),
  site_id         uuid not null references public.sites (id) on delete cascade,
  page_id         uuid not null references public.site_pages (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  seq             int not null,
  /** Etat complet des sections de la page APRES la modification. */
  state           jsonb not null,
  action          text not null,
  /** Libelle en francais courant : « Titre modifié », « Section ajoutée ». */
  label           text not null,
  block_id        uuid,
  actor_id        uuid references public.profiles (id) on delete set null,
  actor_kind      text not null default 'member',
  undone_at       timestamptz,
  discarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint editor_revisions_state_object check (jsonb_typeof(state) = 'object'),
  constraint editor_revisions_actor_kind_valid check (actor_kind in ('member', 'stax', 'system'))
);

create unique index editor_revisions_page_seq_key on public.editor_revisions (page_id, seq);
create index editor_revisions_site_idx on public.editor_revisions (site_id, created_at desc);

-- -----------------------------------------------------------------------------
--  3. Points de sauvegarde du brouillon complet
-- -----------------------------------------------------------------------------
create table public.draft_checkpoints (
  id              uuid primary key default app.uuid_v7(),
  site_id         uuid not null references public.sites (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  state           jsonb not null,
  source          text not null default 'autosave',
  label           text not null,
  actor_id        uuid references public.profiles (id) on delete set null,
  actor_kind      text not null default 'member',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint draft_checkpoints_state_object check (jsonb_typeof(state) = 'object'),
  constraint draft_checkpoints_source_valid
    check (source in ('autosave', 'before_restore', 'before_publish', 'manual')),
  constraint draft_checkpoints_actor_kind_valid check (actor_kind in ('member', 'stax', 'system'))
);

create index draft_checkpoints_site_idx on public.draft_checkpoints (site_id, created_at desc);

-- -----------------------------------------------------------------------------
--  4. Versions publiees : ce qu'il faut pour les relire et les restaurer
-- -----------------------------------------------------------------------------
alter table public.site_versions
  add column if not exists source text not null default 'publish',
  add column if not exists draft_state jsonb,
  add column if not exists actor_kind text not null default 'member',
  add column if not exists restored_from_version_id uuid
    references public.site_versions (id) on delete set null;

alter table public.site_versions
  add constraint site_versions_source_valid
    check (source in ('publish', 'initial', 'rollback')),
  add constraint site_versions_actor_kind_valid check (actor_kind in ('member', 'stax', 'system'));

alter table public.page_versions
  add column if not exists site_version_id uuid references public.site_versions (id) on delete cascade,
  add column if not exists path text,
  add column if not exists title text;

create index if not exists page_versions_site_version_idx on public.page_versions (site_version_id);

-- Une version survit a la page qu'elle photographie : supprimer definitivement
-- une page ne doit pas effacer ce qui a ete publie. La reference devient nulle,
-- l'instantane reste.
alter table public.page_versions alter column page_id drop not null;
alter table public.page_versions drop constraint if exists page_versions_page_id_fkey;
alter table public.page_versions
  add constraint page_versions_page_id_fkey foreign key (page_id)
    references public.site_pages (id) on delete set null;

/*
 * Immuabilite, avec une seule exception : les cles etrangeres `on delete set
 * null`. Supprimer un compte ou une page efface la REFERENCE, jamais le contenu
 * publie. Sans cette exception, les deux regles se contrediraient et aucun
 * compte ayant publie ne pourrait etre supprime (article 17 du RGPD).
 */
create or replace function app.forbid_page_version_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if (new.page_id is null or new.page_id = old.page_id)
     and (new.created_by is null or new.created_by = old.created_by)
     and row(new.id, new.site_id, new.version_number, new.snapshot, new.created_at,
             new.site_version_id, new.path, new.title)
         is not distinct from
         row(old.id, old.site_id, old.version_number, old.snapshot, old.created_at,
             old.site_version_id, old.path, old.title) then
    return new;
  end if;
  raise exception 'Une version de page publiee est immuable' using errcode = '23514';
end;
$$;

create or replace function app.freeze_published_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.published_at is null then
    return new;
  end if;
  if (new.published_by is null or new.published_by = old.published_by)
     and (new.created_by is null or new.created_by = old.created_by)
     and (new.restored_from_version_id is null
          or new.restored_from_version_id = old.restored_from_version_id)
     and row(new.id, new.site_id, new.version_number, new.label, new.snapshot,
             new.content_hash, new.published_at, new.scheduled_for, new.created_at,
             new.source, new.draft_state, new.actor_kind)
         is not distinct from
         row(old.id, old.site_id, old.version_number, old.label, old.snapshot,
             old.content_hash, old.published_at, old.scheduled_for, old.created_at,
             old.source, old.draft_state, old.actor_kind) then
    return new;
  end if;
  raise exception 'Une version publiee est immuable (site_versions.%)', old.id
    using errcode = '23514';
end;
$$;

drop trigger if exists page_versions_immutable on public.page_versions;
create trigger page_versions_immutable
  before update on public.page_versions
  for each row execute function app.forbid_page_version_mutation();

-- -----------------------------------------------------------------------------
--  Droits
-- -----------------------------------------------------------------------------
create or replace function app.can_edit_site(p_site uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(app.site_can(p_site, 'content.edit') or app.is_platform_site_editor(), false);
$$;

create or replace function app.can_publish_site(p_site uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(app.site_can(p_site, 'content.publish') or app.is_platform_site_editor(), false);
$$;

-- -----------------------------------------------------------------------------
--  Etat d'une page, etat du brouillon
-- -----------------------------------------------------------------------------
create or replace function app.page_state(p_page uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select jsonb_build_object('blocks', coalesce(jsonb_agg(
           jsonb_build_object(
             'id', b.id, 'type', b.type, 'version', b.version,
             'props', b.props, 'settings', b.settings, 'visible', b.is_visible)
           order by b.sort_order, b.created_at), '[]'::jsonb))
    from public.page_blocks b
   where b.page_id = p_page and b.deleted_at is null;
$$;

/**
 * Brouillon complet et sans perte : pages non publiees et sections masquees
 * comprises. C'est ce qui est conserve avec chaque publication et chaque
 * point de sauvegarde, et ce qui permet de restaurer exactement.
 */
create or replace function app.build_draft_state(p_site uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select jsonb_build_object(
    'format', 1,
    'theme', coalesce((
      select jsonb_build_object(
        'preset', t.preset, 'tokens', t.tokens,
        'font_heading', t.font_heading, 'font_body', t.font_body,
        'logo_media_id', t.logo_media_id, 'favicon_media_id', t.favicon_media_id)
        from public.site_themes t where t.site_id = p_site), '{}'::jsonb),
    'settings', coalesce((
      select jsonb_build_object(
        'business_name', s.business_name, 'tagline', s.tagline, 'description', s.description,
        'email', s.email, 'phone', s.phone, 'address_line1', s.address_line1,
        'address_line2', s.address_line2, 'postal_code', s.postal_code, 'city', s.city,
        'country', s.country, 'social_links', s.social_links,
        'seo_title', s.seo_title, 'seo_description', s.seo_description,
        'seo_keywords', s.seo_keywords, 'og_image_media_id', s.og_image_media_id,
        'robots_indexable', s.robots_indexable, 'navigation', s.navigation,
        'cookie_banner_enabled', s.cookie_banner_enabled,
        'analytics_enabled', s.analytics_enabled)
        from public.site_settings s where s.site_id = p_site), '{}'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'path', p.path, 'title', p.title, 'kind', p.kind, 'locale', p.locale,
          'seo_title', p.seo_title, 'seo_description', p.seo_description,
          'robots_indexable', p.robots_indexable, 'is_visible_in_nav', p.is_visible_in_nav,
          'sort_order', p.sort_order, 'is_published', p.is_published,
          'blocks', app.page_state(p.id) -> 'blocks')
        order by p.sort_order, p.created_at)
        from public.site_pages p
       where p.site_id = p_site and p.deleted_at is null), '[]'::jsonb)
  );
$$;

/** Convertit l'instantane publie d'une ancienne version en etat de brouillon. */
create or replace function app.snapshot_to_draft_state(p_snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = public, app, pg_catalog
as $$
  select jsonb_build_object(
    'format', 1,
    'theme', jsonb_build_object(
      'preset', p_snapshot #>> '{theme,preset}',
      'tokens', coalesce(p_snapshot #> '{theme,tokens}', '{}'::jsonb),
      'font_heading', p_snapshot #>> '{theme,fontHeading}',
      'font_body', p_snapshot #>> '{theme,fontBody}'),
    'settings', coalesce(p_snapshot -> 'settings', '{}'::jsonb)
                - 'enabled_modules' - 'notification_emails' - 'google_site_verification',
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', page ->> 'id', 'path', page ->> 'path', 'title', page ->> 'title',
          'kind', page ->> 'kind', 'locale', coalesce(page ->> 'locale', 'fr'),
          'seo_title', page ->> 'seoTitle', 'seo_description', page ->> 'seoDescription',
          'robots_indexable', coalesce((page ->> 'robotsIndexable')::boolean, true),
          'is_visible_in_nav', coalesce((page ->> 'showInNav')::boolean, true),
          'sort_order', coalesce((page ->> 'sortOrder')::int, 100),
          'is_published', true,
          'blocks', coalesce((
            select jsonb_agg(block || jsonb_build_object('visible', true))
              from jsonb_array_elements(coalesce(page -> 'blocks', '[]'::jsonb)) block), '[]'::jsonb)))
        from jsonb_array_elements(coalesce(p_snapshot -> 'pages', '[]'::jsonb)) page), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
--  Application d'un etat
-- -----------------------------------------------------------------------------
/**
 * Applique l'etat des sections d'une page.
 *
 * Une section absente de l'etat part dans la corbeille ; une section presente
 * est remise en place (et sortie de la corbeille le cas echeant) ; une section
 * inconnue est creee avec l'identifiant fourni. Un identifiant qui appartient
 * a une AUTRE page — donc peut-etre a un autre client — est refuse.
 */
create or replace function app.apply_page_state(p_page uuid, p_state jsonb, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site    uuid;
  v_block   jsonb;
  v_index   int;
  v_id      uuid;
  v_ids     uuid[] := '{}';
  v_owner   uuid;
begin
  select site_id into v_site from public.site_pages where id = p_page;
  if v_site is null then
    raise exception 'Page introuvable' using errcode = 'P0002';
  end if;

  if jsonb_typeof(coalesce(p_state -> 'blocks', 'null'::jsonb)) <> 'array' then
    raise exception 'Etat de page illisible' using errcode = '22023';
  end if;
  if jsonb_array_length(p_state -> 'blocks') > 80 then
    raise exception 'Une page ne peut pas depasser 80 sections' using errcode = '23514';
  end if;

  for v_block in select value from jsonb_array_elements(p_state -> 'blocks') loop
    if (v_block ->> 'id') is not null then
      v_ids := v_ids || (v_block ->> 'id')::uuid;
    end if;
  end loop;

  update public.page_blocks
     set deleted_at = now(), deleted_by = p_actor
   where page_id = p_page and deleted_at is null and not (id = any (v_ids));

  for v_block, v_index in
    select value, ordinality from jsonb_array_elements(p_state -> 'blocks') with ordinality
  loop
    v_id := coalesce((v_block ->> 'id')::uuid, gen_random_uuid());
    select page_id into v_owner from public.page_blocks where id = v_id;

    if v_owner is not null and v_owner <> p_page then
      raise exception 'Cette section appartient a une autre page' using errcode = '42501';
    end if;

    if v_owner is null then
      insert into public.page_blocks
        (id, page_id, site_id, type, version, props, settings, sort_order, is_visible)
      values
        (v_id, p_page, v_site, v_block ->> 'type',
         coalesce((v_block ->> 'version')::int, 1),
         coalesce(v_block -> 'props', '{}'::jsonb),
         coalesce(v_block -> 'settings', '{}'::jsonb),
         v_index * 10,
         coalesce((v_block ->> 'visible')::boolean, true));
    else
      update public.page_blocks
         set type = v_block ->> 'type',
             version = coalesce((v_block ->> 'version')::int, version),
             props = coalesce(v_block -> 'props', props),
             settings = coalesce(v_block -> 'settings', settings),
             sort_order = v_index * 10,
             is_visible = coalesce((v_block ->> 'visible')::boolean, is_visible),
             deleted_at = null,
             deleted_by = null
       where id = v_id;
    end if;
  end loop;
end;
$$;

/** Revision courante d'une page : la derniere ni annulee ni ecartee. */
create or replace function app.current_revision(p_page uuid)
returns public.editor_revisions
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select r.* from public.editor_revisions r
   where r.page_id = p_page and r.undone_at is null and r.discarded_at is null
   order by r.seq desc
   limit 1;
$$;

/**
 * Prepare une modification : verrouille la page, pose l'etat de depart si la
 * page n'a jamais ete modifiee, detecte une modification concurrente et ecarte
 * la branche « retablir ».
 */
create or replace function app.editor_prepare(p_page uuid, p_base_seq int)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_page    public.site_pages%rowtype;
  v_current public.editor_revisions%rowtype;
begin
  select * into v_page from public.site_pages where id = p_page for update;

  v_current := app.current_revision(p_page);
  if v_current.id is null then
    insert into public.editor_revisions
      (site_id, page_id, organization_id, seq, state, action, label, actor_kind)
    values
      (v_page.site_id, p_page, app.site_org(v_page.site_id),
       coalesce((select max(seq) from public.editor_revisions where page_id = p_page), 0) + 1,
       app.page_state(p_page), 'baseline', 'État de départ', 'system');
  elsif p_base_seq is not null and p_base_seq <> v_current.seq then
    raise exception 'stax:conflict'
      using errcode = '40001',
            hint = 'Cette page vient d''etre modifiee par quelqu''un d''autre.';
  end if;

  update public.editor_revisions
     set discarded_at = now()
   where page_id = p_page and undone_at is not null and discarded_at is null;
end;
$$;

/** Enregistre l'etat courant d'une page comme nouvelle revision. */
create or replace function app.editor_record(
  p_page     uuid,
  p_action   text,
  p_label    text,
  p_block    uuid,
  p_coalesce boolean
)
returns int
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site  uuid;
  v_org   uuid;
  v_actor uuid := app.current_user_id();
  v_last  public.editor_revisions%rowtype;
  v_seq   int;
begin
  select site_id into v_site from public.site_pages where id = p_page;
  v_org := app.site_org(v_site);
  v_last := app.current_revision(p_page);

  -- Une frappe continue dans un meme champ forme UNE etape d'annulation, pas
  -- une par enregistrement automatique.
  if p_coalesce and v_last.id is not null and v_last.action = p_action
     and v_last.block_id is not distinct from p_block
     and v_last.actor_id is not distinct from v_actor
     and v_last.updated_at > now() - interval '45 seconds'
     -- Jamais apres une annulation : la revision courante porte alors un etat
     -- que l'on doit pouvoir retrouver tel quel.
     and v_last.seq = (select max(seq) from public.editor_revisions where page_id = p_page) then
    update public.editor_revisions
       set state = app.page_state(p_page), updated_at = now()
     where id = v_last.id;
    return v_last.seq;
  end if;

  v_seq := coalesce((select max(seq) from public.editor_revisions where page_id = p_page), 0) + 1;
  insert into public.editor_revisions
    (site_id, page_id, organization_id, seq, state, action, label, block_id,
     actor_id, actor_kind)
  values
    (v_site, p_page, v_org, v_seq, app.page_state(p_page), p_action, left(p_label, 120),
     p_block, v_actor, app.actor_kind(v_org));
  return v_seq;
end;
$$;

/**
 * Marque le brouillon comme modifie et entretient un point de sauvegarde
 * automatique par tranche de dix minutes d'edition : l'historique montre
 * « Enregistrement automatique » avec l'etat le plus recent de la tranche.
 */
create or replace function app.touch_draft(p_site uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_org   uuid := app.site_org(p_site);
  v_actor uuid := app.current_user_id();
  v_last  public.draft_checkpoints%rowtype;
begin
  update public.sites set draft_updated_at = now() where id = p_site;

  select * into v_last from public.draft_checkpoints
   where site_id = p_site
   order by created_at desc
   limit 1;

  if v_last.id is not null and v_last.source = 'autosave'
     and v_last.actor_id is not distinct from v_actor
     and v_last.created_at > now() - interval '10 minutes' then
    update public.draft_checkpoints
       set state = app.build_draft_state(p_site), updated_at = now()
     where id = v_last.id;
  else
    insert into public.draft_checkpoints
      (site_id, organization_id, state, source, label, actor_id, actor_kind)
    values
      (p_site, v_org, app.build_draft_state(p_site), 'autosave',
       'Enregistrement automatique', v_actor, app.actor_kind(v_org));
  end if;
end;
$$;

create or replace function app.editor_status(p_page uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_current public.editor_revisions%rowtype;
  v_next    public.editor_revisions%rowtype;
  v_has_previous boolean := false;
begin
  v_current := app.current_revision(p_page);

  if v_current.id is not null then
    v_has_previous := exists (
      select 1 from public.editor_revisions
       where page_id = p_page and seq < v_current.seq
         and undone_at is null and discarded_at is null);
  end if;

  select * into v_next from public.editor_revisions
   where page_id = p_page and undone_at is not null and discarded_at is null
     and seq > coalesce(v_current.seq, 0)
   order by seq asc
   limit 1;

  return jsonb_build_object(
    'seq', coalesce(v_current.seq, 0),
    'canUndo', v_has_previous,
    'undoLabel', case when v_has_previous then v_current.label end,
    'canRedo', v_next.id is not null,
    'redoLabel', v_next.label
  );
end;
$$;

-- -----------------------------------------------------------------------------
--  Operations de l'editeur
-- -----------------------------------------------------------------------------
create or replace function app.editor_commit(
  p_page     uuid,
  p_blocks   jsonb,
  p_action   text,
  p_label    text,
  p_block    uuid default null,
  p_base_seq int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_page public.site_pages%rowtype;
begin
  select * into v_page from public.site_pages where id = p_page;
  if not found or not app.can_edit_site(v_page.site_id) then
    -- Meme reponse qu'une page inexistante : pas d'oracle sur les autres tenants.
    raise exception 'Page introuvable' using errcode = 'P0002';
  end if;
  if v_page.deleted_at is not null then
    raise exception 'Cette page est dans la corbeille' using errcode = '23514';
  end if;
  if p_action not in ('block.edit', 'block.style', 'block.add', 'block.duplicate',
                      'block.move', 'block.hide', 'block.show', 'block.delete',
                      'block.restore') then
    raise exception 'Action inconnue' using errcode = '22023';
  end if;

  perform app.editor_prepare(p_page, p_base_seq);
  perform app.apply_page_state(p_page, jsonb_build_object('blocks', p_blocks),
                               app.current_user_id());
  perform app.editor_record(p_page, p_action, coalesce(nullif(p_label, ''), 'Modification'),
                            p_block, p_action in ('block.edit', 'block.style'));
  perform app.touch_draft(v_page.site_id);

  if app.actor_kind(app.site_org(v_page.site_id)) = 'stax' then
    perform app.write_audit('editor.' || p_action, app.site_org(v_page.site_id),
                            v_page.site_id, 'site_page', p_page::text,
                            jsonb_build_object('label', p_label, 'block', p_block));
  end if;

  return app.editor_status(p_page);
end;
$$;

create or replace function app.editor_undo(p_page uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_page     public.site_pages%rowtype;
  v_current  public.editor_revisions%rowtype;
  v_previous public.editor_revisions%rowtype;
begin
  select * into v_page from public.site_pages where id = p_page for update;
  if not found or not app.can_edit_site(v_page.site_id) then
    raise exception 'Page introuvable' using errcode = 'P0002';
  end if;

  v_current := app.current_revision(p_page);
  if v_current.id is null then
    return app.editor_status(p_page);
  end if;

  select * into v_previous from public.editor_revisions
   where page_id = p_page and seq < v_current.seq
     and undone_at is null and discarded_at is null
   order by seq desc
   limit 1;

  if v_previous.id is null then
    return app.editor_status(p_page);
  end if;

  update public.editor_revisions set undone_at = now() where id = v_current.id;
  perform app.apply_page_state(p_page, v_previous.state, app.current_user_id());
  perform app.touch_draft(v_page.site_id);
  return app.editor_status(p_page) || jsonb_build_object('undone', v_current.label);
end;
$$;

create or replace function app.editor_redo(p_page uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_page    public.site_pages%rowtype;
  v_current public.editor_revisions%rowtype;
  v_next    public.editor_revisions%rowtype;
begin
  select * into v_page from public.site_pages where id = p_page for update;
  if not found or not app.can_edit_site(v_page.site_id) then
    raise exception 'Page introuvable' using errcode = 'P0002';
  end if;

  v_current := app.current_revision(p_page);
  select * into v_next from public.editor_revisions
   where page_id = p_page and undone_at is not null and discarded_at is null
     and seq > coalesce(v_current.seq, 0)
   order by seq asc
   limit 1;

  if v_next.id is null then
    return app.editor_status(p_page);
  end if;

  update public.editor_revisions set undone_at = null where id = v_next.id;
  perform app.apply_page_state(p_page, v_next.state, app.current_user_id());
  perform app.touch_draft(v_page.site_id);
  return app.editor_status(p_page) || jsonb_build_object('redone', v_next.label);
end;
$$;

-- -----------------------------------------------------------------------------
--  Restauration d'un etat complet dans le brouillon
-- -----------------------------------------------------------------------------
create or replace function app.checkpoint_draft(p_site uuid, p_source text, p_label text)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_org uuid := app.site_org(p_site);
  v_id  uuid;
begin
  insert into public.draft_checkpoints
    (site_id, organization_id, state, source, label, actor_id, actor_kind)
  values
    (p_site, v_org, app.build_draft_state(p_site), p_source, left(p_label, 160),
     app.current_user_id(), app.actor_kind(v_org))
  returning id into v_id;
  return v_id;
end;
$$;

/**
 * Remplace le brouillon par un etat complet — celui d'une version publiee ou
 * d'un point de sauvegarde. Rien n'est detruit : les pages et sections qui
 * n'existaient pas dans l'etat restaure partent dans la corbeille, et chaque
 * page recoit une revision « restauration » que l'on peut annuler.
 */
create or replace function app.apply_draft_state(p_site uuid, p_state jsonb, p_label text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor    uuid := app.current_user_id();
  v_page     jsonb;
  v_page_id  uuid;
  v_ids      uuid[] := '{}';
  v_existing uuid;
  v_logo     uuid;
  v_favicon  uuid;
  v_og       uuid;
begin
  if jsonb_typeof(coalesce(p_state -> 'pages', 'null'::jsonb)) <> 'array' then
    raise exception 'Etat de brouillon illisible' using errcode = '22023';
  end if;

  for v_page in select value from jsonb_array_elements(p_state -> 'pages') loop
    v_ids := v_ids || (v_page ->> 'id')::uuid;
  end loop;

  -- Etat de depart de chaque page vivante, pour que la restauration elle-meme
  -- s'annule depuis l'editeur.
  for v_page_id in
    select id from public.site_pages where site_id = p_site and deleted_at is null
  loop
    if (app.current_revision(v_page_id)).id is null then
      perform app.editor_prepare(v_page_id, null);
    end if;
  end loop;

  update public.site_pages
     set deleted_at = now(), deleted_by = v_actor
   where site_id = p_site and deleted_at is null and not (id = any (v_ids));

  -- Adresses provisoires : deux pages qui echangent leurs adresses ne doivent
  -- pas se heurter a l'unicite pendant l'operation.
  update public.site_pages
     set path = '/restauration-' || left(replace(id::text, '-', ''), 16),
         deleted_at = null, deleted_by = null
   where site_id = p_site and id = any (v_ids);

  for v_page in select value from jsonb_array_elements(p_state -> 'pages') loop
    v_page_id := (v_page ->> 'id')::uuid;
    select site_id into v_existing from public.site_pages where id = v_page_id;
    if v_existing is not null and v_existing <> p_site then
      raise exception 'Cette page appartient a un autre site' using errcode = '42501';
    end if;

    if v_existing is null then
      insert into public.site_pages
        (id, site_id, path, title, kind, locale, seo_title, seo_description,
         robots_indexable, is_visible_in_nav, sort_order, is_published)
      values
        (v_page_id, p_site, v_page ->> 'path', v_page ->> 'title',
         coalesce(v_page ->> 'kind', 'standard'), coalesce(v_page ->> 'locale', 'fr'),
         v_page ->> 'seo_title', v_page ->> 'seo_description',
         coalesce((v_page ->> 'robots_indexable')::boolean, true),
         coalesce((v_page ->> 'is_visible_in_nav')::boolean, true),
         coalesce((v_page ->> 'sort_order')::int, 100),
         coalesce((v_page ->> 'is_published')::boolean, true));
      perform app.editor_prepare(v_page_id, null);
    else
      update public.site_pages
         set path = v_page ->> 'path',
             title = v_page ->> 'title',
             kind = coalesce(v_page ->> 'kind', kind),
             seo_title = v_page ->> 'seo_title',
             seo_description = v_page ->> 'seo_description',
             robots_indexable = coalesce((v_page ->> 'robots_indexable')::boolean, robots_indexable),
             is_visible_in_nav = coalesce((v_page ->> 'is_visible_in_nav')::boolean, is_visible_in_nav),
             sort_order = coalesce((v_page ->> 'sort_order')::int, sort_order),
             is_published = coalesce((v_page ->> 'is_published')::boolean, is_published)
       where id = v_page_id;
      perform app.editor_prepare(v_page_id, null);
    end if;

    perform app.apply_page_state(v_page_id,
                                 jsonb_build_object('blocks', coalesce(v_page -> 'blocks', '[]'::jsonb)),
                                 v_actor);
    perform app.editor_record(v_page_id, 'restore', p_label, null, false);
  end loop;

  -- Theme : les fichiers passes a la corbeille definitive ne sont pas restaures.
  if jsonb_typeof(p_state -> 'theme') = 'object' and p_state -> 'theme' <> '{}'::jsonb then
    select id into v_logo from public.media
     where id = nullif(p_state #>> '{theme,logo_media_id}', '')::uuid;
    select id into v_favicon from public.media
     where id = nullif(p_state #>> '{theme,favicon_media_id}', '')::uuid;

    update public.site_themes
       set preset = coalesce(p_state #>> '{theme,preset}', preset),
           tokens = coalesce(p_state #> '{theme,tokens}', tokens),
           font_heading = coalesce(p_state #>> '{theme,font_heading}', font_heading),
           font_body = coalesce(p_state #>> '{theme,font_body}', font_body),
           logo_media_id = case when p_state -> 'theme' ? 'logo_media_id'
                                then v_logo else logo_media_id end,
           favicon_media_id = case when p_state -> 'theme' ? 'favicon_media_id'
                                   then v_favicon else favicon_media_id end
     where site_id = p_site;
  end if;

  if jsonb_typeof(p_state -> 'settings') = 'object' and p_state -> 'settings' <> '{}'::jsonb then
    select id into v_og from public.media
     where id = nullif(p_state #>> '{settings,og_image_media_id}', '')::uuid;

    update public.site_settings
       set business_name = p_state #>> '{settings,business_name}',
           tagline = p_state #>> '{settings,tagline}',
           description = p_state #>> '{settings,description}',
           email = p_state #>> '{settings,email}',
           phone = p_state #>> '{settings,phone}',
           address_line1 = p_state #>> '{settings,address_line1}',
           address_line2 = p_state #>> '{settings,address_line2}',
           postal_code = p_state #>> '{settings,postal_code}',
           city = p_state #>> '{settings,city}',
           country = coalesce(p_state #>> '{settings,country}', country),
           social_links = coalesce(p_state #> '{settings,social_links}', social_links),
           seo_title = p_state #>> '{settings,seo_title}',
           seo_description = p_state #>> '{settings,seo_description}',
           seo_keywords = coalesce(
             (select array_agg(value) from jsonb_array_elements_text(
                case when jsonb_typeof(p_state #> '{settings,seo_keywords}') = 'array'
                     then p_state #> '{settings,seo_keywords}' else '[]'::jsonb end)),
             seo_keywords),
           og_image_media_id = v_og,
           robots_indexable = coalesce((p_state #>> '{settings,robots_indexable}')::boolean,
                                       robots_indexable),
           navigation = coalesce(p_state #> '{settings,navigation}', navigation),
           cookie_banner_enabled = coalesce(
             (p_state #>> '{settings,cookie_banner_enabled}')::boolean, cookie_banner_enabled),
           analytics_enabled = coalesce(
             (p_state #>> '{settings,analytics_enabled}')::boolean, analytics_enabled)
     where site_id = p_site;
  end if;

  perform app.touch_draft(p_site);
end;
$$;

create or replace function app.restore_version_to_draft(p_site uuid, p_version uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_version public.site_versions%rowtype;
  v_label   text;
begin
  if not app.can_edit_site(p_site) then
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;

  select * into v_version from public.site_versions where id = p_version and site_id = p_site;
  if not found then
    raise exception 'Version introuvable pour ce site' using errcode = 'P0002';
  end if;

  v_label := 'Version ' || v_version.version_number || ' restaurée';
  perform app.checkpoint_draft(p_site, 'before_restore',
                               'Avant la restauration de la version ' || v_version.version_number);
  perform app.apply_draft_state(p_site,
                                coalesce(v_version.draft_state,
                                         app.snapshot_to_draft_state(v_version.snapshot)),
                                v_label);
  perform app.write_audit('site.version_restored_to_draft', app.site_org(p_site), p_site,
                          'site_version', p_version::text,
                          jsonb_build_object('version', v_version.version_number));
  return jsonb_build_object('ok', true, 'version', v_version.version_number);
end;
$$;

create or replace function app.restore_checkpoint_to_draft(p_site uuid, p_checkpoint uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_checkpoint public.draft_checkpoints%rowtype;
begin
  if not app.can_edit_site(p_site) then
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;

  select * into v_checkpoint from public.draft_checkpoints
   where id = p_checkpoint and site_id = p_site;
  if not found then
    raise exception 'Point de sauvegarde introuvable' using errcode = 'P0002';
  end if;

  perform app.checkpoint_draft(p_site, 'before_restore', 'Avant une restauration');
  perform app.apply_draft_state(p_site, v_checkpoint.state, 'Sauvegarde restaurée');
  perform app.write_audit('site.checkpoint_restored', app.site_org(p_site), p_site,
                          'draft_checkpoint', p_checkpoint::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
--  Corbeille des pages et des sections
-- -----------------------------------------------------------------------------
create or replace function app.trash_page(p_page uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_page public.site_pages%rowtype;
begin
  select * into v_page from public.site_pages where id = p_page for update;
  if not found or not app.can_edit_site(v_page.site_id) then
    raise exception 'Page introuvable' using errcode = 'P0002';
  end if;
  if v_page.kind = 'home' or v_page.path = '/' then
    raise exception 'La page d''accueil ne peut pas etre supprimee' using errcode = '23514';
  end if;
  if v_page.deleted_at is not null then
    return jsonb_build_object('ok', true);
  end if;

  update public.site_pages
     set deleted_at = now(), deleted_by = app.current_user_id()
   where id = p_page;
  perform app.touch_draft(v_page.site_id);
  perform app.write_audit('page.trashed', app.site_org(v_page.site_id), v_page.site_id,
                          'site_page', p_page::text, jsonb_build_object('title', v_page.title));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function app.restore_page(p_page uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_page    public.site_pages%rowtype;
  v_path    text;
  v_counter int := 1;
  v_limit   int;
  v_org     uuid;
begin
  select * into v_page from public.site_pages where id = p_page for update;
  if not found or not app.can_edit_site(v_page.site_id) then
    raise exception 'Page introuvable' using errcode = 'P0002';
  end if;
  if v_page.deleted_at is null then
    return jsonb_build_object('ok', true, 'path', v_page.path);
  end if;

  v_org := app.site_org(v_page.site_id);
  v_limit := app.feature_limit(v_org, 'max_pages');
  if v_limit is not null and v_limit >= 0
     and app.usage_count(v_org, 'max_pages') >= v_limit
     and not app.is_platform_site_editor() then
    raise exception 'Limite de % pages atteinte pour votre offre', v_limit using errcode = '23514';
  end if;

  v_path := v_page.path;
  while exists (select 1 from public.site_pages
                 where site_id = v_page.site_id and locale = v_page.locale
                   and path = v_path and deleted_at is null) loop
    v_counter := v_counter + 1;
    v_path := v_page.path || '-' || v_counter;
  end loop;

  update public.site_pages
     set deleted_at = null, deleted_by = null, path = v_path
   where id = p_page;
  perform app.touch_draft(v_page.site_id);
  perform app.write_audit('page.restored', v_org, v_page.site_id, 'site_page', p_page::text,
                          jsonb_build_object('path', v_path));
  return jsonb_build_object('ok', true, 'path', v_path, 'renamed', v_path <> v_page.path);
end;
$$;

/**
 * Suppression definitive. Separee de la corbeille, reservee a qui peut
 * publier, et impossible sur un element qui n'est pas deja dans la corbeille :
 * on ne detruit jamais d'un seul geste quelque chose de visible.
 */
create or replace function app.purge_trash_item(p_kind text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site uuid;
  v_deleted timestamptz;
begin
  if p_kind = 'block' then
    select site_id, deleted_at into v_site, v_deleted from public.page_blocks where id = p_id;
  elsif p_kind = 'page' then
    select site_id, deleted_at into v_site, v_deleted from public.site_pages where id = p_id;
  else
    raise exception 'Element inconnu' using errcode = '22023';
  end if;

  if v_site is null or not app.can_publish_site(v_site) then
    raise exception 'Element introuvable' using errcode = 'P0002';
  end if;
  if v_deleted is null then
    raise exception 'Seul un element deja dans la corbeille peut etre supprime definitivement'
      using errcode = '23514';
  end if;

  if p_kind = 'block' then
    delete from public.page_blocks where id = p_id;
  else
    delete from public.site_pages where id = p_id;
  end if;

  perform app.write_audit('trash.purged', app.site_org(v_site), v_site, p_kind, p_id::text,
                          '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
--  Publication
-- -----------------------------------------------------------------------------
create or replace function app.build_site_snapshot(p_site uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, app, extensions, pg_catalog
as $$
  select jsonb_build_object(
    'site', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'slug', s.slug,
      'businessType', s.business_type_slug,
      'planSlug', s.plan_slug,
      'defaultLocale', s.default_locale,
      'enabledLocales', s.enabled_locales,
      'timezone', s.timezone,
      'isDemo', s.is_demo
    ),
    'theme', coalesce(
      (select jsonb_build_object(
          'preset', t.preset,
          'tokens', t.tokens,
          'fontHeading', t.font_heading,
          'fontBody', t.font_body,
          'logoUrl', case when lm.id is null then null
                          else lm.storage_bucket || '/' || lm.storage_path end,
          'faviconUrl', case when fm.id is null then null
                             else fm.storage_bucket || '/' || fm.storage_path end
        )
        from public.site_themes t
        left join public.media lm on lm.id = t.logo_media_id
        left join public.media fm on fm.id = t.favicon_media_id
       where t.site_id = s.id),
      '{}'::jsonb
    ),
    'settings', coalesce(
      (select to_jsonb(ss) - 'site_id' - 'updated_at' from public.site_settings ss
        where ss.site_id = s.id),
      '{}'::jsonb
    ),
    'pages', coalesce(
      (select jsonb_agg(page_json order by page_order)
         from (
           select p.sort_order as page_order,
                  jsonb_build_object(
                    'id', p.id,
                    'path', p.path,
                    'title', p.title,
                    'kind', p.kind,
                    'locale', p.locale,
                    'seoTitle', p.seo_title,
                    'seoDescription', p.seo_description,
                    'robotsIndexable', p.robots_indexable,
                    'showInNav', p.is_visible_in_nav,
                    'sortOrder', p.sort_order,
                    'blocks', coalesce((
                      select jsonb_agg(
                        jsonb_build_object(
                          'id', b.id,
                          'type', b.type,
                          'version', b.version,
                          'props', b.props,
                          'settings', b.settings
                        ) order by b.sort_order
                      )
                      from public.page_blocks b
                      where b.page_id = p.id and b.is_visible and b.deleted_at is null
                    ), '[]'::jsonb)
                  ) as page_json
             from public.site_pages p
            where p.site_id = s.id and p.is_published and p.deleted_at is null
         ) pages),
      '[]'::jsonb
    ),
    'redirects', coalesce(
      (select jsonb_agg(jsonb_build_object(
          'from', r.source_path, 'to', r.target_path, 'status', r.status_code))
         from public.site_redirects r where r.site_id = s.id),
      '[]'::jsonb
    ),
    'generatedAt', to_jsonb(now())
  )
  from public.sites s
  where s.id = p_site;
$$;

/** Amene un site en ligne en respectant la machine a etats. */
create or replace function app.bring_site_live(p_site uuid)
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
  if v_status = 'ready' then
    update public.sites set status = 'live' where id = p_site;
  end if;
end;
$$;

/** Instantanes de chaque page d'une version, pour la comparaison page a page. */
create or replace function app.record_page_versions(p_site uuid, p_version uuid, p_number int,
                                                    p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_page jsonb;
begin
  for v_page in select value from jsonb_array_elements(coalesce(p_snapshot -> 'pages', '[]'::jsonb))
  loop
    if exists (select 1 from public.site_pages where id = (v_page ->> 'id')::uuid) then
      insert into public.page_versions
        (page_id, site_id, version_number, snapshot, created_by, site_version_id, path, title)
      values
        ((v_page ->> 'id')::uuid, p_site, p_number, v_page, app.current_user_id(), p_version,
         v_page ->> 'path', v_page ->> 'title')
      on conflict (page_id, version_number) do nothing;
    end if;
  end loop;
end;
$$;

create or replace function app.publish_site(
  p_site  uuid,
  p_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app, extensions, pg_catalog
as $$
declare
  v_site       public.sites%rowtype;
  v_snapshot   jsonb;
  v_hash       text;
  v_next       int;
  v_version_id uuid;
  v_actor      uuid := app.current_user_id();
  v_kind       text;
begin
  select * into v_site from public.sites where id = p_site for update;
  if not found then
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;

  if not (app.can_publish_site(p_site) or app.is_platform_admin()) then
    raise exception 'Droit de publication requis' using errcode = '42501';
  end if;

  if v_site.archived_at is not null or v_site.status in ('suspended', 'archived') then
    raise exception 'Un site archive ou suspendu ne peut pas etre publie'
      using errcode = '23514';
  end if;

  -- Filet de derniere ligne : l'interface verifie beaucoup plus, mais un site
  -- sans page d'accueil ne doit jamais partir en ligne, quel que soit le chemin.
  if not exists (select 1 from public.site_pages
                  where site_id = p_site and path = '/' and is_published
                    and deleted_at is null) then
    raise exception 'stax:no_home'
      using errcode = '23514',
            hint = 'Votre site doit avoir une page d''accueil publiee.';
  end if;

  v_snapshot := app.build_site_snapshot(p_site);
  v_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');
  v_kind := app.actor_kind(v_site.organization_id);

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.site_versions where site_id = p_site;

  insert into public.site_versions
    (site_id, version_number, label, snapshot, content_hash,
     published_at, published_by, created_by, source, draft_state, actor_kind)
  values
    (p_site, v_next, p_label, v_snapshot, v_hash, now(), v_actor, v_actor,
     case when v_site.published_version_id is null then 'initial' else 'publish' end,
     app.build_draft_state(p_site), v_kind)
  returning id into v_version_id;

  perform app.record_page_versions(p_site, v_version_id, v_next, v_snapshot);

  -- Bascule atomique : la version servie change dans la meme transaction que
  -- sa creation. Un visiteur voit l'ancienne ou la nouvelle, jamais un melange.
  update public.sites
     set published_version_id = v_version_id,
         last_published_at = now(),
         first_published_at = coalesce(first_published_at, now())
   where id = p_site;

  perform app.bring_site_live(p_site);

  -- La mise en ligne initiale ouvre la fenetre de retractation commerciale.
  update public.projects
     set go_live_at = coalesce(go_live_at, now()),
         published_at = coalesce(published_at, now())
   where site_id = p_site;

  insert into public.audit_logs (actor_id, actor_type, organization_id, site_id,
                                 action, target_type, target_id, metadata_safe)
  values (v_actor,
          case when v_kind = 'stax' then 'platform_staff' else 'user' end,
          v_site.organization_id, p_site, 'site.published', 'site_version',
          v_version_id::text,
          jsonb_build_object('version', v_next, 'hash', v_hash, 'actor_kind', v_kind));

  return v_version_id;
end;
$$;

/** Remet en ligne une version anterieure, sous un NOUVEAU numero. */
create or replace function app.rollback_site(p_site uuid, p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, app, extensions, pg_catalog
as $$
declare
  v_site     public.sites%rowtype;
  v_source   public.site_versions%rowtype;
  v_next     int;
  v_new_id   uuid;
  v_actor    uuid := app.current_user_id();
  v_kind     text;
begin
  select * into v_site from public.sites where id = p_site for update;
  if not found then
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;

  if not (app.can_publish_site(p_site) or app.is_platform_admin()) then
    raise exception 'Droit de publication requis' using errcode = '42501';
  end if;

  if v_site.archived_at is not null or v_site.status in ('suspended', 'archived') then
    raise exception 'Un site archive ou suspendu ne peut pas etre publie'
      using errcode = '23514';
  end if;

  select * into v_source
    from public.site_versions where id = p_version_id and site_id = p_site;
  if not found or v_source.published_at is null then
    raise exception 'Version introuvable pour ce site' using errcode = 'P0002';
  end if;

  v_kind := app.actor_kind(v_site.organization_id);
  select coalesce(max(version_number), 0) + 1 into v_next
    from public.site_versions where site_id = p_site;

  insert into public.site_versions
    (site_id, version_number, label, snapshot, content_hash,
     published_at, published_by, created_by, source, draft_state, actor_kind,
     restored_from_version_id)
  values
    (p_site, v_next,
     'Retour à la version ' || v_source.version_number,
     v_source.snapshot, v_source.content_hash, now(), v_actor, v_actor, 'rollback',
     coalesce(v_source.draft_state, app.snapshot_to_draft_state(v_source.snapshot)),
     v_kind, v_source.id)
  returning id into v_new_id;

  perform app.record_page_versions(p_site, v_new_id, v_next, v_source.snapshot);

  update public.sites
     set published_version_id = v_new_id, last_published_at = now()
   where id = p_site;

  perform app.bring_site_live(p_site);

  insert into public.audit_logs (actor_id, actor_type, organization_id, site_id,
                                 action, target_type, target_id, metadata_safe)
  values (v_actor,
          case when v_kind = 'stax' then 'platform_staff' else 'user' end,
          v_site.organization_id, p_site, 'site.rolled_back', 'site_version', v_new_id::text,
          jsonb_build_object('restored_from', v_source.version_number, 'version', v_next,
                             'actor_kind', v_kind));

  return v_new_id;
end;
$$;

create or replace function app.draft_site_snapshot(p_site uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, extensions, pg_catalog
as $$
begin
  if not (app.can_edit_site(p_site) or app.is_platform_staff()) then
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;
  return app.build_site_snapshot(p_site);
end;
$$;

/** Instantane d'une version publiee, pour « Voir » depuis l'historique. */
create or replace function app.version_snapshot(p_site uuid, p_version uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_snapshot jsonb;
begin
  if not (app.can_edit_site(p_site) or app.is_platform_staff()) then
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;
  select snapshot into v_snapshot from public.site_versions
   where id = p_version and site_id = p_site;
  if v_snapshot is null then
    raise exception 'Version introuvable' using errcode = 'P0002';
  end if;
  return v_snapshot;
end;
$$;

/** Etat de brouillon d'une version ou d'un point de sauvegarde, pour comparer. */
create or replace function app.history_state(p_site uuid, p_kind text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_state jsonb;
begin
  if not (app.can_edit_site(p_site) or app.is_platform_staff()) then
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;
  if p_kind = 'version' then
    select coalesce(draft_state, app.snapshot_to_draft_state(snapshot)) into v_state
      from public.site_versions where id = p_id and site_id = p_site;
  elsif p_kind = 'checkpoint' then
    select state into v_state from public.draft_checkpoints where id = p_id and site_id = p_site;
  elsif p_kind = 'draft' then
    v_state := app.build_draft_state(p_site);
  end if;
  if v_state is null then
    raise exception 'Etat introuvable' using errcode = 'P0002';
  end if;
  return v_state;
end;
$$;

-- -----------------------------------------------------------------------------
--  Resolution publique : le numero de version sert d'en-tete de controle
-- -----------------------------------------------------------------------------
drop function if exists public.resolve_published_site(text);
drop function if exists app.resolve_published_site(text);

create or replace function app.resolve_published_site(p_hostname text)
returns table (
  site_id        uuid,
  organization_id uuid,
  site_status    app.site_status,
  domain_status  app.domain_status,
  version_id     uuid,
  version_number int,
  content_hash   text,
  snapshot       jsonb,
  enabled_modules text[],
  timezone       text,
  is_demo        boolean,
  has_customer_accounts boolean
)
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select s.id,
         s.organization_id,
         s.status,
         d.status,
         v.id,
         v.version_number,
         v.content_hash,
         v.snapshot,
         coalesce(ss.enabled_modules, '{}'),
         s.timezone,
         s.is_demo,
         app.has_feature(s.organization_id, 'customer_accounts')
    from public.site_domains d
    join public.sites s on s.id = d.site_id
    left join public.site_versions v on v.id = s.published_version_id
    left join public.site_settings ss on ss.site_id = s.id
   where d.hostname = lower(p_hostname)
     and d.status <> 'detached'
   limit 1;
$$;

create or replace function public.resolve_published_site(p_hostname text)
returns table (
  site_id        uuid,
  organization_id uuid,
  site_status    app.site_status,
  domain_status  app.domain_status,
  version_id     uuid,
  version_number int,
  content_hash   text,
  snapshot       jsonb,
  enabled_modules text[],
  timezone       text,
  is_demo        boolean,
  has_customer_accounts boolean
)
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select * from app.resolve_published_site(p_hostname);
$$;

revoke all on function app.resolve_published_site(text) from public, anon, authenticated;
revoke all on function public.resolve_published_site(text) from public, anon, authenticated;
grant execute on function public.resolve_published_site(text) to service_role;

comment on function public.resolve_published_site(text) is
  'Version publiee servie pour un nom d''hote. Reserve au moteur des sites (cle de service).';

-- -----------------------------------------------------------------------------
--  Quotas : une page dans la corbeille ne compte plus
-- -----------------------------------------------------------------------------
create or replace function app.usage_count(p_org uuid, p_feature text)
returns integer
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select case p_feature
    when 'max_pages' then (
      select count(*)::int from public.site_pages p
        join public.sites s on s.id = p.site_id
       where s.organization_id = p_org and s.archived_at is null and p.deleted_at is null)
    when 'max_team_members' then (
      select count(*)::int from public.organization_members
       where organization_id = p_org)
    when 'max_products' then (
      select count(*)::int from public.products where organization_id = p_org)
    when 'max_media_mb' then (
      select coalesce(ceil(sum(size_bytes) / 1048576.0), 0)::int
        from public.media where organization_id = p_org)
    when 'max_monthly_submissions' then (
      select count(*)::int from public.form_submissions
       where organization_id = p_org and created_at >= date_trunc('month', now()))
    when 'max_sites' then (
      select count(*)::int from public.sites
       where organization_id = p_org and archived_at is null)
    else 0
  end;
$$;

-- -----------------------------------------------------------------------------
--  Surface RPC
-- -----------------------------------------------------------------------------
create or replace function public.editor_commit(
  p_page uuid, p_blocks jsonb, p_action text, p_label text,
  p_block uuid default null, p_base_seq int default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.editor_commit(p_page, p_blocks, p_action, p_label, p_block, p_base_seq);
$$;

create or replace function public.editor_undo(p_page uuid)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.editor_undo(p_page);
$$;

create or replace function public.editor_redo(p_page uuid)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.editor_redo(p_page);
$$;

create or replace function public.editor_status(p_page uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, app, pg_catalog as $$
begin
  if not app.can_edit_site((select site_id from public.site_pages where id = p_page)) then
    raise exception 'Page introuvable' using errcode = 'P0002';
  end if;
  return app.editor_status(p_page);
end;
$$;

create or replace function public.restore_version_to_draft(p_site uuid, p_version uuid)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.restore_version_to_draft(p_site, p_version);
$$;

create or replace function public.restore_checkpoint_to_draft(p_site uuid, p_checkpoint uuid)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.restore_checkpoint_to_draft(p_site, p_checkpoint);
$$;

create or replace function public.trash_page(p_page uuid)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.trash_page(p_page);
$$;

create or replace function public.restore_page(p_page uuid)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.restore_page(p_page);
$$;

create or replace function public.purge_trash_item(p_kind text, p_id uuid)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.purge_trash_item(p_kind, p_id);
$$;

create or replace function public.version_snapshot(p_site uuid, p_version uuid)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.version_snapshot(p_site, p_version);
$$;

create or replace function public.history_state(p_site uuid, p_kind text, p_id uuid)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.history_state(p_site, p_kind, p_id);
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.editor_commit(uuid, jsonb, text, text, uuid, int)',
    'public.editor_undo(uuid)',
    'public.editor_redo(uuid)',
    'public.editor_status(uuid)',
    'public.restore_version_to_draft(uuid, uuid)',
    'public.restore_checkpoint_to_draft(uuid, uuid)',
    'public.trash_page(uuid)',
    'public.restore_page(uuid)',
    'public.purge_trash_item(text, uuid)',
    'public.version_snapshot(uuid, uuid)',
    'public.history_state(uuid, text, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;

  -- Les fonctions internes ne sont appelables que par leurs enveloppes.
  foreach fn in array array[
    'app.apply_page_state(uuid, jsonb, uuid)',
    'app.editor_prepare(uuid, int)',
    'app.editor_record(uuid, text, text, uuid, boolean)',
    'app.touch_draft(uuid)',
    'app.checkpoint_draft(uuid, text, text)',
    'app.apply_draft_state(uuid, jsonb, text)',
    'app.bring_site_live(uuid)',
    'app.record_page_versions(uuid, uuid, int, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
--  RLS des nouvelles tables : lecture par les membres et l'equipe, ecriture
--  uniquement par les fonctions ci-dessus.
-- -----------------------------------------------------------------------------
alter table public.editor_revisions enable row level security;
alter table public.draft_checkpoints enable row level security;

create policy editor_revisions_select on public.editor_revisions
  for select to authenticated
  using (app.is_site_member(site_id) or app.is_platform_staff());

create policy draft_checkpoints_select on public.draft_checkpoints
  for select to authenticated
  using (app.is_site_member(site_id) or app.is_platform_staff());

revoke all on table public.editor_revisions from anon, authenticated;
revoke all on table public.draft_checkpoints from anon, authenticated;
grant select on table public.editor_revisions to authenticated;
grant select on table public.draft_checkpoints to authenticated;

-- Les versions publiees ne s'ecrivent QUE par publish_site / rollback_site.
drop policy if exists site_versions_insert on public.site_versions;
drop policy if exists page_versions_insert on public.page_versions;
revoke insert, update, delete on table public.site_versions from anon, authenticated;
revoke insert, update, delete on table public.page_versions from anon, authenticated;

-- =============================================================================
--  StaX — 0008 · Fonctions de domaine
--  Operations atomiques et resolution des droits. Ces fonctions sont la
--  frontiere de securite cote base : elles verifient elles-memes les droits,
--  meme lorsqu'elles sont SECURITY DEFINER.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Acces aux sites
-- -----------------------------------------------------------------------------
create or replace function app.site_org(p_site uuid)
returns uuid
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select organization_id from public.sites where id = p_site;
$$;

create or replace function app.site_can(p_site uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(app.org_can(app.site_org(p_site), p_capability), false);
$$;

create or replace function app.is_site_member(p_site uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(app.is_org_member(app.site_org(p_site)), false);
$$;

-- -----------------------------------------------------------------------------
--  Resolution des droits d'offre — la verification existe cote serveur
-- -----------------------------------------------------------------------------
create or replace function app.organization_plan_id(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  -- L'offre de reference d'une organisation est celle de son site le plus haut
  -- de gamme encore actif (un client peut avoir plusieurs sites).
  select s.plan_id
    from public.sites s
    join public.plans p on p.id = s.plan_id
   where s.organization_id = p_org
     and s.archived_at is null
   order by p.setup_price_cents desc, s.created_at asc
   limit 1;
$$;

/**
 * Droit d'offre effectif : plan_features, puis derogation eventuelle.
 * Appele par hasFeature() cote TypeScript ET par les policies RLS.
 */
create or replace function app.has_feature(p_org uuid, p_feature text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_plan uuid;
  v_enabled boolean;
  v_override boolean;
  v_expires timestamptz;
begin
  select o.enabled, o.expires_at into v_override, v_expires
    from public.organization_feature_overrides o
   where o.organization_id = p_org and o.feature_key = p_feature;

  if v_override is not null and (v_expires is null or v_expires > now()) then
    return v_override;
  end if;

  v_plan := app.organization_plan_id(p_org);
  if v_plan is null then
    return false;
  end if;

  select pf.enabled into v_enabled
    from public.plan_features pf
   where pf.plan_id = v_plan and pf.feature_key = p_feature;

  return coalesce(v_enabled, false);
end;
$$;

/** Quota effectif. NULL = illimite, -1 = fonctionnalite indisponible. */
create or replace function app.feature_limit(p_org uuid, p_feature text)
returns integer
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_plan uuid;
  v_limit integer;
  v_has_override boolean := false;
  v_override_limit integer;
  v_expires timestamptz;
begin
  select true, o.limit_value, o.expires_at
    into v_has_override, v_override_limit, v_expires
    from public.organization_feature_overrides o
   where o.organization_id = p_org and o.feature_key = p_feature;

  if v_has_override and v_override_limit is not null
     and (v_expires is null or v_expires > now()) then
    return v_override_limit;
  end if;

  if not app.has_feature(p_org, p_feature) then
    return -1;
  end if;

  v_plan := app.organization_plan_id(p_org);
  select pf.limit_value into v_limit
    from public.plan_features pf
   where pf.plan_id = v_plan and pf.feature_key = p_feature;

  return v_limit;
end;
$$;

-- -----------------------------------------------------------------------------
--  Codes d'activation — consommation atomique
-- -----------------------------------------------------------------------------
create type app.activation_result as (
  ok               boolean,
  reason           text,
  organization_id  uuid,
  site_id          uuid,
  granted_role     app.org_role
);

/**
 * Consomme un code d'activation dans une seule transaction :
 * verrouillage de la ligne, controle d'expiration, de revocation, de la
 * contrainte d'email et du nombre de tentatives, creation de l'appartenance,
 * marquage du code comme consomme. Le code devient definitivement inutilisable.
 */
create or replace function app.redeem_activation_code(
  p_code_hash text,
  p_user_id   uuid,
  p_email     text
)
returns app.activation_result
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_code   public.activation_codes%rowtype;
  v_result app.activation_result;
begin
  v_result := (false, 'invalid', null, null, null)::app.activation_result;

  select * into v_code
    from public.activation_codes
   where code_hash = p_code_hash
   for update;

  if not found then
    -- Reponse volontairement identique a « code invalide » : pas d'oracle.
    return v_result;
  end if;

  update public.activation_codes
     set attempt_count = attempt_count + 1,
         last_attempt_at = now()
   where id = v_code.id;

  if v_code.attempt_count >= 10 then
    return (false, 'too_many_attempts', null, null, null)::app.activation_result;
  end if;
  if v_code.revoked_at is not null then
    return (false, 'revoked', null, null, null)::app.activation_result;
  end if;
  if v_code.used_at is not null then
    return (false, 'already_used', null, null, null)::app.activation_result;
  end if;
  if v_code.expires_at <= now() then
    return (false, 'expired', null, null, null)::app.activation_result;
  end if;
  if v_code.email_constraint is not null
     and lower(v_code.email_constraint) <> lower(coalesce(p_email, '')) then
    return (false, 'email_mismatch', null, null, null)::app.activation_result;
  end if;

  insert into public.organization_members (organization_id, user_id, role, invited_by)
  values (v_code.organization_id, p_user_id, v_code.granted_role, v_code.created_by)
  on conflict (organization_id, user_id) do update
    set role = case
      when public.organization_members.role = 'owner' then 'owner'::app.org_role
      else excluded.role
    end;

  update public.activation_codes
     set used_at = now(), used_by = p_user_id
   where id = v_code.id;

  insert into public.audit_logs (actor_id, actor_type, organization_id, site_id,
                                 action, target_type, target_id, metadata_safe)
  values (p_user_id, 'user', v_code.organization_id, v_code.site_id,
          'activation_code.used', 'activation_code', v_code.id::text,
          jsonb_build_object('granted_role', v_code.granted_role, 'hint', v_code.code_hint));

  return (true, 'ok', v_code.organization_id, v_code.site_id, v_code.granted_role)
         ::app.activation_result;
end;
$$;

revoke all on function app.redeem_activation_code(text, uuid, text) from public, anon;

-- -----------------------------------------------------------------------------
--  Publication d'un site — snapshot atomique et immuable
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
          'logoUrl', lm.storage_path,
          'faviconUrl', fm.storage_path
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
                      where b.page_id = p.id and b.is_visible
                    ), '[]'::jsonb)
                  ) as page_json
             from public.site_pages p
            where p.site_id = s.id and p.is_published
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
begin
  select * into v_site from public.sites where id = p_site for update;
  if not found then
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;

  if not (app.site_can(p_site, 'content.publish') or app.is_platform_admin()) then
    raise exception 'Droit de publication requis' using errcode = '42501';
  end if;

  if v_site.archived_at is not null or v_site.status = 'suspended' then
    raise exception 'Un site archive ou suspendu ne peut pas etre publie'
      using errcode = '23514';
  end if;

  v_snapshot := app.build_site_snapshot(p_site);
  v_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.site_versions where site_id = p_site;

  insert into public.site_versions
    (site_id, version_number, label, snapshot, content_hash,
     published_at, published_by, created_by)
  values
    (p_site, v_next, p_label, v_snapshot, v_hash, now(), v_actor, v_actor)
  returning id into v_version_id;

  update public.sites
     set published_version_id = v_version_id,
         last_published_at = now(),
         first_published_at = coalesce(first_published_at, now()),
         status = case when status = 'live' then status else 'live' end
   where id = p_site;

  -- La mise en ligne initiale ouvre la fenetre de retractation commerciale.
  update public.projects
     set go_live_at = coalesce(go_live_at, now()),
         published_at = coalesce(published_at, now())
   where site_id = p_site;

  insert into public.audit_logs (actor_id, actor_type, organization_id, site_id,
                                 action, target_type, target_id, metadata_safe)
  values (v_actor,
          case when app.is_platform_staff() then 'platform_staff' else 'user' end,
          v_site.organization_id, p_site, 'site.published', 'site_version',
          v_version_id::text,
          jsonb_build_object('version', v_next, 'hash', v_hash));

  return v_version_id;
end;
$$;

/** Restaure une version anterieure en la republiant sous un nouveau numero. */
create or replace function app.rollback_site(p_site uuid, p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, app, extensions, pg_catalog
as $$
declare
  v_source   public.site_versions%rowtype;
  v_next     int;
  v_new_id   uuid;
  v_actor    uuid := app.current_user_id();
  v_org      uuid := app.site_org(p_site);
begin
  if not (app.site_can(p_site, 'content.publish') or app.is_platform_admin()) then
    raise exception 'Droit de publication requis' using errcode = '42501';
  end if;

  select * into v_source
    from public.site_versions where id = p_version_id and site_id = p_site;
  if not found then
    raise exception 'Version introuvable pour ce site' using errcode = 'P0002';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.site_versions where site_id = p_site;

  insert into public.site_versions
    (site_id, version_number, label, snapshot, content_hash,
     published_at, published_by, created_by)
  values
    (p_site, v_next,
     'Restauration de la version ' || v_source.version_number,
     v_source.snapshot, v_source.content_hash, now(), v_actor, v_actor)
  returning id into v_new_id;

  update public.sites
     set published_version_id = v_new_id, last_published_at = now()
   where id = p_site;

  insert into public.audit_logs (actor_id, actor_type, organization_id, site_id,
                                 action, target_type, target_id, metadata_safe)
  values (v_actor,
          case when app.is_platform_staff() then 'platform_staff' else 'user' end,
          v_org, p_site, 'site.rolled_back', 'site_version', v_new_id::text,
          jsonb_build_object('restored_from', v_source.version_number));

  return v_new_id;
end;
$$;

-- -----------------------------------------------------------------------------
--  Resolution d'un hostname vers le contenu publie (runtime des sites)
--  Appelee exclusivement par le service role depuis le Worker : le navigateur
--  ne peut JAMAIS designer lui-meme le tenant a servir.
-- -----------------------------------------------------------------------------
create or replace function app.resolve_published_site(p_hostname text)
returns table (
  site_id        uuid,
  organization_id uuid,
  site_status    app.site_status,
  domain_status  app.domain_status,
  version_id     uuid,
  content_hash   text,
  snapshot       jsonb,
  enabled_modules text[],
  timezone       text,
  is_demo        boolean
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
         v.content_hash,
         v.snapshot,
         coalesce(ss.enabled_modules, '{}'),
         s.timezone,
         s.is_demo
    from public.site_domains d
    join public.sites s on s.id = d.site_id
    left join public.site_versions v on v.id = s.published_version_id
    left join public.site_settings ss on ss.site_id = s.id
   where d.hostname = lower(p_hostname)
     and d.status <> 'detached'
   limit 1;
$$;

revoke all on function app.resolve_published_site(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
--  Journalisation d'audit depuis la couche applicative
-- -----------------------------------------------------------------------------
create or replace function app.write_audit(
  p_action      text,
  p_org         uuid default null,
  p_site        uuid default null,
  p_target_type text default null,
  p_target_id   text default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_id uuid;
  v_actor uuid := app.current_user_id();
  v_email text;
begin
  select email into v_email from public.profiles where id = v_actor;

  insert into public.audit_logs
    (actor_id, actor_email, actor_type, organization_id, site_id,
     action, target_type, target_id, metadata_safe)
  values
    (v_actor, v_email,
     case when v_actor is null then 'system'
          when app.is_platform_staff() then 'platform_staff'
          else 'user' end,
     p_org, p_site, p_action, p_target_type, p_target_id,
     -- Filet de securite : aucune cle sensible ne rentre dans un journal.
     (p_metadata - 'password' - 'token' - 'secret' - 'code' - 'authorization'
                 - 'api_key' - 'client_secret'))
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
--  Utilisation des quotas — controle serveur
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
       where s.organization_id = p_org and s.archived_at is null)
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

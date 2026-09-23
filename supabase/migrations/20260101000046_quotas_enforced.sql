-- =============================================================================
--  StaX — 0046 · Des quotas appliques par la base, pas seulement affiches
--
--  Les cartes tarifaires annoncent des limites : pages, collaborateurs,
--  produits, espace medias, formulaires, langues. Jusqu'ici seule la limite de
--  pages etait appliquee (et seulement au moteur historique). Une limite
--  affichee mais non appliquee est une promesse fausse dans les deux sens :
--  le client croit avoir moins que ce qu'il a, ou plus que ce qu'il paie.
--
--  Regles :
--   - l'usage est compte en base, au meme endroit que la limite est lue ;
--   - les pages d'un site developpe independamment sont celles que declare
--     son contrat d'edition (chaque page est concue et developpee par l'equipe) ;
--   - l'equipe StaX ne compte jamais dans les collaborateurs d'un client ;
--   - l'equipe StaX qui construit un site n'est pas bloquee par les quotas du
--     client (elle les verifie a la livraison : checklist « offre appliquee »).
-- =============================================================================

create or replace function app.usage_count(p_org uuid, p_feature text)
returns integer
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select case p_feature
    when 'max_pages' then (
      (select count(*)::int from public.site_pages p
         join public.sites s on s.id = p.site_id
        where s.organization_id = p_org and s.archived_at is null
          and s.architecture = 'legacy_engine' and p.deleted_at is null)
      + (select coalesce(sum((m.summary ->> 'pages')::int), 0)::int
           from public.site_manifests m
           join public.sites s on s.id = m.site_id
          where s.organization_id = p_org and s.archived_at is null and m.is_active))
    when 'max_team_members' then (
      (select count(*)::int from public.organization_members m
         join public.profiles p on p.id = m.user_id
        where m.organization_id = p_org and p.platform_role is null)
      + (select count(*)::int from public.organization_invitations i
          where i.organization_id = p_org and i.accepted_at is null
            and i.revoked_at is null and i.expires_at > now()))
    when 'max_products' then (
      select count(*)::int from public.products where organization_id = p_org)
    when 'max_media_mb' then (
      select coalesce(ceil(sum(size_bytes) / 1048576.0), 0)::int
        from public.media where organization_id = p_org)
    when 'max_forms' then (
      select count(*)::int from public.forms f
        join public.sites s on s.id = f.site_id
       where f.organization_id = p_org and f.is_active and s.archived_at is null)
    when 'max_locales' then (
      select coalesce(max((m.summary ->> 'locales')::int), 1)::int
        from public.site_manifests m
        join public.sites s on s.id = m.site_id
       where s.organization_id = p_org and s.archived_at is null and m.is_active)
    else 0
  end;
$$;

-- Limite applicable : NULL = illimite, -1 = non incluse (ou pas encore
-- d'offre). `p_strict` : une organisation sans offre est-elle refusee ?
create or replace function app.quota_exceeded(
  p_org      uuid,
  p_feature  text,
  p_adding   integer default 1,
  p_strict   boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_limit integer;
begin
  if app.organization_plan_id(p_org) is null and not app.org_has_all_features(p_org) then
    return p_strict;
  end if;
  v_limit := app.feature_limit(p_org, p_feature);
  if v_limit is null then
    return false;
  end if;
  if v_limit < 0 then
    return true;
  end if;
  return app.usage_count(p_org, p_feature) + p_adding > v_limit;
end;
$$;

-- -----------------------------------------------------------------------------
--  Collaborateurs
-- -----------------------------------------------------------------------------
create or replace function app.enforce_member_quota()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_limit integer;
begin
  if app.is_service_role() or app.is_platform_admin() then
    return new;
  end if;
  -- L'equipe StaX ne consomme jamais le quota d'un client.
  if exists (select 1 from public.profiles where id = new.user_id and platform_role is not null) then
    return new;
  end if;
  -- Une invitation a deja ete comptee a son envoi : l'accepter ne consomme
  -- pas une seconde place.
  if exists (select 1 from public.organization_invitations i
              where i.organization_id = new.organization_id and i.accepted_by = new.user_id)
     or exists (select 1 from public.organization_invitations i
                  join public.profiles p on lower(p.email) = lower(i.email)
                 where i.organization_id = new.organization_id and p.id = new.user_id
                   and i.accepted_at is null and i.revoked_at is null
                   and i.expires_at > now()) then
    return new;
  end if;
  if app.quota_exceeded(new.organization_id, 'max_team_members') then
    v_limit := app.feature_limit(new.organization_id, 'max_team_members');
    raise exception 'Limite de % collaborateurs atteinte pour votre offre', greatest(v_limit, 0)
      using errcode = '23514', hint = 'Retirez un collaborateur ou passez a une offre superieure.';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_members_quota on public.organization_members;
create trigger organization_members_quota
  before insert on public.organization_members
  for each row execute function app.enforce_member_quota();

create or replace function app.enforce_invitation_quota()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_limit integer;
begin
  if app.is_service_role() or app.is_platform_admin() then
    return new;
  end if;
  if app.quota_exceeded(new.organization_id, 'max_team_members') then
    v_limit := app.feature_limit(new.organization_id, 'max_team_members');
    raise exception 'Limite de % collaborateurs atteinte pour votre offre', greatest(v_limit, 0)
      using errcode = '23514', hint = 'Retirez un collaborateur ou passez a une offre superieure.';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_invitations_quota on public.organization_invitations;
create trigger organization_invitations_quota
  before insert on public.organization_invitations
  for each row execute function app.enforce_invitation_quota();

-- -----------------------------------------------------------------------------
--  Produits : la boutique est un droit d'offre, et le catalogue a une taille
-- -----------------------------------------------------------------------------
create or replace function app.enforce_product_quota()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_limit integer;
begin
  if app.is_service_role() then
    return new;
  end if;
  if not app.has_feature(new.organization_id, 'ecommerce') then
    raise exception 'La boutique en ligne n''est pas incluse dans votre offre'
      using errcode = '23514';
  end if;
  if app.quota_exceeded(new.organization_id, 'max_products', 1, true) then
    v_limit := app.feature_limit(new.organization_id, 'max_products');
    raise exception 'Limite de % produits atteinte pour votre offre', greatest(v_limit, 0)
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists products_quota on public.products;
create trigger products_quota
  before insert on public.products
  for each row execute function app.enforce_product_quota();

-- -----------------------------------------------------------------------------
--  Formulaires
-- -----------------------------------------------------------------------------
create or replace function app.enforce_form_quota()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_limit integer;
begin
  if app.is_service_role() or app.is_platform_site_editor() or not new.is_active then
    return new;
  end if;
  if app.quota_exceeded(new.organization_id, 'max_forms') then
    v_limit := app.feature_limit(new.organization_id, 'max_forms');
    raise exception 'Limite de % formulaires atteinte pour votre offre', greatest(v_limit, 0)
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists forms_quota on public.forms;
create trigger forms_quota
  before insert on public.forms
  for each row execute function app.enforce_form_quota();

-- -----------------------------------------------------------------------------
--  Espace medias
-- -----------------------------------------------------------------------------
create or replace function app.enforce_media_quota()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_limit integer;
  v_used  bigint;
begin
  if app.is_service_role() or app.is_platform_site_editor() then
    return new;
  end if;
  if app.organization_plan_id(new.organization_id) is null
     and not app.org_has_all_features(new.organization_id) then
    return new;
  end if;
  v_limit := app.feature_limit(new.organization_id, 'max_media_mb');
  if v_limit is null then
    return new;
  end if;
  select coalesce(sum(size_bytes), 0) into v_used
    from public.media where organization_id = new.organization_id;
  if v_limit < 0 or v_used + new.size_bytes > v_limit::bigint * 1048576 then
    raise exception 'Espace de stockage de % Mo atteint pour votre offre', greatest(v_limit, 0)
      using errcode = '23514', hint = 'Supprimez definitivement des fichiers de la corbeille, '
                                     || 'ou passez a une offre superieure.';
  end if;
  return new;
end;
$$;

drop trigger if exists media_quota on public.media;
create trigger media_quota
  before insert on public.media
  for each row execute function app.enforce_media_quota();

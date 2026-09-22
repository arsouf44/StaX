-- =============================================================================
--  StaX — 0033 · L'equipe StaX intervient sur le site d'un client
--
--  L'equipe doit pouvoir creer, corriger, publier et restaurer le site d'un
--  client. Mais jamais « en passant » : un droit permanent sur tous les sites
--  serait un droit que personne ne voit.
--
--  La regle : un membre de l'equipe (proprietaire, admin, designer, support)
--  obtient les droits de contenu d'un administrateur de l'organisation
--  UNIQUEMENT pendant une session d'assistance ouverte sur cette
--  organisation — motif obligatoire, duree limitee, visible par le client.
--  Les droits financiers, les membres et la suppression ne sont jamais
--  accordes par ce biais.
--
--  Tout passe par `app.org_can`, donc par TOUTES les policies RLS et toutes
--  les fonctions qui l'utilisent : aucun chemin parallele a maintenir.
-- =============================================================================

create or replace function app.has_active_support_session(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(
    app.is_platform_site_editor()
    and exists (
      select 1 from public.impersonation_sessions s
       where s.staff_id = app.current_user_id()
         and s.organization_id = p_org
         and s.ended_at is null
         and s.expires_at > now()
    ),
    false);
$$;

create or replace function app.org_can(p_org uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(case app.org_role(p_org)
    when 'owner'   then p_capability in (
      'org.view','org.manage','org.delete','members.manage','content.view','content.edit',
      'content.publish','inbox.view','inbox.manage','commerce.view','commerce.manage',
      'billing.view','billing.manage','analytics.view','domain.manage','media.manage',
      'payments.connect','data.export','support.manage'
    )
    when 'admin'   then p_capability in (
      'org.view','org.manage','members.manage','content.view','content.edit',
      'content.publish','inbox.view','inbox.manage','commerce.view','commerce.manage',
      'billing.view','analytics.view','domain.manage','media.manage','data.export',
      'support.manage'
    )
    when 'editor'  then p_capability in (
      'org.view','content.view','content.edit','content.publish','inbox.view','inbox.manage',
      'commerce.view','commerce.manage','analytics.view','media.manage','support.manage'
    )
    when 'billing' then p_capability in (
      'org.view','billing.view','billing.manage','analytics.view','data.export'
    )
    when 'viewer'  then p_capability in (
      'org.view','content.view','inbox.view','commerce.view','analytics.view'
    )
    else false
  end, false)
  or (
    -- Session d'assistance ouverte : droits de CONTENU seulement.
    p_capability in (
      'org.view','content.view','content.edit','content.publish','inbox.view',
      'commerce.view','analytics.view','media.manage','domain.manage'
    )
    and app.has_active_support_session(p_org)
  );
$$;

-- L'editeur, la publication et la restauration suivent la meme regle :
-- membre de l'organisation avec le droit, ou equipe StaX en session.
create or replace function app.can_edit_site(p_site uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(app.site_can(p_site, 'content.edit') or app.is_platform_admin(), false);
$$;

create or replace function app.can_publish_site(p_site uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(app.site_can(p_site, 'content.publish') or app.is_platform_admin(), false);
$$;

-- Une personne de l'equipe en session voit l'organisation comme un membre :
-- `is_org_member` alimente les lectures de l'espace client.
create or replace function app.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select exists (
    select 1 from public.organization_members m
     where m.organization_id = p_org and m.user_id = app.current_user_id()
  ) or app.has_active_support_session(p_org);
$$;

-- Le stockage des photos applique la meme regle via `app.org_can`
-- (migration 0032) : rien a changer ici.

comment on function app.has_active_support_session(uuid) is
  'Vrai si la personne connectee est de l''equipe StaX (proprietaire, admin, designer, '
  'support) ET a une session d''assistance ouverte sur cette organisation.';

-- L'auteur d'une modification : un vrai membre, ou l'equipe StaX (meme en
-- session d'assistance, ou elle « voit » l'organisation comme un membre).
create or replace function app.actor_kind(p_org uuid)
returns text
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select case
    when app.current_user_id() is null then 'system'
    when app.org_role(p_org) is not null then 'member'
    when app.is_platform_staff() then 'stax'
    else 'system'
  end;
$$;

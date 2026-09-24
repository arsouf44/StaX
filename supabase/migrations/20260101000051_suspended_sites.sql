-- =============================================================================
-- StaX — Sites suspendus : ni edition, ni publication
--
-- La suspension d'un site (defaut de paiement persistant, contenu illicite,
-- fin de la periode de continuite) s'exprimait de deux facons : le statut
-- `suspended` — pose par les parcours historiques — et la date `suspended_at`.
-- `request_site_release` ne regardait que la date : un site au STATUT
-- suspendu pouvait encore etre modifie et publie par le client, et une
-- publication deja en file d'attente partait en production.
--
-- Desormais :
--   - `app.site_is_available` est la seule definition d'un site disponible
--     (ni archive, ni suspendu, quelle que soit la facon dont il l'a ete) ;
--   - le client d'un site indisponible perd l'edition, l'apercu et la
--     publication (`app.site_content_access`), la lecture de son historique
--     restant intacte ;
--   - une publication en file d'attente pour un site devenu indisponible
--     echoue a sa prise en charge, avec une erreur claire, au lieu d'etre
--     deployee.
-- =============================================================================

create or replace function app.site_is_available(p_site uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select exists (
    select 1 from public.sites s
     where s.id = p_site
       and s.archived_at is null
       and s.suspended_at is null
       and s.status <> 'suspended');
$$;

comment on function app.site_is_available(uuid) is
  'Vrai si le site n''est ni archive ni suspendu (statut `suspended` ou date `suspended_at`).';

-- Le client n'edite et ne publie qu'un site livre ET disponible. Avant la
-- livraison, l'equipe StaX travaille sur le projet comme auparavant.
create or replace function app.site_content_access(p_site uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(
    (app.site_can(p_site, p_capability) and app.site_is_available(p_site))
    or (app.is_platform_site_editor()
        and exists (select 1 from public.sites s
                     where s.id = p_site and s.delivered_at is null and s.archived_at is null)),
    false);
$$;

-- Prise en charge d'une version par le serveur : une version en attente pour
-- un site devenu indisponible echoue, la production ne change pas.
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
  if not app.site_is_available(v_release.site_id) then
    perform app.fail_site_release(p_release, 'configuration', 'site_unavailable',
      'Le site est suspendu : la publication n’a pas été effectuée.');
    return jsonb_build_object('ok', false, 'code', 'site_unavailable');
  end if;
  update public.site_releases set status = 'committing' where id = p_release;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function app.site_is_available(uuid) from public, anon;
grant execute on function app.site_is_available(uuid) to authenticated, service_role;
revoke all on function app.site_content_access(uuid, text) from public, anon;
revoke all on function app.claim_site_release(uuid) from public, anon, authenticated;

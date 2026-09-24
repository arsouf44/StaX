-- =============================================================================
--  StaX — 0052 · Durcissements relevés par les conseillers Supabase
--
--  Constats faits sur la base réelle, une fois 0042–0051 appliquées :
--
--   1. `public.write_audit` était exécutable par toute personne connectée,
--      pour n'importe quelle organisation : un client pouvait inscrire une
--      ligne dans le journal d'audit d'une autre société. L'auteur restait
--      tracé, mais un journal doit rester fiable. Désormais, hors serveur et
--      équipe StaX, on n'écrit que dans le journal de sa propre organisation,
--      et seulement pour un site de cette organisation.
--
--   2. `public.compute_order_pricing` était exécutable sans compte (`anon`).
--      Aucun écran public ne l'utilise : le prix d'une commande est calculé en
--      base au moment de la commande, par une personne connectée. Ouvert à
--      tous, il permettait de tester des codes promotionnels sans limite.
--
--   3. Clés étrangères sans index sur les tables du modèle actuel : la
--      suppression d'une organisation, d'un profil ou d'un contrat parcourait
--      toute la table. Index ajoutés.
--
--  Aucune migration précédente n'est modifiée.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Journal d'audit : chacun le sien
-- -----------------------------------------------------------------------------
create or replace function public.write_audit(
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
begin
  if not (app.is_service_role() or app.is_platform_staff()) then
    if app.current_user_id() is null then
      raise exception 'Authentification requise' using errcode = '42501';
    end if;
    if p_org is null or not app.is_org_member(p_org) then
      raise exception 'Journal reserve a votre organisation' using errcode = '42501';
    end if;
    if p_site is not null
       and not exists (select 1 from public.sites s
                        where s.id = p_site and s.organization_id = p_org) then
      raise exception 'Ce site n''appartient pas a votre organisation' using errcode = '42501';
    end if;
  end if;
  return app.write_audit(p_action, p_org, p_site, p_target_type, p_target_id, p_metadata);
end;
$$;

comment on function public.write_audit(text, uuid, uuid, text, text, jsonb) is
  'Ecrit une ligne d''audit. Serveur et equipe StaX : sans restriction. Client : uniquement '
  'dans le journal de sa propre organisation, pour un site de cette organisation.';

-- -----------------------------------------------------------------------------
--  2. Calcul du prix : réservé aux personnes connectées
-- -----------------------------------------------------------------------------
revoke execute on function public.compute_order_pricing(uuid, text) from anon;

-- -----------------------------------------------------------------------------
--  3. Index des clés étrangères du modèle actuel
-- -----------------------------------------------------------------------------
create index if not exists site_releases_org_idx        on public.site_releases (organization_id);
create index if not exists site_releases_manifest_idx   on public.site_releases (manifest_id);
create index if not exists site_releases_source_idx
  on public.site_releases (source_release_id) where source_release_id is not null;
create index if not exists site_releases_repository_idx on public.site_releases (repository_id);
create index if not exists site_releases_hosting_idx    on public.site_releases (hosting_id);
create index if not exists site_releases_deployment_idx
  on public.site_releases (deployment_id) where deployment_id is not null;
create index if not exists site_releases_created_by_idx on public.site_releases (created_by);

create index if not exists site_deployments_org_idx        on public.site_deployments (organization_id);
create index if not exists site_deployments_created_by_idx on public.site_deployments (created_by);

create index if not exists site_content_drafts_org_idx      on public.site_content_drafts (organization_id);
create index if not exists site_content_drafts_manifest_idx on public.site_content_drafts (manifest_id);
create index if not exists site_content_drafts_base_idx     on public.site_content_drafts (base_release_id);
create index if not exists site_content_drafts_updated_by_idx
  on public.site_content_drafts (updated_by);

create index if not exists site_manifests_org_idx         on public.site_manifests (organization_id);
create index if not exists site_manifests_repository_idx  on public.site_manifests (repository_id);
create index if not exists site_manifests_imported_by_idx on public.site_manifests (imported_by);

create index if not exists site_repositories_org_idx          on public.site_repositories (organization_id);
create index if not exists site_repositories_connected_by_idx on public.site_repositories (connected_by);

create index if not exists site_hosting_org_idx          on public.site_hosting (organization_id);
create index if not exists site_hosting_connected_by_idx on public.site_hosting (connected_by);

create index if not exists site_delivery_checks_checked_by_idx
  on public.site_delivery_checks (checked_by);

create index if not exists plan_inclusions_feature_idx
  on public.plan_inclusions (feature_key) where feature_key is not null;

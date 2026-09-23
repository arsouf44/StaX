-- =============================================================================
--  StaX — 0049 · Publication : confirmation tardive, et droits des modules
--
--  1. Une version declaree en echec parce que Cloudflare n'avait rien confirme
--     dans le delai (etape `timeout`) redevient PUBLIEE si Cloudflare confirme
--     ensuite le deploiement de SON commit — et seulement si aucune version
--     plus recente n'a ete publiee ou n'est en cours. Le statut affiche suit
--     toujours l'etat reel du site en ligne.
--  2. La checklist de livraison verifie aussi les modules de l'API des sites
--     declares par le contrat (reservations, boutique, paiement, comptes
--     clients) et le multilingue : un site ne peut pas etre livre avec un
--     module que l'offre du client ne comprend pas.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Machine a etats : echec par delai -> publie, sur confirmation reelle
-- -----------------------------------------------------------------------------
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
      -- Seule une version ecrite dans le depot, et declaree en echec faute de
      -- confirmation dans le delai, peut encore etre confirmee.
      when 'failed'     then case when old.error_stage = 'timeout' and old.commit_sha is not null
                                  then array['published'] else array[]::text[] end
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

create or replace function app.finalize_site_release(p_release uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_release public.site_releases%rowtype;
  v_late    boolean;
begin
  select * into v_release from public.site_releases where id = p_release for update;
  if not found then
    return false;
  end if;
  v_late := v_release.status = 'failed' and v_release.error_stage = 'timeout'
            and v_release.commit_sha is not null;
  if v_release.status <> 'deploying' and not v_late then
    return false;
  end if;
  -- Confirmation tardive : jamais par-dessus une version plus recente.
  if v_late and exists (select 1 from public.site_releases o
                         where o.site_id = v_release.site_id
                           and o.version_number > v_release.version_number
                           and o.status in ('queued', 'committing', 'deploying', 'published',
                                            'superseded')) then
    return false;
  end if;

  update public.site_releases
     set status = 'superseded', superseded_at = now()
   where site_id = v_release.site_id and status = 'published' and id <> v_release.id;

  update public.site_releases
     set status = 'published', published_at = now(),
         error_stage = case when v_late then null else error_stage end,
         error_code = case when v_late then null else error_code end,
         error_message = case when v_late then null else error_message end
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
      || 'déploiement' || case when v_late then ' (confirmation reçue en retard).' else '.' end,
    '/app/editeur', 'success');

  perform app.write_audit('site.release_published', v_release.organization_id,
                          v_release.site_id, 'site_release', v_release.id::text,
                          jsonb_build_object('version', v_release.version_number,
                                             'commit', v_release.commit_sha,
                                             'kind', v_release.kind,
                                             'late', v_late));
  return true;
end;
$$;

revoke all on function app.finalize_site_release(uuid) from public, anon, authenticated;

-- Etat d'un deploiement rapporte par Cloudflare (reprise de 0044, avec la
-- confirmation tardive).
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
    elsif v_release.status = 'failed' and v_release.error_stage = 'timeout'
          and p_status = 'success' and p_environment = 'production' then
      -- Cloudflare confirme apres le delai : la version est reellement en
      -- ligne, elle est donc publiee (si rien de plus recent ne l'a remplacee).
      perform app.finalize_site_release(v_release.id);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'deploymentId', v_deployment.id,
                            'status', v_deployment.status, 'releaseId', v_deployment.release_id);
end;
$$;

-- -----------------------------------------------------------------------------
--  2. Checklist de livraison : modules et langues couverts par l'offre
-- -----------------------------------------------------------------------------
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
  v_module    text;
  v_feature   text;
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
    -- Modules de l'API des sites utilises par le code du site : chacun exige
    -- le droit correspondant de l'offre.
    for v_module in
      select jsonb_array_elements_text(coalesce(v_manifest.summary -> 'modules', '[]'::jsonb))
    loop
      v_feature := case v_module
                     when 'booking' then 'bookings'
                     when 'products' then 'ecommerce'
                     when 'orders' then 'ecommerce'
                     when 'payments' then 'online_payments'
                     when 'donations' then 'online_payments'
                     when 'customer-accounts' then 'customer_accounts'
                   end;
      if v_feature is not null and not app.has_feature(v_site.organization_id, v_feature) then
        v_plan_ok := false;
        v_plan_msg := array_append(v_plan_msg,
                                   (format('Module « %s » non inclus dans l’offre.', v_module))::text);
      end if;
    end loop;
    if coalesce((v_manifest.summary ->> 'locales')::int, 1) > 1
       and not app.has_feature(v_site.organization_id, 'multi_language') then
      v_plan_ok := false;
      v_plan_msg := array_append(v_plan_msg, ('Site multilingue non inclus dans l’offre.')::text);
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

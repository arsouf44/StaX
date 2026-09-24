-- =============================================================================
--  StaX — 0047 · API des sites : les modules StaX au service d'un site
--  developpe independamment
--
--  Un site externe est servi par SON projet Cloudflare. Pour que les modules
--  que StaX gere (messages recus, reservations, boutique, comptes clients,
--  mesure d'audience) fonctionnent sur ce site, son code appelle l'API des
--  sites StaX. Cette API :
--   - identifie le site par sa cle PUBLIQUE (`sites.public_key`) ;
--   - n'accepte que les origines du site (ses domaines, son projet
--     Cloudflare et ses apercus) ;
--   - n'expose que ce que l'offre du client comprend (la base le verifie a
--     chaque operation : `submit_form`, `create_booking`, `create_shop_order`…).
--
--  Le rendu du site ne depend PAS de cette API : une indisponibilite de StaX
--  n'empeche jamais le site de s'afficher.
-- =============================================================================

alter table public.site_settings
  add column if not exists integration_settings jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'site_settings_integration_settings_object') then
    alter table public.site_settings add constraint site_settings_integration_settings_object
      check (jsonb_typeof(integration_settings) = 'object');
  end if;
end;
$$;

comment on column public.site_settings.integration_settings is
  'Parametres des modules pour un site externe, issus de son contrat d''edition : chemin de la '
  'page de connexion des comptes clients, page de suivi de commande… Jamais de secret.';

-- -----------------------------------------------------------------------------
--  1. Resolution par cle publique (moteur des sites uniquement)
-- -----------------------------------------------------------------------------
create or replace function app.resolve_site_api(p_public_key text)
returns jsonb
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select jsonb_build_object(
    'siteId', s.id,
    'organizationId', s.organization_id,
    'name', s.name,
    'architecture', s.architecture,
    'status', s.status,
    'available', s.archived_at is null and s.suspended_at is null and s.status <> 'suspended',
    'timezone', s.timezone,
    'locale', s.default_locale,
    'enabledModules', coalesce(to_jsonb(ss.enabled_modules), '[]'::jsonb),
    'integration', coalesce(ss.integration_settings, '{}'::jsonb),
    'businessName', coalesce(ss.business_name, s.name),
    'hosts', coalesce((
      select jsonb_agg(distinct h) from (
        select d.hostname as h from public.site_domains d
         where d.site_id = s.id and d.status <> 'detached'
        union all
        select substring(sh.production_url from '^https://([^/]+)') from public.site_hosting sh
         where sh.site_id = s.id and sh.status <> 'disconnected'
      ) hosts where h is not null), '[]'::jsonb),
    -- Apercus Cloudflare : <deploiement>.<projet>.pages.dev, ou versions d'un
    -- Worker. Seul le suffixe exact du projet du site est accepte.
    'previewSuffixes', coalesce((
      select jsonb_agg(case sh.provider
                         -- Le sous-domaine reel du projet (il differe du nom
                         -- quand celui-ci etait deja pris) : lu sur l'URL.
                         when 'cloudflare_pages'
                           then '.' || substring(sh.production_url from '^https://([^/]+\.pages\.dev)/?$')
                         else '-' || substring(sh.production_url
                                               from '^https://([^/]+\.workers\.dev)/?$')
                       end)
        from public.site_hosting sh
       where sh.site_id = s.id and sh.status <> 'disconnected'
         and sh.production_url ~ '\.(pages|workers)\.dev/?$'), '[]'::jsonb),
    'features', jsonb_build_object(
      'bookings', app.has_feature(s.organization_id, 'bookings'),
      'ecommerce', app.has_feature(s.organization_id, 'ecommerce'),
      'onlinePayments', app.has_feature(s.organization_id, 'online_payments'),
      'customerAccounts', app.has_feature(s.organization_id, 'customer_accounts'),
      'advancedAnalytics', app.has_feature(s.organization_id, 'advanced_analytics')))
    from public.sites s
    left join public.site_settings ss on ss.site_id = s.id
   where s.public_key = p_public_key
     and s.architecture = 'external_repository'
     and app.is_service_role();
$$;

create or replace function public.resolve_site_api(p_public_key text)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.resolve_site_api(p_public_key);
$$;

revoke all on function app.resolve_site_api(text) from public, anon, authenticated;
revoke all on function public.resolve_site_api(text) from public, anon, authenticated;
grant execute on function public.resolve_site_api(text) to service_role;

-- -----------------------------------------------------------------------------
--  2. Formulaires et modules declares par le contrat d'edition
--
--  Le developpeur declare les formulaires de SON site (champs, types,
--  obligations) dans `stax.manifest.json`. A l'activation du contrat, StaX
--  cree les formulaires correspondants : la boite de reception du client
--  connait alors exactement les champs attendus, et `submit_form` n'accepte
--  que ceux-la. Un formulaire retire du contrat est desactive, jamais efface :
--  les messages recus restent consultables.
-- -----------------------------------------------------------------------------
create or replace function app.sync_site_integrations(
  p_site        uuid,
  p_forms       jsonb,
  p_modules     text[],
  p_integration jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site   public.sites%rowtype;
  v_form   jsonb;
  v_field  jsonb;
  v_id     uuid;
  v_slugs  text[] := '{}';
  v_order  int;
  v_count  int := 0;
begin
  if app.current_user_id() is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;
  select * into v_site from public.sites where id = p_site for update;
  if not found or v_site.architecture <> 'external_repository' then
    return jsonb_build_object('ok', false, 'code', 'site_not_found');
  end if;
  if jsonb_typeof(coalesce(p_forms, '[]'::jsonb)) <> 'array' then
    raise exception 'Formulaires illisibles' using errcode = '22023';
  end if;

  insert into public.site_settings (site_id, business_name, enabled_modules, integration_settings)
  values (p_site, v_site.name, coalesce(p_modules, '{}'), coalesce(p_integration, '{}'::jsonb))
  on conflict (site_id) do update
     set enabled_modules = coalesce(p_modules, '{}'),
         integration_settings = coalesce(p_integration, '{}'::jsonb);

  for v_form in select * from jsonb_array_elements(coalesce(p_forms, '[]'::jsonb)) loop
    v_slugs := v_slugs || (v_form ->> 'slug');
    insert into public.forms (site_id, organization_id, slug, name, kind, success_message, is_active)
    values (p_site, v_site.organization_id, v_form ->> 'slug', v_form ->> 'name',
            coalesce(nullif(v_form ->> 'kind', ''), 'contact'),
            coalesce(nullif(v_form ->> 'successMessage', ''),
                     'Merci, votre message a bien été envoyé.'),
            true)
    on conflict (site_id, slug) do update
       set name = excluded.name, kind = excluded.kind,
           success_message = excluded.success_message, is_active = true
    returning id into v_id;

    delete from public.form_fields where form_id = v_id;
    v_order := 0;
    for v_field in select * from jsonb_array_elements(coalesce(v_form -> 'fields', '[]'::jsonb)) loop
      v_order := v_order + 10;
      insert into public.form_fields
        (form_id, name, label, type, placeholder, help_text, is_required, options, sort_order)
      values
        (v_id, v_field ->> 'name', v_field ->> 'label', coalesce(v_field ->> 'type', 'text'),
         nullif(v_field ->> 'placeholder', ''), nullif(v_field ->> 'help', ''),
         coalesce((v_field ->> 'required')::boolean, false),
         coalesce(v_field -> 'options', '[]'::jsonb), v_order);
    end loop;
    v_count := v_count + 1;
  end loop;

  update public.forms set is_active = false
   where site_id = p_site and is_active and not (slug = any (v_slugs));

  perform app.write_audit('site.integrations_synced', v_site.organization_id, v_site.id,
                          'site', v_site.id::text,
                          jsonb_build_object('forms', v_count, 'modules', to_jsonb(p_modules)));
  return jsonb_build_object('ok', true, 'forms', v_count);
end;
$$;

create or replace function public.sync_site_integrations(
  p_site uuid, p_forms jsonb, p_modules text[], p_integration jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.sync_site_integrations(p_site, p_forms, p_modules, p_integration);
$$;

revoke all on function app.sync_site_integrations(uuid, jsonb, text[], jsonb)
  from public, anon, authenticated;
revoke all on function public.sync_site_integrations(uuid, jsonb, text[], jsonb) from public, anon;
grant execute on function public.sync_site_integrations(uuid, jsonb, text[], jsonb)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
--  3. Catalogue public d'un site (lecture seule, produits visibles)
-- -----------------------------------------------------------------------------
create or replace function app.site_public_catalog(p_site uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select case when app.is_service_role()
                   and app.site_has_feature(p_site, 'ecommerce') then
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'slug', p.slug, 'name', p.name, 'description', p.description,
               'priceCents', p.price_cents, 'compareAtPriceCents', p.compare_at_price_cents,
               'currency', p.currency, 'vatRateBps', p.vat_rate_bps,
               'inStock', not p.track_inventory or p.allow_backorder or p.stock_quantity > 0,
               'images', p.images, 'featured', p.is_featured,
               'categoryId', p.category_id)
             order by p.sort_order, p.name)
        from public.products p
       where p.site_id = p_site and p.is_visible), '[]'::jsonb)
  else null end;
$$;

create or replace function public.site_public_catalog(p_site uuid)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.site_public_catalog(p_site);
$$;

revoke all on function app.site_public_catalog(uuid) from public, anon, authenticated;
revoke all on function public.site_public_catalog(uuid) from public, anon, authenticated;
grant execute on function public.site_public_catalog(uuid) to service_role;

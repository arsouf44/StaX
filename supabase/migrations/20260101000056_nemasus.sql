-- =============================================================================
--  Nemasus — 0056 · La marque StaX devient Nemasus
--
--  Les migrations passées ne sont jamais réécrites (leur empreinte est
--  vérifiée par `pnpm db:migrate`) : cette migration porte le renommage en
--  avant, de façon identique sur une base neuve et sur la production.
--
--  1. Textes visibles produits par la base : messages d'erreur, notifications
--     et résumés écrits par les fonctions, commentaires. Chaque fonction dont
--     le corps mentionne « StaX » est recréée à l'identique, nom de la marque
--     et nom du contrat d'édition (`nemasus.manifest.json`) mis à jour.
--  2. Données de référence affichées aux clients : offres, inclusions,
--     fonctionnalités, organisation interne, compte d'administration initial.
--  3. Contrat d'édition : `nemasus.manifest.json` par défaut pour les dépôts
--     rattachés désormais. Un dépôt déjà rattaché garde le chemin enregistré.
--  4. Tâche de fond : secrets Vault `nemasus_platform_url` et
--     `nemasus_cron_secret` (les anciens noms `stax_*` restent lus tant
--     qu'ils existent) ; tâches pg_cron renommées.
--  5. Sous-traitants : la liste publique dit exactement qui traite quoi, où.
--
--  Restent volontairement inchangés, car stockés dans les lignes et les
--  contraintes : les valeurs internes 'stax' (auteur d'un message ou d'une
--  version : l'équipe), 'stax_purchase', 'stax_publish', 'stax_preview'…,
--  les colonnes `last_stax_commit_sha`, `purchased_by_stax`,
--  `dns_managed_by_stax` et le paramètre de session `stax.retention_purge`.
--  Ils ne sont jamais affichés ; l'interface les traduit.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Fonctions et commentaires
-- -----------------------------------------------------------------------------
do $$
declare
  r     record;
  v_def text;
begin
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('app', 'public')
       and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_depend d
                        where d.classid = 'pg_proc'::regclass
                          and d.objid = p.oid and d.deptype = 'e')
       and (p.prosrc like '%StaX%'
            or p.prosrc like '%stax.manifest.json%'
            or coalesce(pg_get_expr(p.proargdefaults, 0), '') like '%stax.manifest.json%')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def, 'StaX', 'Nemasus');
    v_def := replace(v_def, 'stax.manifest.json', 'nemasus.manifest.json');
    execute v_def;
  end loop;

  for r in
    select p.oid::regprocedure as signature, d.description
      from pg_description d
      join pg_proc p on p.oid = d.objoid and d.classoid = 'pg_proc'::regclass
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('app', 'public')
       and d.description like '%StaX%'
  loop
    execute format('comment on function %s is %L',
                   r.signature, replace(r.description, 'StaX', 'Nemasus'));
  end loop;

  for r in
    select c.oid::regclass as relation, c.relkind, a.attname, d.objsubid, d.description
      from pg_description d
      join pg_class c on c.oid = d.objoid and d.classoid = 'pg_class'::regclass
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid
     where n.nspname in ('app', 'public')
       and d.description like '%StaX%'
  loop
    if r.objsubid = 0 then
      execute format('comment on %s %s is %L',
                     case r.relkind when 'v' then 'view'
                                    when 'm' then 'materialized view'
                                    else 'table' end,
                     r.relation, replace(r.description, 'StaX', 'Nemasus'));
    else
      execute format('comment on column %s.%I is %L',
                     r.relation, r.attname, replace(r.description, 'StaX', 'Nemasus'));
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
--  2. Données de référence visibles
-- -----------------------------------------------------------------------------
update public.plans
   set description = replace(description, 'StaX', 'Nemasus')
 where description like '%StaX%';

update public.plan_inclusions
   set label  = replace(label, 'StaX', 'Nemasus'),
       detail = replace(detail, 'StaX', 'Nemasus')
 where label like '%StaX%' or detail like '%StaX%';

update public.features
   set label       = replace(label, 'StaX', 'Nemasus'),
       description = replace(description, 'StaX', 'Nemasus')
 where label like '%StaX%' or description like '%StaX%';

-- Organisation interne qui reçoit les prospects du site vitrine. Son
-- identifiant technique (`stax-plateforme`) est lu par app.* : il reste.
update public.organizations
   set name = 'Nemasus'
 where slug = 'stax-plateforme' and name = 'StaX';

-- Libellés écrits par la base pour les commandes internes.
update public.order_items
   set label = replace(label, 'StaX', 'Nemasus')
 where kind = 'internal_waiver' and label like '%StaX%';

update public.projects
   set summary = replace(summary, 'StaX', 'Nemasus')
 where summary like 'Commande interne StaX%';

-- Nom par défaut du compte créé par `pnpm admin:bootstrap`.
update public.profiles
   set full_name = 'Administrateur Nemasus'
 where full_name = 'Administrateur StaX';

-- -----------------------------------------------------------------------------
--  3. Contrat d'édition
-- -----------------------------------------------------------------------------
alter table public.site_repositories
  alter column manifest_path set default 'nemasus.manifest.json';

-- -----------------------------------------------------------------------------
--  4. Tâche de fond
-- -----------------------------------------------------------------------------
create or replace function app.trigger_site_operations()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_url     text;
  v_secret  text;
  v_request bigint;
begin
  -- Requetes dynamiques : Vault et pg_net n'existent que sur Supabase.
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;

  -- Le nom actuel l'emporte ; l'ancien reste lu tant qu'il existe.
  execute $q$select decrypted_secret from vault.decrypted_secrets
              where name in ('nemasus_platform_url', 'stax_platform_url')
              order by (name = 'nemasus_platform_url') desc limit 1$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets
              where name in ('nemasus_cron_secret', 'stax_cron_secret')
              order by (name = 'nemasus_cron_secret') desc limit 1$q$ into v_secret;

  if v_url is null or v_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$'
     or v_secret is null or length(v_secret) < 16 then
    return null;
  end if;

  -- Requete asynchrone : pg_net l'envoie en arriere-plan, le planificateur
  -- n'attend pas. Le delai couvre la duree maximale de la route (60 s).
  execute $q$select net.http_get(url := $1, headers := $2, timeout_milliseconds := 60000)$q$
     into v_request
    using rtrim(v_url, '/') || '/api/cron/sites',
          jsonb_build_object('Authorization', 'Bearer ' || v_secret);
  return v_request;
end;
$$;

comment on function app.trigger_site_operations() is
  'Appelle /api/cron/sites avec CRON_SECRET, lus dans Supabase Vault (nemasus_platform_url, '
  'nemasus_cron_secret ; anciens noms stax_* acceptés). Planifiee toutes les 5 minutes par '
  'pg_cron. Sans secrets : ne fait rien.';

revoke all on function app.trigger_site_operations() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$select cron.unschedule(jobid) from cron.job
                   where jobname in ('stax-site-operations', 'nemasus-site-operations',
                                     'stax-retention', 'nemasus-retention')$cron$;
    execute $cron$select cron.schedule('nemasus-site-operations', '*/5 * * * *',
                                       'select app.trigger_site_operations()')$cron$;
    execute $cron$select cron.schedule('nemasus-retention', '17 3 * * *',
                                       'select app.apply_retention()')$cron$;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
--  5. Sous-traitants
-- -----------------------------------------------------------------------------
update public.subprocessors
   set purpose = 'Hébergement et diffusion de chaque site client sur son propre projet (Pages ou '
                 || 'Workers), CDN, protection réseau, certificats TLS et vérification anti-robot '
                 || 'des formulaires (Turnstile).',
       location = 'États-Unis (société) — réseau mondial, traitement au plus près du visiteur',
       transfer_safeguards = 'Clauses contractuelles types de la Commission européenne '
                             || '(Data Processing Addendum Cloudflare).',
       updated_at = now()
 where name = 'Cloudflare, Inc.';

update public.subprocessors
   set name = 'Supabase Pte. Ltd.',
       purpose = 'Base de données PostgreSQL, authentification et stockage des fichiers de la '
                 || 'plateforme.',
       location = 'Union européenne — Paris (région eu-west-3) ; société établie à Singapour',
       transfer_safeguards = 'Données stockées dans l’Union européenne. Accès exceptionnels du '
                             || 'support encadrés par les clauses contractuelles types (DPA Supabase).',
       updated_at = now()
 where name in ('Supabase, Inc.', 'Supabase Pte. Ltd.');

update public.subprocessors
   set location = 'Irlande (Union européenne)',
       transfer_safeguards = 'Données traitées dans l’Union européenne. Stripe agit en responsable '
                             || 'de traitement distinct pour la lutte contre la fraude et ses '
                             || 'obligations réglementaires.',
       updated_at = now()
 where name = 'Stripe Payments Europe, Ltd.';

update public.subprocessors
   set transfer_safeguards = 'Clauses contractuelles types de la Commission européenne '
                             || '(Data Protection Agreement GitHub).',
       updated_at = now()
 where name = 'GitHub, Inc.';

insert into public.subprocessors
  (name, purpose, location, transfer_safeguards, privacy_url, category, sort_order)
select 'Vercel Inc.',
       'Hébergement et exécution de la plateforme Nemasus : site public, espace client, '
       || 'administration.',
       'États-Unis (société) — exécution en Europe, à Paris (région cdg1)',
       'Clauses contractuelles types de la Commission européenne (Data Processing Addendum Vercel).',
       'https://vercel.com/legal/privacy-policy',
       'infrastructure', 5
 where not exists (select 1 from public.subprocessors where name = 'Vercel Inc.');

insert into public.subprocessors
  (name, purpose, location, transfer_safeguards, privacy_url, category, sort_order)
select 'Plus Five Five, Inc. (Resend)',
       'Envoi des e-mails transactionnels : confirmations, propositions, livraison, réponses de '
       || 'l’équipe, notifications des formulaires.',
       'États-Unis',
       'Clauses contractuelles types de la Commission européenne (Data Processing Addendum Resend).',
       'https://resend.com/legal/privacy-policy',
       'email', 40
 where not exists (select 1 from public.subprocessors where name like '%Resend%');

-- -----------------------------------------------------------------------------
--  6. Opposition d'un prospect : effacer ses coordonnées
-- -----------------------------------------------------------------------------
--  Chaque e-mail de proposition indique au prospect qu'il peut s'opposer au
--  traitement de ses coordonnées (article 21 du RGPD). Retirer la proposition
--  ne suffit pas : ses coordonnées resteraient trois ans. Cette fonction les
--  efface d'une proposition RETIRÉE (la retirer d'abord garantit qu'aucun
--  paiement n'est en cours), exactement comme la purge des trois ans
--  (app.apply_retention). La référence, l'offre et les montants restent : ils
--  ne désignent plus personne.
create or replace function app.erase_site_proposal_contact(p_proposal uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor uuid := app.current_user_id();
  v_prop  public.site_proposals%rowtype;
begin
  if v_actor is null or not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme' using errcode = '42501';
  end if;

  select * into v_prop from public.site_proposals where id = p_proposal for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_prop.status <> 'withdrawn' then
    return jsonb_build_object('ok', false, 'code', 'not_withdrawn', 'status', v_prop.status);
  end if;
  if v_prop.prospect_email like 'efface-%@anonymise.invalid' then
    return jsonb_build_object('ok', true, 'alreadyErased', true);
  end if;

  update public.site_proposals
     set prospect_email = 'efface-' || id || '@anonymise.invalid',
         prospect_name  = null,
         prospect_phone = null,
         company_name   = 'Coordonnées effacées',
         message        = null,
         internal_notes = null,
         email_error    = null,
         updated_at     = now()
   where id = p_proposal;

  perform app.write_audit(
    'proposal.contact_erased', v_prop.organization_id, v_prop.site_id, 'site_proposal',
    v_prop.id::text, jsonb_build_object('reference', v_prop.reference));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.erase_site_proposal_contact(p_proposal uuid)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.erase_site_proposal_contact(p_proposal);
$$;

revoke all on function app.erase_site_proposal_contact(uuid) from public, anon, authenticated;
revoke all on function public.erase_site_proposal_contact(uuid) from public, anon;
grant execute on function public.erase_site_proposal_contact(uuid) to authenticated, service_role;

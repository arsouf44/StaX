-- =============================================================================
--  StaX — 0043 · Cinq offres, une maintenance MENSUELLE qui demarre a la
--  livraison, et des droits qui correspondent exactement aux promesses
--
--  Ce que cette migration change, et pourquoi :
--
--   1. Cinq niveaux : Essentiel, Premium, Ultra Premium, Exceptionnel, Sur
--      mesure. Tous les sites sont concus et developpes individuellement ;
--      les offres different par le niveau de conception, le nombre de pages,
--      la richesse du design, les fonctionnalites et l'accompagnement —
--      jamais par un « modele pour l'offre basse ».
--
--   2. La maintenance devient MENSUELLE. Les prix de creation ne changent
--      pas ; Exceptionnel est ajoutee. Les versions annuelles sont archivees,
--      jamais reecrites : un contrat deja vendu garde son prix et sa
--      periodicite (grandfathering).
--
--   3. La maintenance commence a la LIVRAISON du site, pas a la commande. La
--      commande ne cree plus d'abonnement ; elle porte un etat de maintenance
--      (« en attente de livraison ») que seule la livraison fait avancer. La
--      base refuse d'enregistrer un abonnement mensuel pour un site non livre.
--
--   4. Les droits d'offre ne contiennent plus de fonctionnalite fictive :
--      « animations avancees » et « design sur mesure » decrivaient du travail
--      de conception, pas un droit logiciel — ils deviennent des inclusions
--      contractuelles (table `plan_inclusions`), figees dans chaque commande.
--      « Sites inclus » et « messages mensuels » n'etaient appliques nulle
--      part : ils sont retires plutot que laisses en promesse vide.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Presentation et delais par offre
-- -----------------------------------------------------------------------------
alter table public.plans
  add column if not exists highlight text not null default 'none',
  add column if not exists delivery_weeks_min integer,
  add column if not exists delivery_weeks_max integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plans_highlight_valid') then
    alter table public.plans add constraint plans_highlight_valid
      check (highlight in ('none', 'popular', 'signature'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plans_delivery_weeks_sane') then
    alter table public.plans add constraint plans_delivery_weeks_sane
      check ((delivery_weeks_min is null and delivery_weeks_max is null)
             or (delivery_weeks_min between 1 and 52
                 and delivery_weeks_max between delivery_weeks_min and 52));
  end if;
end;
$$;

comment on column public.plans.highlight is
  'Mise en avant de la carte tarifaire : `popular` (recommandee) ou `signature` (categorie '
  'superieure). Lue par l''interface, jamais deduite du nom de l''offre.';
comment on column public.plans.delivery_weeks_min is
  'Delai de realisation annonce, en semaines, a compter de la reception de tous les '
  'elements du client. NULL pour une offre sur devis (delai fixe au devis).';
comment on column public.plans.billing_interval is
  'Periodicite de la maintenance : `month` pour les offres en vigueur. `year` subsiste pour '
  'les contrats vendus avant le passage a la maintenance mensuelle.';

-- -----------------------------------------------------------------------------
--  2. Archivage des versions annuelles (jamais supprimees)
-- -----------------------------------------------------------------------------
update public.plans
   set is_active = false,
       is_public = false,
       valid_until = coalesce(valid_until, now())
 where slug in ('essentiel', 'premium', 'ultra-premium')
   and is_active
   and billing_interval = 'year';

-- -----------------------------------------------------------------------------
--  3. Nouvelle grille : creation inchangee, maintenance mensuelle
-- -----------------------------------------------------------------------------
insert into public.plans
  (slug, version, name, tagline, description, badge, highlight,
   setup_price_cents, maintenance_price_cents, billing_interval, vat_rate_bps,
   prices_include_vat, is_quote_only, sort_order, delivery_weeks_min, delivery_weeks_max)
values
  ('essentiel', 2, 'Essentiel',
   'Une présence professionnelle, conçue pour votre entreprise.',
   'Un site unique, conçu et développé spécialement pour votre entreprise par notre équipe : '
   || 'jusqu’à 5 pages, responsive, référencement technique essentiel et formulaire de contact. '
   || 'Après la livraison, vous modifiez vos textes, vos photos et vos informations depuis StaX.',
   null, 'none', 30000, 1200, 'month', 2000, false, false, 10, 1, 3),
  ('premium', 3, 'Premium',
   'Un site plus riche, qui travaille pour votre activité.',
   'Tout l’Essentiel, avec une direction artistique plus travaillée, jusqu’à 10 pages, les '
   || 'actualités et réalisations, la prise de rendez-vous ou la réservation, des formulaires '
   || 'avancés, des statistiques détaillées et la publication programmée.',
   'Recommandé', 'popular', 55000, 1400, 'month', 2000, false, false, 20, 2, 4),
  ('ultra-premium', 2, 'Ultra Premium',
   'Une expérience haut de gamme, avec vente en ligne.',
   'Tout le Premium, avec une expérience visuelle haut de gamme et des animations avancées, '
   || 'jusqu’à 20 pages, la boutique en ligne et l’encaissement sur votre propre compte Stripe, '
   || 'les comptes clients, le multilingue et un support prioritaire.',
   null, 'none', 109900, 1600, 'month', 2000, false, false, 30, 3, 6),
  ('exceptionnel', 1, 'Exceptionnel',
   'Direction artistique haut de gamme, pour un site d’exception.',
   'Une direction artistique poussée, travaillée écran par écran : recherche UX/UI, '
   || 'interactions et animations codées pour votre marque, composants uniques, jusqu’à '
   || 'environ 35 pages si le projet le nécessite, et un accompagnement prioritaire avec des '
   || 'phases de validation supplémentaires.',
   'Direction artistique', 'signature', 179000, 1800, 'month', 2000, false, false, 40, 6, 10)
on conflict (slug, version) do update
   set name = excluded.name,
       tagline = excluded.tagline,
       description = excluded.description,
       badge = excluded.badge,
       highlight = excluded.highlight,
       setup_price_cents = excluded.setup_price_cents,
       maintenance_price_cents = excluded.maintenance_price_cents,
       billing_interval = excluded.billing_interval,
       delivery_weeks_min = excluded.delivery_weeks_min,
       delivery_weeks_max = excluded.delivery_weeks_max,
       is_active = true,
       is_public = true,
       valid_until = null,
       sort_order = excluded.sort_order;

-- L'offre sur devis ne porte aucun prix : seule sa description et sa
-- periodicite changent. La maintenance y est definie projet par projet.
update public.plans
   set billing_interval = 'month',
       sort_order = 50,
       badge = null,
       highlight = 'none',
       tagline = 'Plateformes, applications et projets hors catalogue.',
       description = 'Plateforme, application web, espace métier complexe, gros catalogue, '
                     || 'intégrations spécifiques ou fort volume : nous étudions votre besoin et '
                     || 'établissons un devis détaillé. La maintenance est définie selon le projet.'
 where slug = 'sur-mesure'
   and is_active
   and valid_until is null;

-- -----------------------------------------------------------------------------
--  4. Fonctionnalites : uniquement ce que la plateforme applique reellement
-- -----------------------------------------------------------------------------
-- Travail de conception, pas droit logiciel : ils deviennent des inclusions.
-- Quotas jamais appliques : retires plutot que laisses en promesse vide.
-- La suppression emporte les lignes plan_features et les derogations liees.
delete from public.features
 where key in ('advanced_animations', 'custom_design', 'max_sites', 'max_monthly_submissions');

insert into public.features (key, label, description, category, kind, unit) values
  ('advanced_forms', 'Formulaires avancés',
   'Plusieurs formulaires et des champs avancés : listes de choix, cases à cocher, dates, nombres.',
   'site', 'boolean', null),
  ('max_locales', 'Langues', 'Nombre de langues de votre site.', 'limits', 'limit', 'langue')
on conflict (key) do update
   set label = excluded.label,
       description = excluded.description,
       category = excluded.category,
       kind = excluded.kind,
       unit = excluded.unit;

-- Libelles alignes sur ce que chaque droit ouvre reellement.
update public.features f
   set label = v.label, description = v.description, category = v.category
  from (values
    ('custom_domain', 'Nom de domaine personnalisé',
     'Votre domaine relié à votre site, en HTTPS.', 'site'),
    ('seo_tools', 'Référencement technique',
     'Titres et descriptions modifiables, plan du site, données structurées.', 'site'),
    ('content_editor', 'Éditeur StaX',
     'Après la livraison, vous modifiez les contenus prévus par votre site : textes, images, informations.',
     'site'),
    ('version_history', 'Historique des versions',
     'Chaque publication est une version datée, liée à un déploiement réel, restaurable.', 'site'),
    ('scheduled_publishing', 'Publication programmée',
     'Préparez une version et publiez-la automatiquement à la date choisie.', 'site'),
    ('blog', 'Actualités et collections',
     'Articles, actualités, réalisations et autres contenus en liste, gérés depuis StaX.', 'modules'),
    ('bookings', 'Réservations et rendez-vous',
     'Créneaux, capacités et confirmations : vos clients réservent depuis votre site.', 'modules'),
    ('ecommerce', 'Boutique en ligne', 'Catalogue produits, commandes et suivi.', 'modules'),
    ('online_payments', 'Paiement en ligne',
     'Encaissement par carte sur votre propre compte Stripe, sans commission StaX.', 'modules'),
    ('customer_accounts', 'Comptes clients',
     'Un espace personnel pour les clients de votre site, sans mot de passe.', 'modules'),
    ('advanced_analytics', 'Statistiques avancées',
     'Sources de trafic, appareils, conversions et historique sur douze mois.', 'analytics'),
    ('multi_language', 'Multilingue',
     'Plusieurs langues sur votre site, chaque texte traduit dans l’éditeur.', 'site'),
    ('team_collaboration', 'Collaboration',
     'Invitez des collaborateurs avec des rôles distincts.', 'organisation'),
    ('priority_support', 'Support prioritaire',
     'Vos demandes sont ouvertes en priorité haute et traitées en premier.', 'support'),
    ('max_pages', 'Pages', 'Pages conçues et développées pour votre site.', 'limits'),
    ('max_team_members', 'Comptes collaborateurs',
     'Personnes ayant accès à votre espace StaX.', 'limits'),
    ('max_products', 'Produits', 'Produits de votre catalogue en ligne.', 'limits'),
    ('max_media_mb', 'Espace médias', 'Stockage de vos photos et documents.', 'limits'),
    ('max_forms', 'Formulaires', 'Formulaires distincts sur votre site.', 'limits')
  ) as v(key, label, description, category)
 where f.key = v.key;

-- -----------------------------------------------------------------------------
--  5. Droits par offre — appliques par app.has_feature / app.feature_limit
-- -----------------------------------------------------------------------------
do $$
declare
  v_essentiel uuid := (select id from public.plans where slug = 'essentiel' and version = 2);
  v_premium   uuid := (select id from public.plans where slug = 'premium' and version = 3);
  v_ultra     uuid := (select id from public.plans where slug = 'ultra-premium' and version = 2);
  v_except    uuid := (select id from public.plans where slug = 'exceptionnel' and version = 1);
  v_devis     uuid := (select id from public.plans
                        where slug = 'sur-mesure' and is_active and valid_until is null
                        order by version desc limit 1);
begin
  delete from public.plan_features
   where plan_id in (v_essentiel, v_premium, v_ultra, v_except, v_devis);

  insert into public.plan_features (plan_id, feature_key, enabled, limit_value)
  select p.plan_id, v.key, v.enabled, v.limit_value
    from (values (v_essentiel, 1), (v_premium, 2), (v_ultra, 3), (v_except, 4), (v_devis, 5))
           as p(plan_id, tier)
    cross join lateral (values
      -- key                     E      P      U      X      SM
      ('custom_domain',        array[true,  true,  true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('seo_tools',            array[true,  true,  true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('content_editor',       array[true,  true,  true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('version_history',      array[true,  true,  true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('team_collaboration',   array[true,  true,  true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('scheduled_publishing', array[false, true,  true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('blog',                 array[false, true,  true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('bookings',             array[false, true,  true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('advanced_forms',       array[false, true,  true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('advanced_analytics',   array[false, true,  true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('ecommerce',            array[false, false, true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('online_payments',      array[false, false, true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('customer_accounts',    array[false, false, true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('multi_language',       array[false, false, true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('priority_support',     array[false, false, true,  true,  true ], array[null,null,null,null,null]::int[]),
      ('max_pages',            array[true,  true,  true,  true,  true ], array[5,   10,  20,   35,   null]::int[]),
      ('max_team_members',     array[true,  true,  true,  true,  true ], array[2,   5,   10,   20,   null]::int[]),
      ('max_products',         array[false, false, true,  true,  true ], array[0,   0,   500,  2000, null]::int[]),
      ('max_media_mb',         array[true,  true,  true,  true,  true ], array[1024,5120,20480,51200,null]::int[]),
      ('max_forms',            array[true,  true,  true,  true,  true ], array[1,   5,   10,   25,   null]::int[]),
      ('max_locales',          array[true,  true,  true,  true,  true ], array[1,   1,   3,    5,    null]::int[])
    ) as grid(key, flags, limits)
    cross join lateral (select grid.key,
                               grid.flags[p.tier] as enabled,
                               grid.limits[p.tier] as limit_value) as v
   where p.plan_id is not null;
end;
$$;

-- -----------------------------------------------------------------------------
--  6. Inclusions contractuelles : ce que chaque offre comprend, en clair
--
--  Deux natures, distinguees par `feature_key` :
--   - une inclusion adossee a un droit logiciel (`feature_key` renseigne) :
--     la base verifie a l'ecriture que l'offre accorde ce droit ;
--   - une inclusion de conception ou d'accompagnement (`feature_key` nul) :
--     un engagement de travail, fige dans chaque commande.
--  `{limit}` est remplace par la limite de l'offre pour ce droit : le chiffre
--  n'existe qu'a un seul endroit.
-- -----------------------------------------------------------------------------
create table if not exists public.plan_inclusions (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.plans (id) on delete cascade,
  category     text not null,
  label        text not null,
  detail       text,
  feature_key  text references public.features (key) on delete restrict,
  highlight    boolean not null default false,
  sort_order   int not null default 100,
  created_at   timestamptz not null default now(),

  constraint plan_inclusions_category_valid
    check (category in ('conception', 'site', 'gestion', 'accompagnement')),
  constraint plan_inclusions_label_bounded check (length(label) between 3 and 160),
  constraint plan_inclusions_limit_needs_key
    check (position('{limit}' in label) = 0 or feature_key is not null)
);

create unique index if not exists plan_inclusions_plan_label_key
  on public.plan_inclusions (plan_id, label);
create index if not exists plan_inclusions_plan_order_idx
  on public.plan_inclusions (plan_id, sort_order);

alter table public.plan_inclusions enable row level security;
alter table public.plan_inclusions force row level security;

drop policy if exists plan_inclusions_read on public.plan_inclusions;
create policy plan_inclusions_read on public.plan_inclusions
  for select to anon, authenticated using (true);
drop policy if exists plan_inclusions_write on public.plan_inclusions;
create policy plan_inclusions_write on public.plan_inclusions
  for all to authenticated using (app.is_platform_owner()) with check (app.is_platform_owner());

grant select on public.plan_inclusions to anon, authenticated;

-- Une inclusion adossee a un droit doit correspondre a un droit REELLEMENT
-- accorde par l'offre : c'est la base qui l'impose, pas une relecture.
create or replace function app.guard_plan_inclusion()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_enabled boolean;
  v_limit   integer;
  v_kind    text;
begin
  if new.feature_key is null then
    return new;
  end if;
  select pf.enabled, pf.limit_value, f.kind into v_enabled, v_limit, v_kind
    from public.plan_features pf
    join public.features f on f.key = pf.feature_key
   where pf.plan_id = new.plan_id and pf.feature_key = new.feature_key;
  if not coalesce(v_enabled, false) then
    raise exception 'Inclusion « % » : l''offre n''accorde pas le droit %', new.label, new.feature_key
      using errcode = '23514';
  end if;
  if position('{limit}' in new.label) > 0 and (v_kind <> 'limit' or v_limit is null) then
    raise exception 'Inclusion « % » : aucune limite chiffree pour %', new.label, new.feature_key
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists plan_inclusions_guard on public.plan_inclusions;
create trigger plan_inclusions_guard
  before insert or update on public.plan_inclusions
  for each row execute function app.guard_plan_inclusion();

do $$
declare
  v_essentiel uuid := (select id from public.plans where slug = 'essentiel' and version = 2);
  v_premium   uuid := (select id from public.plans where slug = 'premium' and version = 3);
  v_ultra     uuid := (select id from public.plans where slug = 'ultra-premium' and version = 2);
  v_except    uuid := (select id from public.plans where slug = 'exceptionnel' and version = 1);
  v_devis     uuid := (select id from public.plans
                        where slug = 'sur-mesure' and is_active and valid_until is null
                        order by version desc limit 1);
begin
  delete from public.plan_inclusions
   where plan_id in (v_essentiel, v_premium, v_ultra, v_except, v_devis);

  insert into public.plan_inclusions
    (plan_id, category, label, detail, feature_key, highlight, sort_order)
  values
    -- Essentiel ---------------------------------------------------------------
    (v_essentiel, 'conception', 'Site unique, conçu et développé pour votre entreprise',
     'Aucun modèle à personnaliser : la structure, le design et le code sont réalisés pour vous.',
     null, true, 10),
    (v_essentiel, 'conception', 'Jusqu’à {limit} pages', null, 'max_pages', true, 20),
    (v_essentiel, 'conception', 'Design propre, personnalisé à votre identité', null, null, false, 30),
    (v_essentiel, 'conception', 'Responsive complet : ordinateur, tablette, téléphone',
     null, null, false, 40),
    (v_essentiel, 'site', 'Votre nom de domaine, en HTTPS', null, 'custom_domain', true, 50),
    (v_essentiel, 'site', 'Formulaire de contact relié à votre messagerie StaX',
     null, 'max_forms', true, 60),
    (v_essentiel, 'site', 'Informations, horaires et liens sociaux modifiables',
     null, 'content_editor', false, 70),
    (v_essentiel, 'site', 'Référencement technique essentiel : métadonnées, plan du site',
     null, 'seo_tools', false, 80),
    (v_essentiel, 'site', 'Statistiques essentielles de fréquentation',
     'Visiteurs et pages vues, sans cookie de mesure.', null, false, 90),
    (v_essentiel, 'gestion', 'Éditeur StaX après la livraison : textes, images, informations',
     null, 'content_editor', true, 100),
    (v_essentiel, 'gestion', 'Aperçu avant publication, historique des versions, retour arrière',
     null, 'version_history', false, 110),
    (v_essentiel, 'gestion', 'Jusqu’à {limit} comptes collaborateurs',
     null, 'max_team_members', false, 120),
    (v_essentiel, 'accompagnement', 'Hébergement, sauvegarde et surveillance inclus',
     'Dans la maintenance mensuelle, qui démarre à la livraison.', null, true, 130),

    -- Premium -----------------------------------------------------------------
    (v_premium, 'conception', 'Tout ce que comprend l’offre Essentiel', null, null, true, 5),
    (v_premium, 'conception', 'Jusqu’à {limit} pages', null, 'max_pages', true, 10),
    (v_premium, 'conception', 'Direction artistique plus travaillée', null, null, true, 20),
    (v_premium, 'conception', 'Davantage de sections spécifiques à votre activité',
     null, null, false, 30),
    (v_premium, 'site', 'Actualités, articles et réalisations',
     'Des collections de contenus que vous alimentez depuis StaX.', 'blog', true, 40),
    (v_premium, 'site', 'Prise de rendez-vous ou réservation en ligne', null, 'bookings', true, 50),
    (v_premium, 'site', 'Formulaires avancés', 'Jusqu’à 5 formulaires, avec listes de choix, dates et cases à cocher.',
     'advanced_forms', false, 60),
    (v_premium, 'gestion', 'Statistiques avancées : sources, appareils, conversions',
     null, 'advanced_analytics', true, 70),
    (v_premium, 'gestion', 'Publication programmée', null, 'scheduled_publishing', false, 80),
    (v_premium, 'gestion', 'Jusqu’à {limit} comptes collaborateurs',
     null, 'max_team_members', false, 90),
    (v_premium, 'accompagnement', 'Fonctions métier prévues dans votre contrat d’édition',
     'Horaires, carte, prestations, équipe… selon ce qui est prévu pour votre site.',
     null, false, 100),

    -- Ultra Premium -----------------------------------------------------------
    (v_ultra, 'conception', 'Tout ce que comprend l’offre Premium', null, null, true, 5),
    (v_ultra, 'conception', 'Jusqu’à {limit} pages', null, 'max_pages', true, 10),
    (v_ultra, 'conception', 'Expérience visuelle haut de gamme, animations avancées',
     null, null, true, 20),
    (v_ultra, 'site', 'Boutique en ligne : catalogue jusqu’à {limit} produits',
     null, 'max_products', true, 30),
    (v_ultra, 'site', 'Paiement en ligne sur votre propre compte Stripe',
     'Aucune commission StaX sur vos ventes.', 'online_payments', true, 40),
    (v_ultra, 'site', 'Comptes clients sur votre site, si vous les activez',
     null, 'customer_accounts', false, 50),
    (v_ultra, 'site', 'Site multilingue, jusqu’à {limit} langues', null, 'max_locales', true, 60),
    (v_ultra, 'conception', 'Plusieurs modules métier et automatisations prévues au cahier des charges',
     null, null, false, 70),
    (v_ultra, 'accompagnement', 'Support prioritaire', null, 'priority_support', true, 80),
    (v_ultra, 'gestion', 'Jusqu’à {limit} comptes collaborateurs',
     null, 'max_team_members', false, 90),

    -- Exceptionnel --------------------------------------------------------------
    (v_except, 'conception', 'Tout ce que comprend l’offre Ultra Premium', null, null, true, 5),
    (v_except, 'conception', 'Direction artistique poussée, recherche UX/UI spécifique',
     null, null, true, 10),
    (v_except, 'conception', 'Design travaillé écran par écran, compositions hors grille si pertinentes',
     null, null, true, 20),
    (v_except, 'conception', 'Transitions, animations complexes et interactions personnalisées',
     null, null, true, 30),
    (v_except, 'conception', 'Storytelling visuel et motion design', null, null, false, 40),
    (v_except, 'conception', 'WebGL et 3D uniquement lorsque cela sert réellement le projet',
     'Aucune technologie n’est ajoutée par principe : chaque effet doit apporter quelque chose.',
     null, false, 50),
    (v_except, 'conception', 'Composants uniques, codés pour votre marque', null, null, true, 60),
    (v_except, 'conception', 'Expérience mobile particulièrement travaillée', null, null, false, 70),
    (v_except, 'conception', 'Travail approfondi sur votre identité visuelle', null, null, false, 80),
    (v_except, 'site', 'Intégrations plus complexes', null, null, false, 90),
    (v_except, 'conception', 'Jusqu’à environ {limit} pages si le projet le nécessite',
     null, 'max_pages', true, 100),
    (v_except, 'accompagnement', 'Accompagnement prioritaire, phases de validation supplémentaires',
     null, 'priority_support', true, 110),
    (v_except, 'conception', 'Optimisation poussée des performances, animations comprises',
     null, null, false, 120),
    (v_except, 'site', 'Site multilingue, jusqu’à {limit} langues', null, 'max_locales', false, 130),
    (v_except, 'gestion', 'Jusqu’à {limit} comptes collaborateurs',
     null, 'max_team_members', false, 140),

    -- Sur mesure --------------------------------------------------------------
    (v_devis, 'conception', 'Plateforme ou application web', null, null, true, 10),
    (v_devis, 'conception', 'Espace métier complexe', null, null, true, 20),
    (v_devis, 'site', 'Gros catalogue e-commerce', null, null, true, 30),
    (v_devis, 'site', 'Intégrations API spécifiques, ERP ou CRM', null, null, true, 40),
    (v_devis, 'conception', 'Architecture particulière, fort volume', null, null, true, 50),
    (v_devis, 'accompagnement', 'Devis détaillé, ligne par ligne', null, null, true, 60),
    (v_devis, 'accompagnement', 'Maintenance définie selon le projet', null, null, false, 70);
end;
$$;

-- -----------------------------------------------------------------------------
--  7. Commande : inclusions figees et maintenance en attente de livraison
-- -----------------------------------------------------------------------------
alter table public.orders
  add column if not exists plan_inclusions jsonb not null default '[]'::jsonb,
  add column if not exists maintenance_status text not null default 'not_applicable',
  add column if not exists maintenance_started_at timestamptz,
  add column if not exists stripe_payment_method_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_maintenance_status_valid') then
    alter table public.orders add constraint orders_maintenance_status_valid
      check (maintenance_status in
             ('not_applicable', 'pending_delivery', 'started', 'waived', 'failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_plan_inclusions_array') then
    alter table public.orders add constraint orders_plan_inclusions_array
      check (jsonb_typeof(plan_inclusions) = 'array');
  end if;
end;
$$;

comment on column public.orders.maintenance_status is
  'Cycle de la maintenance : `pending_delivery` apres paiement (rien n''est preleve avant la '
  'livraison), `started` quand l''abonnement demarre a la livraison, `waived` pour une '
  'commande interne, `failed` si le demarrage a echoue et doit etre relance.';

-- Donnees existantes : les commandes du parcours annuel creaient leur
-- abonnement au paiement ; elles sont marquees comme telles.
update public.orders o
   set maintenance_status = 'started',
       maintenance_started_at = coalesce(
         (select min(s.current_period_start) from public.subscriptions s where s.order_id = o.id),
         o.paid_at)
 where o.maintenance_status = 'not_applicable'
   and exists (select 1 from public.subscriptions s where s.order_id = o.id);

update public.orders
   set maintenance_status = 'waived'
 where maintenance_status = 'not_applicable'
   and billing_mode = 'internal';

update public.orders
   set maintenance_status = 'pending_delivery'
 where maintenance_status = 'not_applicable'
   and status in ('paid', 'partially_refunded')
   and maintenance_price_cents > 0;

-- Le passage en « payee » ouvre la maintenance EN ATTENTE DE LIVRAISON : rien
-- n'est facture avant que le site soit livre.
create or replace function app.orders_maintenance_lifecycle()
returns trigger
language plpgsql
set search_path = public, app, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.billing_mode = 'internal' then
      new.maintenance_status := 'waived';
    end if;
    return new;
  end if;

  if new.status = 'paid' and old.status is distinct from 'paid'
     and new.maintenance_price_cents > 0
     and new.maintenance_status = 'not_applicable' then
    new.maintenance_status := 'pending_delivery';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_maintenance_lifecycle on public.orders;
create trigger orders_maintenance_lifecycle
  before insert or update of status on public.orders
  for each row execute function app.orders_maintenance_lifecycle();

-- -----------------------------------------------------------------------------
--  8. Creation de commande : inclusions figees, maintenance decrite telle
--     qu'elle sera facturee (periodicite, point de depart)
-- -----------------------------------------------------------------------------
create or replace function app.plan_inclusions_snapshot(p_plan uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'category', i.category,
           'label', case when pf.limit_value is not null
                         then replace(i.label, '{limit}', pf.limit_value::text)
                         else i.label end,
           'detail', i.detail,
           'feature', i.feature_key)
           order by i.sort_order, i.label), '[]'::jsonb)
    from public.plan_inclusions i
    left join public.plan_features pf
      on pf.plan_id = i.plan_id and pf.feature_key = i.feature_key
   where i.plan_id = p_plan;
$$;

create or replace function app.create_order(
  p_organization_id  uuid,
  p_plan_id          uuid,
  p_sector_slug      text,
  p_business_type    text,
  p_questionnaire    jsonb default '{}'::jsonb,
  p_requested_domain text default null,
  p_domain_handling  text default 'none',
  p_coupon_code      text default null,
  p_customer_notes   text default null,
  p_terms_version    text default null,
  p_ip_hash          text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor    uuid := app.current_user_id();
  v_plan     public.plans%rowtype;
  v_price    app.price_breakdown;
  v_order_id uuid;
  v_ref      text;
begin
  if v_actor is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  if not (app.org_can(p_organization_id, 'billing.manage') or app.is_platform_admin()) then
    raise exception 'Droit de facturation requis sur cette organisation'
      using errcode = '42501';
  end if;
  if p_terms_version is null then
    raise exception 'Acceptation des conditions generales de vente requise'
      using errcode = '23514';
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  v_price := app.compute_order_pricing(p_plan_id, p_coupon_code);
  v_ref := app.next_order_reference();

  insert into public.orders (
    reference, organization_id, created_by, status,
    plan_id, plan_slug, plan_version,
    setup_price_cents, maintenance_price_cents, billing_interval, discount_cents,
    vat_rate_bps, vat_cents, total_cents, currency, coupon_code,
    sector_slug, business_type_slug, questionnaire,
    requested_domain, domain_handling, customer_notes,
    terms_version, terms_accepted_at, terms_accepted_ip_hash,
    plan_inclusions
  ) values (
    v_ref, p_organization_id, v_actor, 'draft',
    v_plan.id, v_plan.slug, v_plan.version,
    v_price.setup_cents, v_price.maintenance_cents, v_plan.billing_interval,
    v_price.discount_cents,
    v_price.vat_rate_bps, v_price.vat_cents, v_price.total_cents,
    v_price.currency, upper(nullif(p_coupon_code, '')),
    p_sector_slug, p_business_type, coalesce(p_questionnaire, '{}'::jsonb),
    lower(nullif(p_requested_domain, '')), p_domain_handling, p_customer_notes,
    p_terms_version, now(), p_ip_hash,
    app.plan_inclusions_snapshot(v_plan.id)
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, kind, label, quantity, unit_price_cents,
                                  total_cents, sort_order)
  values
    (v_order_id, 'plan_setup', 'Création du site — offre ' || v_plan.name,
     1, v_price.setup_cents, v_price.setup_cents, 10);

  if v_price.discount_cents > 0 then
    insert into public.order_items (order_id, kind, label, quantity, unit_price_cents,
                                    total_cents, sort_order)
    values (v_order_id, 'discount', 'Code promotionnel ' || upper(p_coupon_code),
            1, -v_price.discount_cents, -v_price.discount_cents, 20);
  end if;

  -- Ligne d'information : la maintenance n'est PAS encaissee a la commande.
  -- Elle est facturee a partir de la livraison du site, a la periodicite de
  -- l'offre.
  if v_price.maintenance_cents > 0 then
    insert into public.order_items (order_id, kind, label, description, quantity,
                                    unit_price_cents, total_cents, sort_order, metadata)
    values (v_order_id, 'plan_maintenance',
            'Maintenance '
              || case when v_plan.billing_interval = 'month' then 'mensuelle' else 'annuelle' end
              || ' — offre ' || v_plan.name,
            'Facturée à partir de la livraison du site, pas à la commande.',
            1, v_price.maintenance_cents, v_price.maintenance_cents, 30,
            jsonb_build_object('billing_interval', v_plan.billing_interval,
                               'starts', 'delivery'));
  end if;

  insert into public.consents (user_id, organization_id, kind, document_version,
                               granted, ip_hash, source)
  values (v_actor, p_organization_id, 'terms', p_terms_version, true, p_ip_hash, 'checkout');

  perform app.write_audit('order.created', p_organization_id, null, 'order',
                          v_order_id::text,
                          jsonb_build_object('reference', v_ref,
                                             'plan', v_plan.slug,
                                             'plan_version', v_plan.version,
                                             'billing_interval', v_plan.billing_interval,
                                             'total_cents', v_price.total_cents));
  return v_order_id;
end;
$$;

-- -----------------------------------------------------------------------------
--  9. Abonnement de maintenance : jamais avant la livraison
--
--  Repris de 0020, avec deux regles de plus :
--   - un abonnement MENSUEL (parcours en vigueur) ne peut etre enregistre que
--     pour un site deja livre : la maintenance commence a la livraison ;
--   - sa creation marque la maintenance de la commande comme demarree.
--  Les contrats annuels anterieurs suivent l'ancien parcours, inchange.
-- -----------------------------------------------------------------------------
create or replace function app.upsert_subscription_from_stripe(
  p_stripe_subscription_id text,
  p_stripe_customer_id     text,
  p_status                 text,
  p_period_start           timestamptz,
  p_period_end             timestamptz,
  p_cancel_at_period_end   boolean,
  p_order_id               uuid default null,
  p_price_id               text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_order        public.orders%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_status       app.subscription_status;
  v_state        app.maintenance_state;
  v_delivered    timestamptz;
begin
  v_status := case p_status
                when 'trialing' then 'trialing'
                when 'active' then 'active'
                when 'past_due' then 'past_due'
                when 'unpaid' then 'unpaid'
                when 'canceled' then 'canceled'
                when 'incomplete' then 'incomplete'
                when 'incomplete_expired' then 'canceled'
                when 'paused' then 'paused'
                else 'incomplete'
              end::app.subscription_status;

  v_state := case
               when v_status in ('trialing', 'active') then 'active'
               when v_status = 'past_due' then 'grace_period'
               when v_status in ('canceled', 'unpaid') then 'maintenance_ended'
               when v_status = 'paused' then 'suspended'
               else 'active'
             end::app.maintenance_state;

  if coalesce(p_cancel_at_period_end, false) and v_status in ('trialing', 'active') then
    v_state := 'cancel_at_period_end'::app.maintenance_state;
  end if;

  select * into v_subscription
    from public.subscriptions
   where stripe_subscription_id = p_stripe_subscription_id
   for update;

  if found then
    update public.subscriptions
       set status = v_status,
           maintenance_state = v_state,
           stripe_customer_id = coalesce(p_stripe_customer_id, stripe_customer_id),
           stripe_price_id = coalesce(p_price_id, stripe_price_id),
           current_period_start = coalesce(p_period_start, current_period_start),
           current_period_end = coalesce(p_period_end, current_period_end),
           cancel_at_period_end = coalesce(p_cancel_at_period_end, cancel_at_period_end),
           canceled_at = case when v_status = 'canceled' then coalesce(canceled_at, now())
                              else canceled_at end,
           grace_period_ends_at = case
             when v_status = 'canceled'
               then coalesce(p_period_end, now())
                    + make_interval(days => app.maintenance_grace_days())
             else grace_period_ends_at
           end
     where id = v_subscription.id;

    return jsonb_build_object('ok', true, 'code', 'updated', 'subscriptionId', v_subscription.id);
  end if;

  if p_order_id is null then
    return jsonb_build_object('ok', false, 'code', 'order_required');
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'order_not_found');
  end if;

  -- La maintenance mensuelle commence a la livraison, jamais avant. Un
  -- abonnement qui arriverait pour un site non livre est une anomalie : il
  -- est refuse et journalise, pour etre corrige, pas absorbe en silence.
  if v_order.billing_interval = 'month' then
    select delivered_at into v_delivered from public.sites where id = v_order.site_id;
    if v_delivered is null then
      perform app.write_audit(
        'subscription.refused_before_delivery', v_order.organization_id, v_order.site_id,
        'order', v_order.id::text,
        jsonb_build_object('stripe_subscription', p_stripe_subscription_id));
      return jsonb_build_object('ok', false, 'code', 'site_not_delivered');
    end if;
  end if;

  insert into public.subscriptions
    (organization_id, site_id, order_id, status, maintenance_state, plan_id, plan_slug,
     maintenance_price_cents, billing_interval, vat_rate_bps, currency,
     stripe_subscription_id, stripe_customer_id, stripe_price_id,
     current_period_start, current_period_end, cancel_at_period_end)
  values
    (v_order.organization_id, v_order.site_id, v_order.id, v_status, v_state,
     v_order.plan_id, v_order.plan_slug, v_order.maintenance_price_cents,
     v_order.billing_interval, v_order.vat_rate_bps,
     v_order.currency, p_stripe_subscription_id, p_stripe_customer_id, p_price_id,
     p_period_start, p_period_end, coalesce(p_cancel_at_period_end, false))
  returning * into v_subscription;

  update public.orders
     set maintenance_status = 'started',
         maintenance_started_at = coalesce(maintenance_started_at, p_period_start, now())
   where id = v_order.id
     and maintenance_status in ('not_applicable', 'pending_delivery', 'failed');

  perform app.write_audit(
    'subscription.created', v_order.organization_id, v_order.site_id,
    'subscription', v_subscription.id::text,
    jsonb_build_object('plan', v_order.plan_slug, 'status', v_status,
                       'billing_interval', v_order.billing_interval));

  return jsonb_build_object('ok', true, 'code', 'created', 'subscriptionId', v_subscription.id);
end;
$$;

-- Le demarrage de la maintenance a echoue cote Stripe (carte refusee, compte
-- client absent) : l'administration le voit et peut relancer.
create or replace function app.mark_maintenance_start_failed(p_order uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_order public.orders%rowtype;
begin
  if not (app.is_service_role() or app.is_platform_admin()) then
    raise exception 'Reserve au serveur de la plateforme' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order for update;
  if not found then
    return;
  end if;
  update public.orders
     set maintenance_status = 'failed'
   where id = p_order and maintenance_status in ('pending_delivery', 'failed');
  perform app.write_audit('maintenance.start_failed', v_order.organization_id, v_order.site_id,
                          'order', p_order::text,
                          jsonb_build_object('reason', left(coalesce(p_reason, ''), 300)));
end;
$$;

create or replace function public.mark_maintenance_start_failed(p_order uuid, p_reason text)
returns void language sql security definer set search_path = public, app, pg_catalog as $$
  select app.mark_maintenance_start_failed(p_order, p_reason);
$$;

revoke all on function app.mark_maintenance_start_failed(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_maintenance_start_failed(uuid, text) from public, anon;
grant execute on function public.mark_maintenance_start_failed(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
--  10. Support prioritaire : un droit applique, pas un slogan
-- -----------------------------------------------------------------------------
create or replace function app.apply_support_priority()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if new.organization_id is not null
     and new.priority in ('low', 'normal')
     and app.has_feature(new.organization_id, 'priority_support') then
    new.priority := 'high';
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_priority on public.support_tickets;
create trigger support_tickets_priority
  before insert on public.support_tickets
  for each row execute function app.apply_support_priority();

-- -----------------------------------------------------------------------------
--  11. Activations progressives qui ne pilotaient rien
--
--  Ces drapeaux n'etaient lus par aucun code : un drapeau qui ne deploie rien
--  laisse croire qu'une fonction existe. La publication programmee et le
--  multilingue sont desormais des droits d'offre REELLEMENT appliques ; les
--  virements instantanes n'existent pas.
-- -----------------------------------------------------------------------------
delete from public.feature_flags
 where key in ('editor.scheduled_publish', 'sites.multi_language', 'connect.instant_payouts');

-- -----------------------------------------------------------------------------
--  12. Codes promotionnels : seule la creation est remisee
--
--  `compute_order_pricing` n'a jamais applique de remise a la maintenance. Un
--  code « maintenance » s'enregistrait donc sans jamais rien retirer : il est
--  desormais refuse a la creation, et les codes existants de ce type sont
--  desactives plutot que laisses en promesse vide.
-- -----------------------------------------------------------------------------
update public.coupons
   set is_active = false
 where applies_to in ('maintenance', 'both') and is_active;

create or replace function app.guard_coupon_scope()
returns trigger
language plpgsql
set search_path = public, app, pg_catalog
as $$
begin
  if new.applies_to <> 'setup' and new.is_active then
    raise exception 'Un code promotionnel ne remise que la creation du site'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists coupons_guard_scope on public.coupons;
create trigger coupons_guard_scope
  before insert or update on public.coupons
  for each row execute function app.guard_coupon_scope();

-- =============================================================================
--  Nemasus — 0058 · Plateforme sur Vercel ; signalements identifiés
--
--  1. Sous-traitants : la plateforme (site public, espace client,
--     administration, API) est exécutée par Vercel, dans la région de Paris.
--     Cloudflare n'héberge plus que les sites des clients et leur API. La liste
--     publique (/sous-traitants) doit le dire exactement.
--  2. Signalements de contenus (règlement (UE) 2022/2065, art. 16, § 2, c) :
--     le nom et l'adresse électronique de l'auteur d'un signalement sont
--     obligatoires, sauf pour un contenu relevant des infractions des
--     articles 3 à 7 de la directive 2011/93/UE (abus sexuels sur mineurs).
--     Le formulaire l'exigeait déjà ; la base le garantit désormais.
--  3. Offres : une promesse exacte. Le site est conçu pour le client, mais
--     Nemasus réutilise ses composants techniques génériques (CGV, art. 16) :
--     « le code est réalisé pour vous » devient « développé pour votre site ».
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Sous-traitants
-- -----------------------------------------------------------------------------
insert into public.subprocessors
  (name, purpose, location, transfer_safeguards, privacy_url, dpa_url, category, sort_order)
select 'Vercel Inc.',
       'Hébergement et exécution de la plateforme Nemasus : site public, espace client, '
       || 'éditeur, administration et API ; journaux techniques (adresse IP, requêtes).',
       'Fonctions exécutées dans la région de Paris (France) ; société établie aux États-Unis, '
       || 'réseau de diffusion mondial',
       'Cadre de protection des données UE–États-Unis (Vercel Inc. y est certifiée) et clauses '
       || 'contractuelles types de la Commission européenne (Data Processing Addendum Vercel).',
       'https://vercel.com/legal/privacy-notice',
       'https://vercel.com/legal/dpa',
       'infrastructure', 5
 where not exists (select 1 from public.subprocessors where name = 'Vercel Inc.');

update public.subprocessors
   set purpose = 'Hébergement et diffusion des sites des clients, chacun sur son propre projet ; '
                 || 'API des sites (formulaires, réservations, boutique) ; CDN, protection '
                 || 'réseau, certificats TLS et vérification anti-robot des formulaires '
                 || '(Turnstile).',
       location = 'États-Unis (société) — réseau mondial, traitement au plus près du visiteur',
       updated_at = now()
 where name = 'Cloudflare, Inc.';

-- -----------------------------------------------------------------------------
--  2. Signalements : identité obligatoire, sauf l'exception du règlement
-- -----------------------------------------------------------------------------
alter table public.content_reports
  drop constraint if exists content_reports_reporter_identified;

-- NOT VALID puis VALIDATE : n'impose aucun verrou long, et échoue proprement
-- si un signalement ancien ne respectait pas la règle.
alter table public.content_reports
  add constraint content_reports_reporter_identified check (
    category = 'child_abuse'
    or (length(btrim(coalesce(reporter_name, ''))) >= 2 and reporter_email is not null)
  ) not valid;

alter table public.content_reports
  validate constraint content_reports_reporter_identified;

comment on constraint content_reports_reporter_identified on public.content_reports is
  'Règlement (UE) 2022/2065, art. 16 § 2 c : nom et e-mail obligatoires, sauf contenu relevant '
  'des articles 3 à 7 de la directive 2011/93/UE (catégorie child_abuse).';

-- -----------------------------------------------------------------------------
--  3. Offres : formulation exacte
-- -----------------------------------------------------------------------------
update public.plan_inclusions
   set detail = 'Aucun modèle à personnaliser : la structure et le design sont conçus pour vous, '
                || 'et le code est développé pour votre site.'
 where detail = 'Aucun modèle à personnaliser : la structure, le design et le code sont réalisés '
                || 'pour vous.';

update public.plan_inclusions
   set label = 'Composants dessinés et codés pour votre marque'
 where label = 'Composants uniques, codés pour votre marque';

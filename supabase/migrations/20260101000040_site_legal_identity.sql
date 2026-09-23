-- =============================================================================
--  StaX — 0040 · Identite legale des sites clients
--
--  Le client est l'editeur de son site : ses mentions obligatoires (raison
--  sociale, forme, immatriculation, siege, directeur de la publication…) sont
--  saisies une fois dans « Mon entreprise » et rendues automatiquement sur les
--  pages legales du site. Elles vivent dans site_settings, donc dans le
--  snapshot publie (app.build_site_snapshot reprend toute la ligne).
--
--  Les pages legales des sites deja crees portaient un texte fige avec des
--  « à compléter » : ce texte de modele est remplace par les sections
--  dynamiques. Seul le texte EXACT du modele est remplace ; une page que le
--  client a reecrite n'est pas touchee. Le site en ligne ne change qu'a la
--  prochaine publication.
-- =============================================================================

alter table public.site_settings
  add column if not exists legal_identity jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'site_settings_legal_identity_object'
  ) then
    alter table public.site_settings add constraint site_settings_legal_identity_object
      check (jsonb_typeof(legal_identity) = 'object' and octet_length(legal_identity::text) <= 8000);
  end if;
end;
$$;

comment on column public.site_settings.legal_identity is
  'Mentions legales de l''editeur du site (LCEN art. 6 III), saisies dans « Mon entreprise ».';

-- Modele fige -> section dynamique « Mentions légales ».
update public.page_blocks b
   set type = 'legal-notice', props = '{"extra": []}'::jsonb, version = 1
  from public.site_pages p
 where p.id = b.page_id
   and p.path = '/mentions-legales'
   and b.type = 'rich-text'
   and b.props::text like '%Numéro SIREN : à compléter%'
   and b.props::text like '%Responsable de la publication : à compléter%';

-- Modele fige -> section dynamique « Politique de confidentialité ».
update public.page_blocks b
   set type = 'privacy-notice', props = '{"extra": []}'::jsonb, version = 1
  from public.site_pages p
 where p.id = b.page_id
   and p.path = '/confidentialite'
   and b.type = 'rich-text'
   and b.props::text like '%Les informations que vous nous confiez%'
   and b.props::text like '%Combien de temps nous les gardons%';

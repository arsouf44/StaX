-- =============================================================================
--  StaX — 0035 · Libelles de metiers affiches aux clients
--
--  Quelques libelles de reference avaient perdu leurs accents. Ils sont lus
--  tels quels dans le tunnel de commande : « Cafe / salon de the » n'a pas
--  sa place devant un client. Meme valeurs que packages/business/src/registry.ts.
-- =============================================================================

update public.business_types set label = 'Café / salon de thé'          where slug = 'cafe';
update public.business_types set label = 'Indépendant / freelance'      where slug = 'freelance';
update public.business_types set label = 'Gîte / location saisonnière'  where slug = 'gite';
update public.business_types set label = 'Guide / activité touristique' where slug = 'guide-touristique';
update public.business_types set label = 'École / établissement'        where slug = 'ecole';

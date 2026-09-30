-- =============================================================================
--  Nemasus — 0061 · Libellés en français correct
--
--  Relecture du 2026-09-30 : des libellés stockés en base, affichés aux clients
--  (catalogue des modules, choix de fonctionnalités) et à l'équipe, avaient
--  perdu leurs accents — « Creneaux, capacites », « Actualites », « questions
--  recurrentes » — ou en portaient un de trop : « un formulaire qui qualifié
--  vos demandes ». Le registre TypeScript (`@nemasus/business`) est corrigé
--  dans le même changement ; les deux restent identiques.
--
--  Mise à jour ciblée : seule une valeur encore fautive est remplacée, jamais
--  un libellé que l'équipe aurait déjà modifié.
-- =============================================================================

update public.business_modules set description = 'Horaires réguliers, services midi/soir et fermetures exceptionnelles.'
 where slug = 'opening-hours'
   and description = 'Horaires reguliers, services midi/soir et fermetures exceptionnelles.';

update public.business_modules set description = 'Répondez aux questions récurrentes et gagnez du temps.'
 where slug = 'faq' and description = 'Répondez aux questions recurrentes et gagnez du temps.';

update public.business_modules set description = 'Un portfolio avant/après pour prouver votre savoir-faire.'
 where slug = 'portfolio' and description = 'Un portfolio avant/apres pour prouver votre savoir-faire.';

update public.business_modules set description = 'Un formulaire structuré qui qualifie vos demandes entrantes.'
 where slug = 'quotes' and description = 'Un formulaire structuré qui qualifié vos demandes entrantes.';

update public.business_modules set description = 'Créneaux, capacités, confirmations et rappels automatiques.'
 where slug = 'booking' and description = 'Creneaux, capacites, confirmations et rappels automatiques.';

update public.business_modules
   set description = replace(description, 'demandes de sejour', 'demandes de séjour')
 where description like '%demandes de sejour%';

update public.business_modules
   set description = replace(description, 'inscriptions a vos', 'inscriptions à vos')
 where description like '%inscriptions a vos%';

update public.business_modules set label = 'Actualités' where label = 'Actualites';

update public.feature_flags
   set description = 'Réordonnancement des sections par glisser-déposer.'
 where key = 'editor.drag_and_drop'
   and description = 'Reordonnancement des sections par glisser-déposer.';

update public.feature_flags
   set label = 'Virements instantanés Connect',
       description = 'Option de virement instantané pour les comptes connectés.'
 where key = 'connect.instant_payouts' and label = 'Virements instantanes Connect';

update public.system_health set label = 'Fournisseur d’e-mails'
 where key = 'email_provider' and label = 'Fournisseur d''e-mails';

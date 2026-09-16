-- =============================================================================
--  StaX — 0011 · Donnees de reference
--  Secteurs, metiers, modules, fonctionnalites, offres. Ce ne sont PAS des
--  donnees de demonstration : le produit ne fonctionne pas sans elles.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Secteurs d'activite
-- -----------------------------------------------------------------------------
insert into public.business_sectors (slug, label, description, icon, sort_order) values
  ('restauration', 'Restauration', 'Restaurants, bars, boulangeries, traiteurs et metiers de bouche.', 'utensils', 10),
  ('beaute-bien-etre', 'Beaute & bien-etre', 'Coiffure, esthetique, spa, massage et soins du corps.', 'sparkles', 20),
  ('artisanat', 'Artisanat & batiment', 'Metiers du batiment, de la renovation et de l''artisanat.', 'hammer', 30),
  ('commerce', 'Commerce & boutique', 'Commerces de proximite, boutiques et vente en ligne.', 'shopping-bag', 40),
  ('services-professionnels', 'Services professionnels', 'Conseil, expertise, professions liberales et cabinets.', 'briefcase', 50),
  ('immobilier', 'Immobilier', 'Agences, mandataires, gestion locative et diagnostic.', 'building-2', 60),
  ('hebergement-tourisme', 'Hebergement & tourisme', 'Hotels, chambres d''hotes, gites et activites touristiques.', 'bed-double', 70),
  ('sante', 'Sante & paramedical', 'Praticiens, cabinets et professions de sante.', 'stethoscope', 80),
  ('automobile', 'Automobile & mobilite', 'Garages, carrosseries, concessions et mobilite.', 'car', 90),
  ('sport', 'Sport & loisirs', 'Salles, clubs, coachs et activites sportives.', 'dumbbell', 100),
  ('evenementiel', 'Evenementiel', 'Organisation, prestation et location evenementielle.', 'party-popper', 110),
  ('education', 'Education & formation', 'Ecoles, formateurs, soutien scolaire et auto-ecoles.', 'graduation-cap', 120),
  ('associations', 'Associations', 'Associations, clubs et structures a but non lucratif.', 'heart-handshake', 130),
  ('autre', 'Autre activite', 'Votre metier n''apparait pas ? Nous l''ajoutons pour vous.', 'circle-ellipsis', 999);

-- -----------------------------------------------------------------------------
--  Metiers
-- -----------------------------------------------------------------------------
insert into public.business_types (slug, sector_slug, label, plural_label, icon, schema_org_type, sort_order) values
  -- Restauration
  ('restaurant', 'restauration', 'Restaurant', 'Restaurants', 'utensils', 'Restaurant', 10),
  ('pizzeria', 'restauration', 'Pizzeria', 'Pizzerias', 'pizza', 'Restaurant', 20),
  ('brasserie', 'restauration', 'Brasserie', 'Brasseries', 'beer', 'Restaurant', 30),
  ('bar', 'restauration', 'Bar', 'Bars', 'martini', 'BarOrPub', 40),
  ('cafe', 'restauration', 'Cafe / salon de the', 'Cafes', 'coffee', 'CafeOrCoffeeShop', 50),
  ('boulangerie', 'restauration', 'Boulangerie', 'Boulangeries', 'croissant', 'Bakery', 60),
  ('patisserie', 'restauration', 'Patisserie', 'Patisseries', 'cake-slice', 'Bakery', 70),
  ('traiteur', 'restauration', 'Traiteur', 'Traiteurs', 'chef-hat', 'FoodService', 80),
  ('food-truck', 'restauration', 'Food truck', 'Food trucks', 'truck', 'FoodEstablishment', 90),
  ('boucherie', 'restauration', 'Boucherie / charcuterie', 'Boucheries', 'beef', 'Store', 100),
  ('caviste', 'restauration', 'Caviste', 'Cavistes', 'wine', 'LiquorStore', 110),
  -- Beaute & bien-etre
  ('coiffeur', 'beaute-bien-etre', 'Coiffeur', 'Coiffeurs', 'scissors', 'HairSalon', 10),
  ('barbier', 'beaute-bien-etre', 'Barbier', 'Barbiers', 'scissors', 'HairSalon', 20),
  ('institut-beaute', 'beaute-bien-etre', 'Institut de beaute', 'Instituts de beaute', 'sparkles', 'BeautySalon', 30),
  ('spa', 'beaute-bien-etre', 'Spa', 'Spas', 'waves', 'DaySpa', 40),
  ('estheticienne', 'beaute-bien-etre', 'Estheticien(ne)', 'Estheticiens', 'flower-2', 'BeautySalon', 50),
  ('onglerie', 'beaute-bien-etre', 'Onglerie / nail artist', 'Ongleries', 'hand', 'NailSalon', 60),
  ('massage', 'beaute-bien-etre', 'Praticien en massage', 'Praticiens', 'hand-heart', 'HealthAndBeautyBusiness', 70),
  ('tatoueur', 'beaute-bien-etre', 'Tatoueur', 'Tatoueurs', 'pen-tool', 'TattooParlor', 80),
  -- Artisanat & batiment
  ('plombier', 'artisanat', 'Plombier / chauffagiste', 'Plombiers', 'wrench', 'Plumber', 10),
  ('electricien', 'artisanat', 'Electricien', 'Electriciens', 'zap', 'Electrician', 20),
  ('menuisier', 'artisanat', 'Menuisier', 'Menuisiers', 'ruler', 'GeneralContractor', 30),
  ('macon', 'artisanat', 'Macon', 'Macons', 'brick-wall', 'GeneralContractor', 40),
  ('peintre', 'artisanat', 'Peintre en batiment', 'Peintres', 'paint-roller', 'HousePainter', 50),
  ('couvreur', 'artisanat', 'Couvreur', 'Couvreurs', 'home', 'RoofingContractor', 60),
  ('serrurier', 'artisanat', 'Serrurier', 'Serruriers', 'key-round', 'Locksmith', 70),
  ('paysagiste', 'artisanat', 'Paysagiste / jardinier', 'Paysagistes', 'trees', 'LandscapeArchitect', 80),
  ('carreleur', 'artisanat', 'Carreleur', 'Carreleurs', 'grid-3x3', 'GeneralContractor', 90),
  ('renovation', 'artisanat', 'Entreprise de renovation', 'Entreprises de renovation', 'hard-hat', 'GeneralContractor', 100),
  -- Commerce
  ('boutique', 'commerce', 'Boutique', 'Boutiques', 'shopping-bag', 'Store', 10),
  ('pret-a-porter', 'commerce', 'Pret-a-porter', 'Boutiques de mode', 'shirt', 'ClothingStore', 20),
  ('fleuriste', 'commerce', 'Fleuriste', 'Fleuristes', 'flower', 'Florist', 30),
  ('epicerie', 'commerce', 'Epicerie fine', 'Epiceries', 'apple', 'GroceryStore', 40),
  ('bijouterie', 'commerce', 'Bijouterie', 'Bijouteries', 'gem', 'JewelryStore', 50),
  ('librairie', 'commerce', 'Librairie', 'Librairies', 'book-open', 'BookStore', 60),
  ('decoration', 'commerce', 'Decoration & maison', 'Boutiques de decoration', 'lamp', 'HomeGoodsStore', 70),
  ('producteur', 'commerce', 'Producteur / vente directe', 'Producteurs', 'wheat', 'Store', 80),
  -- Services professionnels
  ('conseil', 'services-professionnels', 'Cabinet de conseil', 'Cabinets de conseil', 'presentation', 'ProfessionalService', 10),
  ('avocat', 'services-professionnels', 'Avocat', 'Avocats', 'scale', 'Attorney', 20),
  ('expert-comptable', 'services-professionnels', 'Expert-comptable', 'Experts-comptables', 'calculator', 'AccountingService', 30),
  ('architecte', 'services-professionnels', 'Architecte', 'Architectes', 'drafting-compass', 'ProfessionalService', 40),
  ('photographe', 'services-professionnels', 'Photographe', 'Photographes', 'camera', 'ProfessionalService', 50),
  ('agence-communication', 'services-professionnels', 'Agence de communication', 'Agences', 'megaphone', 'ProfessionalService', 60),
  ('freelance', 'services-professionnels', 'Independant / freelance', 'Independants', 'user-round', 'ProfessionalService', 70),
  ('assurance', 'services-professionnels', 'Courtier / assurance', 'Courtiers', 'shield-check', 'InsuranceAgency', 80),
  -- Immobilier
  ('agence-immobiliere', 'immobilier', 'Agence immobiliere', 'Agences immobilieres', 'building-2', 'RealEstateAgent', 10),
  ('mandataire', 'immobilier', 'Mandataire immobilier', 'Mandataires', 'handshake', 'RealEstateAgent', 20),
  ('gestion-locative', 'immobilier', 'Gestion locative', 'Gestionnaires', 'key', 'RealEstateAgent', 30),
  ('diagnostic', 'immobilier', 'Diagnostiqueur', 'Diagnostiqueurs', 'clipboard-check', 'ProfessionalService', 40),
  -- Hebergement & tourisme
  ('hotel', 'hebergement-tourisme', 'Hotel', 'Hotels', 'bed-double', 'Hotel', 10),
  ('chambre-hotes', 'hebergement-tourisme', 'Chambre d''hotes', 'Chambres d''hotes', 'bed', 'BedAndBreakfast', 20),
  ('gite', 'hebergement-tourisme', 'Gite / location saisonniere', 'Gites', 'tent-tree', 'LodgingBusiness', 30),
  ('camping', 'hebergement-tourisme', 'Camping', 'Campings', 'tent', 'Campground', 40),
  ('guide-touristique', 'hebergement-tourisme', 'Guide / activite touristique', 'Guides', 'map', 'TouristAttraction', 50),
  -- Sante
  ('kinesitherapeute', 'sante', 'Kinesitherapeute', 'Kinesitherapeutes', 'activity', 'Physiotherapist', 10),
  ('osteopathe', 'sante', 'Osteopathe', 'Osteopathes', 'bone', 'MedicalBusiness', 20),
  ('dentiste', 'sante', 'Chirurgien-dentiste', 'Dentistes', 'smile', 'Dentist', 30),
  ('psychologue', 'sante', 'Psychologue', 'Psychologues', 'brain', 'Psychiatric', 40),
  ('opticien', 'sante', 'Opticien', 'Opticiens', 'glasses', 'Optician', 50),
  ('veterinaire', 'sante', 'Veterinaire', 'Veterinaires', 'paw-print', 'VeterinaryCare', 60),
  -- Automobile
  ('garage', 'automobile', 'Garage automobile', 'Garages', 'car', 'AutoRepair', 10),
  ('carrosserie', 'automobile', 'Carrosserie', 'Carrosseries', 'spray-can', 'AutoBodyShop', 20),
  ('concession', 'automobile', 'Concession / vente', 'Concessions', 'car-front', 'AutoDealer', 30),
  ('lavage-auto', 'automobile', 'Lavage & detailing', 'Centres de lavage', 'droplets', 'AutoWash', 40),
  ('moto', 'automobile', 'Moto & deux-roues', 'Concessions moto', 'bike', 'MotorcycleDealer', 50),
  -- Sport
  ('salle-sport', 'sport', 'Salle de sport', 'Salles de sport', 'dumbbell', 'ExerciseGym', 10),
  ('coach-sportif', 'sport', 'Coach sportif', 'Coachs sportifs', 'medal', 'SportsActivityLocation', 20),
  ('club-sportif', 'sport', 'Club sportif', 'Clubs sportifs', 'trophy', 'SportsClub', 30),
  ('yoga', 'sport', 'Studio yoga / pilates', 'Studios', 'flower-2', 'SportsActivityLocation', 40),
  -- Evenementiel
  ('wedding-planner', 'evenementiel', 'Wedding planner', 'Wedding planners', 'heart', 'ProfessionalService', 10),
  ('dj', 'evenementiel', 'DJ / animation', 'DJ', 'disc-3', 'ProfessionalService', 20),
  ('location-salle', 'evenementiel', 'Location de salle', 'Salles', 'building', 'EventVenue', 30),
  ('location-materiel', 'evenementiel', 'Location de materiel', 'Loueurs', 'package', 'ProfessionalService', 40),
  -- Education
  ('ecole', 'education', 'Ecole / etablissement', 'Ecoles', 'school', 'EducationalOrganization', 10),
  ('formateur', 'education', 'Organisme de formation', 'Organismes', 'presentation', 'EducationalOrganization', 20),
  ('soutien-scolaire', 'education', 'Soutien scolaire', 'Structures', 'book-open-check', 'EducationalOrganization', 30),
  ('auto-ecole', 'education', 'Auto-ecole', 'Auto-ecoles', 'traffic-cone', 'DrivingSchool', 40),
  ('musique', 'education', 'Ecole de musique', 'Ecoles de musique', 'music', 'EducationalOrganization', 50),
  -- Associations
  ('association', 'associations', 'Association', 'Associations', 'heart-handshake', 'NGO', 10),
  ('club', 'associations', 'Club / amicale', 'Clubs', 'users', 'Organization', 20),
  ('fondation', 'associations', 'Fondation', 'Fondations', 'landmark', 'NGO', 30),
  -- Autre
  ('autre-activite', 'autre', 'Autre activite', 'Autres activites', 'circle-ellipsis', 'LocalBusiness', 10);

-- -----------------------------------------------------------------------------
--  Modules metier
-- -----------------------------------------------------------------------------
insert into public.business_modules (slug, label, description, icon, category, required_feature, sort_order) values
  ('contact', 'Formulaire de contact', 'Recevez les messages de vos visiteurs dans votre boite de reception.', 'mail', 'crm', null, 10),
  ('opening-hours', 'Horaires d''ouverture', 'Horaires reguliers, services midi/soir et fermetures exceptionnelles.', 'clock', 'content', null, 20),
  ('gallery', 'Galerie photos', 'Mettez en valeur votre lieu, vos produits et vos realisations.', 'images', 'content', null, 30),
  ('testimonials', 'Avis clients', 'Publiez les temoignages de vos clients satisfaits.', 'quote', 'marketing', null, 40),
  ('faq', 'Questions frequentes', 'Repondez aux questions recurrentes et gagnez du temps.', 'help-circle', 'content', null, 50),
  ('team', 'Equipe', 'Presentez les personnes qui font votre entreprise.', 'users', 'content', null, 60),
  ('services', 'Prestations & tarifs', 'Detaillez vos prestations, leurs durees et leurs tarifs.', 'list-checks', 'content', null, 70),
  ('service-area', 'Zones d''intervention', 'Indiquez les communes et le rayon que vous couvrez.', 'map-pin', 'content', null, 80),
  ('portfolio', 'Realisations', 'Un portfolio avant/apres pour prouver votre savoir-faire.', 'layout-grid', 'content', null, 90),
  ('quotes', 'Demande de devis', 'Un formulaire structure qui qualifie vos demandes entrantes.', 'file-text', 'crm', null, 100),
  ('restaurant-menu', 'Carte & menus', 'Categories, plats, prix, allergenes, formules midi et soir.', 'utensils', 'content', null, 110),
  ('booking', 'Reservations', 'Creneaux, capacites, confirmations et rappels automatiques.', 'calendar-check', 'booking', 'bookings', 120),
  ('products', 'Catalogue produits', 'Produits, variantes, categories et stock simplifie.', 'package', 'commerce', 'ecommerce', 130),
  ('orders', 'Commandes en ligne', 'Panier, commande et suivi pour vos clients.', 'shopping-cart', 'commerce', 'ecommerce', 140),
  ('payments', 'Paiement en ligne', 'Encaissez directement sur votre propre compte Stripe.', 'credit-card', 'commerce', 'online_payments', 150),
  ('properties', 'Biens immobiliers', 'Annonces avec surface, DPE, photos et statut.', 'building-2', 'content', null, 160),
  ('rooms', 'Chambres & hebergements', 'Chambres, equipements, tarifs et demandes de sejour.', 'bed-double', 'content', null, 170),
  ('events', 'Evenements', 'Agenda, dates et inscriptions a vos evenements.', 'calendar-days', 'content', null, 180),
  ('blog', 'Actualites', 'Publiez vos nouvelles et alimentez votre referencement.', 'newspaper', 'marketing', 'blog', 190),
  ('newsletter', 'Newsletter', 'Collectez des inscriptions avec consentement explicite.', 'send', 'marketing', null, 200),
  ('customer-accounts', 'Comptes clients', 'Espace personnel pour les clients de votre site.', 'user-round-check', 'operations', 'customer_accounts', 210),
  ('donations', 'Dons', 'Recevez des dons ponctuels pour votre association.', 'heart', 'commerce', 'online_payments', 220);

-- -----------------------------------------------------------------------------
--  Affectation des modules par defaut selon le metier
-- -----------------------------------------------------------------------------
-- Socle commun a tous les metiers.
insert into public.business_type_modules (business_type_slug, module_slug, is_default, sort_order)
select bt.slug, bm.slug, true, bm.sort_order
  from public.business_types bt
 cross join (values ('contact'), ('gallery'), ('testimonials'), ('faq')) as m(slug)
  join public.business_modules bm on bm.slug = m.slug
    on conflict do nothing;

-- Horaires : tous les metiers recevant du public.
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, 'opening-hours', 20 from public.business_types
 where sector_slug in ('restauration','beaute-bien-etre','commerce','sante','automobile',
                       'sport','education','hebergement-tourisme')
    on conflict do nothing;

-- Restauration : carte, reservation, equipe.
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, 'restaurant-menu', 15 from public.business_types where sector_slug = 'restauration'
    on conflict do nothing;
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, 'booking', 25 from public.business_types
 where slug in ('restaurant','pizzeria','brasserie','bar','cafe')
    on conflict do nothing;
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, 'team', 60 from public.business_types where slug in ('restaurant','brasserie','patisserie')
    on conflict do nothing;

-- Beaute : prestations, reservation, equipe.
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, m, s from public.business_types
 cross join (values ('services', 15), ('booking', 25), ('team', 60)) as x(m, s)
 where sector_slug = 'beaute-bien-etre'
    on conflict do nothing;

-- Artisanat : prestations, zones, realisations, devis.
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, m, s from public.business_types
 cross join (values ('services', 15), ('service-area', 25), ('portfolio', 35), ('quotes', 45))
   as x(m, s)
 where sector_slug = 'artisanat'
    on conflict do nothing;

-- Commerce : catalogue, commandes, paiement.
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, m, s from public.business_types
 cross join (values ('products', 15), ('orders', 25), ('payments', 35)) as x(m, s)
 where sector_slug = 'commerce'
    on conflict do nothing;

-- Services professionnels : prestations, equipe, rendez-vous, devis.
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, m, s from public.business_types
 cross join (values ('services', 15), ('team', 25), ('booking', 35), ('quotes', 45)) as x(m, s)
 where sector_slug in ('services-professionnels', 'sante')
    on conflict do nothing;

-- Immobilier : biens, equipe, devis.
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, m, s from public.business_types
 cross join (values ('properties', 15), ('team', 25), ('quotes', 35)) as x(m, s)
 where sector_slug = 'immobilier'
    on conflict do nothing;

-- Hebergement : chambres, reservation, prestations.
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, m, s from public.business_types
 cross join (values ('rooms', 15), ('booking', 25), ('services', 35)) as x(m, s)
 where sector_slug = 'hebergement-tourisme'
    on conflict do nothing;

-- Automobile / sport / education : prestations et rendez-vous.
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, m, s from public.business_types
 cross join (values ('services', 15), ('booking', 25), ('team', 35)) as x(m, s)
 where sector_slug in ('automobile', 'sport', 'education')
    on conflict do nothing;

-- Evenementiel : realisations, prestations, devis.
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, m, s from public.business_types
 cross join (values ('portfolio', 15), ('services', 25), ('quotes', 35)) as x(m, s)
 where sector_slug = 'evenementiel'
    on conflict do nothing;

-- Associations : actualites, evenements, dons.
insert into public.business_type_modules (business_type_slug, module_slug, sort_order)
select slug, m, s from public.business_types
 cross join (values ('blog', 15), ('events', 25), ('donations', 35), ('newsletter', 45)) as x(m, s)
 where sector_slug = 'associations'
    on conflict do nothing;

-- -----------------------------------------------------------------------------
--  Fonctionnalites
-- -----------------------------------------------------------------------------
insert into public.features (key, label, description, category, kind, unit) values
  ('custom_domain', 'Nom de domaine personnalise', 'Connectez votre propre nom de domaine avec HTTPS automatique.', 'site', 'boolean', null),
  ('seo_tools', 'SEO technique', 'Balises, sitemap, donnees structurees et redirections.', 'site', 'boolean', null),
  ('content_editor', 'Editeur de contenu', 'Modifiez textes, photos et sections sans coder.', 'site', 'boolean', null),
  ('scheduled_publishing', 'Publication programmee', 'Preparez vos mises a jour et publiez a la date choisie.', 'site', 'boolean', null),
  ('version_history', 'Historique des versions', 'Revenez a une version anterieure a tout moment.', 'site', 'boolean', null),
  ('advanced_animations', 'Animations avancees', 'Transitions et interactions travaillees sur mesure.', 'design', 'boolean', null),
  ('custom_design', 'Design sur mesure', 'Composants et compositions specifiques a votre marque.', 'design', 'boolean', null),
  ('bookings', 'Reservations', 'Moteur de creneaux, capacites et confirmations.', 'modules', 'boolean', null),
  ('ecommerce', 'Vente en ligne', 'Catalogue, panier et commandes.', 'modules', 'boolean', null),
  ('online_payments', 'Paiement en ligne', 'Encaissement par carte via votre compte Stripe.', 'modules', 'boolean', null),
  ('customer_accounts', 'Comptes clients', 'Espace personnel pour les clients de votre site.', 'modules', 'boolean', null),
  ('blog', 'Actualites', 'Publiez articles et actualites.', 'modules', 'boolean', null),
  ('advanced_analytics', 'Statistiques avancees', 'Sources, conversions et suivi des objectifs.', 'analytics', 'boolean', null),
  ('multi_language', 'Multilingue', 'Plusieurs langues sur un meme site.', 'site', 'boolean', null),
  ('team_collaboration', 'Collaboration', 'Invitez des collaborateurs avec des roles distincts.', 'organisation', 'boolean', null),
  ('priority_support', 'Support prioritaire', 'Traitement prioritaire de vos demandes.', 'support', 'boolean', null),
  ('max_sites', 'Sites inclus', 'Nombre de sites geres dans l''espace.', 'limits', 'limit', 'site'),
  ('max_pages', 'Pages', 'Nombre de pages du site.', 'limits', 'limit', 'page'),
  ('max_team_members', 'Collaborateurs', 'Nombre de membres de l''equipe.', 'limits', 'limit', 'membre'),
  ('max_products', 'Produits', 'Nombre de produits au catalogue.', 'limits', 'limit', 'produit'),
  ('max_media_mb', 'Espace media', 'Espace de stockage pour vos photos et documents.', 'limits', 'limit', 'Mo'),
  ('max_monthly_submissions', 'Messages mensuels', 'Nombre de messages recus par mois.', 'limits', 'limit', 'message'),
  ('max_forms', 'Formulaires', 'Nombre de formulaires distincts.', 'limits', 'limit', 'formulaire');

-- -----------------------------------------------------------------------------
--  Offres
--  Montants en centimes. Aucune duplication ailleurs dans le code.
-- -----------------------------------------------------------------------------
insert into public.plans
  (slug, version, name, tagline, description, badge, setup_price_cents, monthly_price_cents,
   vat_rate_bps, is_quote_only, sort_order)
values
  ('classique', 1, 'Classique',
   'Le site vitrine professionnel, complet et rapide.',
   'Un site clair et performant pour presenter votre activite, etre trouve sur Google et recevoir vos premiers contacts.',
   null, 23999, 1400, 2000, false, 10),
  ('premium', 1, 'Premium',
   'Votre site devient un outil de travail.',
   'Reservations, paiement en ligne, modules metier et tableau de bord enrichi : votre site travaille pour vous.',
   'Le plus choisi', 49900, 3200, 2000, false, 20),
  ('signature', 1, 'Signature',
   'Une realisation sur mesure, sans compromis.',
   'Design entierement personnalise, animations avancees, architecture metier complexe et accompagnement rapproche.',
   null, 99900, 4000, 2000, false, 30),
  ('sur-mesure', 1, 'Sur mesure',
   'Un projet specifique, chiffre precisement.',
   'Application metier, integrations, volumetries importantes ou contraintes particulieres : nous etudions votre besoin et etablissons un devis detaille.',
   null, 0, 0, 2000, true, 40);

-- Droits par offre
do $$
declare
  v_classique uuid := (select id from public.plans where slug = 'classique' and version = 1);
  v_premium   uuid := (select id from public.plans where slug = 'premium' and version = 1);
  v_signature uuid := (select id from public.plans where slug = 'signature' and version = 1);
begin
  -- Classique : vitrine optimisee, sans compte client ni paiement en ligne.
  insert into public.plan_features (plan_id, feature_key, enabled, limit_value) values
    (v_classique, 'custom_domain', true, null),
    (v_classique, 'seo_tools', true, null),
    (v_classique, 'content_editor', true, null),
    (v_classique, 'version_history', true, null),
    (v_classique, 'scheduled_publishing', false, null),
    (v_classique, 'advanced_animations', false, null),
    (v_classique, 'custom_design', false, null),
    (v_classique, 'bookings', false, null),
    (v_classique, 'ecommerce', false, null),
    (v_classique, 'online_payments', false, null),
    (v_classique, 'customer_accounts', false, null),
    (v_classique, 'blog', false, null),
    (v_classique, 'advanced_analytics', false, null),
    (v_classique, 'multi_language', false, null),
    (v_classique, 'team_collaboration', true, null),
    (v_classique, 'priority_support', false, null),
    (v_classique, 'max_sites', true, 1),
    (v_classique, 'max_pages', true, 8),
    (v_classique, 'max_team_members', true, 2),
    (v_classique, 'max_products', false, 0),
    (v_classique, 'max_media_mb', true, 1024),
    (v_classique, 'max_monthly_submissions', true, 500),
    (v_classique, 'max_forms', true, 2);

  -- Premium : modules metier, reservations, paiement, comptes clients.
  insert into public.plan_features (plan_id, feature_key, enabled, limit_value) values
    (v_premium, 'custom_domain', true, null),
    (v_premium, 'seo_tools', true, null),
    (v_premium, 'content_editor', true, null),
    (v_premium, 'version_history', true, null),
    (v_premium, 'scheduled_publishing', true, null),
    (v_premium, 'advanced_animations', false, null),
    (v_premium, 'custom_design', false, null),
    (v_premium, 'bookings', true, null),
    (v_premium, 'ecommerce', true, null),
    (v_premium, 'online_payments', true, null),
    (v_premium, 'customer_accounts', true, null),
    (v_premium, 'blog', true, null),
    (v_premium, 'advanced_analytics', true, null),
    (v_premium, 'multi_language', false, null),
    (v_premium, 'team_collaboration', true, null),
    (v_premium, 'priority_support', false, null),
    (v_premium, 'max_sites', true, 1),
    (v_premium, 'max_pages', true, 25),
    (v_premium, 'max_team_members', true, 6),
    (v_premium, 'max_products', true, 300),
    (v_premium, 'max_media_mb', true, 5120),
    (v_premium, 'max_monthly_submissions', true, 3000),
    (v_premium, 'max_forms', true, 8);

  -- Signature : tout Premium, plus le design sur mesure et les animations.
  insert into public.plan_features (plan_id, feature_key, enabled, limit_value) values
    (v_signature, 'custom_domain', true, null),
    (v_signature, 'seo_tools', true, null),
    (v_signature, 'content_editor', true, null),
    (v_signature, 'version_history', true, null),
    (v_signature, 'scheduled_publishing', true, null),
    (v_signature, 'advanced_animations', true, null),
    (v_signature, 'custom_design', true, null),
    (v_signature, 'bookings', true, null),
    (v_signature, 'ecommerce', true, null),
    (v_signature, 'online_payments', true, null),
    (v_signature, 'customer_accounts', true, null),
    (v_signature, 'blog', true, null),
    (v_signature, 'advanced_analytics', true, null),
    (v_signature, 'multi_language', true, null),
    (v_signature, 'team_collaboration', true, null),
    (v_signature, 'priority_support', true, null),
    (v_signature, 'max_sites', true, 3),
    (v_signature, 'max_pages', true, null),
    (v_signature, 'max_team_members', true, 15),
    (v_signature, 'max_products', true, null),
    (v_signature, 'max_media_mb', true, 20480),
    (v_signature, 'max_monthly_submissions', true, null),
    (v_signature, 'max_forms', true, null);
end;
$$;

-- -----------------------------------------------------------------------------
--  Sous-traitants (RGPD, article 28) — le contenu reste a valider juridiquement
-- -----------------------------------------------------------------------------
insert into public.subprocessors (name, purpose, location, transfer_safeguards, privacy_url, category, sort_order) values
  ('Cloudflare, Inc.', 'Hebergement edge, CDN, protection reseau et certificats TLS.',
   'Union europeenne (traitement edge mondial)',
   'Clauses contractuelles types + Data Processing Addendum Cloudflare.',
   'https://www.cloudflare.com/privacypolicy/', 'infrastructure', 10),
  ('Supabase, Inc.', 'Base de donnees PostgreSQL, authentification et stockage de fichiers.',
   'Union europeenne (region de projet configurable)',
   'Clauses contractuelles types + DPA Supabase.',
   'https://supabase.com/privacy', 'infrastructure', 20),
  ('Stripe Payments Europe, Ltd.', 'Traitement des paiements et de la facturation.',
   'Irlande (Union europeenne)',
   'Responsable de traitement autonome pour la lutte anti-fraude.',
   'https://stripe.com/fr/privacy', 'paiement', 30);

-- -----------------------------------------------------------------------------
--  Indicateurs de sante systeme — etat reel uniquement
-- -----------------------------------------------------------------------------
insert into public.system_health (key, label, status, detail) values
  ('database', 'Base de donnees', 'unknown', 'En attente de la premiere sonde.'),
  ('stripe_webhooks', 'Webhooks Stripe', 'unknown', 'En attente du premier evenement.'),
  ('email_provider', 'Fournisseur d''e-mails', 'unknown', 'En attente du premier envoi.'),
  ('domain_verification', 'Verification des domaines', 'unknown', 'En attente de la premiere tache.'),
  ('analytics_rollup', 'Agregation des statistiques', 'unknown', 'En attente de la premiere execution.'),
  ('scheduled_publishing', 'Publications programmees', 'unknown', 'En attente de la premiere execution.'),
  ('backups', 'Sauvegardes PostgreSQL', 'not_configured',
   'La sauvegarde est assuree par Supabase. Renseignez la sonde pour afficher un etat reel.');

-- -----------------------------------------------------------------------------
--  Feature flags initiaux
-- -----------------------------------------------------------------------------
insert into public.feature_flags (key, label, description, enabled_globally, rules) values
  ('editor.drag_and_drop', 'Editeur — glisser-deposer', 'Reordonnancement des sections par glisser-deposer.', true, '{}'),
  ('editor.scheduled_publish', 'Editeur — publication programmee', 'Programmation d''une publication future.', false, '{"plans":["premium","signature"]}'),
  ('sites.multi_language', 'Sites multilingues', 'Gestion de plusieurs langues sur un site client.', false, '{"plans":["signature"]}'),
  ('billing.customer_portal', 'Portail de facturation Stripe', 'Acces au portail client Stripe depuis l''espace.', true, '{}'),
  ('connect.instant_payouts', 'Virements instantanes Connect', 'Option de virement instantane pour les comptes connectes.', false, '{}');

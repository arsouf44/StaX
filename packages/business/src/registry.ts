import type {
  BusinessDefinition,
  BusinessVocabulary,
  ModuleId,
  OnboardingQuestion,
  PageBlueprint,
  SeoDefaults,
} from './types';
import { COMMON_ONBOARDING, getSector } from './sectors';

/**
 * Registre des metiers.
 *
 * Chaque metier est une ligne de configuration : il herite des modules, des
 * pages, des questions et de la direction artistique de son secteur, puis
 * ajoute ce qui lui est propre. Aucun `if (business === ...)` n'existe dans
 * les composants — l'interface lit cette definition.
 */

interface BusinessSpec {
  id: string;
  sector: string;
  name: string;
  pluralName: string;
  icon: string;
  schemaOrgType: string;
  sortOrder: number;
  /** Modules ajoutes en plus de ceux du secteur. */
  extraModules?: readonly ModuleId[];
  /** Modules du secteur retires pour ce metier. */
  removeModules?: readonly ModuleId[];
  vocabulary?: Partial<BusinessVocabulary>;
  extraPages?: readonly PageBlueprint[];
  extraOnboarding?: readonly OnboardingQuestion[];
  seoKeywords?: readonly string[];
}

const DEFAULT_VOCABULARY: BusinessVocabulary = {
  offering: 'prestation',
  offeringPlural: 'prestations',
  customer: 'client',
  customerPlural: 'clients',
  booking: 'rendez-vous',
  bookingPlural: 'rendez-vous',
};

const RESTAURANT_VOCAB: BusinessVocabulary = {
  offering: 'plat',
  offeringPlural: 'plats',
  customer: 'client',
  customerPlural: 'clients',
  booking: 'reservation',
  bookingPlural: 'reservations',
};

const SHOP_VOCAB: BusinessVocabulary = {
  offering: 'produit',
  offeringPlural: 'produits',
  customer: 'client',
  customerPlural: 'clients',
};

const SPECS: readonly BusinessSpec[] = [
  /* --- Restauration ------------------------------------------------------ */
  {
    id: 'restaurant', sector: 'restauration', name: 'Restaurant', pluralName: 'Restaurants',
    icon: 'utensils', schemaOrgType: 'Restaurant', sortOrder: 10,
    extraModules: ['booking', 'team'], vocabulary: RESTAURANT_VOCAB,
    seoKeywords: ['restaurant', 'reserver une table', 'menu', 'carte'],
  },
  {
    id: 'pizzeria', sector: 'restauration', name: 'Pizzeria', pluralName: 'Pizzerias',
    icon: 'pizza', schemaOrgType: 'Restaurant', sortOrder: 20,
    extraModules: ['booking'], vocabulary: RESTAURANT_VOCAB,
  },
  {
    id: 'brasserie', sector: 'restauration', name: 'Brasserie', pluralName: 'Brasseries',
    icon: 'beer', schemaOrgType: 'Restaurant', sortOrder: 30,
    extraModules: ['booking', 'team'], vocabulary: RESTAURANT_VOCAB,
  },
  {
    id: 'bar', sector: 'restauration', name: 'Bar', pluralName: 'Bars',
    icon: 'martini', schemaOrgType: 'BarOrPub', sortOrder: 40,
    extraModules: ['booking', 'events'], vocabulary: RESTAURANT_VOCAB,
  },
  {
    id: 'cafe', sector: 'restauration', name: 'Cafe / salon de the', pluralName: 'Cafes',
    icon: 'coffee', schemaOrgType: 'CafeOrCoffeeShop', sortOrder: 50,
    extraModules: ['booking'], vocabulary: RESTAURANT_VOCAB,
  },
  {
    id: 'boulangerie', sector: 'restauration', name: 'Boulangerie', pluralName: 'Boulangeries',
    icon: 'croissant', schemaOrgType: 'Bakery', sortOrder: 60,
    extraModules: ['products'], vocabulary: SHOP_VOCAB,
  },
  {
    id: 'patisserie', sector: 'restauration', name: 'Patisserie', pluralName: 'Patisseries',
    icon: 'cake-slice', schemaOrgType: 'Bakery', sortOrder: 70,
    extraModules: ['products', 'orders', 'payments', 'team'], vocabulary: SHOP_VOCAB,
  },
  {
    id: 'traiteur', sector: 'restauration', name: 'Traiteur', pluralName: 'Traiteurs',
    icon: 'chef-hat', schemaOrgType: 'FoodService', sortOrder: 80,
    extraModules: ['quotes', 'portfolio'], vocabulary: RESTAURANT_VOCAB,
  },
  {
    id: 'food-truck', sector: 'restauration', name: 'Food truck', pluralName: 'Food trucks',
    icon: 'truck', schemaOrgType: 'FoodEstablishment', sortOrder: 90,
    extraModules: ['events'], vocabulary: RESTAURANT_VOCAB,
  },
  {
    id: 'boucherie', sector: 'restauration', name: 'Boucherie / charcuterie', pluralName: 'Boucheries',
    icon: 'beef', schemaOrgType: 'Store', sortOrder: 100,
    extraModules: ['products'], removeModules: ['restaurant-menu'], vocabulary: SHOP_VOCAB,
  },
  {
    id: 'caviste', sector: 'restauration', name: 'Caviste', pluralName: 'Cavistes',
    icon: 'wine', schemaOrgType: 'LiquorStore', sortOrder: 110,
    extraModules: ['products', 'orders', 'payments', 'events'],
    removeModules: ['restaurant-menu'], vocabulary: SHOP_VOCAB,
  },

  /* --- Beaute & bien-etre ------------------------------------------------ */
  {
    id: 'coiffeur', sector: 'beaute-bien-etre', name: 'Coiffeur', pluralName: 'Coiffeurs',
    icon: 'scissors', schemaOrgType: 'HairSalon', sortOrder: 10, extraModules: ['booking'],
    seoKeywords: ['coiffeur', 'salon de coiffure', 'prendre rendez-vous'],
  },
  {
    id: 'barbier', sector: 'beaute-bien-etre', name: 'Barbier', pluralName: 'Barbiers',
    icon: 'scissors', schemaOrgType: 'HairSalon', sortOrder: 20, extraModules: ['booking'],
  },
  {
    id: 'institut-beaute', sector: 'beaute-bien-etre', name: 'Institut de beaute',
    pluralName: 'Instituts de beaute', icon: 'sparkles', schemaOrgType: 'BeautySalon',
    sortOrder: 30, extraModules: ['booking'],
  },
  {
    id: 'spa', sector: 'beaute-bien-etre', name: 'Spa', pluralName: 'Spas',
    icon: 'waves', schemaOrgType: 'DaySpa', sortOrder: 40, extraModules: ['booking', 'products'],
  },
  {
    id: 'estheticienne', sector: 'beaute-bien-etre', name: 'Estheticien(ne)',
    pluralName: 'Estheticiens', icon: 'flower-2', schemaOrgType: 'BeautySalon',
    sortOrder: 50, extraModules: ['booking'],
  },
  {
    id: 'onglerie', sector: 'beaute-bien-etre', name: 'Onglerie / nail artist',
    pluralName: 'Ongleries', icon: 'hand', schemaOrgType: 'NailSalon',
    sortOrder: 60, extraModules: ['booking'],
  },
  {
    id: 'massage', sector: 'beaute-bien-etre', name: 'Praticien en massage',
    pluralName: 'Praticiens', icon: 'hand-heart', schemaOrgType: 'HealthAndBeautyBusiness',
    sortOrder: 70, extraModules: ['booking'],
  },
  {
    id: 'tatoueur', sector: 'beaute-bien-etre', name: 'Tatoueur', pluralName: 'Tatoueurs',
    icon: 'pen-tool', schemaOrgType: 'TattooParlor', sortOrder: 80,
    extraModules: ['booking', 'portfolio'],
  },

  /* --- Artisanat --------------------------------------------------------- */
  {
    id: 'plombier', sector: 'artisanat', name: 'Plombier / chauffagiste', pluralName: 'Plombiers',
    icon: 'wrench', schemaOrgType: 'Plumber', sortOrder: 10,
    seoKeywords: ['plombier', 'depannage', 'urgence plomberie', 'devis gratuit'],
  },
  {
    id: 'electricien', sector: 'artisanat', name: 'Electricien', pluralName: 'Electriciens',
    icon: 'zap', schemaOrgType: 'Electrician', sortOrder: 20,
  },
  {
    id: 'menuisier', sector: 'artisanat', name: 'Menuisier', pluralName: 'Menuisiers',
    icon: 'ruler', schemaOrgType: 'GeneralContractor', sortOrder: 30,
  },
  {
    id: 'macon', sector: 'artisanat', name: 'Macon', pluralName: 'Macons',
    icon: 'brick-wall', schemaOrgType: 'GeneralContractor', sortOrder: 40,
  },
  {
    id: 'peintre', sector: 'artisanat', name: 'Peintre en batiment', pluralName: 'Peintres',
    icon: 'paint-roller', schemaOrgType: 'HousePainter', sortOrder: 50,
  },
  {
    id: 'couvreur', sector: 'artisanat', name: 'Couvreur', pluralName: 'Couvreurs',
    icon: 'home', schemaOrgType: 'RoofingContractor', sortOrder: 60,
  },
  {
    id: 'serrurier', sector: 'artisanat', name: 'Serrurier', pluralName: 'Serruriers',
    icon: 'key-round', schemaOrgType: 'Locksmith', sortOrder: 70,
  },
  {
    id: 'paysagiste', sector: 'artisanat', name: 'Paysagiste / jardinier', pluralName: 'Paysagistes',
    icon: 'trees', schemaOrgType: 'LandscapeArchitect', sortOrder: 80,
  },
  {
    id: 'carreleur', sector: 'artisanat', name: 'Carreleur', pluralName: 'Carreleurs',
    icon: 'grid-3x3', schemaOrgType: 'GeneralContractor', sortOrder: 90,
  },
  {
    id: 'renovation', sector: 'artisanat', name: 'Entreprise de renovation',
    pluralName: 'Entreprises de renovation', icon: 'hard-hat',
    schemaOrgType: 'GeneralContractor', sortOrder: 100, extraModules: ['team'],
  },

  /* --- Commerce ---------------------------------------------------------- */
  {
    id: 'boutique', sector: 'commerce', name: 'Boutique', pluralName: 'Boutiques',
    icon: 'shopping-bag', schemaOrgType: 'Store', sortOrder: 10, vocabulary: SHOP_VOCAB,
  },
  {
    id: 'pret-a-porter', sector: 'commerce', name: 'Pret-a-porter', pluralName: 'Boutiques de mode',
    icon: 'shirt', schemaOrgType: 'ClothingStore', sortOrder: 20, vocabulary: SHOP_VOCAB,
  },
  {
    id: 'fleuriste', sector: 'commerce', name: 'Fleuriste', pluralName: 'Fleuristes',
    icon: 'flower', schemaOrgType: 'Florist', sortOrder: 30, vocabulary: SHOP_VOCAB,
  },
  {
    id: 'epicerie', sector: 'commerce', name: 'Epicerie fine', pluralName: 'Epiceries',
    icon: 'apple', schemaOrgType: 'GroceryStore', sortOrder: 40, vocabulary: SHOP_VOCAB,
  },
  {
    id: 'bijouterie', sector: 'commerce', name: 'Bijouterie', pluralName: 'Bijouteries',
    icon: 'gem', schemaOrgType: 'JewelryStore', sortOrder: 50, vocabulary: SHOP_VOCAB,
  },
  {
    id: 'librairie', sector: 'commerce', name: 'Librairie', pluralName: 'Librairies',
    icon: 'book-open', schemaOrgType: 'BookStore', sortOrder: 60,
    extraModules: ['events'], vocabulary: SHOP_VOCAB,
  },
  {
    id: 'decoration', sector: 'commerce', name: 'Decoration & maison',
    pluralName: 'Boutiques de decoration', icon: 'lamp', schemaOrgType: 'HomeGoodsStore',
    sortOrder: 70, vocabulary: SHOP_VOCAB,
  },
  {
    id: 'producteur', sector: 'commerce', name: 'Producteur / vente directe',
    pluralName: 'Producteurs', icon: 'wheat', schemaOrgType: 'Store', sortOrder: 80,
    vocabulary: SHOP_VOCAB,
  },

  /* --- Services professionnels ------------------------------------------ */
  {
    id: 'conseil', sector: 'services-professionnels', name: 'Cabinet de conseil',
    pluralName: 'Cabinets de conseil', icon: 'presentation',
    schemaOrgType: 'ProfessionalService', sortOrder: 10, extraModules: ['booking'],
  },
  {
    id: 'avocat', sector: 'services-professionnels', name: 'Avocat', pluralName: 'Avocats',
    icon: 'scale', schemaOrgType: 'Attorney', sortOrder: 20, extraModules: ['booking'],
    vocabulary: { offering: 'domaine d’intervention', offeringPlural: 'domaines d’intervention' },
  },
  {
    id: 'expert-comptable', sector: 'services-professionnels', name: 'Expert-comptable',
    pluralName: 'Experts-comptables', icon: 'calculator',
    schemaOrgType: 'AccountingService', sortOrder: 30, extraModules: ['booking'],
  },
  {
    id: 'architecte', sector: 'services-professionnels', name: 'Architecte',
    pluralName: 'Architectes', icon: 'drafting-compass',
    schemaOrgType: 'ProfessionalService', sortOrder: 40, extraModules: ['portfolio'],
  },
  {
    id: 'photographe', sector: 'services-professionnels', name: 'Photographe',
    pluralName: 'Photographes', icon: 'camera', schemaOrgType: 'ProfessionalService',
    sortOrder: 50, extraModules: ['portfolio', 'booking'],
  },
  {
    id: 'agence-communication', sector: 'services-professionnels',
    name: 'Agence de communication', pluralName: 'Agences', icon: 'megaphone',
    schemaOrgType: 'ProfessionalService', sortOrder: 60, extraModules: ['portfolio', 'blog'],
  },
  {
    id: 'freelance', sector: 'services-professionnels', name: 'Independant / freelance',
    pluralName: 'Independants', icon: 'user-round', schemaOrgType: 'ProfessionalService',
    sortOrder: 70, extraModules: ['portfolio'], removeModules: ['team'],
  },
  {
    id: 'assurance', sector: 'services-professionnels', name: 'Courtier / assurance',
    pluralName: 'Courtiers', icon: 'shield-check', schemaOrgType: 'InsuranceAgency',
    sortOrder: 80, extraModules: ['booking'],
  },

  /* --- Immobilier -------------------------------------------------------- */
  {
    id: 'agence-immobiliere', sector: 'immobilier', name: 'Agence immobiliere',
    pluralName: 'Agences immobilieres', icon: 'building-2',
    schemaOrgType: 'RealEstateAgent', sortOrder: 10,
    vocabulary: { offering: 'bien', offeringPlural: 'biens' },
    seoKeywords: ['agence immobiliere', 'achat', 'vente', 'estimation'],
  },
  {
    id: 'mandataire', sector: 'immobilier', name: 'Mandataire immobilier',
    pluralName: 'Mandataires', icon: 'handshake', schemaOrgType: 'RealEstateAgent',
    sortOrder: 20, removeModules: ['team'],
    vocabulary: { offering: 'bien', offeringPlural: 'biens' },
  },
  {
    id: 'gestion-locative', sector: 'immobilier', name: 'Gestion locative',
    pluralName: 'Gestionnaires', icon: 'key', schemaOrgType: 'RealEstateAgent',
    sortOrder: 30, vocabulary: { offering: 'bien', offeringPlural: 'biens' },
  },
  {
    id: 'diagnostic', sector: 'immobilier', name: 'Diagnostiqueur', pluralName: 'Diagnostiqueurs',
    icon: 'clipboard-check', schemaOrgType: 'ProfessionalService', sortOrder: 40,
    extraModules: ['services'], removeModules: ['properties'],
  },

  /* --- Hebergement ------------------------------------------------------- */
  {
    id: 'hotel', sector: 'hebergement-tourisme', name: 'Hotel', pluralName: 'Hotels',
    icon: 'bed-double', schemaOrgType: 'Hotel', sortOrder: 10, extraModules: ['booking'],
    vocabulary: { offering: 'chambre', offeringPlural: 'chambres', booking: 'sejour', bookingPlural: 'sejours' },
  },
  {
    id: 'chambre-hotes', sector: 'hebergement-tourisme', name: 'Chambre d’hotes',
    pluralName: 'Chambres d’hotes', icon: 'bed', schemaOrgType: 'BedAndBreakfast',
    sortOrder: 20, extraModules: ['booking'],
    vocabulary: { offering: 'chambre', offeringPlural: 'chambres', booking: 'sejour', bookingPlural: 'sejours' },
  },
  {
    id: 'gite', sector: 'hebergement-tourisme', name: 'Gite / location saisonniere',
    pluralName: 'Gites', icon: 'tent-tree', schemaOrgType: 'LodgingBusiness',
    sortOrder: 30, extraModules: ['booking'],
    vocabulary: { offering: 'hebergement', offeringPlural: 'hebergements', booking: 'sejour', bookingPlural: 'sejours' },
  },
  {
    id: 'camping', sector: 'hebergement-tourisme', name: 'Camping', pluralName: 'Campings',
    icon: 'tent', schemaOrgType: 'Campground', sortOrder: 40, extraModules: ['booking', 'events'],
  },
  {
    id: 'guide-touristique', sector: 'hebergement-tourisme', name: 'Guide / activite touristique',
    pluralName: 'Guides', icon: 'map', schemaOrgType: 'TouristAttraction', sortOrder: 50,
    extraModules: ['booking'], removeModules: ['rooms'],
  },

  /* --- Sante ------------------------------------------------------------- */
  {
    id: 'kinesitherapeute', sector: 'sante', name: 'Kinesitherapeute', pluralName: 'Kinesitherapeutes',
    icon: 'activity', schemaOrgType: 'Physiotherapist', sortOrder: 10, extraModules: ['booking'],
  },
  {
    id: 'osteopathe', sector: 'sante', name: 'Osteopathe', pluralName: 'Osteopathes',
    icon: 'bone', schemaOrgType: 'MedicalBusiness', sortOrder: 20, extraModules: ['booking'],
  },
  {
    id: 'dentiste', sector: 'sante', name: 'Chirurgien-dentiste', pluralName: 'Dentistes',
    icon: 'smile', schemaOrgType: 'Dentist', sortOrder: 30, extraModules: ['booking'],
  },
  {
    id: 'psychologue', sector: 'sante', name: 'Psychologue', pluralName: 'Psychologues',
    icon: 'brain', schemaOrgType: 'Psychiatric', sortOrder: 40,
    extraModules: ['booking'], removeModules: ['team'],
  },
  {
    id: 'opticien', sector: 'sante', name: 'Opticien', pluralName: 'Opticiens',
    icon: 'glasses', schemaOrgType: 'Optician', sortOrder: 50, extraModules: ['booking', 'products'],
  },
  {
    id: 'veterinaire', sector: 'sante', name: 'Veterinaire', pluralName: 'Veterinaires',
    icon: 'paw-print', schemaOrgType: 'VeterinaryCare', sortOrder: 60, extraModules: ['booking'],
  },

  /* --- Automobile -------------------------------------------------------- */
  {
    id: 'garage', sector: 'automobile', name: 'Garage automobile', pluralName: 'Garages',
    icon: 'car', schemaOrgType: 'AutoRepair', sortOrder: 10, extraModules: ['booking'],
  },
  {
    id: 'carrosserie', sector: 'automobile', name: 'Carrosserie', pluralName: 'Carrosseries',
    icon: 'spray-can', schemaOrgType: 'AutoBodyShop', sortOrder: 20, extraModules: ['portfolio'],
  },
  {
    id: 'concession', sector: 'automobile', name: 'Concession / vente', pluralName: 'Concessions',
    icon: 'car-front', schemaOrgType: 'AutoDealer', sortOrder: 30, extraModules: ['products'],
  },
  {
    id: 'lavage-auto', sector: 'automobile', name: 'Lavage & detailing',
    pluralName: 'Centres de lavage', icon: 'droplets', schemaOrgType: 'AutoWash',
    sortOrder: 40, extraModules: ['booking'],
  },
  {
    id: 'moto', sector: 'automobile', name: 'Moto & deux-roues', pluralName: 'Concessions moto',
    icon: 'bike', schemaOrgType: 'MotorcycleDealer', sortOrder: 50, extraModules: ['products'],
  },

  /* --- Sport ------------------------------------------------------------- */
  {
    id: 'salle-sport', sector: 'sport', name: 'Salle de sport', pluralName: 'Salles de sport',
    icon: 'dumbbell', schemaOrgType: 'ExerciseGym', sortOrder: 10, extraModules: ['booking'],
  },
  {
    id: 'coach-sportif', sector: 'sport', name: 'Coach sportif', pluralName: 'Coachs sportifs',
    icon: 'medal', schemaOrgType: 'SportsActivityLocation', sortOrder: 20,
    extraModules: ['booking'], removeModules: ['team'],
  },
  {
    id: 'club-sportif', sector: 'sport', name: 'Club sportif', pluralName: 'Clubs sportifs',
    icon: 'trophy', schemaOrgType: 'SportsClub', sortOrder: 30, extraModules: ['events', 'blog'],
  },
  {
    id: 'yoga', sector: 'sport', name: 'Studio yoga / pilates', pluralName: 'Studios',
    icon: 'flower-2', schemaOrgType: 'SportsActivityLocation', sortOrder: 40,
    extraModules: ['booking'],
  },

  /* --- Evenementiel ------------------------------------------------------ */
  {
    id: 'wedding-planner', sector: 'evenementiel', name: 'Wedding planner',
    pluralName: 'Wedding planners', icon: 'heart', schemaOrgType: 'ProfessionalService',
    sortOrder: 10,
  },
  {
    id: 'dj', sector: 'evenementiel', name: 'DJ / animation', pluralName: 'DJ',
    icon: 'disc-3', schemaOrgType: 'ProfessionalService', sortOrder: 20, extraModules: ['events'],
  },
  {
    id: 'location-salle', sector: 'evenementiel', name: 'Location de salle', pluralName: 'Salles',
    icon: 'building', schemaOrgType: 'EventVenue', sortOrder: 30, extraModules: ['booking'],
  },
  {
    id: 'location-materiel', sector: 'evenementiel', name: 'Location de materiel',
    pluralName: 'Loueurs', icon: 'package', schemaOrgType: 'ProfessionalService',
    sortOrder: 40, extraModules: ['products'],
  },

  /* --- Education --------------------------------------------------------- */
  {
    id: 'ecole', sector: 'education', name: 'Ecole / etablissement', pluralName: 'Ecoles',
    icon: 'school', schemaOrgType: 'EducationalOrganization', sortOrder: 10,
    extraModules: ['blog', 'events'],
  },
  {
    id: 'formateur', sector: 'education', name: 'Organisme de formation', pluralName: 'Organismes',
    icon: 'presentation', schemaOrgType: 'EducationalOrganization', sortOrder: 20,
    extraModules: ['booking'],
  },
  {
    id: 'soutien-scolaire', sector: 'education', name: 'Soutien scolaire', pluralName: 'Structures',
    icon: 'book-open-check', schemaOrgType: 'EducationalOrganization', sortOrder: 30,
    extraModules: ['booking'],
  },
  {
    id: 'auto-ecole', sector: 'education', name: 'Auto-ecole', pluralName: 'Auto-ecoles',
    icon: 'traffic-cone', schemaOrgType: 'DrivingSchool', sortOrder: 40, extraModules: ['booking'],
  },
  {
    id: 'musique', sector: 'education', name: 'Ecole de musique', pluralName: 'Ecoles de musique',
    icon: 'music', schemaOrgType: 'EducationalOrganization', sortOrder: 50,
    extraModules: ['events'],
  },

  /* --- Associations ------------------------------------------------------ */
  {
    id: 'association', sector: 'associations', name: 'Association', pluralName: 'Associations',
    icon: 'heart-handshake', schemaOrgType: 'NGO', sortOrder: 10, extraModules: ['donations'],
    vocabulary: { customer: 'adherent', customerPlural: 'adherents' },
  },
  {
    id: 'club', sector: 'associations', name: 'Club / amicale', pluralName: 'Clubs',
    icon: 'users', schemaOrgType: 'Organization', sortOrder: 20, extraModules: ['team'],
    vocabulary: { customer: 'membre', customerPlural: 'membres' },
  },
  {
    id: 'fondation', sector: 'associations', name: 'Fondation', pluralName: 'Fondations',
    icon: 'landmark', schemaOrgType: 'NGO', sortOrder: 30, extraModules: ['donations'],
    vocabulary: { customer: 'donateur', customerPlural: 'donateurs' },
  },

  /* --- Autre ------------------------------------------------------------- */
  {
    id: 'autre-activite', sector: 'autre', name: 'Autre activite', pluralName: 'Autres activites',
    icon: 'circle-ellipsis', schemaOrgType: 'LocalBusiness', sortOrder: 10,
  },
];

function buildSeo(spec: BusinessSpec): SeoDefaults {
  return {
    titleTemplate: `{business} — ${spec.name} a {city}`,
    descriptionTemplate:
      `{business}, ${spec.name.toLowerCase()} a {city}. {pitch} ` +
      'Contactez-nous ou consultez nos informations pratiques.',
    keywords: spec.seoKeywords ?? [spec.name.toLowerCase(), '{city}'],
    schemaOrgType: spec.schemaOrgType,
  };
}

function buildDefinition(spec: BusinessSpec): BusinessDefinition {
  const sector = getSector(spec.sector);
  if (!sector) {
    throw new Error(`[StaX] Metier « ${spec.id} » rattache a un secteur inconnu : ${spec.sector}`);
  }

  const removed = new Set(spec.removeModules ?? []);
  const modules = [
    ...new Set([...sector.defaultModules, ...(spec.extraModules ?? [])]),
  ].filter((id) => !removed.has(id));

  // Les pages du secteur ne sont conservees que si leurs blocs restent
  // couverts par les modules actifs : un mandataire sans page equipe, par
  // exemple, n'herite pas d'une page vide.
  const pages = [...sector.defaultPages, ...(spec.extraPages ?? [])];

  return {
    id: spec.id,
    sector: spec.sector,
    name: spec.name,
    pluralName: spec.pluralName,
    icon: spec.icon,
    modules,
    recommendedPages: pages,
    onboarding: [...COMMON_ONBOARDING, ...sector.onboarding, ...(spec.extraOnboarding ?? [])],
    seoDefaults: buildSeo(spec),
    theme: sector.theme,
    vocabulary: { ...DEFAULT_VOCABULARY, ...spec.vocabulary },
    sortOrder: spec.sortOrder,
  };
}

const BUSINESSES: readonly BusinessDefinition[] = SPECS.map(buildDefinition);
const BUSINESS_INDEX = new Map(BUSINESSES.map((b) => [b.id, b]));

export function getBusiness(id: string | null | undefined): BusinessDefinition | undefined {
  if (!id) return undefined;
  return BUSINESS_INDEX.get(id);
}

export function listBusinesses(): readonly BusinessDefinition[] {
  return BUSINESSES;
}

export function listBusinessesBySector(sectorId: string): readonly BusinessDefinition[] {
  return BUSINESSES.filter((b) => b.sector === sectorId).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

/** Metier de repli, pour ne jamais rendre une interface vide. */
export function fallbackBusiness(): BusinessDefinition {
  const fallback = BUSINESS_INDEX.get('autre-activite');
  if (!fallback) throw new Error('[StaX] Metier de repli introuvable dans le registre.');
  return fallback;
}

export function resolveBusiness(id: string | null | undefined): BusinessDefinition {
  return getBusiness(id) ?? fallbackBusiness();
}

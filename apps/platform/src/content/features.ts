import type { PlanSlug } from '@stax/types';

/**
 * Pages de fonctionnalités.
 *
 * Une seule source de contenu, rendue par une page dynamique : ajouter une
 * fonctionnalité se fait ici, sans dupliquer une page entière. Chaque entrée
 * décrit ce que la fonctionnalité fait réellement — aucune promesse que le
 * produit ne tient pas. Le site est conçu et développé par notre équipe ; ces
 * pages décrivent ce que le client en fait APRÈS la livraison.
 */

export interface FeatureSection {
  title: string;
  body: string;
  points?: readonly string[];
}

export interface FeaturePage {
  slug: string;
  name: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Visuel affiché en tête de page. */
  visual: 'dashboard' | 'editor' | 'site' | 'domains' | 'payments' | 'none';
  sections: readonly FeatureSection[];
  /** Ce que la fonctionnalité ne fait PAS : dit franchement, pas caché. */
  limits?: readonly string[];
  /**
   * Offre minimale requise, ou `null` si incluse partout.
   *
   * Ces valeurs sont les slugs REELS du catalogue. Elles ont porte des noms
   * d'offres disparus (« classique », « signature ») pendant que la base
   * accordait deja autre chose : une page vitrine annoncait alors une
   * fonctionnalite dans une offre qui ne la comportait pas.
   * `tests/integration/plan-promises.test.ts` compare desormais ces valeurs
   * a la grille `plan_features`.
   */
  requiredPlan: Exclude<PlanSlug, 'sur-mesure'> | null;
  related: readonly string[];
}

export const FEATURE_PAGES: readonly FeaturePage[] = [
  {
    slug: 'editeur',
    name: 'Éditeur de contenu',
    eyebrow: 'Après la livraison',
    title: 'Modifiez le contenu de votre site, sans coder',
    subtitle:
      'Nous créons votre site, vous le gérez ensuite. Une fois votre site livré, vous modifiez vos textes, vos photos, vos horaires et vos informations. Rien n’apparaît en ligne tant que vous n’avez pas publié.',
    visual: 'editor',
    requiredPlan: null,
    sections: [
      {
        title: 'Vous cliquez, vous modifiez',
        body: 'L’éditeur affiche votre vrai site. Cliquez sur un texte, une image ou un bouton : StaX présente simplement les champs que votre site permet de modifier — un titre, un texte, une image à remplacer, le texte et le lien d’un bouton. Ni HTML, ni code, ni fichiers.',
        points: [
          'Aperçu de votre vrai site, sur ordinateur et sur mobile',
          'Des champs simples : texte, image, lien, horaires, listes',
          'Actualités, réalisations ou produits : ajoutez et retirez des éléments lorsque votre site le prévoit',
          'Brouillon enregistré, repris là où vous l’avez laissé',
        ],
      },
      {
        title: 'Brouillon, aperçu, publication',
        body: 'Ce que vous modifiez reste un brouillon : vos visiteurs continuent de voir la version en ligne. Quand vous cliquez sur « Publier », vos modifications sont enregistrées dans le code de votre site puis déployées. StaX n’affiche « Publié » qu’une fois le déploiement confirmé ; si quelque chose échoue, la version précédente reste en ligne et l’erreur vous est indiquée.',
        points: [
          'Le brouillon n’affecte jamais la version publiée',
          'L’aperçu montre votre vrai site, pas une imitation',
          'Publication réellement déployée, confirmée avant d’être annoncée',
        ],
      },
      {
        title: 'Un historique, et un retour en arrière',
        body: 'Chaque publication crée une version datée, avec son auteur et sa référence de déploiement. Si une modification ne convient pas, vous restaurez une version précédente : elle est republiée, réellement.',
        points: [
          'Historique complet des publications',
          'Restauration et republication d’une version antérieure',
          'Auteur, date et statut de déploiement sur chaque version',
        ],
      },
      {
        title: 'Votre site reste solide',
        body: 'Le design, la mise en page, l’affichage sur mobile, le code et les intégrations restent entre nos mains : vous ne pouvez pas les casser par inadvertance. Les champs vérifient ce que vous saisissez — longueur d’un titre, format d’une adresse e-mail ou d’un lien, présence d’un texte alternatif sur une image.',
      },
    ],
    limits: [
      'L’éditeur ne permet pas d’ajouter une page, de déplacer des sections ni de modifier le design : ce sont des changements de structure, que notre équipe réalise pour vous, sur devis lorsqu’ils dépassent la maintenance.',
      'L’éditeur s’ouvre à la livraison de votre site. Pendant sa construction, votre espace sert à suivre le projet et à nous transmettre vos éléments.',
      'Aucun code arbitraire ne peut être inséré : c’est une protection contre les failles de sécurité, pas une limitation commerciale.',
    ],
    related: ['gestion-contenu', 'domaines', 'seo'],
  },
  {
    slug: 'domaines',
    name: 'Noms de domaine',
    eyebrow: 'Adresse',
    title: 'Votre domaine, connecté et sécurisé',
    subtitle:
      'Votre site répond sous votre propre nom, en HTTPS, avec un certificat renouvelé automatiquement. Votre domaine pointe vers le déploiement de votre propre site, pas vers une plateforme partagée.',
    visual: 'domains',
    requiredPlan: null,
    sections: [
      {
        title: 'Vous avez déjà un nom de domaine',
        body: 'Nous vous indiquons précisément les enregistrements DNS à ajouter chez votre registrar, ou nous nous en chargeons si vous nous en confiez l’accès. Nous rattachons ensuite votre domaine au projet Cloudflare de votre site et vérifions la configuration avant la livraison.',
        points: [
          'Instructions DNS détaillées',
          'Vérification de la configuration avant la livraison',
          'Certificat HTTPS émis et renouvelé automatiquement',
          'Aucun transfert de domaine imposé',
        ],
      },
      {
        title: 'Vous n’en avez pas encore',
        body: 'Nous vous aidons à le choisir et pouvons l’acheter pour votre compte : il est alors enregistré à votre nom, et nous en assurons le renouvellement tant que la maintenance est en cours. Pendant son développement, votre site est vérifié sur une adresse technique ; il est livré sur votre domaine.',
      },
      {
        title: 'Une protection contre le détournement',
        body: 'Un nom de domaine actif ne peut être rattaché qu’à un seul site, et le domaine n’est activé qu’une fois sa configuration DNS vérifiée. Personne ne peut revendiquer votre adresse.',
        points: [
          'Configuration vérifiée avant activation',
          'Un domaine actif, un seul site',
          'Chaque rattachement est tracé',
        ],
      },
    ],
    limits: [
      'Nous ne sommes pas registrar : l’achat du domaine se fait chez un bureau d’enregistrement, pour vous ou par nous pour votre compte.',
    ],
    related: ['seo', 'editeur'],
  },
  {
    slug: 'formulaires',
    name: 'Formulaires',
    eyebrow: 'Contact',
    title: 'Des formulaires qui qualifient vos demandes',
    subtitle:
      'Un formulaire de contact générique vous fait perdre du temps. Ceux que nous développons pour votre site posent les bonnes questions selon votre métier.',
    visual: 'dashboard',
    requiredPlan: null,
    sections: [
      {
        title: 'Adaptés à votre activité',
        body: 'Un plombier reçoit la nature de la panne, l’urgence et le code postal. Un traiteur reçoit la date, le nombre de convives et le type d’événement. Vous rappelez en connaissant déjà le besoin. L’offre Essentiel comprend un formulaire de contact ; plusieurs formulaires et des champs avancés sont inclus dès l’offre Premium.',
      },
      {
        title: 'Protégés contre le spam',
        body: 'Champ piège invisible, mesure du temps de remplissage, limitation du nombre d’envois et analyse du contenu. Les messages suspects arrivent dans un onglet dédié plutôt que d’être supprimés : aucun message légitime n’est perdu.',
        points: [
          'Aucun captcha imposé à vos visiteurs par défaut',
          'Onglet « Indésirables » récupérable',
          'Limitation du nombre d’envois par heure',
        ],
      },
      {
        title: 'Une notification immédiate',
        body: 'Chaque demande déclenche un e-mail vers les adresses que vous choisissez, et apparaît dans votre boîte de réception StaX avec son statut de traitement.',
      },
    ],
    related: ['messages', 'reservations'],
  },
  {
    slug: 'messages',
    name: 'Messages',
    eyebrow: 'Boîte de réception',
    title: 'Toutes vos demandes au même endroit',
    subtitle:
      'Plus de messages perdus entre une boîte mail saturée, un répondeur et un carnet. Chaque demande a un statut, une réponse et un historique.',
    visual: 'dashboard',
    requiredPlan: null,
    sections: [
      {
        title: 'Non lu, lu, traité',
        body: 'Chaque message porte un statut clair. Vous voyez d’un coup d’œil ce qui attend une réponse, et vous pouvez ajouter une note interne visible seulement par votre équipe.',
      },
      {
        title: 'Un carnet de contacts qui se remplit tout seul',
        body: 'Chaque demande alimente automatiquement votre fichier clients : nom, e-mail, téléphone, origine. Vous retrouvez l’historique complet d’une personne, même si elle vous a écrit six mois plus tôt.',
        points: [
          'Fusion automatique des demandes d’un même contact',
          'Étiquettes et notes libres',
          'Export au format CSV ou JSON',
        ],
      },
      {
        title: 'Exportable, à tout moment',
        body: 'Vos contacts vous appartiennent. Vous pouvez les exporter quand vous voulez, dans un format réutilisable par n’importe quel autre outil.',
      },
    ],
    related: ['formulaires', 'analytics'],
  },
  {
    slug: 'analytics',
    name: 'Statistiques',
    eyebrow: 'Mesure',
    title: 'Comprendre votre audience, sans pister personne',
    subtitle:
      'Combien de visiteurs, quelles pages, d’où viennent-ils. Sans cookie de pistage, sans conserver d’adresse IP, sans revendre quoi que ce soit.',
    visual: 'dashboard',
    requiredPlan: null,
    sections: [
      {
        title: 'Ce que vous voyez',
        body: 'Le nombre de visiteurs et de pages vues, les pages les plus consultées et le nombre de demandes reçues. Dès l’offre Premium, s’y ajoutent les sources de trafic, la répartition mobile/ordinateur et les conversions. De quoi décider, sans noyer l’essentiel.',
      },
      {
        title: 'Ce que nous ne faisons pas',
        body: 'Nous ne déposons aucun cookie de mesure. Nous ne conservons aucune adresse IP. L’empreinte technique qui permet de compter un visiteur unique est salée par jour et par site : elle ne permet aucun suivi d’un jour sur l’autre, ni d’un site à l’autre.',
        points: [
          'Aucun cookie de mesure déposé',
          'Aucune adresse IP conservée',
          'Aucun suivi inter-sites techniquement possible',
          'Données agrégées quotidiennement, événements bruts purgés',
        ],
      },
      {
        title: 'Une conséquence concrète',
        body: 'Parce que rien n’est lu ni écrit dans le terminal de vos visiteurs, cette mesure d’audience n’impose pas de bandeau bloquant. Vos visiteurs arrivent directement sur votre contenu.',
      },
    ],
    limits: [
      'Ces statistiques ne remplacent pas un outil d’analyse marketing avancé. Elles répondent aux questions d’un professionnel, pas à celles d’un service marketing.',
    ],
    related: ['seo', 'messages'],
  },
  {
    slug: 'seo',
    name: 'Référencement',
    eyebrow: 'Visibilité',
    title: 'Le référencement technique, fait correctement',
    subtitle:
      'Être trouvé sur Google commence par des fondations propres. Elles sont en place dès le premier jour, sur tous les sites, sans option payante.',
    visual: 'site',
    requiredPlan: null,
    sections: [
      {
        title: 'Les fondations',
        body: 'Titre et description uniques sur chaque page, URL lisibles, plan du site et robots.txt, page 404 utile : nous les mettons en place en développant votre site, et vous gardez la main sur les titres et descriptions depuis l’éditeur.',
        points: [
          'Balises titre et description, modifiables par page',
          'Plan du site XML mis à jour à chaque publication',
          'Redirections mises en place lors d’une refonte',
          'Page 404 utile plutôt qu’un cul-de-sac',
        ],
      },
      {
        title: 'Des données structurées adaptées à votre métier',
        body: 'Un restaurant déclare ses horaires, sa carte et sa fourchette de prix. Un artisan déclare sa zone d’intervention. Une agence immobilière déclare ses annonces. Google comprend ce que vous faites, pas seulement ce que vous écrivez.',
      },
      {
        title: 'La vitesse compte',
        body: 'Votre site est déployé sur le réseau mondial de Cloudflare, avec des pages légères et des images optimisées ; ses performances sont vérifiées avant la livraison. La vitesse d’affichage est un critère de classement, et surtout une raison de rester sur le site.',
      },
    ],
    limits: [
      'Nous ne promettons aucune position sur Google : personne ne peut honnêtement le garantir. Nous garantissons la qualité technique, qui en est la condition nécessaire.',
      'Le contenu éditorial reste déterminant. Nous vous accompagnons, mais un site qui n’évolue jamais progresse rarement.',
    ],
    related: ['analytics', 'domaines'],
  },
  {
    slug: 'paiements',
    name: 'Paiements',
    eyebrow: 'Encaissement',
    title: 'Encaissez sur votre propre compte',
    subtitle:
      'Acomptes, commandes, dons. L’argent va directement de votre client à votre compte bancaire. StaX n’est pas dans ce circuit.',
    visual: 'payments',
    requiredPlan: 'ultra-premium',
    sections: [
      {
        title: 'Votre compte, à votre nom',
        body: 'Vous ouvrez un compte Stripe à votre nom depuis votre espace, en quelques minutes. Les vérifications d’identité sont faites par Stripe, pas par nous : nous ne voyons jamais vos pièces justificatives.',
        points: [
          'Compte ouvert à votre nom, pas au nôtre',
          'Virements automatiques vers votre banque',
          'Aucune commission StaX sur vos encaissements',
        ],
      },
      {
        title: 'Aucune donnée bancaire chez nous',
        body: 'Les numéros de carte ne transitent jamais par nos serveurs et ne sont jamais stockés. Nous conservons uniquement un identifiant de transaction, un montant et un statut, pour vous permettre de suivre vos encaissements.',
      },
      {
        title: 'Ce que vous payez',
        body: 'À StaX : la création du site, puis la maintenance mensuelle à partir de sa livraison. À Stripe : les frais bancaires de chaque transaction, facturés directement par Stripe selon ses tarifs publics. Rien d’autre.',
      },
    ],
    limits: [
      'L’ouverture du compte Stripe dépend de leurs vérifications d’identité, que nous ne contrôlons pas.',
      'Les frais bancaires sont ceux de Stripe. Nous ne les majorons pas et ne percevons rien dessus.',
    ],
    related: ['ecommerce', 'reservations'],
  },
  {
    slug: 'reservations',
    name: 'Réservations',
    eyebrow: 'Agenda',
    title: 'Vos clients réservent, vous validez',
    subtitle:
      'Créneaux, capacités, délais, fermetures exceptionnelles. Le moteur s’adapte à un restaurant comme à un cabinet.',
    visual: 'dashboard',
    requiredPlan: 'premium',
    sections: [
      {
        title: 'Paramétré selon votre métier',
        body: 'Un restaurant raisonne en couverts par service. Un coiffeur raisonne en prestation, durée et membre d’équipe. Un praticien raisonne en rendez-vous individuels. Le même moteur, configuré différemment.',
        points: [
          'Durée et temps de battement par prestation',
          'Capacité par créneau ou par service',
          'Délai minimum avant réservation',
          'Fermetures exceptionnelles et jours fériés',
        ],
      },
      {
        title: 'Validation manuelle ou automatique',
        body: 'Vous choisissez : confirmation immédiate, ou demande à valider. Dans les deux cas, le client reçoit un e-mail et vous êtes prévenu.',
      },
      {
        title: 'Acompte possible',
        body: 'Pour limiter les réservations non honorées, vous pouvez demander un acompte au moment de la réservation, avec l’offre Ultra Premium, qui comprend le paiement en ligne. Il est encaissé sur votre propre compte.',
      },
    ],
    limits: [
      'Ce n’est pas un logiciel de caisse ni un plan de salle. C’est un carnet de réservations en ligne, fiable et simple.',
    ],
    related: ['paiements', 'messages'],
  },
  {
    slug: 'ecommerce',
    name: 'Vente en ligne',
    eyebrow: 'Boutique',
    title: 'Vendre en ligne, sans usine à gaz',
    subtitle:
      'Un catalogue, un panier, des commandes. Pensé pour les petits volumes d’un commerce de proximité, pas pour concurrencer une place de marché.',
    visual: 'site',
    requiredPlan: 'ultra-premium',
    sections: [
      {
        title: 'Un catalogue simple',
        body: 'Produits, variantes, catégories, photos, stock. Vous mettez à jour vos disponibilités depuis votre espace, y compris depuis votre téléphone.',
      },
      {
        title: 'Retrait ou livraison',
        body: 'Retrait en boutique, livraison locale ou expédition : vous choisissez ce que vous proposez, et vous voyez chaque commande avec son mode de récupération.',
      },
      {
        title: 'Le paiement va chez vous',
        body: 'Comme pour toute transaction sur votre site, l’argent est encaissé sur votre propre compte Stripe. StaX ne prélève aucune commission.',
      },
    ],
    limits: [
      'Nous ne reconstruisons pas une plateforme e-commerce complète : pas de gestion multi-entrepôts, pas de tarification par palier, pas de place de marché.',
      'Pour un catalogue de plusieurs milliers de références, parlons d’un projet sur mesure.',
    ],
    related: ['paiements', 'gestion-contenu'],
  },
  {
    slug: 'gestion-contenu',
    name: 'Gestion de contenu',
    eyebrow: 'Organisation',
    title: 'Vos contenus, vos versions, votre rythme',
    subtitle:
      'Mettre à jour une carte, publier une actualité, préparer une publication : sans dépendre de personne, et sans risquer de casser quoi que ce soit.',
    visual: 'editor',
    requiredPlan: null,
    sections: [
      {
        title: 'Ce que votre site prévoit',
        body: 'Chaque site est livré avec la liste de ce que vous pouvez modifier : informations de l’entreprise, horaires, textes et images des pages, liens et boutons, et, selon votre site, des listes que vous alimentez — actualités, réalisations, prestations, produits.',
      },
      {
        title: 'Médias organisés',
        body: 'Vos photos et documents sont rangés dans une médiathèque, dans la limite d’espace de votre offre. Chaque image reçoit un texte alternatif, utile pour l’accessibilité comme pour le référencement.',
        points: [
          'Espace médias selon votre offre',
          'Texte alternatif sur chaque image',
          'Une image remplacée est publiée avec la version suivante',
        ],
      },
      {
        title: 'Publication programmée',
        body: 'Dès l’offre Premium, préparez une version et choisissez sa date : elle est publiée automatiquement, puis déployée comme n’importe quelle publication.',
      },
      {
        title: 'Un contenu qui vous appartient',
        body: 'À tout moment, vous exportez votre contenu dans un format ouvert. Vos textes et vos images sont à vous, sans condition.',
      },
    ],
    limits: [
      'Ajouter une page ou réorganiser la navigation du site modifie sa structure : notre équipe s’en charge, sur devis lorsque cela dépasse la maintenance.',
    ],
    related: ['editeur', 'seo'],
  },
] as const;

export function getFeaturePage(slug: string): FeaturePage | undefined {
  return FEATURE_PAGES.find((page) => page.slug === slug);
}

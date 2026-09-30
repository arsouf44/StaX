/**
 * Arborescence du site public.
 *
 * Source unique : l en-tete, le pied de page et le plan du site lisent la
 * meme structure. Un lien ajoute ici apparait partout, et le sitemap reste
 * automatiquement exact.
 */

export interface NavLink {
  label: string;
  href: string;
  description?: string;
  badge?: string;
}

export const FEATURE_LINKS: NavLink[] = [
  {
    label: 'Éditeur de contenu',
    href: '/fonctionnalites/editeur',
    description: 'Modifiez vos textes et vos photos sans coder.',
  },
  {
    label: 'Noms de domaine',
    href: '/fonctionnalites/domaines',
    description: 'Votre domaine, connecté et sécurisé en HTTPS.',
  },
  {
    label: 'Formulaires',
    href: '/fonctionnalites/formulaires',
    description: 'Des formulaires qui qualifient vos demandes.',
  },
  {
    label: 'Messages',
    href: '/fonctionnalites/messages',
    description: 'Une boîte de réception claire, sans spam.',
  },
  {
    label: 'Statistiques',
    href: '/fonctionnalites/analytics',
    description: 'Comprendre votre audience, sans pister personne.',
  },
  {
    label: 'Référencement',
    href: '/fonctionnalites/seo',
    description: 'Le SEO technique fait correctement, des le depart.',
  },
  {
    label: 'Paiements',
    href: '/fonctionnalites/paiements',
    description: 'Encaissez sur votre propre compte bancaire.',
  },
  {
    label: 'Réservations',
    href: '/fonctionnalites/reservations',
    description: 'Créneaux, capacités et confirmations automatiques.',
  },
  {
    label: 'Vente en ligne',
    href: '/fonctionnalites/ecommerce',
    description: 'Catalogue, panier et commandes pour les petits volumes.',
  },
  {
    label: 'Gestion de contenu',
    href: '/fonctionnalites/gestion-contenu',
    description: 'Pages, versions et publication maîtrisée.',
  },
];

export const COMPANY_LINKS: NavLink[] = [
  { label: 'À propos', href: '/a-propos', description: 'Qui construit Nemasus, et pourquoi.' },
  { label: 'Sécurité', href: '/securite', description: 'Ce que nous protegeons, et comment.' },
  {
    label: 'Infrastructure',
    href: '/infrastructure',
    description: 'Ou tournent vos sites, et avec quelles garanties.',
  },
  { label: 'État des services', href: '/status', description: 'Disponibilité en temps réel.' },
  { label: 'Contact', href: '/contact', description: 'Parlons de votre projet.' },
];

export const RESOURCE_LINKS: NavLink[] = [
  {
    label: 'Comment ça marche',
    href: '/comment-ca-marche',
    description: 'Le parcours, étape par étape.',
  },
  { label: 'Centre d’aide', href: '/aide', description: 'Guides et réponses pratiques.' },
  {
    label: 'Questions fréquentes',
    href: '/faq',
    description: 'Les réponses aux questions courantes.',
  },
  {
    label: 'Réalisations',
    href: '/realisations',
    description: 'Des exemples concrets, offre par offre.',
  },
];

/**
 * Navigation principale : cinq entrees, comme sur la page d accueil. Les
 * fonctionnalites, les ressources et l entreprise restent detaillees dans le
 * pied de page et le panneau mobile.
 */
export const PRIMARY_NAV: NavLink[] = [
  { label: 'Offres', href: '/tarifs' },
  { label: 'Méthode', href: '/comment-ca-marche' },
  { label: 'Fonctionnalités', href: '/fonctionnalites' },
  { label: 'Réalisations', href: '/realisations' },
  { label: 'Sur mesure', href: '/sur-mesure' },
];

export const LEGAL_LINKS: NavLink[] = [
  { label: 'Mentions légales', href: '/mentions-legales' },
  { label: 'Conditions générales de vente', href: '/cgv' },
  { label: 'Conditions générales d’utilisation', href: '/cgu' },
  { label: 'Accord de traitement des données', href: '/accord-de-traitement' },
  { label: 'Politique de confidentialité', href: '/confidentialite' },
  { label: 'Cookies', href: '/cookies' },
  { label: 'Remboursements', href: '/remboursements' },
  { label: 'Données personnelles', href: '/donnees-personnelles' },
  { label: 'Sous-traitants', href: '/sous-traitants' },
  { label: 'Signaler un contenu', href: '/signaler-un-contenu' },
  { label: 'Accessibilité', href: '/accessibilite' },
];

/** Pages indexables, pour le sitemap. */
export const SITEMAP_ROUTES: Array<{
  path: string;
  priority: number;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
}> = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/fonctionnalites', priority: 0.9, changeFrequency: 'monthly' },
  ...FEATURE_LINKS.map((link) => ({
    path: link.href,
    priority: 0.7,
    changeFrequency: 'monthly' as const,
  })),
  { path: '/tarifs', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/sur-mesure', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/realisations', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/comment-ca-marche', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/securite', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/infrastructure', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/a-propos', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/contact', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/devis', priority: 0.7, changeFrequency: 'yearly' },
  { path: '/aide', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/faq', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/status', priority: 0.3, changeFrequency: 'daily' },
  // Les pages d authentification et le parcours de commande sont volontairement
  // ABSENTS : ils portent `noindex`, et les faire figurer dans le plan du site
  // enverrait aux moteurs une consigne contradictoire.

  ...LEGAL_LINKS.map((link) => ({
    path: link.href,
    priority: 0.3,
    changeFrequency: 'yearly' as const,
  })),
];

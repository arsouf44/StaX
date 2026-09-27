/**
 * A qui convient chaque offre : des exemples, pas une liste de metiers.
 *
 * Le prix et le contenu de chaque offre viennent du catalogue ; ce fichier ne
 * dit que « pour qui », en une phrase et quelques exemples, pour aider a
 * choisir. Une offre absente d ici s affiche simplement sans exemple.
 */

export interface PlanExample {
  /** Une phrase : a qui l offre convient. */
  audience: string;
  /** Deux ou trois exemples concrets. */
  examples: readonly string[];
}

export const PLAN_EXAMPLES: Readonly<Record<string, PlanExample>> = {
  essentiel: {
    audience: 'Idéal pour un petit commerce qui veut une présence propre et claire.',
    examples: ['Une boutique de quartier', 'Un café', 'Un indépendant'],
  },
  premium: {
    audience: 'Un bon site, de qualité, pour la plupart des entreprises.',
    examples: ['Un cabinet', 'Un restaurant qui réserve en ligne', 'Une agence'],
  },
  'ultra-premium': {
    audience: 'Un très bon site, plus riche, qui peut aussi vendre en ligne.',
    examples: ['Une marque avec sa boutique', 'Un hôtel', 'Une entreprise qui grandit'],
  },
  exceptionnel: {
    audience: 'Pour ceux dont l’image fait tout : un site d’exception, écran par écran.',
    examples: ['Un architecte', 'Un studio de design', 'Une maison haut de gamme'],
  },
  'sur-mesure': {
    audience: 'Pour un projet qui sort du cadre : plateforme, application, gros volume.',
    examples: ['Un espace client', 'Une plateforme de réservation', 'Un grand catalogue'],
  },
};

/**
 * Les offres dans l ordre, avec leur nom, pour les rares cas ou le catalogue
 * est injoignable : la page reste structuree, sans prix plutot qu avec un
 * prix perime.
 */
export const PLAN_FALLBACK: ReadonlyArray<{ slug: string; name: string }> = [
  { slug: 'essentiel', name: 'Essentiel' },
  { slug: 'premium', name: 'Premium' },
  { slug: 'ultra-premium', name: 'Ultra Premium' },
  { slug: 'exceptionnel', name: 'Exceptionnel' },
  { slug: 'sur-mesure', name: 'Sur mesure' },
];

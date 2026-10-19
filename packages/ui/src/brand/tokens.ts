/**
 * Jetons de marque : le nom, la promesse, les couleurs.
 *
 * Module volontairement pur — aucun composant, aucun JSX. Les
 * metadonnees des pages, les donnees structurees et `llms.txt` ont besoin
 * du nom et de la promesse sans rien rendre a l'ecran, et les tests les
 * lisent sans dependre de React. Une seule source, jamais de valeur
 * recopiee : e-mails, documents et exports la lisent aussi.
 */
export const BRAND = {
  name: 'Nemasus',
  /** Positionnement, utilise dans les metadonnees et les partages. */
  tagline: 'Nous créons votre site. Vous le gérez ensuite.',
  colors: {
    ink: '#14181C',
    paper: '#F1F2F3',
    accent: '#2F5F86',
    accentLight: '#5D86A8',
    glacier: '#9FB7CB',
    ice: '#E3E7EA',
  },
  radius: 10,
} as const;

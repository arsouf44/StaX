/**
 * Constantes du contrat d'edition StaX.
 *
 * Le contrat est VERSIONNE : un site declare la version qu'il respecte
 * (`"contract": 1`), et StaX refuse un manifeste d'une version qu'il ne sait
 * pas lire plutot que de l'interpreter de travers.
 */

/** Version du contrat que cette version de StaX sait lire et produire. */
export const CONTRACT_VERSION = 1 as const;

/** Nom du fichier de contrat, a la racine du depot par defaut. */
export const DEFAULT_MANIFEST_PATH = 'stax.manifest.json';

/** Branche technique sur laquelle StaX pousse les apercus (jamais la production). */
export const DEFAULT_PREVIEW_BRANCH = 'stax-preview';

/** Schemas publics, pour l'autocompletion dans l'editeur du developpeur. */
export const MANIFEST_SCHEMA_URL = 'https://stax.fr/schemas/stax.manifest.v1.json';
export const CONTENT_SCHEMA_URL = 'https://stax.fr/schemas/stax.content.v1.json';

/**
 * Bornes du contrat. Elles protegent la plateforme (taille des documents,
 * temps de validation) et le client (un editeur a 3 000 champs n'est plus
 * utilisable). Un projet qui les depasse releve de l'offre sur mesure.
 */
export const CONTRACT_LIMITS = {
  pages: 60,
  sectionsPerPage: 40,
  fieldsPerSection: 60,
  globals: 20,
  collections: 20,
  collectionItems: 1000,
  forms: 40,
  formFields: 40,
  locales: 8,
  repeaterItems: 200,
  galleryImages: 200,
  navigationItems: 40,
  selectOptions: 60,
  /** Taille maximale du contenu d'un site, serialise. */
  contentBytes: 1_500_000,
  textMax: 5000,
  richTextMax: 50_000,
} as const;

/** Commit ecrit par StaX : prefixe convenu, reconnaissable dans l'historique. */
export const COMMIT_PREFIX = 'stax:';

/** Marqueurs (trailers Git) qui rendent chaque commit tracable et idempotent. */
export const COMMIT_TRAILERS = {
  release: 'Stax-Release',
  site: 'Stax-Site',
  version: 'Stax-Version',
  preview: 'Stax-Preview',
} as const;

/**
 * Ce que comprend la maintenance mensuelle — et ce qu'elle ne comprend pas.
 *
 * Une seule liste pour la page Tarifs et l'espace client, alignee sur
 * l'article 9 des CGV. La maintenance commence a la LIVRAISON du site ; elle
 * ne comprend pas de travaux de developpement illimites.
 */

export const MAINTENANCE_INCLUDES: readonly string[] = [
  'Hébergement de votre site sur Cloudflare, domaine rattaché et certificat HTTPS renouvelé automatiquement',
  'Infrastructure de publication : chaque publication enregistrée dans le code de votre site, déployée et suivie',
  'Versions conservées, et restauration d’une version précédente',
  'Surveillance de la disponibilité de votre site',
  'Mises à jour nécessaires et correctifs de sécurité, sans intervention de votre part',
  'Accès à l’éditeur StaX et à votre espace, dans les limites de votre offre',
  'Support par messages depuis votre espace',
  'Renouvellement du nom de domaine, lorsque nous l’avons acheté pour vous',
];

export const MAINTENANCE_EXCLUDES: readonly string[] = [
  'Nouvelles pages ou nouvelles fonctionnalités',
  'Modifications de structure ou de design, refontes',
  'Rédaction de contenus et production de photographies',
];

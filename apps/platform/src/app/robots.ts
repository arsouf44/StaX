import type { MetadataRoute } from 'next';
import { deployEnvironment, platformUrl } from '@stax/config';

/**
 * Directives destinees aux robots.
 *
 * Hors production, TOUT est interdit a l indexation : un environnement de
 * preversion indexe par erreur cannibalise le referencement du site reel et
 * expose des contenus non finalises.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = platformUrl().replace(/\/+$/, '');

  if (deployEnvironment() !== 'production') {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Ces chemins ne contiennent rien d indexable et exposeraient des
        // pages personnelles dans les resultats de recherche.
        disallow: [
          '/app/',
          '/admin/',
          '/commander/',
          '/connexion',
          '/inscription',
          '/activation',
          '/mfa',
          '/mot-de-passe-oublie',
          '/nouveau-mot-de-passe',
          '/api/',
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}

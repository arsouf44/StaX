import type { MetadataRoute } from 'next';
import { platformUrl } from '@stax/config';
import { SITEMAP_ROUTES } from '~/lib/navigation';

/**
 * Plan du site de la plateforme.
 *
 * Il ne liste que des pages PUBLIQUES et indexables. L espace client, le
 * back-office, le parcours de commande et les pages d authentification en sont
 * volontairement absents : ils ne doivent apparaitre dans aucun moteur.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = platformUrl().replace(/\/+$/, '');
  const lastModified = new Date();

  return SITEMAP_ROUTES.map((route) => ({
    url: `${origin}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

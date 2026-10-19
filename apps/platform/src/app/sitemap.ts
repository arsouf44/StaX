import type { MetadataRoute } from 'next';
import { platformUrl } from '@nemasus/config';
import { getLegalDocument, LEGAL_ORDER } from '~/content/legal';
import { CONTENT_REVISION, SITEMAP_ROUTES } from '~/lib/navigation';

/**
 * Rendu dynamique : les dates des textes juridiques sont lues dans les
 * documents eux-memes, qui se construisent depuis la configuration.
 */
export const dynamic = 'force-dynamic';

/**
 * Dates reelles de derniere revision des textes juridiques, par chemin.
 *
 * Chaque document porte deja sa date (`updatedAt`) : la reprendre ici evite
 * qu'un texte revise reste annonce comme inchange, ou l'inverse.
 */
function legalRevisions(): Map<string, string> {
  return new Map(
    LEGAL_ORDER.map((slug) => [`/${slug}`, getLegalDocument(slug).updatedAt] as const),
  );
}

/**
 * Plan du site de la plateforme.
 *
 * Il ne liste que des pages PUBLIQUES et indexables. L espace client, le
 * back-office, le parcours de commande et les pages d authentification en sont
 * volontairement absents : ils ne doivent apparaitre dans aucun moteur.
 *
 * Les dates annoncees sont des dates de revision reelles, jamais celle du
 * jour : un plan du site ou tout a change ce matin ne dit rien a personne.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = platformUrl().replace(/\/+$/, '');
  const legal = legalRevisions();

  return SITEMAP_ROUTES.map((route) => ({
    url: `${origin}${route.path}`,
    lastModified: new Date(legal.get(route.path) ?? CONTENT_REVISION),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

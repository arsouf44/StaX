import { deployEnvironment } from '@nemasus/config';
import { llmsTxt } from '~/lib/llms';

/**
 * `/llms.txt` — la carte du site pour les assistants.
 *
 * Rendu dynamique : le fichier cite l'identité de l'éditeur et ses
 * coordonnées, qui viennent des secrets de déploiement et non du build.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response(llmsTxt(), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      // Hors production, aucun robot ne doit retenir ce contenu : une
      // preversion decrirait un site qui n'est pas celui que nous vendons.
      ...(deployEnvironment() === 'production' ? {} : { 'x-robots-tag': 'noindex, nofollow' }),
    },
  });
}

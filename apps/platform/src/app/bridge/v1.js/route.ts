import { platformUrl } from '@stax/config';
import { bridgeScript } from '@stax/site-contract';

/**
 * Pont d'apercu, charge par le code d'un site dans ses builds d'apercu.
 * L'origine de l'editeur y est inscrite : le script n'ecoute qu'elle.
 */
export const dynamic = 'force-static';
export const revalidate = 3600;

export function GET(): Response {
  return new Response(bridgeScript(platformUrl()), {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      // Le script est destine a etre charge par les sites des clients.
      'cross-origin-resource-policy': 'cross-origin',
    },
  });
}

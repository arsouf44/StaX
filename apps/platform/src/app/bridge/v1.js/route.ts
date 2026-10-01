import { platformUrl } from '@nemasus/config';
import { bridgeScript } from '@nemasus/site-contract';

/**
 * Pont d'apercu, charge par le code d'un site dans ses builds d'apercu.
 * L'origine de l'editeur y est inscrite : le script n'ecoute qu'elle.
 *
 * Calcule a la requete, jamais fige au build : l'origine inscrite doit etre
 * celle ou l'editeur tourne VRAIMENT (domaine ajoute ensuite, variable
 * corrigee sans rebuild) ; une origine perimee couperait le pont sans bruit.
 * Les navigateurs et le CDN le gardent une heure.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response(bridgeScript(platformUrl()), {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
      'x-content-type-options': 'nosniff',
      // Le script est destine a etre charge par les sites des clients.
      'cross-origin-resource-policy': 'cross-origin',
    },
  });
}

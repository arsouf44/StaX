import { manifestJsonSchema } from '@stax/site-contract';

/** Schema JSON du contrat d'edition, pour l'editeur du developpeur. */
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(JSON.stringify(manifestJsonSchema(), null, 2), {
    headers: {
      'content-type': 'application/schema+json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
    },
  });
}

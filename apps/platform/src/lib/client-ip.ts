import { readEnv } from '@nemasus/config';

/**
 * Adresse IP du visiteur, lue dans l'en-tete que l'HEBERGEUR pose lui-meme.
 *
 * Un en-tete n'est fiable que si l'hebergeur l'ecrase : sinon le visiteur le
 * choisit, et change d'« adresse » a chaque requete pour contourner la
 * limitation de debit (connexion, inscription, mot de passe oublie, codes).
 *
 *  - Cloudflare Workers pose `cf-connecting-ip` ;
 *  - Vercel pose `x-real-ip` et `x-forwarded-for`, mais laisse passer un
 *    `cf-connecting-ip` fourni par le visiteur. L'ancien ordre de lecture
 *    (Cloudflare d'abord, partout) le rendait donc falsifiable sur Vercel.
 *
 * Derriere un autre mandataire (Cloudflare devant Vercel, serveur maison),
 * `NEMASUS_CLIENT_IP_HEADER` designe l'en-tete a croire.
 */

interface HeaderSource {
  get(name: string): string | null;
}

export type HostingPlatform = 'vercel' | 'cloudflare' | 'other';

export function detectHostingPlatform(): HostingPlatform {
  if (readEnv('VERCEL') === '1') return 'vercel';
  const scope = globalThis as { navigator?: { userAgent?: string } };
  if (scope.navigator?.userAgent === 'Cloudflare-Workers') return 'cloudflare';
  return 'other';
}

const TRUSTED_HEADERS: Record<HostingPlatform, readonly string[]> = {
  cloudflare: ['cf-connecting-ip'],
  vercel: ['x-real-ip', 'x-vercel-forwarded-for', 'x-forwarded-for'],
  // Developpement local et pile de test : aucun mandataire, rien a proteger.
  other: ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for'],
};

const IP_SHAPE = /^[0-9a-f:.]{2,45}$/i;

export function clientIp(
  headers: HeaderSource,
  options: { platform?: HostingPlatform; trustedHeader?: string | null } = {},
): string | null {
  const configured = options.trustedHeader ?? readEnv('NEMASUS_CLIENT_IP_HEADER') ?? null;
  const names = configured
    ? [configured.trim().toLowerCase()]
    : TRUSTED_HEADERS[options.platform ?? detectHostingPlatform()];

  for (const name of names) {
    // Premiere valeur d'une liste (`x-forwarded-for: client, mandataire`).
    const value = headers.get(name)?.split(',')[0]?.trim();
    if (value && IP_SHAPE.test(value)) return value;
  }
  return null;
}

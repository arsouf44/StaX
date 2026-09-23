import { NextResponse, type NextRequest } from 'next/server';
import { isProduction, readEnv } from '@stax/config';
import { buildContentSecurityPolicy, generateNonce } from '@stax/security';
import { THEME_SCRIPT_CSP_HASH } from '~/lib/theme-script';

/**
 * Politique de securite du contenu, par requete.
 *
 * Le tableau de bord et l'espace client portent une session. Une injection de
 * script y vaudrait un vol de session : ils reçoivent donc une CSP stricte, a
 * nonce, ou aucun script inline ne s'execute sans avoir ete emis par le
 * serveur pour CETTE reponse.
 *
 * Pourquoi seulement ces chemins ? Parce qu'un nonce change a chaque requete :
 * l'appliquer partout rendrait dynamiques la centaine de pages vitrines
 * prerendues, sans rien proteger de plus — elles ne portent ni session ni
 * action sensible. Elles reçoivent une CSP fixe, posee dans `next.config.ts`.
 *
 * L'apercu de l'editeur est volontairement exclu : il pose lui-meme une CSP
 * `sandbox`, plus stricte, qui isole le contenu ecrit par le client dans une
 * origine opaque. L'ecraser ici reviendrait a retirer cette barriere.
 */

export default function proxy(request: NextRequest) {
  const nonce = generateNonce();

  const csp = buildContentSecurityPolicy({
    profile: 'platform',
    nonce,
    // Le script d'application du theme s'execute avant le premier rendu et
    // n'a pas de nonce : il est autorise par son empreinte, constante.
    scriptHashes: [THEME_SCRIPT_CSP_HASH],
    // Supabase : authentification et lectures directes depuis le navigateur.
    connectSrc: [readEnv('NEXT_PUBLIC_SUPABASE_URL') ?? ''].filter(Boolean),
    // Photos des clients (bibliotheque, editeur) servies par le stockage.
    imgSrc: [readEnv('NEXT_PUBLIC_SUPABASE_URL') ?? ''].filter(Boolean),
    // L'apercu d'un site livre est son VRAI build Cloudflare (Pages ou
    // Worker), affiche dans l'editeur : seules ces origines peuvent etre
    // encadrees, et seulement dans l'editeur.
    frameSrc: request.nextUrl.pathname.startsWith('/app/editeur')
      ? ['https://*.pages.dev', 'https://*.workers.dev']
      : [],
    // En developpement, `upgrade-insecure-requests` casserait http://localhost.
    allowInsecure: !isProduction(),
  });

  // Next lit ces deux en-tetes SUR LA REQUETE : le premier pour apposer le
  // nonce sur ses propres balises <script>, le second pour savoir qu'une CSP
  // a nonce est active.
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  // Chemin demande, pour les mises en page (qui ne le recoivent pas) et pour
  // revenir a la bonne page apres connexion.
  headers.set('x-stax-pathname', request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Chemins porteurs de session ou d'action sensible.
     * `/app/editeur/apercu` en est retire : il pose sa propre CSP `sandbox`.
     */
    '/app',
    '/app/((?!editeur/apercu).*)',
    '/admin/:path*',
    '/api/:path*',
    '/connexion',
    '/inscription',
    '/activation',
    '/facture',
    '/commander/:path*',
    '/compte/:path*',
    '/mfa/:path*',
    '/mot-de-passe-oublie',
    '/nouveau-mot-de-passe',
    '/remboursements',
  ],
};

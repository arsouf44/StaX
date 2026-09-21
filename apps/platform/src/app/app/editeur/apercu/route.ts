import { readEnv } from '@stax/config';
import { resolveBusiness } from '@stax/business';
import { mediaPublicUrl } from '@stax/database';
import { generateNonce, issueCsrfToken } from '@stax/security';
import { loadSiteData, requiredCollections } from '@stax/site-data';
import {
  normalizePath,
  parseSiteSettings,
  parseSnapshot,
  renderDocument,
  resolveTheme,
  type RenderContext,
} from '@stax/site-engine';
import { getWorkspace } from '~/lib/workspace';

/**
 * Apercu du brouillon.
 *
 * Rend le site exactement comme le moteur public le rendra : meme snapshot,
 * meme moteur, memes donnees. Un apercu approximatif ne servirait a rien —
 * il faut que ce qu on voit soit ce qui sera mis en ligne.
 *
 * ------------------------------------------------------------------------
 *  POURQUOI CETTE PAGE EST ENFERMEE DANS UN BAC A SABLE
 * ------------------------------------------------------------------------
 *
 * Le contenu rendu ici est ECRIT PAR LE CLIENT. Le servir depuis l origine de
 * la plateforme, ou vit la session de la personne connectee, reviendrait a
 * offrir une execution de script dans le contexte de cette session.
 *
 * Deux barrieres, posees ensemble :
 *
 *  1. L en-tete `Content-Security-Policy: sandbox` place le document dans une
 *     origine opaque. Meme charge directement dans un onglet, il n a acces ni
 *     aux cookies de la plateforme, ni a son stockage local, ni a ses API.
 *  2. L iframe de l editeur porte `sandbox` sans `allow-same-origin`, ce qui
 *     produit la meme isolation cote parent.
 *
 * `allow-forms` est volontairement absent : un formulaire d apercu ne doit
 * jamais creer un vrai message ni une vraie reservation. Le jeton anti-CSRF
 * emis ici est d ailleurs lie a une identite « apercu », inutilisable contre
 * le site public.
 *
 * Le site prévisualisé n est JAMAIS designe par le navigateur : il vient de
 * l espace de travail resolu cote serveur.
 */

function storedMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return null;
  const [bucket, ...rest] = value.split('/');
  if (!bucket || rest.length === 0) return null;
  return mediaPublicUrl(bucket, rest.join('/'));
}

function refuse(status: number, message: string): Response {
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Aperçu indisponible</title></head>` +
      `<body style="margin:0;display:grid;place-items:center;min-height:100vh;` +
      `font:15px/1.6 system-ui,sans-serif;color:#444;background:#fafafa;padding:2rem;` +
      `text-align:center">${message}</body></html>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        'cache-control': 'no-store, no-cache, must-revalidate, private',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
  );
}

export async function GET(request: Request): Promise<Response> {
  const { workspace, db, accessToken } = await getWorkspace();

  if (!workspace.capabilities.includes('content.edit')) {
    return refuse(403, 'Votre rôle ne permet pas de prévisualiser le brouillon.');
  }

  const site = workspace.currentSite;
  if (!site) return refuse(404, 'Aucun site à prévisualiser.');

  // Snapshot du BROUILLON, lu avec le jeton de la personne : la fonction SQL
  // verifie `content.edit`, et la RLS s applique par-dessus.
  const { data: raw, error } = await db.rpc('draft_site_snapshot', { p_site: site.id });
  if (error || !raw) {
    return refuse(503, 'L’aperçu n’a pas pu être généré. Réessayez dans un instant.');
  }

  const snapshot = parseSnapshot(raw);
  if (!snapshot || snapshot.pages.length === 0) {
    return refuse(
      200,
      'Cette page n’a pas encore de contenu affichable. Ajoutez une section pour voir l’aperçu.',
    );
  }

  // Le parametre `page` ne designe qu une page DANS le site deja resolu. Un
  // identifiant inconnu retombe sur l accueil plutot que de reveler quoi que
  // ce soit.
  const url = new URL(request.url);
  const requestedId = url.searchParams.get('page');
  const page =
    (requestedId ? snapshot.pages.find((entry) => entry.id === requestedId) : undefined) ??
    snapshot.pagesByPath.get('/') ??
    snapshot.pages[0];

  if (!page) return refuse(200, 'Cette page n’a pas encore de contenu affichable.');

  const settings = parseSiteSettings(
    (raw as { settings?: unknown }).settings ?? {},
    snapshot.snapshot.site.name,
  );
  const theme = resolveTheme({
    preset: snapshot.snapshot.theme.preset,
    fontHeading: snapshot.snapshot.theme.fontHeading,
    fontBody: snapshot.snapshot.theme.fontBody,
    tokens: snapshot.snapshot.theme.tokens,
  });

  const data = await loadSiteData(site.id, requiredCollections(page.blocks), db);
  const business = resolveBusiness(snapshot.snapshot.site.businessType ?? null);
  const nonce = generateNonce();

  // Identite « apercu » : ce jeton ne validera jamais une soumission adressee
  // au site public, dont les jetons sont lies au nom d hote.
  const token = await issueCsrfToken(`preview:${site.id}:${accessToken.slice(0, 8)}`);

  const origin = site.primaryHostname
    ? `https://${site.primaryHostname}`
    : (readEnv('NEXT_PUBLIC_PLATFORM_URL') ?? 'https://stax.fr');

  const context: RenderContext = {
    origin,
    siteId: site.id,
    siteName: snapshot.snapshot.site.name,
    locale: page.locale || snapshot.snapshot.site.defaultLocale,
    timezone: snapshot.snapshot.site.timezone,
    isDemo: snapshot.snapshot.site.isDemo,
    isPreview: true,
    theme,
    settings,
    pages: snapshot.pages,
    currentPath: normalizePath(page.path),
    enabledModules: new Set(site.enabledModules),
    data,
    nonce,
    formToken: token.value,
    turnstileSiteKey: null,
    now: new Date(),
  };

  const html = renderDocument({
    page,
    context,
    schemaOrgType: business.seoDefaults.schemaOrgType,
    logoUrl: storedMediaUrl(snapshot.snapshot.theme.logoUrl),
    ogImageUrl: storedMediaUrl(snapshot.snapshot.theme.logoUrl),
  });

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // `sandbox` d abord : origine opaque, pas d acces a la session de la
      // plateforme. Le reste verrouille ce que le document peut charger.
      'content-security-policy': [
        'sandbox allow-scripts',
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' https: data:",
        "connect-src 'none'",
        "form-action 'none'",
        "frame-ancestors 'self'",
        "base-uri 'none'",
      ].join('; '),
      'cache-control': 'no-store, no-cache, must-revalidate, private',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow, noarchive',
      'referrer-policy': 'no-referrer',
    },
  });
}

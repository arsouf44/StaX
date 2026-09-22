import { readEnv } from '@stax/config';
import { resolveBusiness } from '@stax/business';
import { mediaPublicUrl } from '@stax/database';
import { generateNonce, issueCsrfToken } from '@stax/security';
import { loadSiteData, requiredCollections } from '@stax/site-data';
import {
  draftStateToSnapshot,
  normalizePath,
  parseBlock,
  parseDraftState,
  parseSiteSettings,
  parseSnapshot,
  renderDocument,
  resolveTheme,
  type ParsedBlock,
  type RenderContext,
} from '@stax/site-engine';
import { getWorkspace } from '~/lib/workspace';
import { loadPageBlocks } from '../data';

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

/** Origine du stockage des photos : nommee dans `img-src` (http en local). */
function storageImageOrigin(): string[] {
  const raw = readEnv('SUPABASE_URL') ?? readEnv('NEXT_PUBLIC_SUPABASE_URL');
  if (!raw) return [];
  try {
    return [new URL(raw).origin];
  } catch {
    return [];
  }
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

/**
 * Origine de l editeur qui affiche cet apercu.
 *
 * L apercu est charge par une adresse RELATIVE depuis l editeur : le nom
 * d hote que le navigateur envoie ici est donc exactement celui de la page
 * parente. `request.url`, lui, peut porter le nom interne du serveur
 * (`localhost` derriere un mandataire) : les messages de l apercu, adresses
 * a cette origine, seraient alors silencieusement perdus et le clic sur un
 * titre ne selectionnerait plus rien.
 */
function requestOrigin(request: Request, url: URL): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return url.origin;
  const forwarded = request.headers.get('x-forwarded-proto');
  const scheme =
    forwarded === 'https' || forwarded === 'http' ? forwarded : url.protocol.slice(0, -1);
  return `${scheme}://${host}`;
}

export async function GET(request: Request): Promise<Response> {
  const { workspace, db, accessToken } = await getWorkspace();

  if (!workspace.capabilities.includes('content.edit')) {
    return refuse(403, 'Votre rôle ne permet pas de prévisualiser le brouillon.');
  }

  const site = workspace.currentSite;
  if (!site) return refuse(404, 'Aucun site à prévisualiser.');

  const url = new URL(request.url);
  const versionId = url.searchParams.get('version');
  const checkpointId = url.searchParams.get('checkpoint');
  const editorMode = url.searchParams.get('mode') === 'editor' && !versionId && !checkpointId;
  const isUuid = (value: string | null) =>
    value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  // Trois sources possibles, toutes lues avec le jeton de la personne et
  // verifiees en base pour CE site : le brouillon (par defaut), une version
  // publiee (« Voir » dans l historique) ou un point de sauvegarde.
  let raw: unknown = null;
  if (versionId) {
    if (!isUuid(versionId)) return refuse(404, 'Version introuvable.');
    const { data, error } = await db.rpc('version_snapshot', {
      p_site: site.id,
      p_version: versionId,
    });
    if (error || !data) return refuse(404, 'Version introuvable.');
    raw = data;
  } else if (checkpointId) {
    if (!isUuid(checkpointId)) return refuse(404, 'Sauvegarde introuvable.');
    const { data, error } = await db.rpc('history_state', {
      p_site: site.id,
      p_kind: 'checkpoint',
      p_id: checkpointId,
    });
    if (error || !data) return refuse(404, 'Sauvegarde introuvable.');
    raw = draftStateToSnapshot(parseDraftState(data), {
      id: site.id,
      name: site.name,
      slug: site.slug,
      businessType: site.businessTypeSlug,
    });
  } else {
    // Snapshot du BROUILLON : la fonction SQL verifie `content.edit`, et la
    // RLS s applique par-dessus.
    const { data, error } = await db.rpc('draft_site_snapshot', { p_site: site.id });
    if (error || !data) {
      return refuse(503, 'L’aperçu n’a pas pu être généré. Réessayez dans un instant.');
    }
    raw = data;
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
  const requestedId = url.searchParams.get('page');
  let page =
    (requestedId ? snapshot.pages.find((entry) => entry.id === requestedId) : undefined) ??
    snapshot.pagesByPath.get('/') ??
    snapshot.pages[0];

  // Mode editeur : les sections MASQUEES sont montrees (grisees) pour rester
  // selectionnables — un client doit pouvoir retrouver ce qu il a masque.
  const hiddenBlockIds = new Set<string>();
  if (editorMode && requestedId && isUuid(requestedId)) {
    const all = await loadPageBlocks(db, requestedId);
    const parsed: ParsedBlock[] = [];
    for (const block of all) {
      const result = parseBlock(block);
      if (!result.block) continue;
      parsed.push(result.block);
      if (!block.visible) hiddenBlockIds.add(block.id);
    }
    const base = snapshot.pages.find((entry) => entry.id === requestedId);
    if (base) {
      page = { ...base, blocks: parsed };
    } else {
      // Page non publiee (retiree du site) : absente du snapshot, mais on
      // doit pouvoir la modifier et la voir.
      const { data: row } = await db
        .from('site_pages')
        .select('id, path, title, kind, locale')
        .eq('id', requestedId)
        .is('deleted_at', null)
        .maybeSingle();
      if (row) {
        page = {
          id: row.id as string,
          path: row.path as string,
          title: row.title as string,
          kind: row.kind as string,
          locale: (row.locale as string) || 'fr',
          seoTitle: null,
          seoDescription: null,
          robotsIndexable: false,
          showInNav: false,
          blocks: parsed,
          droppedBlocks: [],
        };
      }
    }
  }

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
    // L'apercu ne propose pas l'espace client : ses formulaires sont inertes.
    hasCustomerAccounts: false,
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
    ...(editorMode
      ? {
          editor: {
            hiddenBlockIds,
            parentOrigin: requestOrigin(request, url),
            selectedBlockId: isUuid(url.searchParams.get('sel'))
              ? url.searchParams.get('sel')
              : null,
            scrollY: Math.max(0, Math.min(Number(url.searchParams.get('y')) || 0, 500000)),
          },
        }
      : {}),
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
        ["img-src 'self' https: data:", ...storageImageOrigin()].join(' '),
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

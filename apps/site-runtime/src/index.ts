import { setEnvSource } from '@stax/config';
import { CACHE_POLICIES, generateNonce } from '@stax/security';
import { buildRobotsTxt, buildSitemapXml, normalizePath, renderDocument } from '@stax/site-engine';
import { buildPageContext, siteOrigin } from './context';
import { resolveSite, type ResolvedSite, type ResolutionOutcome } from './resolve';
import {
  htmlResponse,
  jsonResponse,
  redirectResponse,
  statusPage,
  textResponse,
} from './responses';
import { handleFormSubmit } from './api/forms';
import { handleBookingCreate, handleBookingSlots } from './api/bookings';
import { handleCartRead, handleCartWrite } from './api/cart';
import { handleCheckout } from './api/checkout';
import { handleOrderStatus } from './api/order-status';
import {
  handleCustomerAccount,
  handleCustomerLoginRequest,
  handleCustomerLogout,
} from './api/customer-account';
import { handleCollect } from './api/collect';
import { handleDonation } from './api/donations';
import type { WorkerEnv } from './env';

/**
 * Moteur multi-tenant des sites clients.
 *
 * UN SEUL Worker sert TOUS les sites. Il n existe pas de deploiement par
 * client : le tenant est determine a chaque requete a partir du nom d hote, et
 * seules les donnees de ce tenant sont chargees.
 *
 * Consequence directe sur la securite : il n y a aucun chemin de code ou une
 * requete arrivant sur le domaine du client A puisse lire une donnee du client
 * B. Les identifiants envoyes par le navigateur ne servent jamais a choisir le
 * tenant, uniquement a designer une ressource DANS ce tenant — et la base
 * verifie systematiquement l appartenance.
 */

/** Chemins reserves au moteur : jamais servis comme page editoriale. */
const RESERVED_PREFIXES = ['/api/', '/_stax/'];

function isReserved(path: string): boolean {
  return RESERVED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function outcomeResponse(outcome: Exclude<ResolutionOutcome, { kind: 'site' }>): Response {
  const nonce = generateNonce();
  switch (outcome.kind) {
    case 'unknown-host':
      return statusPage({
        status: 404,
        title: 'Aucun site sur cette adresse',
        message:
          'Ce nom de domaine ne correspond à aucun site publié. Si vous venez de le connecter, ' +
          'la propagation peut prendre quelques heures.',
        nonce,
      });
    case 'domain-pending':
      return statusPage({
        status: 503,
        title: 'Connexion du domaine en cours',
        message:
          'Ce domaine est en cours de vérification. Le site sera accessible dès que la ' +
          'configuration DNS sera confirmée.',
        detail: outcome.hostname,
        nonce,
      });
    case 'not-published':
      return statusPage({
        status: 404,
        title: 'Site en préparation',
        message: 'Ce site n’a pas encore été publié. Revenez bientôt.',
        nonce,
      });
    case 'suspended':
      return statusPage({
        status: 503,
        title: 'Site momentanément indisponible',
        message:
          'Ce site est temporairement suspendu. Son propriétaire peut le réactiver depuis son ' +
          'espace client.',
        nonce,
      });
    default:
      return statusPage({
        status: 503,
        title: 'Service momentanément indisponible',
        message:
          'Nous ne parvenons pas à charger ce site pour l’instant. Merci de réessayer dans ' +
          'quelques instants.',
        nonce,
      });
  }
}

async function handlePage(request: Request, site: ResolvedSite, path: string): Promise<Response> {
  const redirect = site.snapshot.redirects.get(path);
  if (redirect) return redirectResponse(redirect.to, redirect.status);

  const page = site.snapshot.pagesByPath.get(path);
  if (!page) {
    // 404 dans l identite du site plutot qu une page systeme anonyme : le
    // visiteur reste chez le commercant et peut poursuivre sa navigation.
    const notFound = site.snapshot.pagesByPath.get('/404');
    if (notFound) {
      const context = await buildPageContext(request, site, notFound, {
        isPreview: site.hostname.isPreview,
      });
      return htmlResponse(
        renderDocument({
          page: context.page,
          context: context.context,
          schemaOrgType: context.schemaOrgType,
          logoUrl: context.logoUrl,
          ogImageUrl: context.ogImageUrl,
        }),
        { status: 404, nonce: context.context.nonce },
      );
    }
    return statusPage({
      status: 404,
      title: 'Page introuvable',
      message: 'Cette page n’existe pas ou a été déplacée.',
      action: { label: 'Retour à l’accueil', href: '/' },
      nonce: generateNonce(),
    });
  }

  const built = await buildPageContext(request, site, page, {
    isPreview: site.hostname.isPreview,
  });

  const html = renderDocument({
    page: built.page,
    context: built.context,
    schemaOrgType: built.schemaOrgType,
    logoUrl: built.logoUrl,
    ogImageUrl: built.ogImageUrl,
  });

  const allowMaps = page.blocks.some((block) => block.type === 'embed');

  return htmlResponse(html, {
    status: 200,
    nonce: built.context.nonce,
    // Un apercu prive n est jamais mis en cache partage : il change a chaque
    // enregistrement et ne doit pas fuiter hors de son destinataire.
    cache: site.hostname.isPreview ? CACHE_POLICIES.private : CACHE_POLICIES.publishedPage,
    allowMaps,
  });
}

async function route(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);

  const outcome = await resolveSite(request.headers.get('host'));
  if (outcome.kind !== 'site') {
    // Les routes techniques repondent en JSON, jamais en HTML : un appel
    // asynchrone ne doit pas recevoir une page d erreur a analyser.
    if (isReserved(path)) {
      return jsonResponse({ ok: false, code: 'site_unavailable' }, 404);
    }
    return outcomeResponse(outcome);
  }

  const site = outcome.site;

  /* --- Routes techniques ------------------------------------------------- */

  if (path === '/robots.txt') {
    return textResponse(
      buildRobotsTxt({
        origin: siteOrigin(request),
        indexable: site.settings.robotsIndexable && !site.hostname.isPreview && !site.isDemo,
      }),
      'text/plain; charset=utf-8',
    );
  }

  if (path === '/sitemap.xml') {
    const indexable = site.settings.robotsIndexable && !site.hostname.isPreview;
    return textResponse(
      buildSitemapXml(
        siteOrigin(request),
        indexable
          ? site.snapshot.pages
              .filter((page) => page.robotsIndexable)
              .map((page) => ({
                path: page.path,
                changeFrequency: page.path === '/' ? ('weekly' as const) : ('monthly' as const),
                priority: page.path === '/' ? 1 : 0.6,
              }))
          : [],
      ),
      'application/xml; charset=utf-8',
    );
  }

  if (path === '/api/collect' && request.method === 'POST') {
    return handleCollect(request, site);
  }

  if (path === '/api/bookings/slots' && request.method === 'GET') {
    return handleBookingSlots(request, site);
  }

  if (path === '/api/bookings' && request.method === 'POST') {
    return handleBookingCreate(request, site);
  }

  if (path === '/api/cart') {
    if (request.method === 'GET') return handleCartRead(request, site);
    if (request.method === 'POST') return handleCartWrite(request, site);
    return jsonResponse({ ok: false, code: 'method_not_allowed' }, 405);
  }

  // Page de suivi de commande : produite par le moteur, dans l'identite du
  // site. Elle n'appartient pas au contenu editorial du client, mais elle doit
  // rester chez lui — un acheteur qui vient de payer ne doit pas atterrir sur
  // une page systeme anonyme.
  if (path === '/commande' && (request.method === 'GET' || request.method === 'HEAD')) {
    return handleOrderStatus(request, site);
  }

  // Espace client du site. Reserve aux offres qui le comportent : la base
  // tranche, la route ne fait que refleter sa reponse.
  if (path === '/compte' && (request.method === 'GET' || request.method === 'HEAD')) {
    return handleCustomerAccount(request, site);
  }

  if (path === '/api/compte/connexion' && request.method === 'POST') {
    return handleCustomerLoginRequest(request, site);
  }

  if (path === '/api/compte/deconnexion' && request.method === 'POST') {
    return handleCustomerLogout(request, site);
  }

  if (path === '/api/checkout' && request.method === 'POST') {
    return handleCheckout(request, site);
  }

  if (path === '/api/donations' && request.method === 'POST') {
    return handleDonation(request, site);
  }

  if (path.startsWith('/api/forms/') && request.method === 'POST') {
    const slug = path.slice('/api/forms/'.length);
    if (!/^[a-z0-9][a-z0-9-]{0,48}$/.test(slug)) {
      return jsonResponse({ ok: false, code: 'not_found' }, 404);
    }
    return handleFormSubmit(request, site, slug);
  }

  if (isReserved(path)) {
    return jsonResponse({ ok: false, code: 'not_found' }, 404);
  }

  /* --- Pages editoriales -------------------------------------------------- */

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ ok: false, code: 'method_not_allowed' }, 405);
  }

  const response = await handlePage(request, site, path);
  if (request.method === 'HEAD') {
    return new Response(null, { status: response.status, headers: response.headers });
  }
  return response;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    // Les bindings du Worker deviennent la source de configuration pour toute
    // la requete : aucun module ne lit `process.env`, qui n existe pas ici.
    setEnvSource(env as Record<string, string | undefined>);

    try {
      return await route(request);
    } catch (error) {
      // Aucun detail technique ne sort vers le visiteur : le message serait au
      // mieux inutile, au pire une aide a l attaquant.
      console.error('[stax:site-runtime] erreur non rattrapee', error);
      return statusPage({
        status: 500,
        title: 'Une erreur est survenue',
        message:
          'Ce site n’a pas pu être affiché. L’incident a été signalé automatiquement. ' +
          'Merci de réessayer dans quelques instants.',
        nonce: generateNonce(),
      });
    }
  },
};

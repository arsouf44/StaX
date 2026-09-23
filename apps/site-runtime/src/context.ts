import { readEnv, siteHostIdentity } from '@stax/config';
import { resolveBusiness } from '@stax/business';
import { mediaPublicUrl } from '@stax/database';
import { generateNonce, issueCsrfToken } from '@stax/security';
import {
  emptySiteData,
  normalizePath,
  parseLegalIdentity,
  resolveTheme,
  type RenderContext,
  type RenderablePage,
} from '@stax/site-engine';
import { loadSiteData, requiredCollections } from '@stax/site-data';
import type { ResolvedSite } from './resolve';

/**
 * Construction du contexte de rendu.
 *
 * Le jeton de formulaire est signe avec le NOM D HOTE comme identifiant de
 * session : il n est donc valable que sur le site qui l a emis, ce qui empeche
 * de rejouer un formulaire du site A vers le site B.
 */

export function siteOrigin(request: Request): string {
  const url = new URL(request.url);
  // Cloudflare termine TLS en amont : le schema d origine est toujours https
  // en production, meme si l URL interne indique http.
  const protocol = url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? 'http' : 'https';
  return `${protocol}//${url.host}`;
}

export interface PageContext {
  context: RenderContext;
  page: RenderablePage;
  schemaOrgType: string;
  logoUrl: string | null;
  ogImageUrl: string | null;
}

function storedMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return null;
  const [bucket, ...rest] = value.split('/');
  if (!bucket || rest.length === 0) return null;
  return mediaPublicUrl(bucket, rest.join('/'));
}

export async function buildPageContext(
  request: Request,
  site: ResolvedSite,
  page: RenderablePage,
  options: { isPreview: boolean },
): Promise<PageContext> {
  const snapshot = site.snapshot.snapshot;
  const theme = resolveTheme({
    preset: snapshot.theme.preset,
    fontHeading: snapshot.theme.fontHeading,
    fontBody: snapshot.theme.fontBody,
    tokens: snapshot.theme.tokens,
  });

  const data = await loadSiteData(site.siteId, requiredCollections(page.blocks));
  const token = await issueCsrfToken(site.hostname.hostname);
  const business = resolveBusiness(snapshot.site.businessType);

  const context: RenderContext = {
    origin: siteOrigin(request),
    siteId: site.siteId,
    siteName: snapshot.site.name,
    locale: page.locale || snapshot.site.defaultLocale,
    timezone: site.timezone,
    isDemo: site.isDemo,
    isPreview: options.isPreview,
    hasCustomerAccounts: site.hasCustomerAccounts,
    theme,
    settings: site.settings,
    host: siteHostIdentity(readEnv('NEXT_PUBLIC_PLATFORM_URL') ?? null),
    pages: site.snapshot.pages,
    currentPath: normalizePath(page.path),
    enabledModules: site.enabledModules,
    data,
    nonce: generateNonce(),
    formToken: token.value,
    turnstileSiteKey: readEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ?? null,
    now: new Date(),
  };

  return {
    context,
    page,
    schemaOrgType: business.seoDefaults.schemaOrgType,
    logoUrl: storedMediaUrl(snapshot.theme.logoUrl),
    ogImageUrl: storedMediaUrl(snapshot.theme.logoUrl),
  };
}

/** Contexte minimal, pour les pages d erreur qui n ont pas de page publiee. */
export function fallbackContext(request: Request, siteName: string): RenderContext {
  return {
    origin: siteOrigin(request),
    siteId: '',
    siteName,
    locale: 'fr',
    timezone: 'Europe/Paris',
    isDemo: false,
    isPreview: false,
    hasCustomerAccounts: false,
    theme: resolveTheme({}),
    settings: {
      businessName: siteName,
      tagline: null,
      description: null,
      email: null,
      phone: null,
      addressLine1: null,
      addressLine2: null,
      postalCode: null,
      city: null,
      country: 'FR',
      latitude: null,
      longitude: null,
      socialLinks: {},
      seoTitle: null,
      seoDescription: null,
      robotsIndexable: false,
      enabledModules: [],
      navigation: { primary: [], footer: [] },
      cookieBannerEnabled: false,
      analyticsEnabled: false,
      googleSiteVerification: null,
      legalIdentity: parseLegalIdentity({}),
    },
    pages: [],
    currentPath: '/',
    enabledModules: new Set(),
    data: emptySiteData(),
    nonce: generateNonce(),
    formToken: '',
    turnstileSiteKey: null,
    now: new Date(),
  };
}

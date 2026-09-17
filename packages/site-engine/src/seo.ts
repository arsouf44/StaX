import { serializeJsonLd } from '@stax/security';
import type { SiteSettingsView } from './snapshot';

/**
 * SEO technique des sites clients.
 *
 * Chaque page publiee recoit : un titre, une description, une URL canonique,
 * des balises Open Graph et Twitter, des directives robots, et des donnees
 * structurees Schema.org adaptees au metier. Le sitemap et robots.txt sont
 * generes a partir du meme snapshot.
 */

export interface SeoContext {
  siteName: string;
  origin: string;
  path: string;
  locale: string;
  settings: SiteSettingsView;
  schemaOrgType: string;
  logoUrl?: string | null;
  ogImageUrl?: string | null;
}

export interface PageSeoInput {
  title: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  robotsIndexable: boolean;
  isHome: boolean;
}

export interface SeoTags {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function absoluteUrl(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, '');
  const suffix = path === '/' ? '' : path;
  return `${base}${suffix}`;
}

export function buildSeoTags(context: SeoContext, page: PageSeoInput): SeoTags {
  const businessName = context.settings.businessName || context.siteName;
  const city = context.settings.city;

  const rawTitle =
    page.seoTitle ||
    (page.isHome
      ? [businessName, context.settings.tagline].filter(Boolean).join(' — ')
      : `${page.title} — ${businessName}`);

  const rawDescription =
    page.seoDescription ||
    context.settings.seoDescription ||
    context.settings.description ||
    [context.settings.tagline, city ? `${businessName} a ${city}.` : businessName]
      .filter(Boolean)
      .join(' ');

  const canonical = absoluteUrl(context.origin, context.path);
  const indexable = page.robotsIndexable && context.settings.robotsIndexable;

  const title = truncate(rawTitle, 65);
  const description = truncate(rawDescription || businessName, 165);

  const openGraph: Record<string, string> = {
    'og:type': page.isHome ? 'website' : 'article',
    'og:site_name': businessName,
    'og:title': title,
    'og:description': description,
    'og:url': canonical,
    'og:locale': context.locale === 'en' ? 'en_US' : 'fr_FR',
  };
  if (context.ogImageUrl) openGraph['og:image'] = context.ogImageUrl;

  const twitter: Record<string, string> = {
    'twitter:card': context.ogImageUrl ? 'summary_large_image' : 'summary',
    'twitter:title': title,
    'twitter:description': description,
  };
  if (context.ogImageUrl) twitter['twitter:image'] = context.ogImageUrl;

  return {
    title,
    description,
    canonical,
    robots: indexable
      ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
      : 'noindex, nofollow',
    openGraph,
    twitter,
  };
}

export interface OpeningHoursSpec {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

const SCHEMA_DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

/**
 * Donnees structurees Schema.org adaptees au metier.
 * Aucune valeur inventee : un champ absent de la configuration du client est
 * simplement omis, jamais rempli par defaut.
 */
export function buildLocalBusinessJsonLd(context: SeoContext, hours: OpeningHoursSpec[] = []) {
  const s = context.settings;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': context.schemaOrgType || 'LocalBusiness',
    name: s.businessName || context.siteName,
    url: context.origin,
  };

  if (s.description) data.description = truncate(s.description, 400);
  if (context.logoUrl) data.logo = context.logoUrl;
  if (context.ogImageUrl) data.image = context.ogImageUrl;
  if (s.phone) data.telephone = s.phone;
  if (s.email) data.email = s.email;

  if (s.addressLine1 || s.city || s.postalCode) {
    const address: Record<string, string> = { '@type': 'PostalAddress' };
    if (s.addressLine1) address.streetAddress = [s.addressLine1, s.addressLine2].filter(Boolean).join(', ');
    if (s.postalCode) address.postalCode = s.postalCode;
    if (s.city) address.addressLocality = s.city;
    address.addressCountry = s.country;
    data.address = address;
  }

  if (s.latitude != null && s.longitude != null) {
    data.geo = { '@type': 'GeoCoordinates', latitude: s.latitude, longitude: s.longitude };
  }

  const social = Object.values(s.socialLinks).filter((url) => typeof url === 'string' && url.length > 0);
  if (social.length > 0) data.sameAs = social;

  if (hours.length > 0) {
    data.openingHoursSpecification = hours.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${SCHEMA_DAYS[h.dayOfWeek] ?? 'Monday'}`,
      opens: h.opensAt,
      closes: h.closesAt,
    }));
  }

  return data;
}

export function buildBreadcrumbJsonLd(
  origin: string,
  trail: ReadonlyArray<{ name: string; path: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(origin, item.path),
    })),
  };
}

export function buildFaqJsonLd(items: ReadonlyArray<{ question: string; answer: string }>) {
  if (items.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function buildMenuJsonLd(
  restaurantName: string,
  sections: ReadonlyArray<{
    name: string;
    items: ReadonlyArray<{ name: string; description?: string | null; priceCents?: number | null }>;
  }>,
) {
  if (sections.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    name: `Carte — ${restaurantName}`,
    hasMenuSection: sections.map((section) => ({
      '@type': 'MenuSection',
      name: section.name,
      hasMenuItem: section.items.map((item) => ({
        '@type': 'MenuItem',
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
        ...(item.priceCents != null
          ? {
              offers: {
                '@type': 'Offer',
                price: (item.priceCents / 100).toFixed(2),
                priceCurrency: 'EUR',
              },
            }
          : {}),
      })),
    })),
  };
}

export function jsonLdScript(data: unknown): string {
  return serializeJsonLd(data);
}

/* -------------------------------------------------------------------------- */
/*  robots.txt et sitemap.xml                                                  */
/* -------------------------------------------------------------------------- */

export function buildRobotsTxt(params: { origin: string; indexable: boolean }): string {
  if (!params.indexable) {
    return ['User-agent: *', 'Disallow: /', ''].join('\n');
  }
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /panier',
    'Disallow: /commande',
    '',
    `Sitemap: ${params.origin.replace(/\/+$/, '')}/sitemap.xml`,
    '',
  ].join('\n');
}

export interface SitemapEntry {
  path: string;
  lastModified?: string | null;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSitemapXml(origin: string, entries: readonly SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const parts = [`    <loc>${xmlEscape(absoluteUrl(origin, entry.path))}</loc>`];
      if (entry.lastModified) parts.push(`    <lastmod>${xmlEscape(entry.lastModified)}</lastmod>`);
      if (entry.changeFrequency) parts.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
      if (entry.priority != null) parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');
}

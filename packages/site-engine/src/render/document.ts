import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildLocalBusinessJsonLd,
  buildMenuJsonLd,
  buildSeoTags,
  jsonLdScript,
  type SeoContext,
} from '../seo';
import type { RenderablePage } from '../snapshot';
import { renderBlocks } from './blocks';
import { attrs, html, join, raw, renderToString, type RawHtml } from './html';
import type { RenderContext } from './context';
import { SITE_STYLESHEET } from './styles';
import { SITE_SCRIPT } from './script';
import { EDITOR_STYLES, editorScript } from './editor-script';

/**
 * Document complet d une page publique.
 *
 * Le HTML est autonome : styles integres, aucune police bloquante, script
 * differe et facultatif. Une page reste entierement lisible et utilisable si le
 * JavaScript ne se charge pas — la navigation, les formulaires et la carte
 * fonctionnent sans lui.
 */

function navLinks(context: RenderContext) {
  const configured = context.settings.navigation.primary;
  if (configured.length > 0) return configured;
  // A defaut de navigation configuree, on derive celle-ci des pages publiees.
  return context.pages
    .filter((page) => page.showInNav && page.path !== '/')
    .map((page) => ({ label: page.title, path: page.path }));
}

function brand(context: RenderContext, logoUrl: string | null): RawHtml {
  const name = context.settings.businessName || context.siteName;
  return html`<a class="brand" href="/" aria-label="${name} — accueil">
    ${
      logoUrl
        ? html`<img src="${logoUrl}" alt="${name}" width="120" height="36" />`
        : html`<span>${name}</span>`
    }
  </a>`;
}

function header(context: RenderContext, logoUrl: string | null): RawHtml {
  const links = navLinks(context);
  const cta = context.settings.navigation.footer.find((link) => link.path.startsWith('#')) ?? null;

  return html`<header class="hdr" data-stax-header>
    <div class="wrap w-wide hdr-in">
      ${brand(context, logoUrl)}
      <nav class="nav nav-desktop" aria-label="Navigation principale">
        ${join(
          links.map(
            (link) =>
              html`<a
                href="${link.path}"
                ${attrs({ 'aria-current': link.path === context.currentPath ? 'page' : false })}
                >${link.label}</a
              >`,
          ),
        )}
        ${
          context.settings.phone
            ? html`<a
                class="btn btn-primary"
                href="tel:${context.settings.phone.replace(/[^+0-9]/g, '')}"
                >Appeler</a
              >`
            : cta
              ? html`<a class="btn btn-primary" href="${cta.path}">${cta.label}</a>`
              : ''
        }
      </nav>
      <button
        type="button"
        class="nav-toggle"
        data-stax-nav-toggle
        aria-expanded="false"
        aria-controls="nav-mobile"
      >
        <span class="sr">Ouvrir le menu</span>
        <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M3 5h14v1.6H3V5Zm0 4.2h14v1.6H3V9.2ZM3 13.4h14V15H3v-1.6Z" />
        </svg>
      </button>
    </div>
    <div class="wrap w-wide">
      <nav class="nav-mobile" id="nav-mobile" data-open="false" aria-label="Navigation principale">
        ${join(links.map((link) => html`<a href="${link.path}">${link.label}</a>`))}
      </nav>
    </div>
  </header>`;
}

function footer(context: RenderContext): RawHtml {
  const settings = context.settings;
  const year = new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    timeZone: context.timezone,
  }).format(context.now);
  const address = [
    settings.addressLine1,
    settings.addressLine2,
    [settings.postalCode, settings.city].filter(Boolean).join(' '),
  ].filter((line): line is string => Boolean(line && line.trim()));

  const social = Object.entries(settings.socialLinks).filter(([, url]) => Boolean(url));
  const footerLinks = settings.navigation.footer;

  return html`<footer class="ftr">
    <div class="wrap w-wide">
      <div class="ftr-grid">
        <div>
          <p style="font-family:var(--site-font-heading);font-weight:600;font-size:1rem">
            ${settings.businessName || context.siteName}
          </p>
          ${settings.tagline ? html`<p class="muted" style="margin-top:.5rem">${settings.tagline}</p>` : ''}
          ${
            address.length > 0
              ? html`<p class="muted" style="margin-top:1rem">
                  ${join(address.map((line) => html`${line}<br />`))}
                </p>`
              : ''
          }
          ${
            settings.phone
              ? html`<p style="margin-top:.75rem">
                  <a href="tel:${settings.phone.replace(/[^+0-9]/g, '')}">${settings.phone}</a>
                </p>`
              : ''
          }
          ${
            settings.email
              ? html`<p><a href="mailto:${settings.email}">${settings.email}</a></p>`
              : ''
          }
        </div>
        <div>
          <h2>Navigation</h2>
          <ul>
            ${join(
              navLinks(context).map(
                (link) => html`<li><a href="${link.path}">${link.label}</a></li>`,
              ),
            )}
          </ul>
        </div>
        <div>
          ${
            footerLinks.length > 0
              ? html`<h2>Informations</h2>
                  <ul>
                    ${join(footerLinks.map((link) => html`<li><a href="${link.path}">${link.label}</a></li>`))}
                  </ul>`
              : ''
          }
          ${
            social.length > 0
              ? html`<h2 style="margin-top:1.5rem">Réseaux</h2>
                  <ul>
                    ${join(
                      social.map(
                        ([key, url]) =>
                          html`<li>
                            <a href="${url}" target="_blank" rel="noopener noreferrer me">${key}</a>
                          </li>`,
                      ),
                    )}
                  </ul>`
              : ''
          }
        </div>
      </div>
      <div class="ftr-btm">
        <p>© ${year} ${settings.businessName || context.siteName}</p>
        ${context.hasCustomerAccounts ? html`<p><a href="/compte">Mon espace</a></p>` : ''}
        <p>
          Site réalisé et hébergé par
          <a href="https://stax.fr" target="_blank" rel="noopener">StaX</a>
        </p>
      </div>
    </div>
  </footer>`;
}

/**
 * Banniere de demonstration.
 * Un site de demonstration doit etre reconnaissable comme tel : il ne doit
 * jamais pouvoir passer pour l activite reelle d un vrai commercant.
 */
function demoBanner(): RawHtml {
  return html`<div
    style="background:#111;color:#fff;padding:.625rem 1rem;text-align:center;font-size:.8125rem"
    role="note"
  >
    Site de <strong>démonstration</strong> — entreprise fictive, créée pour illustrer les
    possibilités de la plateforme.
  </div>`;
}

function previewBanner(): RawHtml {
  return html`<div
    style="background:#7c5cff;color:#fff;padding:.625rem 1rem;text-align:center;font-size:.8125rem"
    role="note"
  >
    Aperçu privé — cette version n’est pas encore publiée et n’est pas indexée.
  </div>`;
}

export interface DocumentInput {
  page: RenderablePage;
  context: RenderContext;
  /** Type Schema.org derive du metier du site. */
  schemaOrgType: string;
  logoUrl: string | null;
  ogImageUrl: string | null;
  /**
   * Contenu produit par le moteur plutot que par le snapshot.
   *
   * Sert aux pages qui n appartiennent pas au contenu editorial du client — la
   * confirmation de commande, par exemple. Elles doivent rester dans SON
   * identite : un acheteur qui vient de payer ne doit pas atterrir sur une page
   * systeme anonyme qui ressemble a une erreur.
   */
  mainOverride?: RawHtml;
}

/** Assemble le document HTML complet d une page. */
export function renderDocument(input: DocumentInput): string {
  const { page, context } = input;
  const seoContext: SeoContext = {
    siteName: context.siteName,
    origin: context.origin,
    path: page.path,
    locale: page.locale,
    settings: context.settings,
    schemaOrgType: input.schemaOrgType,
    logoUrl: input.logoUrl,
    ogImageUrl: input.ogImageUrl,
  };

  const seo = buildSeoTags(seoContext, {
    title: page.title,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    // Un apercu prive n est JAMAIS indexable, quelle que soit la configuration.
    robotsIndexable: page.robotsIndexable && !context.isPreview,
    isHome: page.path === '/',
  });

  const structured: unknown[] = [
    buildLocalBusinessJsonLd(
      seoContext,
      context.data.openingHours.map((entry) => ({
        dayOfWeek: entry.dayOfWeek,
        opensAt: entry.opensAt,
        closesAt: entry.closesAt,
      })),
    ),
  ];

  if (page.path !== '/') {
    structured.push(
      buildBreadcrumbJsonLd(context.origin, [
        { name: 'Accueil', path: '/' },
        { name: page.title, path: page.path },
      ]),
    );
  }

  const faqBlock = page.blocks.find((block) => block.type === 'faq');
  if (faqBlock) {
    const items = Array.isArray(faqBlock.props['items'])
      ? (faqBlock.props['items'] as Array<{ question: string; answer: string }>)
      : [];
    const faq = buildFaqJsonLd(items);
    if (faq) structured.push(faq);
  }

  if (page.blocks.some((block) => block.type === 'menu') && context.data.menu.length > 0) {
    const menu = buildMenuJsonLd(
      context.settings.businessName || context.siteName,
      context.data.menu
        .filter((category) => category.items.length > 0)
        .map((category) => ({
          name: category.name,
          items: category.items.map((item) => ({
            name: item.name,
            description: item.description,
            priceCents: item.priceCents,
          })),
        })),
    );
    if (menu) structured.push(menu);
  }

  const body = renderToString(html`
    ${context.isPreview && !context.editor ? previewBanner() : ''}${context.isDemo ? demoBanner() : ''}
    <a class="skip" href="#contenu">Aller au contenu</a>
    ${header(context, input.logoUrl)}
    <main id="contenu">${input.mainOverride ?? renderBlocks(page.blocks, context)}</main>
    ${footer(context)}
  `);

  // Le script Turnstile n est charge que si un widget est reellement present :
  // une page sans formulaire ne doit pas contacter un tiers.
  const needsTurnstile = context.turnstileSiteKey !== null && body.includes('cf-turnstile');

  const head = html`
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${seo.title}</title>
    <meta name="description" content="${seo.description}" />
    <link rel="canonical" href="${seo.canonical}" />
    <meta name="robots" content="${seo.robots}" />
    <meta name="theme-color" content="${context.theme.preset.colors.background}" />
    <meta name="generator" content="StaX" />
    ${join(
      Object.entries(seo.openGraph).map(
        ([property, value]) => html`<meta property="${property}" content="${value}" />`,
      ),
    )}
    ${join(
      Object.entries(seo.twitter).map(
        ([name, value]) => html`<meta name="${name}" content="${value}" />`,
      ),
    )}
    ${
      context.settings.googleSiteVerification
        ? html`<meta
            name="google-site-verification"
            content="${context.settings.googleSiteVerification}"
          />`
        : ''
    }
    ${input.logoUrl ? html`<link rel="icon" href="${input.logoUrl}" />` : ''}
    ${
      context.theme.googleFontsHref
        ? html`<link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
            <link
              rel="stylesheet"
              href="${context.theme.googleFontsHref}"
              media="print"
              onload="this.media='all'"
            />
            <noscript><link rel="stylesheet" href="${context.theme.googleFontsHref}" /></noscript>`
        : ''
    }
    <style nonce="${context.nonce}">
      :root{${raw(context.theme.cssVariables)}}
      ${raw(SITE_STYLESHEET)}
      ${context.editor ? raw(EDITOR_STYLES) : ''}
    </style>
    <link rel="alternate" type="application/xml" href="/sitemap.xml" title="Plan du site" />
    ${join(
      structured.map(
        (data) =>
          html`<script type="application/ld+json" nonce="${context.nonce}">
            ${raw(jsonLdScript(data))}
          </script>`,
      ),
    )}
  `;

  // Le jeton anti-CSRF est porte par le document, pas par chaque bouton : les
  // interactions sans formulaire (ajout au panier) en ont besoin elles aussi,
  // et le repeter partout multiplierait les occasions de l oublier.
  const tokenAttribute = renderToString(html`${context.formToken}`);

  return `<!doctype html>
<html lang="${page.locale}" data-scheme="${context.theme.scheme}">
<head>${renderToString(head)}</head>
<body data-stax-token="${tokenAttribute}">
${body}
<script nonce="${context.nonce}" defer>${SITE_SCRIPT}</script>
${
  context.editor
    ? `<script nonce="${context.nonce}">${editorScript({
        parentOrigin: context.editor.parentOrigin,
        selectedBlockId: context.editor.selectedBlockId,
        scrollY: context.editor.scrollY,
      })}</script>`
    : ''
}
${needsTurnstile ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}
</body>
</html>`;
}

import { describe, expect, it } from 'vitest';
import {
  buildTemplateForBusiness,
  checkSiteForPublication,
  createBlock,
  emptySiteData,
  parseLegalIdentity,
  parseSiteSettings,
  renderBlock,
  resolveTheme,
  type DraftState,
  type RenderContext,
} from '@stax/site-engine';

/**
 * Obligations legales des sites clients : mentions generees a partir de
 * « Mon entreprise », rien d invente, contenus tiers charges sur demande
 * seulement, publication refusee sans les mentions obligatoires.
 */

const IDENTITY = {
  legalName: 'Boulangerie Martin SAS',
  legalForm: 'SAS',
  capital: '1 000 €',
  registration: 'RCS Lyon 000 000 000',
  address: '1 rue de la Paix, 69001 Lyon',
  publicationDirector: 'Marie Martin',
};

function context(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    origin: 'https://boulangerie-martin.fr',
    siteId: 'site',
    siteName: 'Boulangerie Martin',
    locale: 'fr',
    timezone: 'Europe/Paris',
    isDemo: false,
    isPreview: false,
    hasCustomerAccounts: false,
    theme: resolveTheme({}),
    settings: parseSiteSettings(
      {
        business_name: 'Boulangerie Martin',
        email: 'bonjour@exemple.test',
        legal_identity: IDENTITY,
      },
      'Boulangerie Martin',
    ),
    host: {
      name: 'StaX SAS',
      address: '2 avenue de l’Hébergeur, 75001 Paris',
      phone: '01 00 00 00 00',
      email: null,
      reportUrl: 'https://stax.example/signaler-un-contenu',
    },
    pages: [],
    currentPath: '/',
    enabledModules: new Set(['contact']),
    data: emptySiteData(),
    nonce: 'n',
    formToken: 't',
    turnstileSiteKey: null,
    now: new Date('2026-09-23T10:00:00Z'),
    ...overrides,
  };
}

function render(type: string, ctx: RenderContext, props: Record<string, unknown> = {}): string {
  const block = createBlock(type);
  if (!block) throw new Error(`bloc ${type} inconnu`);
  // Espaces normalises : la mise en forme du gabarit ne regarde pas le lecteur.
  return renderBlock({ ...block, props: { ...block.props, ...props } }, ctx).value.replace(
    /\s+/g,
    ' ',
  );
}

describe('mentions légales d’un site client', () => {
  it('reprennent l’identité de l’éditeur et celle de l’hébergeur', () => {
    const htmlText = render('legal-notice', context());
    for (const value of Object.values(IDENTITY)) expect(htmlText).toContain(value.split(' €')[0]);
    expect(htmlText).toContain('StaX SAS');
    expect(htmlText).toContain('01 00 00 00 00');
    expect(htmlText).toContain('https://stax.example/signaler-un-contenu');
  });

  it('n’inventent rien : un champ vide n’apparaît pas en ligne', () => {
    const ctx = context();
    ctx.settings = { ...ctx.settings, legalIdentity: parseLegalIdentity({}) };
    const htmlText = render('legal-notice', ctx);
    expect(htmlText).not.toContain('Immatriculation');
    expect(htmlText).not.toMatch(/\d{3} \d{3} \d{3}/);
  });

  it('signalent un champ vide dans l’aperçu, pour que le client le complète', () => {
    const ctx = context({ isPreview: true });
    ctx.settings = { ...ctx.settings, legalIdentity: parseLegalIdentity({}) };
    expect(render('legal-notice', ctx)).toContain('À compléter dans « Mon entreprise »');
  });
});

describe('politique de confidentialité d’un site client', () => {
  it('ne parle que des fonctionnalités actives', () => {
    const vitrine = render('privacy-notice', context());
    expect(vitrine).toContain('Boulangerie Martin SAS');
    expect(vitrine).toContain('CNIL');
    expect(vitrine).not.toContain('Stripe');
    expect(vitrine).not.toContain('réservations');

    const boutique = render(
      'privacy-notice',
      context({
        enabledModules: new Set(['contact', 'products', 'orders', 'payments', 'booking']),
      }),
    );
    expect(boutique).toContain('Stripe');
    expect(boutique).toContain('Traiter vos commandes');
    expect(boutique).toContain('Gérer vos réservations');
  });
});

describe('contenus intégrés', () => {
  it('ne chargent aucun contenu tiers avant le clic du visiteur', () => {
    const htmlText = render('embed', context(), { provider: 'youtube', resourceId: 'abc123' });
    expect(htmlText).not.toContain('<iframe');
    expect(htmlText).toContain('data-stax-embed="https://www.youtube-nocookie.com/embed/abc123"');
    expect(htmlText).toContain('YouTube');
    expect(htmlText).toContain('data-stax-embed-load');
  });
});

describe('boutique en ligne', () => {
  it('le modèle d une boutique publie des conditions de vente', () => {
    const template = buildTemplateForBusiness('boulangerie', {
      enabledModules: ['contact', 'products', 'orders', 'payments'],
    });
    const paths = template.pages.map((page) => page.path);
    expect(paths).toContain('/mentions-legales');
    expect(paths).toContain('/confidentialite');
    expect(paths).toContain('/conditions-generales-de-vente');
    expect(template.navigation.footer.map((link) => link.path)).toContain(
      '/conditions-generales-de-vente',
    );
  });

  it('les conditions de vente portent les mentions obligatoires', () => {
    const htmlText = render('sales-terms', context(), { perishable: true });
    expect(htmlText).toContain('quatorze jours');
    expect(htmlText).toContain('Formulaire de rétractation');
    expect(htmlText).toContain('garantie légale de conformité');
    expect(htmlText).toContain('L.221-28');
    expect(htmlText).toContain('Commander avec obligation de paiement');
  });

  it('le panier exige l acceptation des conditions quand elles existent', () => {
    const ctx = context({
      enabledModules: new Set(['products', 'orders']),
      pages: [
        {
          id: 'cgv',
          path: '/conditions-generales-de-vente',
          title: 'Conditions générales de vente',
          kind: 'legal',
          locale: 'fr',
          seoTitle: null,
          seoDescription: null,
          robotsIndexable: true,
          showInNav: false,
          blocks: [],
          droppedBlocks: [],
        },
      ],
    });
    const htmlText = render('cart', ctx);
    expect(htmlText).toContain('name="acceptTerms"');
    expect(htmlText).toContain('Commander avec obligation de paiement');
  });
});

describe('vérification avant publication', () => {
  const state = {
    format: 1,
    theme: {},
    settings: { business_name: 'Boulangerie Martin', seo_description: 'Pain au levain.' },
    pages: [
      {
        id: 'home',
        path: '/',
        title: 'Accueil',
        is_published: true,
        blocks: [
          { id: 'h', type: 'hero', props: { title: 'Bonjour' }, settings: {}, visible: true },
        ],
      },
    ],
  } as unknown as DraftState;
  const base = {
    forms: [],
    liveMediaIds: new Set<string>(),
    collections: {},
    enabledModules: new Set<string>(),
  };

  it('refuse la publication sans mentions légales obligatoires', () => {
    const report = checkSiteForPublication(state, {
      ...base,
      legalIdentity: parseLegalIdentity({ legalName: 'X' }),
    });
    const issue = report.blocking.find((entry) => entry.code === 'legal_identity');
    expect(issue?.message).toContain('forme juridique');
    expect(issue?.fix).toContain('Mon entreprise');
  });

  it('accepte la publication quand elles sont complètes', () => {
    const report = checkSiteForPublication(state, {
      ...base,
      legalIdentity: parseLegalIdentity(IDENTITY),
    });
    expect(report.blocking.find((entry) => entry.code === 'legal_identity')).toBeUndefined();
  });
});

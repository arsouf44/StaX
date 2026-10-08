import { afterEach, describe, expect, it } from 'vitest';
import {
  clearEnvSource,
  endOfContractDeletionDate,
  legalStatus,
  maintenancePolicyConfig,
  setEnvSource,
} from '@nemasus/config';
import { isHumanHealthBusiness, resolveBusiness } from '@nemasus/business';
import {
  createBlock,
  emptySiteData,
  HEALTH_DATA_NOTICE,
  parseSiteSettings,
  renderBlock,
  resolveTheme,
  type RenderContext,
} from '@nemasus/site-engine';
import { cancelSubscriptionSchema, contentReportSchema } from '@nemasus/validation';
import {
  buildDataProcessingAgreement,
  buildLegalNotice,
  buildTerms,
  type LegalDocument,
} from '~/content/legal';
import {
  buildGithubAppManifest,
  exchangeManifestCode,
  githubAppCreationUrl,
  isValidGithubOrganization,
  privateKeyForEnv,
} from '~/lib/github-manifest';

/**
 * Audit juridique du 2026-09-29 : chaque point corrigé est verrouillé ici.
 */

afterEach(() => clearEnvSource());

function text(document: LegalDocument): string {
  return JSON.stringify(document.articles);
}

describe('mentions légales', () => {
  it('nomment Vercel, hébergeur de la plateforme, avec adresse et téléphone', () => {
    setEnvSource({});
    const notice = text(buildLegalNotice());
    expect(notice).toContain('Vercel Inc.');
    expect(notice).toContain('440 N Barranca Avenue #4133, Covina, CA 91723');
    expect(notice).toContain('+1 559 288 7060');
    // Les sites des clients ont leur propre hébergeur.
    expect(notice).toContain('Cloudflare, Inc.');
  });

  it('donnent la chaîne de représentation et l’ancien nom', () => {
    setEnvSource({});
    const notice = text(buildLegalNotice());
    expect(notice).toContain('SELALLIAN');
    expect(notice).toContain('Julie Rachline Gomez');
    expect(notice).toContain('anciennement StaX');
  });

  it('sont complètes : téléphone et e-mail de l’éditeur, sans aucun marqueur', () => {
    setEnvSource({});
    expect(legalStatus().missingRequired).toEqual([]);
    const notice = text(buildLegalNotice());
    expect(notice).not.toContain('A CONFIGURER');
    expect(notice).toContain('07 82 09 37 51');
    expect(notice).toContain('a.gomez@contact-nemasus.com');
    expect(notice).not.toContain('lallianse.com');
  });

  it('affichent le téléphone de l’éditeur dès qu’il est configuré', () => {
    setEnvSource({ LEGAL_PHONE: '+33 1 23 45 67 89' });
    expect(legalStatus().missingRequired).not.toContain('LEGAL_PHONE');
    expect(text(buildLegalNotice())).toContain('+33 1 23 45 67 89');
  });

  it('acceptent le téléphone du support à la place', () => {
    setEnvSource({ SUPPORT_PHONE: '+33 1 98 76 54 32' });
    expect(legalStatus().missingRequired).not.toContain('LEGAL_PHONE');
  });
});

describe('fin de contrat (RGPD, art. 28 § 3 g)', () => {
  it('ne conserve plus les données un an « archivées »', () => {
    const policy = maintenancePolicyConfig() as unknown as Record<string, unknown>;
    expect(policy['archiveRetentionDays']).toBeUndefined();
    expect(text(buildDataProcessingAgreement())).not.toMatch(/archiv/i);
    expect(text(buildTerms())).not.toMatch(/archivés/i);
  });

  it('fixe la suppression selon le choix du client', () => {
    const end = new Date('2026-10-01T00:00:00Z');
    const { gracePeriodDays, exportWindowDays } = maintenancePolicyConfig();
    const day = 86_400_000;
    expect(endOfContractDeletionDate(end, 'suppression').getTime()).toBe(
      end.getTime() + gracePeriodDays * day,
    );
    expect(endOfContractDeletionDate(end, 'restitution').getTime()).toBe(
      end.getTime() + (gracePeriodDays + exportWindowDays) * day,
    );
  });

  it('applique la restitution quand le client ne choisit rien', () => {
    const parsed = cancelSubscriptionSchema.parse({
      subscriptionId: '00000000-0000-4000-8000-000000000001',
      confirm: true,
    });
    expect(parsed.dataFate).toBe('restitution');
  });

  it('l’accord de traitement laisse le choix au client', () => {
    const dpa = text(buildDataProcessingAgreement());
    expect(dpa).toContain('restitution puis suppression');
    expect(dpa).toContain('article 28, paragraphe 3, g)');
  });
});

describe('données de santé', () => {
  it('concernent les praticiens, pas les vétérinaires', () => {
    expect(isHumanHealthBusiness(resolveBusiness('kinesitherapeute'))).toBe(true);
    expect(isHumanHealthBusiness(resolveBusiness('veterinaire'))).toBe(false);
    expect(isHumanHealthBusiness(resolveBusiness('boulangerie'))).toBe(false);
  });

  function context(healthDataGuard: boolean): RenderContext {
    return {
      origin: 'https://cabinet.example',
      siteId: 'site',
      siteName: 'Cabinet',
      locale: 'fr',
      timezone: 'Europe/Paris',
      isDemo: false,
      isPreview: false,
      hasCustomerAccounts: false,
      theme: resolveTheme({}),
      settings: parseSiteSettings({ business_name: 'Cabinet' }, 'Cabinet'),
      pages: [],
      currentPath: '/',
      enabledModules: new Set(['contact']),
      data: {
        ...emptySiteData(),
        forms: [
          {
            id: 'f',
            slug: 'contact',
            name: 'Contact',
            kind: 'contact',
            description: null,
            successMessage: 'Merci',
            honeypotField: 'website',
            requireCaptcha: false,
            fields: [
              {
                name: 'message',
                label: 'Message',
                type: 'textarea',
                placeholder: null,
                helpText: null,
                isRequired: true,
                options: [],
              },
            ],
          },
        ],
      },
      nonce: 'n',
      formToken: 't',
      turnstileSiteKey: null,
      healthDataGuard,
      now: new Date('2026-09-29T10:00:00Z'),
    };
  }

  function renderContact(ctx: RenderContext): string {
    const block = createBlock('contact');
    if (!block) throw new Error('bloc contact inconnu');
    return renderBlock({ ...block, props: { ...block.props, formSlug: 'contact' } }, ctx).value;
  }

  it('le site d’un praticien avertit sous chaque champ libre', () => {
    const html = renderContact(context(true));
    expect(html).toContain(HEALTH_DATA_NOTICE);
    expect(html).toContain('aria-describedby="f-message-health"');
  });

  it('les autres sites n’affichent pas cet avertissement', () => {
    expect(renderContact(context(false))).not.toContain(HEALTH_DATA_NOTICE);
  });

  it('l’accord de traitement encadre ces données', () => {
    expect(text(buildDataProcessingAgreement())).toContain('hébergeur de données de santé');
  });
});

describe('TVA et propriété du code (CGV)', () => {
  it('la TVA suit le lieu d’établissement, avec autoliquidation', () => {
    const terms = text(buildTerms());
    expect(terms).toContain('lieu d’établissement du Client');
    expect(terms).toContain('Autoliquidation');
  });

  it('distingue code spécifique, composants génériques et bibliothèques de tiers', () => {
    const terms = text(buildTerms());
    for (const category of ['Code spécifique', 'Composants génériques', 'Bibliothèques de tiers']) {
      expect(terms).toContain(category);
    }
    expect(terms).toContain('héberger chez le prestataire de son choix');
  });
});

describe('signalement (DSA, art. 16 § 2 c)', () => {
  const base = {
    url: 'https://site.example/page',
    explanation: 'Ce contenu est manifestement illicite pour cette raison.',
    goodFaith: true,
    website: '',
  };

  it('exige nom et e-mail hors abus sur mineurs', () => {
    expect(contentReportSchema.safeParse({ ...base, category: 'fraud' }).success).toBe(false);
  });

  it('permet l’anonymat pour un abus sur mineur', () => {
    expect(contentReportSchema.safeParse({ ...base, category: 'child_abuse' }).success).toBe(true);
  });
});

describe('application GitHub par manifeste', () => {
  it('ne demande que le strict nécessaire', () => {
    const manifest = buildGithubAppManifest('https://nemasus.example/', 'Nemasus Sites');
    expect(manifest.default_permissions).toEqual({ contents: 'write', metadata: 'read' });
    expect(manifest.public).toBe(false);
    expect(manifest.hook_attributes.url).toBe('https://nemasus.example/api/webhooks/github');
    expect(manifest.redirect_url).toBe('https://nemasus.example/admin/integrations/github/retour');
    expect(manifest.default_events.sort()).toEqual([
      'installation_repositories',
      'push',
      'repository',
    ]);
  });

  it('vise le bon compte GitHub', () => {
    expect(githubAppCreationUrl(null, 'a.b.c')).toBe(
      'https://github.com/settings/apps/new?state=a.b.c',
    );
    expect(githubAppCreationUrl('lallianse', 's')).toBe(
      'https://github.com/organizations/lallianse/settings/apps/new?state=s',
    );
    expect(isValidGithubOrganization('lallianse')).toBe(true);
    expect(isValidGithubOrganization('../evil')).toBe(false);
    expect(isValidGithubOrganization('-bad')).toBe(false);
  });

  it('échange le code contre les identifiants', async () => {
    const calls: string[] = [];
    const app = await exchangeManifestCode('abc12345', (async (url: string) => {
      calls.push(url);
      return new Response(
        JSON.stringify({
          id: 42,
          slug: 'nemasus-sites',
          name: 'Nemasus Sites',
          html_url: 'https://github.com/apps/nemasus-sites',
          pem: '-----BEGIN RSA PRIVATE KEY-----\nAAA\n-----END RSA PRIVATE KEY-----\n',
          webhook_secret: 'secret',
          owner: { login: 'lallianse' },
        }),
        { status: 201 },
      );
    }) as typeof fetch);
    expect(calls).toEqual(['https://api.github.com/app-manifests/abc12345/conversions']);
    expect(app).toMatchObject({ id: 42, slug: 'nemasus-sites', owner: 'lallianse' });
  });

  it('refuse un code invalide ou déjà utilisé', async () => {
    await expect(exchangeManifestCode('../../x')).rejects.toThrow(/invalide/);
    await expect(
      exchangeManifestCode(
        'abc12345',
        (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/déjà servi/);
  });

  it('met la clé privée sur une ligne relisible', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nAAA\n-----END RSA PRIVATE KEY-----';
    const encoded = privateKeyForEnv(pem);
    expect(encoded).not.toContain('\n');
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(pem);
  });
});

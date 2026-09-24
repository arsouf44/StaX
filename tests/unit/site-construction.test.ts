import { describe, expect, it } from 'vitest';
import { buildDashboardNavigation } from '@stax/business';
import { blankTemplate, buildTemplateForBusiness } from '@stax/site-engine';
import {
  clearEnvSource,
  coreConfigurationProblems,
  readServerEnv,
  resetEnvCache,
  setEnvSource,
  supabaseServiceCredentials,
} from '@stax/config';
import type { OrgCapability } from '@stax/types';
import { frameableProjectUrl } from '~/lib/frame-url';

/**
 * StaX construit le site, puis le confie au client.
 *
 * Tant qu'il n'est pas confie, l'espace client ne propose que le suivi du
 * projet et les ecrans du compte (la base, elle, refuse toute modification :
 * voir tests/sql/rls.test.sql). L'equipe peut partir d'une page vierge.
 */

const ALL: OrgCapability[] = [
  'org.view',
  'org.manage',
  'members.manage',
  'content.view',
  'content.edit',
  'content.publish',
  'inbox.view',
  'inbox.manage',
  'commerce.view',
  'commerce.manage',
  'billing.view',
  'billing.manage',
  'analytics.view',
  'domain.manage',
  'media.manage',
  'data.export',
  'support.manage',
];

function hrefs(
  siteDelivered: boolean,
  architecture?: 'external_repository' | 'legacy_engine',
): string[] {
  return buildDashboardNavigation({
    enabledModules: ['menu', 'bookings'],
    hasFeature: () => true,
    can: (capability) => ALL.includes(capability),
    siteDelivered,
    architecture,
  }).flatMap((group) => group.items.map((item) => item.href));
}

describe('espace client pendant la construction du site', () => {
  it('ne propose ni l’éditeur, ni les écrans du site, ni ses statistiques', () => {
    const entries = hrefs(false);
    expect(entries).toContain('/app');
    expect(entries).toContain('/app/projet');
    expect(entries).toContain('/app/support');
    expect(entries).toContain('/app/facturation');
    expect(entries).not.toContain('/app/editeur');
    expect(entries).not.toContain('/app/site/pages');
    expect(entries).not.toContain('/app/media');
    expect(entries).not.toContain('/app/statistiques');
  });

  it('propose tout une fois le site confié', () => {
    const entries = hrefs(true);
    expect(entries).toContain('/app/editeur');
    expect(entries).toContain('/app/site/pages');
    expect(entries).toContain('/app/statistiques');
  });
});

describe('site indépendant (dépôt GitHub + projet Cloudflare)', () => {
  it('avant la livraison : ni éditeur, ni versions, seulement le suivi du projet', () => {
    const entries = hrefs(false, 'external_repository');
    expect(entries).toContain('/app/projet');
    expect(entries).not.toContain('/app/editeur');
    expect(entries).not.toContain('/app/site/versions');
  });

  it('après la livraison : l’éditeur du contrat et l’historique des versions', () => {
    const entries = hrefs(true, 'external_repository');
    expect(entries).toContain('/app/editeur');
    expect(entries).toContain('/app/site/versions');
  });

  it('jamais les écrans de l’ancien moteur : pages, apparence, navigation, formulaires', () => {
    const entries = hrefs(true, 'external_repository');
    for (const legacy of [
      '/app/site/pages',
      '/app/site/apparence',
      '/app/site/navigation',
      '/app/site/referencement',
      '/app/forms',
    ]) {
      expect(entries).not.toContain(legacy);
    }
  });
});

describe('aperçu dans l’éditeur', () => {
  it('encadre le projet Cloudflare du site, jamais une origine quelconque', () => {
    expect(frameableProjectUrl('https://boulangerie.pages.dev')).toBe(
      'https://boulangerie.pages.dev/',
    );
    expect(frameableProjectUrl('https://site.compte.workers.dev/accueil')).toBe(
      'https://site.compte.workers.dev/',
    );
    // Le domaine du client sert le meme deploiement, mais la CSP de l'editeur
    // ne l'autorise pas : l'editeur ne doit pas tenter de l'encadrer.
    expect(frameableProjectUrl('https://www.boulangerie.fr/')).toBeNull();
    expect(frameableProjectUrl('http://boulangerie.pages.dev')).toBeNull();
    expect(frameableProjectUrl('https://pages.dev.attaquant.fr')).toBeNull();
    expect(frameableProjectUrl(null)).toBeNull();
    expect(frameableProjectUrl('pas une adresse')).toBeNull();
  });
});

describe('site construit de zéro', () => {
  const full = buildTemplateForBusiness('restaurant', { businessName: 'Chez Dupont' });
  const blank = blankTemplate(full);

  it('part d’une page d’accueil sans aucune section', () => {
    const home = blank.pages.find((page) => page.path === '/');
    expect(home?.blocks).toEqual([]);
    expect(blank.navigation.primary).toEqual([{ label: home?.title, path: '/' }]);
  });

  it('garde les seules pages légales obligatoires, sans contenu d’exemple', () => {
    const others = blank.pages.filter((page) => page.path !== '/');
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((page) => page.kind === 'legal')).toBe(true);
    expect(blank.pages.length).toBeLessThan(full.pages.length);
  });
});

describe('configuration du client de service', () => {
  const withEnv = (env: Record<string, string>, run: () => void) => {
    // Une valeur vide vaut « absente » : l'environnement du poste de test ne
    // peut pas fausser le resultat.
    setEnvSource({
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      SUPABASE_SECRET_KEY: '',
      SUPABASE_SERVICE_KEY: '',
      ...env,
    });
    resetEnvCache();
    try {
      run();
    } finally {
      clearEnvSource();
      resetEnvCache();
    }
  };

  it('accepte l’URL publique et la clé sous son autre nom', () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: 'https://projet.supabase.co',
        SUPABASE_SECRET_KEY: 'cle-de-service-de-test',
      },
      () => {
        expect(readServerEnv('SUPABASE_URL')).toBe('https://projet.supabase.co');
        expect(supabaseServiceCredentials()).toEqual({
          ok: true,
          url: 'https://projet.supabase.co',
          key: 'cle-de-service-de-test',
        });
      },
    );
  });

  it('nomme la variable manquante, sans jamais afficher de valeur', () => {
    withEnv(
      { STAX_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://projet.supabase.co' },
      () => {
        const credentials = supabaseServiceCredentials();
        expect(credentials.ok).toBe(false);
        const problems = coreConfigurationProblems().join(' ');
        expect(problems).toContain('SUPABASE_SERVICE_ROLE_KEY');
        expect(problems).not.toContain('projet.supabase.co');
      },
    );
  });
});

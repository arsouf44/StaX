import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Referencement du site public : ce qui est promis aux moteurs et aux
 * assistants.
 *
 * Ces assertions portent sur les details qu'une relecture humaine laisse
 * passer et qui coutent cher : un lien canonique qui pointe ailleurs, une
 * carte de partage heritee de l'accueil sur trente pages, un plan du site
 * qui declare tout modifie ce matin, ou un `llms.txt` qui decrit un produit
 * que nous ne vendons pas.
 */

const ORIGIN = 'https://nemasus.example';

beforeAll(() => {
  process.env.PLATFORM_URL = ORIGIN;
  process.env.NEXT_PUBLIC_PLATFORM_URL = ORIGIN;
});

describe('description pour les moteurs', () => {
  it('laisse passer une description courte', async () => {
    const { metaDescription } = await import('~/lib/seo');
    expect(metaDescription('Un studio qui conçoit des sites.')).toBe(
      'Un studio qui conçoit des sites.',
    );
  });

  it('coupe en fin de phrase plutot qu au milieu d un mot', async () => {
    const { metaDescription } = await import('~/lib/seo');
    const long = `${'Nemasus conçoit et développe votre site professionnel sur mesure. '.repeat(4)}`;
    const cut = metaDescription(long);
    expect(cut.length).toBeLessThanOrEqual(158);
    expect(cut.endsWith('.') || cut.endsWith('…')).toBe(true);
  });

  it('ne coupe jamais au milieu d un mot', async () => {
    const { metaDescription } = await import('~/lib/seo');
    const cut = metaDescription('alpha '.repeat(60));
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toMatch(/alph…$/);
  });
});

describe('metadonnees d une page', () => {
  it('rattache le canonique, l Open Graph et la carte de partage au MEME chemin', async () => {
    const { pageMetadata } = await import('~/lib/seo');
    const meta = pageMetadata({
      path: '/comment-ca-marche',
      title: 'Comment ça marche',
      description: 'Commande, virement, code d’accès.',
    });

    // La faute que cette fonction existe pour empecher : un `og:url` reste
    // sur « / » et trente pages se partagent avec le titre de l'accueil.
    expect(meta.alternates?.canonical).toBe('/comment-ca-marche');
    expect(meta.openGraph?.url).toBe('/comment-ca-marche');
    expect(meta.openGraph?.title).toContain('Comment ça marche');
    expect(meta.twitter?.title).toContain('Comment ça marche');
  });

  it('porte une image de partage et la description tronquee', async () => {
    const { pageMetadata } = await import('~/lib/seo');
    const meta = pageMetadata({
      path: '/securite',
      title: 'Sécurité',
      description: `${'Isolation imposée par la base de données à chaque requête. '.repeat(5)}`,
    });
    expect(String(meta.description).length).toBeLessThanOrEqual(158);
    expect(meta.description).toBe(meta.openGraph?.description);
    expect(JSON.stringify(meta.openGraph?.images)).toContain('/opengraph-image');
    expect(JSON.stringify(meta.twitter?.images)).toContain('/twitter-image');
  });

  it('date un document juridique sans jamais utiliser la date du jour', async () => {
    const { pageMetadata } = await import('~/lib/seo');
    const meta = pageMetadata({
      path: '/cgv',
      title: 'Conditions générales de vente',
      description: 'Les conditions de vente.',
      type: 'article',
      modified: '2026-10-08',
    });
    // `type` discrimine l'union Open Graph de Next : on le lit explicitement.
    const og = meta.openGraph as { type?: string; modifiedTime?: string };
    expect(og.type).toBe('article');
    expect(og.modifiedTime).toBe('2026-10-08');
  });

  it('sait retirer une page des moteurs tout en gardant ses liens suivis', async () => {
    const { pageMetadata } = await import('~/lib/seo');
    const meta = pageMetadata({
      path: '/acces',
      title: 'Accès',
      description: 'Entrez votre code.',
      index: false,
    });
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });
});

describe('donnees structurees', () => {
  it('ne publie aucun marqueur « A CONFIGURER » dans le balisage', async () => {
    const { organizationJsonLd } = await import('~/lib/schema');
    expect(JSON.stringify(organizationJsonLd())).not.toMatch(/CONFIGURER/i);
  });

  it('decrit l organisation avec une URL absolue et sa zone', async () => {
    const { organizationJsonLd } = await import('~/lib/schema');
    const org = organizationJsonLd() as Record<string, unknown>;
    expect(org['@type']).toBe('Organization');
    expect(org.url).toBe(`${ORIGIN}/`);
    expect(JSON.stringify(org.areaServed)).toContain('France');
  });

  it('part toujours de l accueil dans le fil d Ariane', async () => {
    const { trailFrom } = await import('~/lib/schema');
    const trail = trailFrom({ name: 'Sécurité', path: '/securite' }) as {
      itemListElement: Array<{ position: number; name: string; item: string }>;
    };
    expect(trail.itemListElement.map((entry) => entry.position)).toEqual([1, 2]);
    expect(trail.itemListElement[0]?.name).toBe('Accueil');
    expect(trail.itemListElement[1]?.item).toBe(`${ORIGIN}/securite`);
  });

  it('enumere une page de liste avec des URL absolues et une position par entree', async () => {
    const { collectionPageJsonLd } = await import('~/lib/schema');
    const page = collectionPageJsonLd({
      path: '/fonctionnalites',
      name: 'Fonctionnalités',
      description: 'Ce que le client gère lui-même.',
      items: [
        { name: 'Éditeur', path: '/fonctionnalites/editeur' },
        { name: 'Domaines', path: '/fonctionnalites/domaines' },
      ],
    }) as Record<string, { numberOfItems: number; itemListElement: Array<{ url: string }> }>;

    expect(page['@type']).toBe('CollectionPage');
    expect(page.mainEntity?.numberOfItems).toBe(2);
    expect(page.mainEntity?.itemListElement[0]?.url).toBe(`${ORIGIN}/fonctionnalites/editeur`);
  });
});

describe('llms.txt — le site ecrit pour les assistants', () => {
  it('ouvre sur la marque, sa promesse et un resume', async () => {
    const { llmsTxt } = await import('~/lib/llms');
    const text = llmsTxt();
    expect(text.startsWith('# Nemasus\n')).toBe(true);
    // Le format attendu : un titre, puis un resume en citation.
    expect(text).toMatch(/\n> Nous créons votre site\. Vous le gérez ensuite\./);
  });

  it('corrige d emblee ce qu un assistant se trompe a decrire', async () => {
    const { llmsTxt } = await import('~/lib/llms');
    const text = llmsTxt();
    // Nemasus ressemble, vu de loin, a un createur de sites en ligne.
    expect(text).toContain('Ce que ce n’est pas');
    expect(text).toContain('glisser-déposer');
    expect(text).toContain('aucun prix public');
    expect(text).toContain('virement bancaire');
    expect(text).toContain('code d’accès personnel');
  });

  it('n annonce ni prix, ni chiffre d affaires, ni promesse inventee', async () => {
    const { llmsFullTxt, llmsTxt } = await import('~/lib/llms');
    for (const [name, text] of [
      ['llms.txt', llmsTxt()],
      ['llms-full.txt', llmsFullTxt()],
    ] as const) {
      expect(text, name).not.toMatch(/\d[\d\s\u00a0\u202f]*(?:,\d{2})?\s?€|€\s?\d/);
      expect(text, name).not.toMatch(/\/\s?mois|par mois|abonnement mensuel/i);
      // Aucun chiffre de resultat : la regle du site vaut pour ses fichiers.
      expect(text, name).not.toMatch(/\d+\s?% de (?:ventes|disponibilité|clients)/i);
      expect(text, name).not.toMatch(/CONFIGURER/i);
    }
  });

  it('ne donne que des liens absolus : un assistant ne resout pas un chemin relatif', async () => {
    const { llmsFullTxt, llmsTxt } = await import('~/lib/llms');
    const index = llmsTxt();

    // La carte du site est faite de liens nommes ; le fichier complet cite les
    // URL telles quelles, sous le titre de chaque fonctionnalite. Dans les deux
    // cas, rien de relatif : un assistant n'a pas de page courante.
    const named = [...index.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1] ?? '');
    expect(named.length).toBeGreaterThan(10);
    for (const link of named) expect(link.startsWith(ORIGIN)).toBe(true);

    for (const text of [index, llmsFullTxt()]) {
      expect(text).not.toMatch(/\]\(\//);
      expect(text).not.toMatch(/^\/[a-z]/m);
    }
  });

  it('renvoie vers le fichier complet et vers le plan du site', async () => {
    const { llmsTxt } = await import('~/lib/llms');
    expect(llmsTxt()).toContain(`${ORIGIN}/llms-full.txt`);
    expect(llmsTxt()).toContain(`${ORIGIN}/sitemap.xml`);
  });

  it('expose chaque fonctionnalite AVEC ses limites, et chaque question', async () => {
    const { llmsFullTxt } = await import('~/lib/llms');
    const { FEATURE_PAGES } = await import('~/content/features');
    const { FAQ_ITEMS } = await import('~/content/faq');
    const text = llmsFullTxt();

    for (const feature of FEATURE_PAGES) {
      expect(text, feature.slug).toContain(feature.name);
      expect(text, feature.slug).toContain(`${ORIGIN}/fonctionnalites/${feature.slug}`);
    }
    // Les limites sont la raison d'etre du fichier complet : un assistant qui
    // ne lit que des arguments de vente promet a notre place.
    expect(text).toContain('Limites assumées');
    for (const item of FAQ_ITEMS) expect(text, item.question).toContain(item.question);
  });

  it('reprend le parcours reel, dans l ordre, depuis la source du site', async () => {
    const { llmsTxt } = await import('~/lib/llms');
    const { ORDER_JOURNEY } = await import('~/content/process');
    const text = llmsTxt();
    const positions = ORDER_JOURNEY.map((step) => text.indexOf(step.title));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe('robots.txt', () => {
  it('interdit tout hors production', async () => {
    process.env.NEMASUS_ENV = 'preview';
    const robots = (await import('~/app/robots')).default;
    expect(robots().rules).toEqual([{ userAgent: '*', disallow: '/' }]);
    expect(robots().sitemap).toBeUndefined();
    delete process.env.NEMASUS_ENV;
  });

  it('autorise explicitement les robots des assistants, sans leur ouvrir les espaces prives', async () => {
    process.env.NEMASUS_ENV = 'production';
    const robots = (await import('~/app/robots')).default;
    const rules = robots().rules as Array<{
      userAgent: string;
      allow?: string;
      disallow?: string[];
    }>;
    delete process.env.NEMASUS_ENV;

    // Un groupe `User-agent` dedie remplace entierement le groupe `*` : les
    // chemins prives doivent figurer dans CHAQUE groupe, sans exception. Un
    // oubli ici livrerait les espaces clients a l'entrainement des modeles.
    for (const agent of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
      const rule = rules.find((candidate) => candidate.userAgent === agent);
      expect(rule, agent).toBeDefined();
      expect(rule?.allow, agent).toBe('/');
    }
    for (const rule of rules) {
      for (const path of ['/app/', '/admin/', '/api/', '/commander/', '/acces']) {
        expect(rule.disallow, `${rule.userAgent} laisse passer ${path}`).toContain(path);
      }
    }
  });

  it('annonce le plan du site en production', async () => {
    process.env.NEMASUS_ENV = 'production';
    const robots = (await import('~/app/robots')).default;
    expect(robots().sitemap).toBe(`${ORIGIN}/sitemap.xml`);
    delete process.env.NEMASUS_ENV;
  });
});

describe('plan du site', () => {
  it('ne declare jamais une page modifiee aujourd hui', async () => {
    const sitemap = (await import('~/app/sitemap')).default;
    const today = new Date().toISOString().slice(0, 10);
    for (const entry of sitemap()) {
      const date = new Date(String(entry.lastModified)).toISOString().slice(0, 10);
      expect(date, `${entry.url} se declare modifie ce matin`).not.toBe(today);
    }
  });

  it('reprend la date reelle des textes juridiques', async () => {
    const sitemap = (await import('~/app/sitemap')).default;
    const { getLegalDocument } = await import('~/content/legal');
    const entries = new Map(sitemap().map((entry) => [entry.url, entry.lastModified]));
    for (const slug of ['cgv', 'mentions-legales', 'sous-traitants'] as const) {
      const expected = getLegalDocument(slug).updatedAt;
      const actual = new Date(String(entries.get(`${ORIGIN}/${slug}`))).toISOString().slice(0, 10);
      expect(actual, slug).toBe(expected);
    }
  });

  it('n expose aucune page privee et couvre toutes les fonctionnalites', async () => {
    const sitemap = (await import('~/app/sitemap')).default;
    const { FEATURE_PAGES } = await import('~/content/features');
    const urls = sitemap().map((entry) => entry.url);

    for (const forbidden of ['/app/', '/admin/', '/commander', '/connexion', '/bienvenue']) {
      expect(
        urls.filter((url) => url.includes(forbidden)),
        forbidden,
      ).toEqual([]);
    }
    for (const feature of FEATURE_PAGES) {
      expect(urls, feature.slug).toContain(`${ORIGIN}/fonctionnalites/${feature.slug}`);
    }
    // Aucun doublon : deux entrees pour une page gaspillent le budget d'exploration.
    expect(new Set(urls).size).toBe(urls.length);
  });
});

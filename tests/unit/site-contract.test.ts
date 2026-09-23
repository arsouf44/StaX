import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bridgeScript,
  buildContentBundle,
  checkManifestAgainstPlan,
  collectMediaIds,
  contentFromBundle,
  contentHash,
  formatFieldAddress,
  integrationsFromManifest,
  manifestJsonSchema,
  parseBridgeMessage,
  parseFieldAddress,
  parseManifest,
  resolveFieldAddress,
  richTextToHtml,
  stableStringify,
  validateContent,
  writeFieldValue,
  type MediaDescriptor,
  type SiteManifest,
} from '@stax/site-contract';

const fixture = readFileSync(
  fileURLToPath(new URL('../fixtures/site-contract/stax.manifest.json', import.meta.url)),
  'utf8',
);

function loadManifest(): SiteManifest {
  const result = parseManifest(fixture);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.manifest;
}

const MEDIA_ID = '0190a7b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b';

function sampleContent() {
  return {
    globals: {
      coordonnees: {
        telephone: '01 23 45 67 89',
        email: 'Contact@Boulangerie-Martin.fr',
        horaires: {
          week: {
            mon: [],
            tue: [{ open: '07:00', close: '19:30' }],
            wed: [{ open: '07:00', close: '19:30' }],
            thu: [{ open: '07:00', close: '19:30' }],
            fri: [{ open: '07:00', close: '19:30' }],
            sat: [{ open: '07:00', close: '13:00' }],
            sun: [{ open: '07:30', close: '12:30' }],
          },
        },
      },
      entete: {
        menu: {
          fr: [
            { label: 'Accueil', href: '/' },
            { label: 'Contact', href: '/contact' },
          ],
        },
      },
    },
    pages: {
      accueil: {
        seo: {
          fr: {
            title: 'Boulangerie Martin — Lyon',
            description: 'Pain au levain et viennoiseries.',
          },
        },
        sections: {
          hero: {
            titre: { fr: 'Le pain du quartier', en: 'Your neighbourhood bakery' },
            texte: { fr: [{ type: 'paragraph', children: [{ text: 'Depuis 1987.' }] }] },
            image: { mediaId: MEDIA_ID, alt: 'La vitrine' },
            bouton: { fr: { label: 'Nous trouver', href: '/contact' } },
          },
          specialites: {
            produits: {
              fr: [
                {
                  _id: 'croissant01',
                  nom: 'Croissant',
                  prix: 1.2,
                  photo: { src: '/images/croissant.jpg', alt: 'Croissant' },
                },
              ],
            },
          },
        },
      },
      contact: { sections: { intro: {} } },
    },
    collections: {
      actualites: [
        { id: 'article0001', values: { titre: { fr: 'Galette des rois' }, date: '2026-01-06' } },
        { id: 'article0002', values: { titre: { fr: 'Galette des rois !' }, date: '2026-01-07' } },
      ],
    },
  };
}

describe('manifeste', () => {
  it('lit un manifeste valide et le resume', () => {
    const result = parseManifest(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toMatchObject({
      pages: 2,
      locales: 2,
      forms: 1,
      collections: 1,
      advancedForms: false,
      modules: ['contact'],
    });
    expect(result.warnings).toEqual([]);
  });

  it('refuse une version de contrat inconnue plutot que de la deviner', () => {
    const result = parseManifest({ ...JSON.parse(fixture), contract: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.contractVersion).toBe(2);
    expect(result.errors[0]?.path).toBe('contract');
  });

  it('refuse un JSON illisible, des identifiants en double, des formulaires sans module', () => {
    expect(parseManifest('{ pas du json').ok).toBe(false);

    const duplicated = JSON.parse(fixture);
    duplicated.pages[1].id = 'accueil';
    const dup = parseManifest(duplicated);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.errors.some((error) => error.message.includes('deux fois'))).toBe(true);

    const noModule = JSON.parse(fixture);
    noModule.modules = [];
    expect(parseManifest(noModule).ok).toBe(false);
  });

  it('refuse un chemin de contenu qui sort du depot', () => {
    const manifest = JSON.parse(fixture);
    manifest.content.file = '../../etc/passwd.json';
    expect(parseManifest(manifest).ok).toBe(false);
    manifest.content.file = '/src/content/stax.content.json';
    expect(parseManifest(manifest).ok).toBe(false);
  });

  it('refuse un champ de type inconnu : aucun gabarit, aucun type implicite', () => {
    const manifest = JSON.parse(fixture);
    manifest.pages[0].sections[0].fields.push({ id: 'html', label: 'HTML', type: 'html' });
    expect(parseManifest(manifest).ok).toBe(false);
  });

  it('publie un schema JSON pour les developpeurs', () => {
    const schema = manifestJsonSchema();
    expect(schema['$id']).toBe('https://stax.fr/schemas/stax.manifest.v1.json');
    expect(JSON.stringify(schema)).toContain('opening_hours');
  });
});

describe('contenu', () => {
  it('retire toute zone que le manifeste ne declare pas', () => {
    const manifest = loadManifest();
    const input = sampleContent() as Record<string, unknown>;
    (input['pages'] as Record<string, unknown>)['admin'] = { sections: { x: { y: 'z' } } };
    (input['globals'] as Record<string, Record<string, unknown>>)['coordonnees']!['script'] =
      '<script>';
    input['theme'] = { css: 'body{display:none}' };

    const result = validateContent(manifest, input, { mode: 'draft' });
    expect(result.content.pages['admin']).toBeUndefined();
    expect(result.content.globals['coordonnees']?.['script']).toBeUndefined();
    expect(result.content).not.toHaveProperty('theme');
    expect(result.dropped).toEqual(
      expect.arrayContaining(['pages.admin', 'globals.coordonnees.script']),
    );
  });

  it('tolere un brouillon incomplet mais refuse de le publier', () => {
    const manifest = loadManifest();
    const input = sampleContent();
    input.pages.accueil.sections.hero.titre = { fr: '', en: '' };
    expect(validateContent(manifest, input, { mode: 'draft' }).ok).toBe(true);
    const publish = validateContent(manifest, input, { mode: 'publish' });
    expect(publish.ok).toBe(false);
    expect(publish.errors.map((error) => error.path)).toContain('pages.accueil.hero.titre@fr');
  });

  it('normalise les valeurs et signale les traductions manquantes', () => {
    const manifest = loadManifest();
    const result = validateContent(manifest, sampleContent(), { mode: 'publish' });
    expect(result.errors).toEqual([]);
    expect(result.content.globals['coordonnees']?.['email']).toBe('contact@boulangerie-martin.fr');
    expect(result.warnings.some((warning) => warning.path === 'pages.accueil.hero.bouton@en')).toBe(
      true,
    );
  });

  it('rend les adresses des articles uniques', () => {
    const manifest = loadManifest();
    const result = validateContent(manifest, sampleContent(), { mode: 'publish' });
    const slugs = result.content.collections['actualites']?.map((item) => item.slug);
    expect(slugs).toEqual(['galette-des-rois', 'galette-des-rois-2']);
  });

  it('refuse les liens et images dangereux', () => {
    const manifest = loadManifest();
    const input = sampleContent();
    input.pages.accueil.sections.hero.bouton = {
      fr: { label: 'Cliquez', href: 'javascript:alert(1)' },
    };
    input.pages.accueil.sections.hero.image = { src: 'javascript:alert(1)', alt: 'x' } as never;
    const result = validateContent(manifest, input, { mode: 'draft' });
    expect(result.content.pages['accueil']?.sections['hero']?.['bouton']).toBeUndefined();
    expect(result.content.pages['accueil']?.sections['hero']?.['image']).toBeUndefined();
    expect(result.ok).toBe(false);
  });

  it('refuse du balisage dans le texte riche, et echappe le texte', () => {
    const manifest = loadManifest();
    const input = sampleContent();
    input.pages.accueil.sections.hero.texte = {
      fr: [{ type: 'paragraph', children: [{ text: '<img src=x onerror=alert(1)>' }] }],
    };
    const result = validateContent(manifest, input, { mode: 'publish' });
    const html = richTextToHtml(
      (result.content.pages['accueil']?.sections['hero']?.['texte'] as Record<string, never>)['fr'],
    );
    expect(html).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');

    // Un bloc « html » n'existe pas dans le contrat.
    input.pages.accueil.sections.hero.texte = { fr: [{ type: 'html', html: '<script>' }] } as never;
    expect(validateContent(manifest, input, { mode: 'draft' }).ok).toBe(false);
  });

  it('borne la taille du contenu', () => {
    const manifest = loadManifest();
    const input = sampleContent();
    input.collections.actualites = Array.from({ length: 900 }, (_, index) => ({
      id: `article${String(index).padStart(4, '0')}`,
      values: { titre: { fr: `Article ${index} ${'x'.repeat(200)}` }, date: '2026-01-06' },
    }));
    const result = validateContent(manifest, input, { mode: 'draft' });
    expect(result.ok).toBe(true);
    input.collections.actualites = input.collections.actualites.map((item) => ({
      ...item,
      values: {
        ...item.values,
        corps: {
          fr: [{ type: 'paragraph', children: [{ text: 'y'.repeat(4000) }] }],
        },
      },
    })) as never;
    expect(validateContent(manifest, input, { mode: 'draft' }).errors.at(-1)?.message).toMatch(
      /trop volumineux/,
    );
  });
});

describe('bundle publie dans le depot', () => {
  const media = new Map<string, MediaDescriptor>([
    [MEDIA_ID, { id: MEDIA_ID, fileName: `${MEDIA_ID}.jpg`, width: 1600, height: 900 }],
  ]);
  const meta = { siteId: 'site-1', version: 7, releaseId: 'release-7' };

  it('est deterministe : meme contenu, meme fichier, meme empreinte', async () => {
    const manifest = loadManifest();
    const a = validateContent(manifest, sampleContent(), { mode: 'publish' }).content;
    const shuffled = JSON.parse(stableStringify(a));
    const b = validateContent(
      manifest,
      { collections: shuffled.collections, pages: shuffled.pages, globals: shuffled.globals },
      { mode: 'publish' },
    ).content;
    expect(buildContentBundle(manifest, a, media, meta).json).toBe(
      buildContentBundle(manifest, b, media, meta).json,
    );
    expect(await contentHash(a)).toBe(await contentHash(b));
  });

  it('resout langues, images, telephone et texte riche', () => {
    const manifest = loadManifest();
    const content = validateContent(manifest, sampleContent(), { mode: 'publish' }).content;
    const { bundle, missingMedia } = buildContentBundle(manifest, content, media, meta);
    expect(missingMedia).toEqual([]);
    const fr = bundle.locales['fr']!;
    const en = bundle.locales['en']!;
    const hero = fr.pages['accueil']!.sections['hero']!;
    expect(hero['titre']).toBe('Le pain du quartier');
    expect(en.pages['accueil']!.sections['hero']!['titre']).toBe('Your neighbourhood bakery');
    // Traduction absente : la langue par defaut est reprise.
    expect(en.pages['accueil']!.sections['hero']!['bouton']).toEqual({
      label: 'Nous trouver',
      href: '/contact',
    });
    expect(hero['image']).toEqual({
      src: `/media/stax/${MEDIA_ID}.jpg`,
      alt: 'La vitrine',
      width: 1600,
      height: 900,
    });
    expect(hero['texte']).toMatchObject({ html: '<p>Depuis 1987.</p>' });
    expect(fr.globals['coordonnees']!['telephone']).toEqual({
      display: '01 23 45 67 89',
      href: 'tel:+33123456789',
    });
    expect(fr.globals['coordonnees']!['adresse']).toBeNull();
    expect(fr.collections['actualites']![0]).toMatchObject({
      _slug: 'galette-des-rois',
      _path: '/actualites/galette-des-rois',
    });
    expect(bundle.stax).toEqual({
      site: 'site-1',
      version: 7,
      release: 'release-7',
      preview: null,
    });
  });

  it('liste les photos a deposer et signale une photo introuvable', () => {
    const manifest = loadManifest();
    const content = validateContent(manifest, sampleContent(), { mode: 'publish' }).content;
    expect(collectMediaIds(manifest, content)).toEqual([MEDIA_ID]);
    expect(buildContentBundle(manifest, content, new Map(), meta).missingMedia).toEqual([MEDIA_ID]);
  });

  it('reprend le contenu initial ecrit par le developpeur (aller-retour)', () => {
    const manifest = loadManifest();
    const input = sampleContent();
    input.pages.accueil.sections.hero.image = {
      src: '/images/vitrine.jpg',
      alt: 'La vitrine',
    } as never;
    const content = validateContent(manifest, input, { mode: 'publish' }).content;
    const { bundle } = buildContentBundle(manifest, content, new Map(), meta);
    const reimported = validateContent(
      manifest,
      contentFromBundle(manifest, JSON.parse(JSON.stringify(bundle))),
      {
        mode: 'publish',
      },
    );
    expect(reimported.errors).toEqual([]);
    // Seule la traduction de repli (bouton en anglais) differe : elle devient explicite.
    const again = buildContentBundle(manifest, reimported.content, new Map(), meta);
    expect(again.json).toBe(buildContentBundle(manifest, content, new Map(), meta).json);
  });
});

describe('adresses de champs (clic dans l’apercu)', () => {
  it('relie une adresse a son champ, et refuse une adresse inconnue', () => {
    const manifest = loadManifest();
    const address = parseFieldAddress('pages.accueil.hero.titre');
    expect(address).toEqual({
      scope: 'page',
      pageId: 'accueil',
      sectionId: 'hero',
      fieldId: 'titre',
    });
    expect(resolveFieldAddress(manifest, address!)?.label).toBe('Titre');
    expect(formatFieldAddress(address!)).toBe('pages.accueil.hero.titre');
    expect(resolveFieldAddress(manifest, parseFieldAddress('pages.accueil._seo')!)?.type).toBe(
      'seo',
    );
    expect(
      resolveFieldAddress(manifest, parseFieldAddress('pages.accueil.hero.code')!),
    ).toBeUndefined();
    expect(parseFieldAddress('pages.<script>.x.y')).toBeNull();
  });

  it('ecrit une valeur sans modifier le document d’origine', () => {
    const manifest = loadManifest();
    const content = validateContent(manifest, sampleContent(), { mode: 'draft' }).content;
    const next = writeFieldValue(
      content,
      parseFieldAddress('globals.coordonnees.telephone')!,
      '04 00 00 00 00',
    );
    expect(next.globals['coordonnees']?.['telephone']).toBe('04 00 00 00 00');
    expect(content.globals['coordonnees']?.['telephone']).toBe('01 23 45 67 89');
  });
});

describe('offre et contrat', () => {
  const rights = (features: string[], limits: Record<string, number | null>) => ({
    has: (key: string) => features.includes(key),
    limit: (key: string) => (key in limits ? (limits[key] ?? null) : null),
  });

  it('refuse un contrat qui depasse l’offre Essentiel', () => {
    const result = parseManifest(fixture);
    if (!result.ok) throw new Error('manifeste invalide');
    const problems = checkManifestAgainstPlan(
      result.summary,
      rights([], { max_pages: 5, max_locales: 1, max_forms: 1 }),
    );
    expect(problems.map((problem) => problem.key).sort()).toEqual([
      'blog',
      'max_locales',
      'multi_language',
    ]);
  });

  it('accepte le meme contrat sur l’offre Ultra Premium', () => {
    const result = parseManifest(fixture);
    if (!result.ok) throw new Error('manifeste invalide');
    const problems = checkManifestAgainstPlan(
      result.summary,
      rights(['blog', 'multi_language', 'advanced_forms'], {
        max_pages: 20,
        max_locales: 3,
        max_forms: 10,
      }),
    );
    expect(problems).toEqual([]);
  });

  it('exige le droit de chaque module utilise', () => {
    const manifest = JSON.parse(fixture);
    manifest.modules = ['contact', 'booking', 'payments'];
    const result = parseManifest(manifest);
    if (!result.ok) throw new Error('manifeste invalide');
    const keys = checkManifestAgainstPlan(
      result.summary,
      rights(['blog', 'multi_language'], {}),
    ).map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['bookings', 'online_payments']));
  });

  it('traduit les formulaires declares pour la messagerie StaX', () => {
    const sync = integrationsFromManifest(loadManifest());
    expect(sync.forms[0]).toMatchObject({ slug: 'contact', kind: 'contact' });
    expect(sync.forms[0]?.fields.map((field) => field.name)).toEqual([
      'nom',
      'email',
      'message',
      'rgpd',
    ]);
    expect(sync.modules).toEqual(['contact']);
  });
});

describe('pont d’apercu', () => {
  it('n’accepte que des messages bien formes', () => {
    expect(
      parseBridgeMessage({
        source: 'stax-bridge',
        version: 1,
        type: 'select',
        address: 'pages.accueil.hero.titre',
      }),
    ).toMatchObject({ type: 'select' });
    expect(
      parseBridgeMessage({ source: 'autre', version: 1, type: 'select', address: 'x' }),
    ).toBeNull();
    expect(
      parseBridgeMessage({
        source: 'stax-bridge',
        version: 1,
        type: 'select',
        address: '"><script>',
      }),
    ).toBeNull();
    expect(
      parseBridgeMessage({ source: 'stax-bridge', version: 1, type: 'eval', code: 'alert(1)' }),
    ).toBeNull();
  });

  it('inscrit l’origine exacte de l’editeur et rien d’autre', () => {
    const script = bridgeScript('https://app.stax.fr/app/editeur?x=1');
    expect(script).toContain('var ORIGIN = "https://app.stax.fr";');
    expect(script).not.toContain('eval(');
    expect(script).not.toContain('innerHTML');
    expect(() => bridgeScript('pas une url')).toThrow();
  });
});

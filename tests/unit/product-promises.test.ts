import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildRefundPolicy,
  buildTerms,
  buildTermsOfUse,
  type LegalDocument,
} from '~/content/legal';
import { FAQ_ITEMS, HOMEPAGE_FAQ } from '~/content/faq';
import { PRINCIPLE_POINTS, PROCESS_STEPS } from '~/content/process';
import { MAINTENANCE_EXCLUDES, MAINTENANCE_INCLUDES } from '~/content/maintenance';
import { FEATURE_PAGES } from '~/content/features';

/**
 * Ce que StaX dit de lui-meme.
 *
 * StaX n'est ni un generateur de sites, ni un systeme de modeles : chaque site
 * est concu et developpe par l'equipe, dans son propre depot, puis livre ; le
 * client le gere ENSUITE. Une page qui laisserait croire l'inverse vendrait
 * un produit qui n'existe pas. Ces regles le verifient mecaniquement.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function sourceFiles(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, files);
    else if (/\.(ts|tsx)$/.test(full)) files.push(full);
  }
  return files;
}

/** Ce que voit un visiteur ou un client : pages vitrines, contenus, commande, e-mails. */
const CUSTOMER_FACING = [
  'apps/platform/src/app/(marketing)',
  'apps/platform/src/app/(commande)',
  'apps/platform/src/components/marketing',
  'apps/platform/src/content',
  'apps/platform/src/app/app/projet',
  'apps/platform/src/app/app/abonnement',
  'packages/emails/src',
].flatMap((directory) => sourceFiles(join(ROOT, directory)));

/** Lignes affichables (les commentaires expliquent, ils ne s'affichent pas). */
function visibleLines(file: string): Array<{ line: string; number: number }> {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => {
      const trimmed = line.trim();
      return !(trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'));
    });
}

const FORBIDDEN: Array<{ rule: RegExp; why: string }> = [
  { rule: /glisser[- ]?d[ée]pos/i, why: 'pas d’éditeur par glisser-déposer' },
  { rule: /drag[- ]?(and|&|n)[- ]?drop/i, why: 'pas d’éditeur par glisser-déposer' },
  { rule: /\btemplates?\b/i, why: 'aucun template' },
  { rule: /modules? activ[ée]s? automatiquement/i, why: 'le métier ne configure rien tout seul' },
  { rule: /choisisse[zr] (un|votre) mod[èe]le/i, why: 'aucun modèle à choisir' },
  {
    rule: /(site|design|pages?) (g[ée]n[ée]r[ée]e?s?|cr[ée]{1,2}e?s?) automatiquement/i,
    why: 'aucune génération automatique',
  },
  { rule: /instantan[ée]/i, why: 'aucun site fabriqué instantanément' },
  {
    rule: /design (totalement|enti[èe]rement) (unique|sur mesure|personnalis)/i,
    why: 'pas de promesse absolue de design unique',
  },
  { rule: /en quelques (minutes|heures)[^'"`]*\bsite\b/i, why: 'un site se conçoit en semaines' },
];

describe('formulations interdites', () => {
  it('recense les fichiers affichés au visiteur', () => {
    expect(CUSTOMER_FACING.length).toBeGreaterThan(40);
  });

  it('ne laisse jamais croire à un générateur, un modèle ou un éditeur avant livraison', () => {
    const offenders: string[] = [];
    for (const file of CUSTOMER_FACING) {
      // `template` designe, dans le paquet d'e-mails, l'identifiant technique
      // d'un gabarit de message (`template: 'welcome'`) : jamais un mot affiche.
      const isEmailCode = file.includes('/packages/emails/src/');
      for (const { line, number } of visibleLines(file)) {
        for (const { rule, why } of FORBIDDEN) {
          if (isEmailCode && rule.source.includes('template')) continue;
          if (rule.test(line)) {
            offenders.push(
              `${file.slice(ROOT.length)}:${number} (${why}) — ${line.trim().slice(0, 90)}`,
            );
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('le vrai produit, dit clairement', () => {
  it('« Nous créons votre site. Vous le gérez ensuite. » est le titre de l’accueil', () => {
    const hero = readFileSync(
      join(ROOT, 'apps/platform/src/components/marketing/hero.tsx'),
      'utf8',
    );
    expect(hero).toContain('Nous créons votre site.');
    expect(hero).toContain('Vous le gérez ensuite.');
    expect(hero).toContain('Pas de modèle à personnaliser');
  });

  it('le message tient en sept points, du choix de l’offre à la publication réelle', () => {
    expect(PRINCIPLE_POINTS.map((point) => point.title)).toEqual([
      'Vous choisissez votre offre',
      'Vous nous présentez votre entreprise',
      'Nous concevons et développons votre site',
      'Nous le mettons réellement en ligne',
      'Nous vous le livrons',
      'Vous modifiez son contenu depuis StaX',
      'Vous publiez, et c’est réellement en ligne',
    ]);
  });

  it('« Comment ça marche » suit exactement six étapes', () => {
    expect(PROCESS_STEPS.map((step) => step.title)).toEqual([
      'Votre projet',
      'Conception',
      'Développement',
      'Mise en ligne',
      'Livraison',
      'Vous gardez la main',
    ]);
    const deployment = PROCESS_STEPS[3];
    expect(deployment?.description).toMatch(/GitHub/);
    expect(deployment?.description).toMatch(/Cloudflare/);
    expect(PROCESS_STEPS[4]?.description).toMatch(/déjà en ligne/);
  });

  it('ne promet pas que le client peut tout modifier', () => {
    const editor = FEATURE_PAGES.find((page) => page.slug === 'editeur');
    expect(editor?.limits?.join(' ')).toMatch(/structure/);
    expect(
      FAQ_ITEMS.some((item) => /Puis-je modifier mon site avant sa livraison/.test(item.question)),
    ).toBe(true);
  });

  it('la maintenance dit ce qu’elle comprend, et ce qu’elle ne comprend pas', () => {
    const included = MAINTENANCE_INCLUDES.join(' ');
    for (const expected of [
      'Cloudflare',
      'HTTPS',
      'publication',
      'Versions',
      'Surveillance',
      'éditeur',
      'Support',
    ]) {
      expect(included.toLowerCase()).toContain(expected.toLowerCase());
    }
    expect(MAINTENANCE_EXCLUDES.join(' ')).toMatch(/fonctionnalités/);
  });

  it('la FAQ de l’accueil est complète et répond d’abord « non, vous ne construisez rien »', () => {
    expect(HOMEPAGE_FAQ).toHaveLength(6);
    expect(HOMEPAGE_FAQ[0]?.question).toBe('Est-ce que je construis mon site moi-même ?');
    expect(HOMEPAGE_FAQ[0]?.answer).toMatch(/^Non\./);
  });
});

/* -------------------------------------------------------------------------- */
/*  Offres : cinq niveaux, Exceptionnel partout                                */
/* -------------------------------------------------------------------------- */

function text(document: LegalDocument): string {
  return [
    document.description,
    document.intro ?? '',
    ...document.articles.flatMap((article) => [
      article.title,
      ...article.blocks.flatMap((block) => [
        block.text ?? '',
        ...(block.items ?? []),
        ...(block.definitions ?? []).flatMap((definition) => [
          definition.term,
          definition.description,
        ]),
      ]),
    ]),
  ].join('\n');
}

describe('Exceptionnel existe partout où une offre se nomme', () => {
  const migration = readFileSync(
    join(ROOT, 'supabase/migrations/20260101000043_monthly_offers.sql'),
    'utf8',
  );

  it('au catalogue : 1 790 € HT, 18 € HT par mois, catégorie « signature »', () => {
    expect(migration).toMatch(
      /\('exceptionnel', 1, 'Exceptionnel',[\s\S]*?'signature', 179000, 1800, 'month'/,
    );
    const inclusions = migration.match(/\(v_except, '/g) ?? [];
    expect(inclusions.length).toBeGreaterThanOrEqual(12);
  });

  it('dans les CGV, la FAQ et les pages de fonctionnalités', () => {
    expect(text(buildTerms())).toContain('Exceptionnel');
    expect(FAQ_ITEMS.map((item) => item.answer).join(' ')).toContain('Exceptionnel');
    for (const page of [
      'apps/platform/src/app/(marketing)/fonctionnalites/page.tsx',
      'apps/platform/src/app/(marketing)/fonctionnalites/[slug]/page.tsx',
    ]) {
      expect(readFileSync(join(ROOT, page), 'utf8')).toMatch(/exceptionnel:/);
    }
  });

  it('dans les cartes tarifaires et le tunnel de commande, traitée comme catégorie supérieure', () => {
    const cards = readFileSync(
      join(ROOT, 'apps/platform/src/components/marketing/pricing-cards.tsx'),
      'utf8',
    );
    const choice = readFileSync(
      join(ROOT, 'apps/platform/src/app/(commande)/commander/plan-choice.tsx'),
      'utf8',
    );
    expect(cards).toContain("plan.highlight === 'signature'");
    expect(choice).toContain('plan.signature');
    // Plus aucune grille pensee pour trois ou quatre offres, ni texte en dur.
    expect(cards).not.toMatch(/HIGHLIGHTS/);
    expect(cards).toMatch(/xl:grid-cols-4/);
  });
});

/* -------------------------------------------------------------------------- */
/*  Juridique : maintenance mensuelle, qui commence a la livraison             */
/* -------------------------------------------------------------------------- */

describe('textes juridiques cohérents avec le fonctionnement réel', () => {
  const cgv = text(buildTerms());

  it('les CGV décrivent une maintenance mensuelle, sans durée minimale, dès la livraison', () => {
    expect(cgv).toMatch(/abonnement mensuel/);
    expect(cgv).toMatch(/commence le jour de la Livraison/);
    expect(cgv).toMatch(/sans durée minimale/);
    expect(cgv).toMatch(/terme de la période mensuelle en cours/);
    expect(cgv).not.toMatch(
      /maintenance annuelle|abonnement annuel|périodes successives d’un an|par an\b/i,
    );
  });

  it('les CGV décrivent la livraison, la réversibilité et le code source du site', () => {
    expect(cgv).toMatch(/Livraison/);
    expect(cgv).toMatch(/projet indépendant|projet qui lui est propre/);
    expect(cgv).toMatch(/copie du code source/);
    expect(cgv).toMatch(/Aucun modèle préexistant/);
    expect(cgv).toMatch(/ne comprend pas de travaux de développement illimités/);
  });

  it('la garantie court à partir de la livraison', () => {
    const refund = text(buildRefundPolicy());
    expect(refund).toMatch(/livraison/);
    expect(refund).not.toMatch(/maintenance annuelle/);
  });

  it('les CGU restent cohérentes (aucune promesse de maintenance annuelle)', () => {
    expect(text(buildTermsOfUse())).not.toMatch(/maintenance annuelle|abonnement annuel/i);
  });
});

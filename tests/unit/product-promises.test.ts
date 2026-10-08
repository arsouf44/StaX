import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTerms, buildTermsOfUse, type LegalDocument } from '~/content/legal';
import { FAQ_ITEMS, HOMEPAGE_FAQ } from '~/content/faq';
import { ORDER_JOURNEY, PRINCIPLE_POINTS, PROCESS_STEPS } from '~/content/process';
import { FEATURE_PAGES } from '~/content/features';

/**
 * Ce que Nemasus dit de lui-meme.
 *
 * Nemasus n'est ni un generateur de sites, ni un systeme de modeles : chaque site
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
  'apps/platform/src/app/app/facturation',
  'apps/platform/src/app/(auth)/acces',
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
  it('« Nous créons votre site. Vous le gérez ensuite. » ouvre l’accueil, sous le titre', () => {
    const home = readFileSync(join(ROOT, 'apps/platform/src/app/(marketing)/page.tsx'), 'utf8');
    // « fait à la main » promettait un mode de production invérifiable : le
    // titre dit ce que le client reçoit (audit du 2026-09-29).
    expect(home).toContain('Un site fait pour vous');
    expect(home).not.toContain('fait à la main');
    expect(home).toContain('Nous créons votre site.');
    expect(home).toContain('Vous le gérez ensuite.');
    expect(home).toContain('Pas de modèle à personnaliser');
    expect(home).toContain('Vous publiez, et c’est réellement en ligne');
  });

  it('le message tient en sept points, de la commande à la publication réelle', () => {
    expect(PRINCIPLE_POINTS.map((point) => point.title)).toEqual([
      'Vous commandez votre site',
      'Vous réglez par virement',
      'Nous concevons et développons votre site',
      'Nous le mettons réellement en ligne',
      'Nous vous le livrons',
      'Vous modifiez son contenu depuis Nemasus',
      'Vous publiez, et c’est réellement en ligne',
    ]);
  });

  it('commander suit quatre temps : commande, virement, code, espace', () => {
    expect(ORDER_JOURNEY.map((step) => step.title)).toEqual([
      'Vous commandez',
      'Vous réglez par virement',
      'Vous recevez votre code',
      'Votre espace s’ouvre',
    ]);
    expect(ORDER_JOURNEY[0]?.description).toMatch(/Aucun compte à créer, aucun paiement/);
    expect(ORDER_JOURNEY[2]?.description).toMatch(/usage unique/);
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

  it('la FAQ explique le prix, le virement et le code d’accès', () => {
    const answers = FAQ_ITEMS.map((item) => `${item.question} ${item.answer}`).join(' ');
    expect(answers).toMatch(/pas de grille tarifaire/i);
    expect(answers).toMatch(/virement bancaire/);
    expect(answers).toMatch(/code d’accès/);
    expect(answers).toMatch(/Mot de passe oublié/);
  });

  it('la FAQ de l’accueil est complète et répond d’abord « non, vous ne construisez rien »', () => {
    expect(HOMEPAGE_FAQ).toHaveLength(6);
    expect(HOMEPAGE_FAQ[0]?.question).toBe('Est-ce que je construis mon site moi-même ?');
    expect(HOMEPAGE_FAQ[0]?.answer).toMatch(/^Non\./);
  });
});

/* -------------------------------------------------------------------------- */
/*  Aucun prix, aucune offre, aucun abonnement                                 */
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

/**
 * Ce que voit le public : pages vitrines, contenus, parcours de commande,
 * accès client, e-mails. Les maquettes de sites de démonstration
 * (`product-visuals`, `diagrams`) montrent les prix d'un restaurant ou d'un
 * salon fictifs, jamais ceux de Nemasus : elles sont hors de cette règle.
 */
const PUBLIC_PRICING_SCOPE = CUSTOMER_FACING.filter(
  (file) =>
    !file.endsWith('product-visuals.tsx') &&
    !file.endsWith('diagrams.tsx') &&
    // Le formulaire de projet sur mesure demande le budget du visiteur : ce
    // n'est pas un prix de Nemasus.
    !file.endsWith('quote-form.tsx'),
);

describe('aucune grille tarifaire visible', () => {
  it('aucun montant en euros, aucune offre, aucun abonnement dans les pages publiques', () => {
    const offenders: string[] = [];
    const rules: Array<{ rule: RegExp; why: string }> = [
      { rule: /\d\s?€|€\s?\d/, why: 'montant affiché' },
      { rule: /\b(Essentiel|Premium|Ultra Premium|Exceptionnel)\b/, why: 'nom d’offre' },
      { rule: /\/tarifs\b/, why: 'lien vers les tarifs' },
      { rule: /maintenance mensuelle|abonnement mensuel|par mois\b/i, why: 'abonnement' },
      { rule: /\bHT\b.*\bTTC\b/, why: 'prix HT/TTC' },
    ];
    for (const file of PUBLIC_PRICING_SCOPE) {
      // Les e-mails transactionnels affichent le montant CONVENU d'une
      // commande (modalités de virement) : c'est une donnée, pas un tarif.
      const isEmail = file.includes('/packages/emails/src/');
      for (const { line, number } of visibleLines(file)) {
        for (const { rule, why } of rules) {
          if (isEmail && why === 'montant affiché') continue;
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

  it('les anciennes pages d’offres redirigent vers l’explication du parcours', () => {
    const config = readFileSync(join(ROOT, 'apps/platform/next.config.ts'), 'utf8');
    expect(config).toMatch(/source: '\/tarifs', destination: '\/comment-ca-marche'/);
    expect(config).toMatch(/source: '\/remboursements', destination: '\/cgv'/);
  });
});

/* -------------------------------------------------------------------------- */
/*  Juridique : commande, virement, code d'accès                               */
/* -------------------------------------------------------------------------- */

describe('textes juridiques cohérents avec le fonctionnement réel', () => {
  const cgv = text(buildTerms());

  it('les CGV décrivent la commande, le virement et le code d’accès, sans abonnement', () => {
    expect(cgv).toMatch(/Modalités de paiement/);
    expect(cgv).toMatch(/virement bancaire/);
    expect(cgv).toMatch(/Code d’accès/);
    expect(cgv).toMatch(/ne publie pas de grille tarifaire/);
    expect(cgv).toMatch(/Aucun abonnement/);
    expect(cgv).not.toMatch(
      /carte bancaire, par l’intermédiaire de Stripe|abonnement mensuel|prélev/i,
    );
    expect(cgv).not.toMatch(/\b(Essentiel|Ultra Premium|Exceptionnel)\b/);
  });

  it('les CGV décrivent la livraison, la réversibilité et le code source du site', () => {
    expect(cgv).toMatch(/Livraison/);
    expect(cgv).toMatch(/projet indépendant|projet qui lui est propre/);
    expect(cgv).toMatch(/copie du code source/);
    expect(cgv).toMatch(/Aucun modèle préexistant/);
    expect(cgv).toMatch(/ne comprennent pas de travaux de développement illimités/);
  });

  it('les CGU restent cohérentes (aucun abonnement)', () => {
    expect(text(buildTermsOfUse())).not.toMatch(/abonnement|maintenance annuelle/i);
  });
});

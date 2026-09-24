import type { ManifestSummary, SiteModule } from './manifest';

/**
 * Le contrat d'edition d'un site respecte-t-il l'offre achetee ?
 *
 * Meme regle que la base (`app.delivery_readiness`, controle « Offre
 * correctement appliquee ») : un site Essentiel ne peut pas etre livre avec
 * douze pages declarees, une boutique ou trois langues. Le controle est
 * rejoue ici pour l'afficher a l'equipe des l'import du manifeste, avant la
 * livraison.
 */

/** Droit d'offre exige par chaque module de l'API des sites. */
export const MODULE_FEATURES: Readonly<Record<SiteModule, string | null>> = {
  contact: null,
  newsletter: null,
  booking: 'bookings',
  products: 'ecommerce',
  orders: 'ecommerce',
  payments: 'online_payments',
  donations: 'online_payments',
  'customer-accounts': 'customer_accounts',
};

export interface PlanRights {
  has(feature: string): boolean;
  /** `null` = illimite ; negatif = non inclus. */
  limit(key: string): number | null;
}

export interface PlanProblem {
  key: string;
  message: string;
}

function overLimit(count: number, limit: number | null): boolean {
  return limit !== null && (limit < 0 || count > limit);
}

export function checkManifestAgainstPlan(
  summary: ManifestSummary,
  rights: PlanRights,
): PlanProblem[] {
  const problems: PlanProblem[] = [];

  const pages = rights.limit('max_pages');
  if (overLimit(summary.pages, pages)) {
    problems.push({
      key: 'max_pages',
      message: `${summary.pages} pages déclarées, ${Math.max(pages ?? 0, 0)} incluses dans l’offre.`,
    });
  }

  const locales = rights.limit('max_locales');
  if (overLimit(summary.locales, locales)) {
    problems.push({
      key: 'max_locales',
      message: `${summary.locales} langues déclarées, ${Math.max(locales ?? 0, 0)} incluses dans l’offre.`,
    });
  }
  if (summary.locales > 1 && !rights.has('multi_language')) {
    problems.push({ key: 'multi_language', message: 'Site multilingue non inclus dans l’offre.' });
  }

  const forms = rights.limit('max_forms');
  if (overLimit(summary.forms, forms)) {
    problems.push({
      key: 'max_forms',
      message: `${summary.forms} formulaires déclarés, ${Math.max(forms ?? 0, 0)} inclus dans l’offre.`,
    });
  }
  if (summary.advancedForms && !rights.has('advanced_forms')) {
    problems.push({
      key: 'advanced_forms',
      message: 'Formulaires avancés non inclus dans l’offre.',
    });
  }

  if (summary.collections > 0 && !rights.has('blog')) {
    problems.push({ key: 'blog', message: 'Collections de contenus non incluses dans l’offre.' });
  }

  for (const module of summary.modules) {
    const feature = MODULE_FEATURES[module];
    if (feature && !rights.has(feature)) {
      problems.push({ key: feature, message: `Module « ${module} » non inclus dans l’offre.` });
    }
  }
  return problems;
}

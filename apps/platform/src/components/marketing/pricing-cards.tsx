import { Fragment } from 'react';
import Link from 'next/link';
import type { PlanInclusionView, PlanView } from '@stax/database';
import {
  computeOrderPricing,
  firstYearTotal,
  formatMaintenance,
  formatMoney,
  type PricingPlanInput,
} from '@stax/payments';
import { ButtonLink, cn } from '@stax/ui';
import { deliveryWeeksLabel } from '~/lib/catalog';

/**
 * Cartes tarifaires.
 *
 * Tout ce qu'une carte affiche vient de la base : les montants de `plans`, ce
 * que l'offre comprend de `plan_inclusions` (la base refuse une inclusion
 * adossee a un droit que l'offre n'accorde pas), les chiffres de
 * `plan_features`. Aucune promesse n'est ecrite ici : une carte ne peut pas
 * annoncer plus que ce que la plateforme applique.
 *
 * La maintenance est MENSUELLE et ne commence qu'a la LIVRAISON du site : rien
 * n'est preleve pendant la conception. Le cout de la premiere annee est affiche
 * explicitement — creation plus douze premiers mois de maintenance — pour que
 * le client voie ce qu'il paiera, pas seulement le prix d'appel.
 */

interface PricingCardsProps {
  plans: PlanView[];
  /** Ne montre que les inclusions mises en avant. */
  compact?: boolean;
  className?: string;
}

const INCLUSION_GROUPS: Array<{ category: PlanInclusionView['category']; label: string }> = [
  { category: 'conception', label: 'Conception' },
  { category: 'site', label: 'Votre site' },
  { category: 'gestion', label: 'Après la livraison' },
  { category: 'accompagnement', label: 'Accompagnement' },
];

function pricingInput(plan: PlanView): PricingPlanInput {
  return {
    slug: plan.slug,
    setupPriceCents: plan.setupPriceCents,
    maintenancePriceCents: plan.maintenancePriceCents,
    billingInterval: plan.billingInterval,
    vatRateBps: plan.vatRateBps,
    pricesIncludeVat: plan.pricesIncludeVat,
    currency: plan.currency,
    isQuoteOnly: plan.isQuoteOnly,
  };
}

export function PricingCards({ plans, compact = false, className }: PricingCardsProps) {
  if (plans.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-10 text-center">
        <p className="text-sm text-[var(--foreground-muted)]">
          Le catalogue tarifaire est momentanément indisponible.{' '}
          <Link href="/contact" className="underline underline-offset-4">
            Contactez-nous
          </Link>{' '}
          pour obtenir nos tarifs.
        </p>
      </div>
    );
  }

  const catalogue = plans.filter((plan) => !plan.isQuoteOnly);
  const onQuote = plans.filter((plan) => plan.isQuoteOnly);

  return (
    <div className={cn('space-y-4', className)}>
      {catalogue.length > 0 ? (
        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
          {catalogue.map((plan) => (
            <PlanCard key={plan.id} plan={plan} compact={compact} />
          ))}
        </div>
      ) : null}
      {onQuote.map((plan) => (
        <QuoteCard key={plan.id} plan={plan} compact={compact} />
      ))}
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={cn('mt-0.5 size-3.5 shrink-0', className)}
    >
      <path d="m3 8.5 3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InclusionList({
  inclusions,
  compact,
  tone,
}: {
  inclusions: PlanInclusionView[];
  compact: boolean;
  tone: 'default' | 'featured' | 'signature';
}) {
  const iconClass =
    tone === 'signature'
      ? 'text-[var(--ice)]'
      : tone === 'featured'
        ? 'text-[var(--accent-text)]'
        : 'text-[var(--muted-strong)]';

  if (compact) {
    const visible = inclusions.filter((inclusion) => inclusion.highlight).slice(0, 6);
    return (
      <ul className="space-y-2.5">
        {visible.map((inclusion) => (
          <li key={inclusion.label} className="flex gap-2.5 text-sm">
            <CheckIcon className={iconClass} />
            <span className="leading-relaxed text-[var(--foreground-muted)]">
              {inclusion.label}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-5">
      {INCLUSION_GROUPS.map((group) => {
        const items = inclusions.filter((inclusion) => inclusion.category === group.category);
        if (items.length === 0) return null;
        return (
          <div key={group.category}>
            <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              {group.label}
            </p>
            <ul className="mt-2.5 space-y-2.5">
              {items.map((inclusion) => (
                <li key={inclusion.label} className="flex gap-2.5 text-sm">
                  <CheckIcon className={iconClass} />
                  <span className="leading-relaxed text-[var(--foreground-muted)]">
                    {inclusion.label}
                    {inclusion.detail ? (
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {inclusion.detail}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function PlanCard({ plan, compact }: { plan: PlanView; compact: boolean }) {
  const signature = plan.highlight === 'signature';
  const featured = plan.highlight === 'popular';
  const tone = signature ? 'signature' : featured ? 'featured' : 'default';

  const input = pricingInput(plan);
  const pricing = computeOrderPricing(input);
  const firstYear = firstYearTotal(input);

  return (
    <div
      // Exceptionnel est une categorie a part : la carte reste noire et froide
      // quel que soit le theme, comme une piece de collection dans la vitrine.
      data-theme={signature ? 'dark' : undefined}
      className={cn(
        'relative flex flex-col rounded-[var(--radius-xl)] p-7 transition-[border-color,transform] duration-300',
        signature
          ? 'glass-edge overflow-hidden bg-[var(--ink)] text-[var(--foreground)] shadow-[var(--shadow-stage)] ring-1 ring-[var(--glacier)]/35'
          : featured
            ? 'glass-edge bg-[linear-gradient(180deg,rgb(20_124_255/0.14),transparent_45%)] ring-1 glass-2 ring-[var(--accent)]/45 xl:-translate-y-2'
            : 'border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]',
      )}
    >
      {signature ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(120%_80%_at_50%_0%,rgb(157_219_255/0.16),transparent_70%)]"
        />
      ) : null}

      {plan.badge ? (
        <span
          className={cn(
            'absolute top-5 right-6 rounded-full px-3 py-1 text-2xs font-medium',
            signature
              ? 'border border-[var(--ice)]/30 bg-[rgb(157_219_255/0.08)] text-[var(--ice)]'
              : featured
                ? 'bg-[var(--accent)] text-white shadow-[0_8px_24px_-10px_var(--accent-glow)]'
                : 'border border-[var(--border-strong)] text-[var(--foreground-muted)]',
          )}
        >
          {plan.badge}
        </span>
      ) : null}

      <div className="relative">
        {signature ? (
          <p className="text-2xs font-medium tracking-[0.2em] text-[var(--ice)] uppercase">
            Catégorie signature
          </p>
        ) : null}
        <h3
          className={cn(
            'font-semibold tracking-[-0.025em]',
            signature ? 'mt-2 text-2xl' : 'text-xl',
            plan.badge ? 'pr-24' : null,
          )}
        >
          {plan.name}
        </h3>
        {plan.tagline ? (
          <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">{plan.tagline}</p>
        ) : null}
      </div>

      <div className="relative mt-6">
        <p className="flex items-baseline gap-1.5">
          <span className="text-[2rem] font-semibold tracking-[-0.04em] tabular-nums xl:text-[2.25rem]">
            {formatMoney(plan.setupPriceCents, plan.currency, { hideDecimalsWhenRound: true })}
          </span>
          <span className="text-xs text-[var(--muted)]">HT · création</span>
        </p>
        <p className="mt-1.5 text-sm text-[var(--foreground-muted)] tabular-nums">
          puis{' '}
          <span className="font-medium text-[var(--foreground)]">
            {formatMaintenance(plan.maintenancePriceCents, plan.currency, plan.billingInterval)} HT
          </span>{' '}
          de maintenance
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          La maintenance commence à la livraison de votre site, sans durée minimale.
        </p>
        <p className="mt-2 text-xs text-[var(--muted)] tabular-nums">
          {formatMoney(pricing.totalCents, plan.currency)} TTC à la commande ·{' '}
          {formatMoney(firstYear, plan.currency)} TTC création et 12 premiers mois de maintenance
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Réalisation en {deliveryWeeksLabel(plan.deliveryWeeks)} après réception de vos éléments
        </p>
      </div>

      <ButtonLink
        href={`/commander?offre=${plan.slug}`}
        variant={featured || signature ? 'accent' : 'secondary'}
        size="pill"
        block
        className="relative mt-7"
      >
        Choisir cette offre
      </ButtonLink>

      <div
        className={cn(
          'relative mt-6 border-t pt-6',
          signature ? 'border-[var(--ice)]/15' : 'border-[var(--border)]',
        )}
      >
        <InclusionList inclusions={plan.inclusions} compact={compact} tone={tone} />
      </div>
    </div>
  );
}

/**
 * Offre sur devis : une bande pleine largeur sous les offres chiffrees. Elle ne
 * porte aucun prix — la maintenance y est definie projet par projet.
 */
function QuoteCard({ plan, compact }: { plan: PlanView; compact: boolean }) {
  const items = compact
    ? plan.inclusions.filter((inclusion) => inclusion.highlight)
    : plan.inclusions;

  return (
    <div className="grid gap-6 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:items-center">
      <div>
        <h3 className="text-xl font-semibold tracking-[-0.025em]">{plan.name}</h3>
        {plan.tagline ? (
          <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">{plan.tagline}</p>
        ) : null}
        <p className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Sur devis</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Chiffrage détaillé après étude de votre besoin
        </p>
      </div>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {items.map((inclusion) => (
          <li key={inclusion.label} className="flex gap-2.5 text-sm">
            <CheckIcon className="text-[var(--muted-strong)]" />
            <span className="leading-relaxed text-[var(--foreground-muted)]">
              {inclusion.label}
            </span>
          </li>
        ))}
      </ul>
      <ButtonLink href="/devis" variant="secondary" size="pill">
        Demander un devis
      </ButtonLink>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  site: 'Votre site',
  modules: 'Fonctionnalités métier',
  analytics: 'Statistiques',
  organisation: 'Organisation',
  support: 'Accompagnement',
  limits: 'Limites incluses',
};

/** Tableau comparatif complet, aligne sur les droits reellement appliques. */
export function PlanComparisonTable({ plans }: { plans: PlanView[] }) {
  const billable = plans.filter((plan) => !plan.isQuoteOnly);
  if (billable.length === 0) return null;

  const categories = new Map<string, Map<string, { label: string; unit: string | null }>>();
  for (const plan of billable) {
    for (const feature of plan.features) {
      if (!categories.has(feature.category)) categories.set(feature.category, new Map());
      categories
        .get(feature.category)
        ?.set(feature.key, { label: feature.label, unit: feature.unit });
    }
  }

  const priceRows: Array<{ label: string; value: (plan: PlanView) => string }> = [
    {
      label: 'Création (HT)',
      value: (plan) =>
        formatMoney(plan.setupPriceCents, plan.currency, { hideDecimalsWhenRound: true }),
    },
    {
      label: 'Maintenance (HT), dès la livraison',
      value: (plan) =>
        formatMaintenance(plan.maintenancePriceCents, plan.currency, plan.billingInterval),
    },
    {
      label: 'Délai de réalisation',
      value: (plan) => deliveryWeeksLabel(plan.deliveryWeeks),
    },
  ];

  return (
    <div
      role="region"
      aria-label="Comparaison détaillée des offres"
      tabIndex={0}
      className="relative overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <table className="w-full min-w-[48rem] border-collapse text-sm">
        <caption className="sr-only">
          Comparaison des fonctionnalités incluses dans chaque offre StaX
        </caption>
        <thead className="border-b border-[var(--border)] bg-[var(--background-subtle)]">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-[var(--muted)]">
              Fonctionnalité
            </th>
            {billable.map((plan) => (
              <th key={plan.id} scope="col" className="px-4 py-3 text-center text-xs font-medium">
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          <tr className="bg-[var(--background-inset)]">
            <th
              scope="colgroup"
              colSpan={billable.length + 1}
              className="px-4 py-2 text-left text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase"
            >
              Tarifs
            </th>
          </tr>
          {priceRows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className="px-4 py-3 text-left font-normal text-[var(--foreground-muted)]"
              >
                {row.label}
              </th>
              {billable.map((plan) => (
                <td key={plan.id} className="px-4 py-3 text-center tabular-nums">
                  {row.value(plan)}
                </td>
              ))}
            </tr>
          ))}
          {[...categories.entries()].map(([category, features]) => (
            <Fragment key={category}>
              <tr className="bg-[var(--background-inset)]">
                <th
                  scope="colgroup"
                  colSpan={billable.length + 1}
                  className="px-4 py-2 text-left text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase"
                >
                  {CATEGORY_LABELS[category] ?? category}
                </th>
              </tr>
              {[...features.entries()].map(([key, meta]) => (
                <tr key={key}>
                  <th
                    scope="row"
                    className="px-4 py-3 text-left font-normal text-[var(--foreground-muted)]"
                  >
                    {meta.label}
                  </th>
                  {billable.map((plan) => {
                    const feature = plan.features.find((f) => f.key === key);
                    return (
                      <td key={plan.id} className="px-4 py-3 text-center">
                        <FeatureCell feature={feature} unit={meta.unit} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeatureCell({
  feature,
  unit,
}: {
  feature: { kind: 'boolean' | 'limit'; enabled: boolean; limitValue: number | null } | undefined;
  unit: string | null;
}) {
  if (!feature || !feature.enabled || (feature.kind === 'limit' && feature.limitValue === 0)) {
    return (
      <>
        <span aria-hidden="true" className="text-[var(--border-strong)]">
          —
        </span>
        <span className="sr-only">Non inclus</span>
      </>
    );
  }
  if (feature.kind === 'limit') {
    return (
      <span className="tabular-nums">
        {feature.limitValue === null
          ? 'Illimité'
          : `${feature.limitValue.toLocaleString('fr-FR')}${unit ? ` ${plural(unit, feature.limitValue)}` : ''}`}
      </span>
    );
  }
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="mx-auto size-4 text-[var(--success)]"
      >
        <path d="m3 8.5 3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">Inclus</span>
    </>
  );
}

/** « 3 langues », « 1 langue » : les unites du catalogue sont au singulier. */
function plural(unit: string, value: number): string {
  if (value <= 1 || unit.endsWith('s') || unit.endsWith('x') || unit === 'Mo' || unit === 'Go') {
    return unit;
  }
  return `${unit}s`;
}
